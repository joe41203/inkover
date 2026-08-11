import { describe, expect, it } from "vitest";
import {
	ACTION_KEYS,
	constrain,
	TOOLS,
	toolByKey,
	toolByKind,
} from "@/lib/tools";

describe("ツール定義", () => {
	it("キーが重複していない", () => {
		const keys = TOOLS.map((t) => t.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("ツール以外のショートカットと衝突しない", () => {
		const reserved = [ACTION_KEYS.toggleMode, ACTION_KEYS.toggleFade];
		for (const t of TOOLS) {
			expect(reserved).not.toContain(t.key);
		}
	});

	it("全消去は単キーでなく Delete/Backspace に割り当てる", () => {
		// ツール切替の単キーと衝突させないため
		expect(ACTION_KEYS.clear).toContain("Delete");
		expect(ACTION_KEYS.clear).toContain("Backspace");
	});

	it("shotcraft と共通のツールは同じキー割り当てにする", () => {
		// 両拡張を行き来しても手が迷わないようにするため。
		// inkover 固有のツール（レーザーなど）はこの表に無い。
		const shared: Record<string, string> = {
			pen: "p",
			arrow: "a",
			line: "l",
			rect: "r",
			ellipse: "e",
			spotlight: "o",
			text: "t",
			step: "s",
		};
		for (const t of TOOLS) {
			const key = shared[t.kind];
			if (key) expect(t.key).toBe(key);
		}
	});

	it("inkover 固有のツールも重複しないキーを持つ", () => {
		const laser = TOOLS.find((t) => t.kind === "laser");
		expect(laser).toBeDefined();
		expect(laser?.key).toBe("w");
	});

	it("キーからツールを引ける（大文字小文字を問わない）", () => {
		expect(toolByKey("p")?.kind).toBe("pen");
		expect(toolByKey("P")?.kind).toBe("pen");
		expect(toolByKey("z")).toBeUndefined();
	});

	it("種別からツールを引ける", () => {
		expect(toolByKind("arrow")?.key).toBe("a");
	});
});

describe("constrain（Shift 押下時の制約）", () => {
	it("直線を 45 度刻みへ吸着させる", () => {
		// ほぼ水平 → 完全な水平に
		const p = constrain("line", { x: 0, y: 0 }, { x: 100, y: 8 });
		expect(p.y).toBeCloseTo(0, 5);
		expect(p.x).toBeCloseTo(Math.hypot(100, 8), 5);
	});

	it("斜め 45 度付近はそのまま 45 度になる", () => {
		const p = constrain("arrow", { x: 0, y: 0 }, { x: 100, y: 95 });
		expect(p.x).toBeCloseTo(p.y, 5);
	});

	it("矩形を正方形にする", () => {
		const p = constrain("rect", { x: 0, y: 0 }, { x: 100, y: 40 });
		expect(Math.abs(p.x)).toBe(Math.abs(p.y));
		expect(Math.abs(p.x)).toBe(100);
	});

	it("左上方向でも符号を保ったまま正方形にする", () => {
		const p = constrain("ellipse", { x: 100, y: 100 }, { x: 40, y: 80 });
		expect(p.x).toBe(40);
		expect(p.y).toBe(40);
	});

	it("ペンには制約をかけない", () => {
		const to = { x: 33, y: 77 };
		expect(constrain("pen", { x: 0, y: 0 }, to)).toEqual(to);
	});

	it("長さゼロの線はそのまま返す", () => {
		const to = { x: 5, y: 5 };
		expect(constrain("line", { x: 5, y: 5 }, to)).toEqual(to);
	});
});
