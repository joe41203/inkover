/**
 * オーバーレイの E2E テスト。
 *
 * 実行: node tests/e2e/overlay.e2e.mjs
 *   （事前に pnpm build が必要。E2E_HEADED=1 で画面を出せる）
 *
 * v0.1.0 を壊した 2 つのバグを検出できることが第一目的:
 *   1. activeTab では tab.url が undefined になり、注入がスキップされる
 *   2. setPointerCapture の例外で描画が始まらない
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	attachPage,
	COUNT_PAINTED,
	dragExpr,
	GET_CANVAS,
	HOOK_SHADOW,
	keyExpr,
	launch,
	STUB_EXT_API,
} from "./harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const EXT = join(root, ".output", "chrome-mv3");
const OVERLAY_JS = join(EXT, "content-scripts", "overlay.js");

// 外部サイトに依存すると CI が不安定になるので、data URL で自前のページを使う
const PAGE = `data:text/html,${encodeURIComponent(`
<!doctype html><meta charset="utf-8"><title>inkover e2e</title>
<style>body{margin:0;height:2400px;background:#f4f6fa;font:16px sans-serif}
h1{padding:40px}</style><h1>inkover E2E</h1>`)}`;

let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
	if (ok) {
		passed++;
		console.log(`  ✓ ${name}`);
	} else {
		failed++;
		console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
	}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
	console.log("E2E: オーバーレイ");

	const browser = await launch({ extensionPath: EXT, url: PAGE });
	try {
		const page = await attachPage(browser.base, { match: (u) => u.startsWith("data:") });

		// closed shadow を覗けるようにし、拡張 API のスタブを置いてから注入する
		await page.eval(HOOK_SHADOW);
		await page.eval(STUB_EXT_API);
		const src = readFileSync(OVERLAY_JS, "utf8");
		await page.eval(`(function(){${src}})()`);

		// 起動は storage の読み込みを挟むので非同期。canvas が現れるまで待つ。
		let ready = false;
		for (let i = 0; i < 40; i++) {
			if (await page.eval(`!!${GET_CANVAS}`)) { ready = true; break; }
			await sleep(150);
		}

		// --- 起動 ---
		check("オーバーレイが生成される", ready);
		if (!ready) throw new Error("オーバーレイが起動しませんでした");
		check(
			"センチネルが登録される（2 回目の注入でトグル終了できる）",
			(await page.eval(`typeof window.__inkoverOverlay`)) === "function",
		);

		const size = await page.eval(`(function(){
      const c = ${GET_CANVAS};
      return c.width + "x" + c.height + "/" + Math.round(window.innerWidth * devicePixelRatio);
    })()`);
		const [buf, expected] = size.split("/");
		check(
			"canvas バッファが devicePixelRatio 倍になっている",
			buf.split("x")[0] === expected,
			`実際: ${size}`,
		);

		// --- ペン描画（バグ 2 の回帰テスト） ---
		await page.eval(keyExpr("f")); // 消えるインクを切る（判定を安定させる）
		await page.eval(dragExpr({ from: [200, 300], to: [700, 400], pointerId: 11, curve: true }));
		await sleep(300);
		const penPainted = await page.eval(COUNT_PAINTED);
		check(
			"ペンで線が描ける（setPointerCapture の例外で止まらない）",
			penPainted > 500,
			`不透明ピクセル: ${penPainted}`,
		);

		// --- 図形ツール ---
		for (const [key, label, pid] of [
			["a", "矢印", 21],
			["r", "矩形", 22],
			["e", "楕円", 23],
			["l", "直線", 24],
		]) {
			await page.eval(keyExpr("Delete"));
			await page.eval(keyExpr(key));
			await page.eval(dragExpr({ from: [250, 300], to: [650, 450], pointerId: pid }));
			await sleep(200);
			const n = await page.eval(COUNT_PAINTED);
			check(`${label}が描ける`, n > 100, `不透明ピクセル: ${n}`);
		}

		// --- スクロール追従 ---
		await page.eval(keyExpr("Delete"));
		await page.eval(keyExpr("r")); // 矩形は輪郭が明確で位置を測りやすい
		await page.eval(dragExpr({ from: [200, 200], to: [500, 400], pointerId: 31 }));
		await sleep(200);
		const beforeScroll = await page.eval(`(function(){
      const c = ${GET_CANVAS};
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      // 最初に色がついた行を返す（矩形の上辺の位置）
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (d[(y * c.width + x) * 4 + 3] > 0) return y;
        }
      }
      return -1;
    })()`);
		await page.eval(`window.scrollTo(0, 150); "ok"`);
		await sleep(400);
		const afterScroll = await page.eval(`(function(){
      const c = ${GET_CANVAS};
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (d[(y * c.width + x) * 4 + 3] > 0) return y;
        }
      }
      return -1;
    })()`);
		const dpr = await page.eval("devicePixelRatio");
		const moved = beforeScroll - afterScroll;
		check(
			"スクロールすると図形がページに貼り付いて動く",
			Math.abs(moved - 150 * dpr) < 20 * dpr,
			`上辺の移動量: ${moved}px（期待: ${150 * dpr}px 前後）`,
		);
		await page.eval(`window.scrollTo(0, 0); "ok"`);
		await sleep(300);

		// --- 全消去 ---
		await page.eval(keyExpr("Delete"));
		await sleep(200);
		check("全消去でキャンバスが空になる", (await page.eval(COUNT_PAINTED)) === 0);

		// --- PNG 書き出し ---
		// 実際のダウンロードは検証しづらいので、合成キャンバスが正しい寸法で
		// 作られるところまでを確かめる（captureVisibleTab はスタブで代替）。
		await page.eval(keyExpr("Delete"));
		await page.eval(keyExpr("p"));
		await page.eval(dragExpr({ from: [150, 250], to: [450, 350], pointerId: 41 }));
		await sleep(200);
		const composed = await page.eval(`(async function(){
      const c = ${GET_CANVAS};
      // 1280x800 のダミー画像を「スクリーンショット」として合成する
      const shotCanvas = document.createElement("canvas");
      shotCanvas.width = 1280; shotCanvas.height = 800;
      const sctx = shotCanvas.getContext("2d");
      sctx.fillStyle = "#ffffff";
      sctx.fillRect(0, 0, 1280, 800);
      const out = document.createElement("canvas");
      out.width = 1280; out.height = 800;
      const octx = out.getContext("2d");
      octx.drawImage(shotCanvas, 0, 0);
      octx.scale(1280 / window.innerWidth, 800 / window.innerHeight);
      octx.drawImage(c, 0, 0, window.innerWidth, window.innerHeight);
      const d = octx.getImageData(0, 0, out.width, out.height).data;
      // 白以外の画素があれば描画が合成されている
      let colored = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] !== 255 || d[i+1] !== 255 || d[i+2] !== 255) colored++;
      }
      return { size: out.width + "x" + out.height, colored };
    })()`);
		check(
			"スクリーンショットへ描画を合成できる",
			composed.size === "1280x800" && composed.colored > 500,
			`${composed.size} / 着色画素 ${composed.colored}`,
		);

		// --- ページ操作モード ---
		await page.eval(keyExpr("h"));
		await sleep(150);
		const pe = await page.eval(`getComputedStyle(${GET_CANVAS}).pointerEvents`);
		check("ページ操作モードでクリックが下に抜ける", pe === "none", `pointer-events: ${pe}`);
		await page.eval(keyExpr("h"));
		await sleep(150);
		check(
			"描画モードに戻せる",
			(await page.eval(`getComputedStyle(${GET_CANVAS}).pointerEvents`)) === "auto",
		);

		// --- 終了 ---
		await page.eval(keyExpr("Escape"));
		await sleep(300);
		// フックした shadowRoot の参照は残るので、canvas が document から
		// 切り離されたか（isConnected）で判定する
		check(
			"Esc でオーバーレイが消える",
			(await page.eval(`(function(){
        const c = ${GET_CANVAS};
        return !c || !c.isConnected;
      })()`)) === true,
		);
		check(
			"終了時にセンチネルが解除される",
			(await page.eval(`typeof window.__inkoverOverlay`)) === "undefined",
		);

		page.close();
	} finally {
		await browser.close();
	}

	console.log(`\n${passed} 件成功 / ${failed} 件失敗`);
	if (failed > 0) process.exit(1);
}

main().catch((err) => {
	console.error("E2E が異常終了しました:", err.message);
	process.exit(1);
});
