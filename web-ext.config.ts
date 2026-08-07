import { defineWebExtConfig } from "wxt";

/**
 * `pnpm dev` で起動する Chrome の設定。
 *
 * 専用プロファイルで立ち上がるので、普段使いのブラウザやタブには影響しない。
 * 動作確認ページを最初から開いておく。
 */
export default defineWebExtConfig({
	startUrls: [
		// リポジトリ同梱の確認用ページ
		"https://developer.mozilla.org/ja/docs/Web/API/Pointer_events",
		"chrome://extensions",
	],
});
