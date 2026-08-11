/**
 * E2E テストの土台。
 *
 * 拡張を読み込んだ Chrome を CDP で操作する。単体テストでは検出できない
 * 「注入されない」「描画されない」を実際のブラウザで確かめるためにある
 * （v0.1.0 はこの 2 つで完全に動かなかった）。
 *
 * 依存を増やさないよう Puppeteer は使わず、Node 標準の fetch と WebSocket で
 * CDP を直接叩く。
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_CANDIDATES = [
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/Applications/Chromium.app/Contents/MacOS/Chromium",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium",
	"/usr/bin/chromium-browser",
];

export function findChrome() {
	const fromEnv = process.env.CHROME_PATH;
	if (fromEnv && existsSync(fromEnv)) return fromEnv;
	return CHROME_CANDIDATES.find((p) => existsSync(p)) ?? null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 拡張を読み込んだ Chrome を起動する。
 * 呼び出し側は必ず close() を呼ぶこと（プロファイルを消すため）。
 */
export async function launch({ extensionPath, url, port = 9455 }) {
	const chrome = findChrome();
	if (!chrome) throw new Error("Chrome が見つかりません（CHROME_PATH で指定できます）");

	const profile = mkdtempSync(join(tmpdir(), "inkover-e2e-"));
	const proc = spawn(
		chrome,
		[
			`--user-data-dir=${profile}`,
			`--remote-debugging-port=${port}`,
			`--load-extension=${extensionPath}`,
			`--disable-extensions-except=${extensionPath}`,
			"--no-first-run",
			"--no-default-browser-check",
			"--disable-background-timer-throttling",
			"--window-size=1280,860",
			// CI（ヘッドレス環境）でも動かせるようにする
			...(process.env.E2E_HEADED ? [] : ["--headless=new"]),
			url,
		],
		{ stdio: "ignore", detached: false },
	);

	// デバッガが応答するまで待つ
	const base = `http://127.0.0.1:${port}`;
	let ready = false;
	for (let i = 0; i < 60; i++) {
		try {
			const r = await fetch(`${base}/json/version`);
			if (r.ok) { ready = true; break; }
		} catch {
			// まだ起動していない
		}
		await sleep(250);
	}
	if (!ready) {
		proc.kill();
		rmSync(profile, { recursive: true, force: true });
		throw new Error("Chrome の起動を待てませんでした");
	}

	return {
		base,
		async close() {
			proc.kill();
			await sleep(300);
			rmSync(profile, { recursive: true, force: true });
		},
	};
}

/** ページターゲットへ接続し、評価用のハンドルを返す。 */
export async function attachPage(base, { match = (u) => u.startsWith("http") } = {}) {
	let target = null;
	for (let i = 0; i < 40; i++) {
		const list = await (await fetch(`${base}/json/list`)).json();
		target = list.find((t) => t.type === "page" && match(t.url));
		if (target?.webSocketDebuggerUrl) break;
		await sleep(250);
	}
	if (!target) throw new Error("ページターゲットが見つかりません");

	const ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((res, rej) => {
		ws.addEventListener("open", res, { once: true });
		ws.addEventListener("error", rej, { once: true });
	});

	let id = 0;
	const send = (method, params = {}) =>
		new Promise((res, rej) => {
			const myId = ++id;
			const onMsg = (ev) => {
				const msg = JSON.parse(ev.data);
				if (msg.id !== myId) return;
				ws.removeEventListener("message", onMsg);
				msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
			};
			ws.addEventListener("message", onMsg);
			ws.send(JSON.stringify({ id: myId, method, params }));
		});

	return {
		send,
		/** ページ内で式を評価して値を返す。 */
		async eval(expression) {
			const r = await send("Runtime.evaluate", {
				expression,
				returnByValue: true,
				awaitPromise: true,
			});
			if (r.exceptionDetails) {
				throw new Error(
					`評価に失敗: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ""}`,
				);
			}
			return r.result?.value;
		},
		close() {
			ws.close();
		},
	};
}

/**
 * closed Shadow DOM の中を覗けるようにする。
 *
 * 本番では closed のままにしたいので、テスト時だけ attachShadow をフックして
 * 生成された root を window に逃がす。オーバーレイを注入する前に呼ぶこと。
 */
export const HOOK_SHADOW = `(function(){
  if (window.__inkoverHooked) return "already";
  window.__inkoverHooked = true;
  window.__inkoverRoot = null;
  const orig = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function(init){
    const root = orig.call(this, { ...init, mode: "open" });
    window.__inkoverRoot = root;
    return root;
  };
  return "hooked";
})()`;

/**
 * 拡張 API のスタブ。
 *
 * ページコンテキストへ手で注入する都合上 chrome.runtime.id が無く、
 * storage / runtime が使えない。本番の content script は拡張コンテキストで
 * 動くのでこの問題は起きないが、テストでは最低限のスタブを置いて
 * 描画ロジックの検証に集中する。
 */
export const STUB_EXT_API = `(function(){
  if (!window.chrome) window.chrome = {};
  const c = window.chrome;
  if (!c.runtime) c.runtime = {};
  if (!c.runtime.id) c.runtime.id = "e2e-stub";
  c.runtime.getURL = (p) => "data:font/woff2;base64,";
  c.runtime.sendMessage = () => Promise.resolve();
  const mem = {};
  c.storage = {
    local: {
      get: (k) => Promise.resolve(k in mem ? { [k]: mem[k] } : {}),
      set: (obj) => { Object.assign(mem, obj); return Promise.resolve(); },
    },
  };
  return "stubbed";
})()`;

/** オーバーレイの canvas を取得する式（フック済みであること）。 */
export const GET_CANVAS = `window.__inkoverRoot && window.__inkoverRoot.querySelector("canvas")`;

/**
 * canvas へ合成 PointerEvent を送ってドラッグする式を作る。
 * pointerId は呼び出しごとに変えること（同じ id を使い回すと捕捉が絡む）。
 */
export function dragExpr({ from, to, pointerId = 1, steps = 20, curve = false }) {
	return `(function(){
    const c = ${GET_CANVAS};
    if (!c) return "canvas なし";
    const mk = (type, x, y) => new PointerEvent(type, {
      clientX: x, clientY: y, button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      pointerId: ${pointerId}, pointerType: "mouse", isPrimary: true,
      bubbles: true, cancelable: true, pressure: 0.5,
    });
    c.dispatchEvent(mk("pointerdown", ${from[0]}, ${from[1]}));
    for (let i = 1; i <= ${steps}; i++) {
      const t = i / ${steps};
      const x = ${from[0]} + (${to[0]} - ${from[0]}) * t;
      const y = ${from[1]} + (${to[1]} - ${from[1]}) * t
        ${curve ? "+ Math.sin(t * Math.PI * 2) * 50" : ""};
      c.dispatchEvent(mk("pointermove", x, y));
    }
    c.dispatchEvent(mk("pointerup", ${to[0]}, ${to[1]}));
    return "ok";
  })()`;
}

/** canvas に描かれた不透明ピクセル数を数える式。0 なら何も描けていない。 */
export const COUNT_PAINTED = `(function(){
  const c = ${GET_CANVAS};
  if (!c) return -1;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
  return n;
})()`;

/** キーを 1 つ押す式。 */
export function keyExpr(key) {
	return `(function(){
    window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true }));
    return "ok";
  })()`;
}
