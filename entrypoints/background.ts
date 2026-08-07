import type { Message } from "@/lib/messages";

/**
 * アイコンクリックで描画オーバーレイを注入する。
 *
 * content script は静的登録せず executeScript で動的注入する。これは
 * host_permissions を要求しないための設計（activeTab はユーザー操作時にのみ
 * 現在タブへのアクセスを許可する）。
 */
export default defineBackground(() => {
	browser.action.onClicked.addListener((tab) => {
		if (tab.id === undefined) return;
		void toggleOverlay(tab.id, tab.url);
	});

	browser.runtime.onMessage.addListener((message: Message, sender) => {
		const tabId = sender.tab?.id;
		if (tabId === undefined) return;
		if (message.type === "OVERLAY_OPENED") {
			void setBadge(tabId, true);
		} else if (message.type === "OVERLAY_CLOSED") {
			void setBadge(tabId, false);
		}
	});
});

/**
 * 拡張が動作できないページか判定する。
 *
 * chrome:// 系・Chrome Web Store・PDF ビューアには content script を注入できない。
 * executeScript は例外を投げるだけで理由が分かりにくいので、先に弾いて
 * ユーザーへ説明できるようにする。
 */
function isRestrictedUrl(url: string | undefined): boolean {
	if (!url) return true;
	return (
		url.startsWith("chrome://") ||
		url.startsWith("chrome-extension://") ||
		url.startsWith("edge://") ||
		url.startsWith("about:") ||
		url.startsWith("devtools://") ||
		url.startsWith("view-source:") ||
		url.startsWith("https://chromewebstore.google.com/") ||
		url.startsWith("https://chrome.google.com/webstore")
	);
}

async function toggleOverlay(tabId: number, url: string | undefined) {
	if (isRestrictedUrl(url)) {
		// 注入できないページ。バッジで理由を示す（アラートはページを止めるので使わない）。
		await browser.action.setBadgeText({ tabId, text: "✕" });
		await browser.action.setBadgeBackgroundColor({ tabId, color: "#8a94a6" });
		setTimeout(() => {
			void browser.action.setBadgeText({ tabId, text: "" });
		}, 2000);
		return;
	}

	try {
		// 既に起動していれば content script 側のセンチネルが検知してトグル終了する。
		await browser.scripting.executeScript({
			target: { tabId },
			files: ["/content-scripts/overlay.js"],
		});
	} catch (err) {
		console.error("[inkover] 注入に失敗しました", err);
		await browser.action.setBadgeText({ tabId, text: "✕" });
		setTimeout(() => {
			void browser.action.setBadgeText({ tabId, text: "" });
		}, 2000);
	}
}

async function setBadge(tabId: number, active: boolean) {
	await browser.action.setBadgeText({ tabId, text: active ? "●" : "" });
	if (active) {
		await browser.action.setBadgeBackgroundColor({ tabId, color: "#ff3b30" });
	}
}
