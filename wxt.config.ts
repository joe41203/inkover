import { defineConfig } from "wxt";

export default defineConfig({
	manifest: {
		name: "inkover",
		description:
			"画面共有中のページにそのまま描き込めるペン。描いた線は数秒で消える。完全ローカル動作",
		permissions: ["activeTab", "scripting", "storage"],
		icons: {
			16: "/icon/16.png",
			32: "/icon/32.png",
			48: "/icon/48.png",
			128: "/icon/128.png",
		},
		action: {
			default_icon: {
				16: "/icon/16.png",
				32: "/icon/32.png",
				48: "/icon/48.png",
			},
		},
		commands: {
			_execute_action: {
				suggested_key: { default: "Alt+Shift+D" },
				description: "描画モードを切り替える",
			},
		},
		// テキスト注釈フォントは content script（ページ側の文脈）から参照するため、
		// ページからアクセスできるリソースとして公開する必要がある。
		web_accessible_resources: [
			{
				resources: ["/fonts/mochiy-pop-one/*"],
				matches: ["<all_urls>"],
			},
		],
	},
});
