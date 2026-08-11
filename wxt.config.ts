import { defineConfig } from "wxt";

export default defineConfig({
	manifest: {
		// _locales の messages.json から引く（default_locale は en）
		default_locale: "en",
		name: "__MSG_extName__",
		description: "__MSG_extDescription__",
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
				description: "__MSG_commandToggle__",
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
