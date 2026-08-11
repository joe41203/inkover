import { describe, expect, it } from "vitest";
import {
	DEFAULT_PREFS,
	type PenPrefs,
	rememberToolStyle,
	styleForTool,
} from "@/lib/messages";

describe("styleForTool", () => {
	it("記録が無ければ直近の設定を返す", () => {
		expect(styleForTool(DEFAULT_PREFS, "arrow")).toEqual({
			colorId: "coral",
			sizeId: "m",
		});
	});

	it("記録があればそれを返す", () => {
		const prefs: PenPrefs = {
			...DEFAULT_PREFS,
			byTool: { arrow: { colorId: "amber", sizeId: "l" } },
		};
		expect(styleForTool(prefs, "arrow")).toEqual({
			colorId: "amber",
			sizeId: "l",
		});
	});

	it("記録の無いツールは影響を受けない", () => {
		const prefs: PenPrefs = {
			...DEFAULT_PREFS,
			byTool: { arrow: { colorId: "amber", sizeId: "l" } },
		};
		expect(styleForTool(prefs, "pen")).toEqual({
			colorId: "coral",
			sizeId: "m",
		});
	});

	it("byTool が無い古い設定でも壊れない（後方互換）", () => {
		const old = {
			colorId: "sky",
			sizeId: "s",
			fadeMs: 6000,
			toolKind: "pen",
		} as PenPrefs;
		expect(styleForTool(old, "rect")).toEqual({ colorId: "sky", sizeId: "s" });
	});
});

describe("rememberToolStyle", () => {
	it("ツールに紐づけて記録する", () => {
		const next = rememberToolStyle(DEFAULT_PREFS, "arrow", {
			colorId: "amber",
			sizeId: "l",
		});
		expect(next.byTool?.arrow).toEqual({ colorId: "amber", sizeId: "l" });
	});

	it("直近の設定としても保持する（未記録ツールのフォールバック用）", () => {
		const next = rememberToolStyle(DEFAULT_PREFS, "arrow", {
			colorId: "amber",
			sizeId: "l",
		});
		expect(next.colorId).toBe("amber");
		expect(next.sizeId).toBe("l");
	});

	it("他のツールの記録を壊さない", () => {
		const a = rememberToolStyle(DEFAULT_PREFS, "arrow", {
			colorId: "amber",
			sizeId: "l",
		});
		const b = rememberToolStyle(a, "pen", { colorId: "sky", sizeId: "s" });
		expect(b.byTool?.arrow).toEqual({ colorId: "amber", sizeId: "l" });
		expect(b.byTool?.pen).toEqual({ colorId: "sky", sizeId: "s" });
	});

	it("元のオブジェクトを変更しない", () => {
		const before = { ...DEFAULT_PREFS, byTool: {} };
		rememberToolStyle(before, "arrow", { colorId: "amber", sizeId: "l" });
		expect(before.byTool).toEqual({});
	});

	it("同じツールを上書きできる", () => {
		const a = rememberToolStyle(DEFAULT_PREFS, "pen", {
			colorId: "amber",
			sizeId: "l",
		});
		const b = rememberToolStyle(a, "pen", { colorId: "violet", sizeId: "s" });
		expect(b.byTool?.pen).toEqual({ colorId: "violet", sizeId: "s" });
	});
});
