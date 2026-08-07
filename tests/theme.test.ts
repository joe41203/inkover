import { describe, expect, it } from "vitest";
import { PEN_COLORS, PEN_SIZES, theme } from "@/lib/theme";

/**
 * 姉妹プロダクト shotcraft と見た目を揃えるための固定。
 * 値を変えるとこのテストが落ちる。意図的に変えるならテストも直す。
 */
describe("shotcraft との一致", () => {
	it("カラーパレットが shotcraft の COLORS と同じ並び・同じ値", () => {
		expect(PEN_COLORS.map((c) => c.value)).toEqual([
			"#fb7185", // コーラル
			"#fbbf24", // アンバー
			"#34d399", // エメラルド
			"#38bdf8", // スカイ
			"#a78bfa", // バイオレット
			"#18181b", // 黒
			"#fafafa", // 白
		]);
	});

	it("UI トークンが midnight テーマと同じ", () => {
		expect(theme.surface).toBe("#161b26");
		expect(theme.surface2).toBe("#1f2632");
		expect(theme.text).toBe("#f2f5f9");
		expect(theme.textMuted).toBe("#9aa6b8");
		expect(theme.accent).toBe("#10b981");
		expect(theme.ring).toBe("#38bdf8");
	});

	it("テキスト注釈は Mochiy Pop One を先頭に置く", () => {
		expect(theme.fontAnnotation.startsWith('"Mochiy Pop One"')).toBe(true);
	});

	it("UI フォントは同梱せずシステムフォントに依存する", () => {
		expect(theme.fontSans).not.toContain("Mochiy");
	});
});

describe("パレットの整合性", () => {
	it("色 ID が重複していない", () => {
		const ids = PEN_COLORS.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("太さ ID が重複していない", () => {
		const ids = PEN_SIZES.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("色は数字キー 1〜7 で選べる数に収まる", () => {
		expect(PEN_COLORS.length).toBeLessThanOrEqual(9);
	});
});
