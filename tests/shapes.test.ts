import { describe, expect, it } from "vitest";
import {
	arrowHead,
	arrowShaftEnd,
	dropFaded,
	FADE_DURATION_MS,
	hasAnimating,
	isClick,
	isClickPlaced,
	isTwoPoint,
	nextStepIndex,
	normalizeRect,
	outlineToPath,
	type Shape,
	shapeOpacity,
	isOffscreen,
	scrollOffset,
	stepRadius,
	toFreehandInput,
} from "@/lib/shapes";

const pen = (finishedAt: number | null, id = 1): Shape => ({
	id,
	kind: "pen",
	color: "#ff0000",
	size: 8,
	points: [
		{ x: 0, y: 0, pressure: 0.5 },
		{ x: 10, y: 10, pressure: 0.5 },
	],
	finishedAt,
	scroll: { x: 0, y: 0 },
});

describe("shapeOpacity", () => {
	it("描画中は常に不透明", () => {
		expect(shapeOpacity(pen(null), 99999, 1000)).toBe(1);
	});

	it("フェード無効なら常に不透明", () => {
		expect(shapeOpacity(pen(0), 99999, null)).toBe(1);
	});

	it("待機時間内は不透明のまま", () => {
		expect(shapeOpacity(pen(1000), 1500, 500)).toBe(1);
	});

	it("待機時間を過ぎると徐々に薄くなる", () => {
		expect(shapeOpacity(pen(0), 1000 + FADE_DURATION_MS / 2, 1000)).toBeCloseTo(
			0.5,
			5,
		);
	});

	it("フェード完了後は 0", () => {
		expect(shapeOpacity(pen(0), 1000 + FADE_DURATION_MS, 1000)).toBe(0);
		expect(shapeOpacity(pen(0), 999999, 1000)).toBe(0);
	});
});

describe("dropFaded / hasAnimating", () => {
	it("消えたものだけ取り除く", () => {
		const result = dropFaded([pen(5000, 1), pen(0, 2)], 5000, 1000);
		expect(result.map((s) => s.id)).toEqual([1]);
	});

	it("フェード無効なら何も落とさない", () => {
		expect(dropFaded([pen(0), pen(0)], 999999, null)).toHaveLength(2);
	});

	it("フェード無効なら rAF を回す必要がない", () => {
		expect(hasAnimating([pen(0)], 0, null)).toBe(false);
	});

	it("全部消えていれば false", () => {
		expect(hasAnimating([pen(0)], 999999, 1000)).toBe(false);
	});

	it("描画中があれば true", () => {
		expect(hasAnimating([pen(null)], 999999, 1000)).toBe(true);
	});
});

describe("種別の判定", () => {
	it("2 点で決まる図形を見分ける", () => {
		expect(isTwoPoint("arrow")).toBe(true);
		expect(isTwoPoint("rect")).toBe(true);
		expect(isTwoPoint("spotlight")).toBe(true);
		expect(isTwoPoint("pen")).toBe(false);
		expect(isTwoPoint("text")).toBe(false);
	});

	it("クリックで置く図形を見分ける", () => {
		expect(isClickPlaced("text")).toBe(true);
		expect(isClickPlaced("step")).toBe(true);
		expect(isClickPlaced("pen")).toBe(false);
	});
});

