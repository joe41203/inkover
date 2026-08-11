import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PEN_COLORS, PEN_SIZES } from "@/lib/theme";
import { TOOLS } from "@/lib/tools";

/**
 * 翻訳の網羅性を機械的に確かめる。
 * キー漏れは実行時まで気づけず、UI にキー名がそのまま出てしまうため。
 */

type Messages = Record<string, { message: string }>;

const root = join(import.meta.dirname, "..");
const load = (locale: string): Messages =>
	JSON.parse(
		readFileSync(
			join(root, "public", "_locales", locale, "messages.json"),
			"utf8",
		),
	);

const en = load("en");
const ja = load("ja");

describe("翻訳ファイル", () => {
	it("en と ja のキーが完全に一致する", () => {
		const enKeys = Object.keys(en).sort();
		const jaKeys = Object.keys(ja).sort();
		expect(jaKeys).toEqual(enKeys);
	});

	it("空の訳文が無い", () => {
		for (const [locale, msgs] of [
			["en", en],
			["ja", ja],
		] as const) {
			for (const [key, entry] of Object.entries(msgs)) {
				expect(entry.message.trim(), `${locale}/${key} が空`).not.toBe("");
			}
		}
	});

	it("manifest が参照するキーが揃っている", () => {
		for (const key of ["extName", "extDescription", "commandToggle"]) {
			expect(en[key], `en に ${key} が無い`).toBeDefined();
			expect(ja[key], `ja に ${key} が無い`).toBeDefined();
		}
	});
});

describe("コードが参照するキー", () => {
	it("全ツールのラベルとヒントが両言語に存在する", () => {
		for (const tool of TOOLS) {
			expect(en[tool.labelKey], `en/${tool.labelKey}`).toBeDefined();
			expect(ja[tool.labelKey], `ja/${tool.labelKey}`).toBeDefined();
			expect(en[tool.hintKey], `en/${tool.hintKey}`).toBeDefined();
			expect(ja[tool.hintKey], `ja/${tool.hintKey}`).toBeDefined();
		}
	});

	it("全色のラベルが両言語に存在する", () => {
		for (const c of PEN_COLORS) {
			expect(en[c.labelKey], `en/${c.labelKey}`).toBeDefined();
			expect(ja[c.labelKey], `ja/${c.labelKey}`).toBeDefined();
		}
	});

	it("全太さのラベルが両言語に存在する", () => {
		for (const s of PEN_SIZES) {
			expect(en[s.labelKey], `en/${s.labelKey}`).toBeDefined();
			expect(ja[s.labelKey], `ja/${s.labelKey}`).toBeDefined();
		}
	});

	it("プレースホルダを持つメッセージは両言語で同じ数を使う", () => {
		for (const key of Object.keys(en)) {
			const enPh = en[key]?.message.match(/\$\w+\$/g)?.length ?? 0;
			const jaPh = ja[key]?.message.match(/\$\w+\$/g)?.length ?? 0;
			expect(jaPh, `${key} のプレースホルダ数が食い違う`).toBe(enPh);
		}
	});
});
