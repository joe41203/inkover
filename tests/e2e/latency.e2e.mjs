/**
 * 描画遅延の計測。
 *
 * 実行: node tests/e2e/latency.e2e.mjs
 *
 * 競合拡張のレビューで最も多い不満が「もっさりする」なので、体感でなく
 * 数値で押さえる。測るのは 2 つ:
 *
 *   1. 入力から描画までの遅延 — pointermove を出してから canvas に反映
 *      されるまで（rAF 1 フレーム分に収まっているか）
 *   2. 1 フレームの描画時間 — 図形が増えたときに 16.7ms を超えないか
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	attachPage,
	GET_CANVAS,
	HOOK_SHADOW,
	keyExpr,
	launch,
	STUB_EXT_API,
} from "./harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const EXT = join(root, ".output", "chrome-mv3");
const PAGE = `data:text/html,${encodeURIComponent(
	`<!doctype html><meta charset="utf-8"><style>body{margin:0;height:2000px;background:#eef}</style><h1>latency</h1>`,
)}`;

/** 1 フレーム 16.7ms を基準に、余裕を見た許容値。 */
const FRAME_BUDGET_MS = 16.7;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
	const browser = await launch({ extensionPath: EXT, url: PAGE });
	try {
		const page = await attachPage(browser.base, { match: (u) => u.startsWith("data:") });
		await page.eval(HOOK_SHADOW);
		await page.eval(STUB_EXT_API);
		await page.eval(`(function(){${readFileSync(join(EXT, "content-scripts", "overlay.js"), "utf8")}})()`);

		for (let i = 0; i < 40; i++) {
			if (await page.eval(`!!${GET_CANVAS}`)) break;
			await sleep(150);
		}
		await page.eval(keyExpr("f")); // フェードを切って条件を揃える

		console.log("描画遅延の計測\n");

		// --- 1. 入力から描画までの遅延 ---
		const inputLatency = await page.eval(`(async function(){
      const c = ${GET_CANVAS};
      const mk = (t, x, y) => new PointerEvent(t, {
        clientX: x, clientY: y, button: 0, buttons: t === "pointerup" ? 0 : 1,
        pointerId: 90, pointerType: "mouse", isPrimary: true,
        bubbles: true, cancelable: true, pressure: 0.5,
      });
      const samples = [];
      c.dispatchEvent(mk("pointerdown", 100, 200));
      for (let i = 1; i <= 30; i++) {
        const t0 = performance.now();
        c.dispatchEvent(mk("pointermove", 100 + i * 20, 200 + Math.sin(i / 3) * 40));
        // 実際に画面へ出るのは次フレーム。rAF 1 回分を待って計測する。
        await new Promise(r => requestAnimationFrame(() => r()));
        samples.push(performance.now() - t0);
      }
      c.dispatchEvent(mk("pointerup", 700, 200));
      samples.sort((a, b) => a - b);
      return {
        median: samples[Math.floor(samples.length / 2)],
        p95: samples[Math.floor(samples.length * 0.95)],
        max: samples[samples.length - 1],
      };
    })()`);

		console.log("  入力 → 描画反映（rAF 1 フレーム待ち込み）");
		console.log(`    中央値 ${inputLatency.median.toFixed(1)}ms / p95 ${inputLatency.p95.toFixed(1)}ms / 最大 ${inputLatency.max.toFixed(1)}ms`);

		// --- 2. 図形数を増やしたときの 1 フレーム描画時間 ---
		console.log("\n  1 フレームの描画時間（図形数別）");
		for (const count of [1, 10, 30, 60]) {
			const frame = await page.eval(`(async function(){
        const c = ${GET_CANVAS};
        const mk = (t, x, y, id) => new PointerEvent(t, {
          clientX: x, clientY: y, button: 0, buttons: t === "pointerup" ? 0 : 1,
          pointerId: id, pointerType: "mouse", isPrimary: true,
          bubbles: true, cancelable: true, pressure: 0.5,
        });
        // いったん消してから指定数だけ描く
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
        for (let n = 0; n < ${count}; n++) {
          const id = 200 + n;
          const y = 120 + (n % 20) * 30;
          c.dispatchEvent(mk("pointerdown", 60, y, id));
          for (let i = 1; i <= 6; i++) c.dispatchEvent(mk("pointermove", 60 + i * 60, y + i, id));
          c.dispatchEvent(mk("pointerup", 420, y + 6, id));
        }
        await new Promise(r => requestAnimationFrame(() => r()));
        // 追加の 1 ストロークを描いている間のフレーム時間を測る
        const times = [];
        let last = performance.now();
        let frames = 0;
        await new Promise(resolve => {
          const tick = () => {
            const now = performance.now();
            times.push(now - last);
            last = now;
            if (++frames >= 20) return resolve();
            requestAnimationFrame(tick);
          };
          c.dispatchEvent(mk("pointerdown", 60, 700, 999));
          requestAnimationFrame(tick);
          for (let i = 1; i <= 20; i++) c.dispatchEvent(mk("pointermove", 60 + i * 30, 700 + i, 999));
        });
        c.dispatchEvent(mk("pointerup", 660, 720, 999));
        times.sort((a, b) => a - b);
        return { median: times[Math.floor(times.length / 2)], max: times[times.length - 1] };
      })()`);
			const flag = frame.median > FRAME_BUDGET_MS ? " ← 予算超過" : "";
			console.log(
				`    ${String(count).padStart(3)} 図形: 中央値 ${frame.median.toFixed(1)}ms / 最大 ${frame.max.toFixed(1)}ms${flag}`,
			);
		}

		console.log(`\n  基準: 1 フレーム ${FRAME_BUDGET_MS}ms（60fps）`);
		page.close();
	} finally {
		await browser.close();
	}
}

main().catch((err) => {
	console.error("計測が異常終了しました:", err.message);
	process.exit(1);
});