describe("normalizeRect", () => {
	it("右下へのドラッグ", () => {
		expect(normalizeRect({ x: 10, y: 20 }, { x: 40, y: 60 })).toEqual({
			x: 10,
			y: 20,
			width: 30,
			height: 40,
		});
	});

	it("左上へのドラッグでも負の幅を作らない", () => {
		expect(normalizeRect({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual({
			x: 10,
			y: 20,
			width: 30,
			height: 40,
		});
	});
});

describe("arrowHead", () => {
	it("長さがなければ頭を作らない", () => {
		expect(arrowHead({ x: 5, y: 5 }, { x: 5, y: 5 }, 8)).toBeNull();
	});

	it("先端は終点そのもの", () => {
		const head = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 8);
		expect(head).not.toBeNull();
		expect(head?.[0]).toEqual({ x: 100, y: 0 });
	});

	it("頭は矢印全体の 1/3 を超えない", () => {
		// size*4 = 80 だが全長 30 なので 10 に制限される
		const head = arrowHead({ x: 0, y: 0 }, { x: 30, y: 0 }, 20);
		expect(head).not.toBeNull();
		// 底辺の x は 30 - 10 = 20
		expect(head?.[1].x).toBeCloseTo(20, 5);
	});

	it("斜めでも先端が終点に一致する", () => {
		const head = arrowHead({ x: 0, y: 0 }, { x: 60, y: 80 }, 5);
		expect(head?.[0]).toEqual({ x: 60, y: 80 });
	});
});

describe("arrowShaftEnd", () => {
	it("軸は終点より手前で止まる", () => {
		const end = arrowShaftEnd({ x: 0, y: 0 }, { x: 100, y: 0 }, 8);
		expect(end.x).toBeLessThan(100);
		expect(end.x).toBeGreaterThan(0);
	});

	it("長さがなければ終点をそのまま返す", () => {
		expect(arrowShaftEnd({ x: 5, y: 5 }, { x: 5, y: 5 }, 8)).toEqual({
			x: 5,
			y: 5,
		});
	});
});

describe("stepRadius", () => {
	it("細い線でも最低限の大きさを保つ", () => {
		expect(stepRadius(1)).toBe(14);
	});

	it("太い線では大きくなる", () => {
		expect(stepRadius(16)).toBeCloseTo(35.2, 5);
	});
});

describe("nextStepIndex", () => {
	const step = (index: number): Shape => ({
		id: index,
		kind: "step",
		color: "#fff",
		size: 8,
		at: { x: 0, y: 0 },
		index,
		finishedAt: 0,
		scroll: { x: 0, y: 0 },
	});

	it("最初は 1", () => {
		expect(nextStepIndex([])).toBe(1);
		expect(nextStepIndex([pen(0)])).toBe(1);
	});

	it("既存の最大値 + 1", () => {
		expect(nextStepIndex([step(1), step(2)])).toBe(3);
	});

	it("欠番があっても最大値を基準にする", () => {
		expect(nextStepIndex([step(1), step(5)])).toBe(6);
	});
});

describe("isClick", () => {
	it("ほぼ動いていなければクリック", () => {
		expect(isClick({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true);
	});

	it("十分動いていればドラッグ", () => {
		expect(isClick({ x: 0, y: 0 }, { x: 30, y: 0 })).toBe(false);
	});
});

describe("toFreehandInput / outlineToPath", () => {
	it("[x, y, pressure] の三つ組に変換する", () => {
		expect(
			toFreehandInput([
				{ x: 0, y: 0, pressure: 0.5 },
				{ x: 10, y: 10, pressure: 0.8 },
			]),
		).toEqual([
			[0, 0, 0.5],
			[10, 10, 0.8],
		]);
	});

	it("空の輪郭は空文字", () => {
		expect(outlineToPath([])).toBe("");
	});

	it("閉じたパスを生成する", () => {
		expect(
			outlineToPath([
				[0, 0],
				[10, 0],
				[10, 10],
			]),
		).toBe("M 0.00 0.00 L 10.00 0.00 L 10.00 10.00 Z");
	});
});

describe("scrollOffset", () => {
	const at = (sx: number, sy: number): Shape => ({
		...pen(0),
		scroll: { x: sx, y: sy },
	});

	it("スクロールしていなければ動かさない", () => {
		expect(scrollOffset(at(0, 0), { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
	});

	it("下へスクロールした分だけ上へずらす", () => {
		// ページを 200px 下げたら、図形は 200px 上に描かれて元の位置に留まる
		expect(scrollOffset(at(0, 0), { x: 0, y: 200 })).toEqual({ x: 0, y: -200 });
	});

	it("スクロール済みの位置で描いた図形も正しく追従する", () => {
		expect(scrollOffset(at(0, 500), { x: 0, y: 300 })).toEqual({
			x: 0,
			y: 200,
		});
	});

	it("横スクロールも扱える", () => {
		expect(scrollOffset(at(100, 0), { x: 250, y: 0 })).toEqual({
			x: -150,
			y: 0,
		});
	});
});

describe("isOffscreen", () => {
	const viewport = { width: 1000, height: 800 };
	const line = (x1: number, y1: number, x2: number, y2: number): Shape => ({
		id: 1,
		kind: "line",
		color: "#fff",
		size: 8,
		from: { x: x1, y: y1 },
		to: { x: x2, y: y2 },
		finishedAt: 0,
		scroll: { x: 0, y: 0 },
	});

	it("画面内なら描画対象", () => {
		expect(
			isOffscreen(line(100, 100, 300, 300), { x: 0, y: 0 }, viewport),
		).toBe(false);
	});

	it("上に大きくスクロールして画面外へ出たら省略する", () => {
		expect(
			isOffscreen(line(100, 100, 300, 200), { x: 0, y: -2000 }, viewport),
		).toBe(true);
	});

	it("下へ出た場合も省略する", () => {
		expect(
			isOffscreen(line(100, 100, 300, 200), { x: 0, y: 2000 }, viewport),
		).toBe(true);
	});

	it("境界付近は余白を見て残す（線幅の分はみ出すため）", () => {
		expect(
			isOffscreen(line(100, 790, 300, 795), { x: 0, y: 0 }, viewport),
		).toBe(false);
	});

	it("スポットライトは画面全体を覆うので常に描く", () => {
		const spot: Shape = {
			id: 2,
			kind: "spotlight",
			color: "#fff",
			size: 8,
			from: { x: 0, y: 0 },
			to: { x: 10, y: 10 },
			finishedAt: 0,
			scroll: { x: 0, y: 0 },
		};
		expect(isOffscreen(spot, { x: 0, y: -5000 }, viewport)).toBe(false);
	});
});
