import { describe, expect, it } from "vitest";
import { canvasSizeFor, captureScale, toCanvasPoint } from "@/lib/geometry";

describe("canvasSizeFor", () => {
	it("DPR 1 ではバッファと CSS サイズが一致する", () => {
		expect(canvasSizeFor(800, 600, 1)).toEqual({
			bufferWidth: 800,
			bufferHeight: 600,
			cssWidth: 800,
			cssHeight: 600,
		});
	});

	it("Retina ではバッファだけ 2 倍になる", () => {
		const s = canvasSizeFor(800, 600, 2);
		expect(s.bufferWidth).toBe(1600);
		expect(s.bufferHeight).toBe(1200);
		// CSS サイズは変わらない。ここが変わると表示が倍になってしまう
		expect(s.cssWidth).toBe(800);
		expect(s.cssHeight).toBe(600);
	});

	it("端数のある DPR も丸めて扱う", () => {
		const s = canvasSizeFor(1440, 900, 1.5);
		expect(s.bufferWidth).toBe(2160);
		expect(s.bufferHeight).toBe(1350);
	});

	it("不正な DPR は 1 として扱う（描画が壊れるのを防ぐ）", () => {
		expect(canvasSizeFor(800, 600, 0).bufferWidth).toBe(800);
		expect(canvasSizeFor(800, 600, Number.NaN).bufferWidth).toBe(800);
		expect(canvasSizeFor(800, 600, -2).bufferWidth).toBe(800);
	});
});

describe("captureScale", () => {
	it("画像とビューポートの比を軸ごとに返す", () => {
		expect(captureScale(1600, 1200, 800, 600)).toEqual({ x: 2, y: 2 });
	});

	it("縦横で倍率が違っても正しく扱う", () => {
		expect(captureScale(1600, 600, 800, 600)).toEqual({ x: 2, y: 1 });
	});

	it("ビューポートが 0 でもゼロ除算しない", () => {
		expect(captureScale(1600, 1200, 0, 0)).toEqual({ x: 1, y: 1 });
	});
});

describe("toCanvasPoint", () => {
	it("矩形の原点を引く", () => {
		expect(toCanvasPoint(100, 50, { left: 0, top: 0 })).toEqual({
			x: 100,
			y: 50,
		});
		expect(toCanvasPoint(100, 50, { left: 20, top: 10 })).toEqual({
			x: 80,
			y: 40,
		});
	});
});
