import type { CaptureResponse, Message } from "@/lib/messages";
import { isRestrictedUrl } from "@/lib/restricted-url";

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

	browser.runtime.onMessage.addListener(
		(message: Message, sender, sendResponse) => {
			const tabId = sender.tab?.id;
			if (tabId === undefined) return;

			if (message.type === "OVERLAY_OPENED") {
				void setBadge(tabId, true);
				return;
			}
			if (message.type === "OVERLAY_CLOSED") {
				void setBadge(tabId, false);
				return;
			}
			if (message.type === "CAPTURE_TAB") {
				// 非同期で応答するので true を返してチャネルを開いたままにする
				void captureTab(sender.tab?.windowId).then(sendResponse);
				return true;
			}
		},
	);
});

/**
 * captureVisibleTab は 1 秒あたり 2 回までという制限がある。
 * 超えると例外になるので、最短間隔を守って順番待ちさせる。
 */
const CAPTURE_MIN_INTERVAL_MS = 600;
let nextCaptureAt = 0;

async function captureTab(
	windowId: number | undefined,
): Promise<CaptureResponse> {
	const now = Date.now();
	const wait = Math.max(0, nextCaptureAt - now);
	nextCaptureAt = Math.max(now, nextCaptureAt) + CAPTURE_MIN_INTERVAL_MS;
	if (wait > 0) await new Promise((r) => setTimeout(r, wait));

	try {
		// windowId が取れない場合は現在のウィンドウが対象になる
		const dataUrl =
			windowId === undefined
				? await browser.tabs.captureVisibleTab({ format: "png" })
				: await browser.tabs.captureVisibleTab(windowId, { format: "png" });
		return { ok: true, dataUrl };
	} catch (err) {
		const error = err instanceof Error ? err.message : String(err);
		console.error("[inkover] キャプチャに失敗しました", err);
		return { ok: false, error };
	}
}

async function toggleOverlay(tabId: number, url: string | undefined) {
	if (isRestrictedUrl(url)) {
		await showUnavailable(tabId);
		return;
	}

	try {
		// 既に起動していれば content script 側のセンチネルが検知してトグル終了する。
		await browser.scripting.executeScript({
			target: { tabId },
			files: ["/content-scripts/overlay.js"],
		});
	} catch (err) {
		// chrome:// や PDF ビューアなど、注入が許されないページはここで落ちる。
		console.error("[inkover] 注入に失敗しました", err);
		await showUnavailable(tabId);
	}
}

/** このページでは使えないことをバッジで知らせる（アラートはページを止めるので使わない）。 */
async function showUnavailable(tabId: number) {
	await browser.action.setBadgeText({ tabId, text: "✕" });
	await browser.action.setBadgeBackgroundColor({ tabId, color: "#8a94a6" });
	setTimeout(() => {
		void browser.action.setBadgeText({ tabId, text: "" });
	}, 2000);
}

async function setBadge(tabId: number, active: boolean) {
	await browser.action.setBadgeText({ tabId, text: active ? "●" : "" });
	if (active) {
		await browser.action.setBadgeBackgroundColor({ tabId, color: "#ff3b30" });
	}
}
