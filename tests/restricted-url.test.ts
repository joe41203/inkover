import { describe, expect, it } from "vitest";
import { isRestrictedUrl } from "@/lib/restricted-url";

describe("isRestrictedUrl", () => {
	/**
	 * v0.1.0 で「アイコンを押しても何も起きない」不具合を出した原因のケース。
	 *
	 * activeTab しか持たない拡張では action.onClicked の tab.url が undefined に
	 * なる。ここで true を返すと、あらゆるページで注入がスキップされる。
	 */
	it("url が読めないときは制限扱いにしない（activeTab では undefined になるため）", () => {
		expect(isRestrictedUrl(undefined)).toBe(false);
		expect(isRestrictedUrl("")).toBe(false);
	});

	it("通常のページは制限しない", () => {
		expect(isRestrictedUrl("https://example.com/")).toBe(false);
		expect(isRestrictedUrl("http://localhost:3000/")).toBe(false);
		expect(isRestrictedUrl("https://meet.google.com/abc-defg-hij")).toBe(false);
		expect(isRestrictedUrl("file:///Users/me/index.html")).toBe(false);
	});

	it("ブラウザ内部のページは制限する", () => {
		expect(isRestrictedUrl("chrome://extensions")).toBe(true);
		expect(isRestrictedUrl("chrome-extension://abcdef/popup.html")).toBe(true);
		expect(isRestrictedUrl("edge://settings")).toBe(true);
		expect(isRestrictedUrl("about:blank")).toBe(true);
		expect(isRestrictedUrl("devtools://devtools/bundled/inspector.html")).toBe(
			true,
		);
		expect(isRestrictedUrl("view-source:https://example.com/")).toBe(true);
	});

	it("Chrome ウェブストアは制限する（特権サイトとして保護されている）", () => {
		expect(isRestrictedUrl("https://chromewebstore.google.com/detail/x")).toBe(
			true,
		);
		expect(isRestrictedUrl("https://chrome.google.com/webstore/detail/x")).toBe(
			true,
		);
	});

	it("ウェブストアと紛らわしい別ドメインは制限しない", () => {
		// 前方一致で判定しているので、別サービスを巻き込まないことを確認する
		expect(isRestrictedUrl("https://chrome.google.com/")).toBe(false);
		expect(isRestrictedUrl("https://example.com/chrome://fake")).toBe(false);
	});
});
