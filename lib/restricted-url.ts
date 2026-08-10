/**
 * 拡張が動作できないページの判定。
 *
 * background から切り出してテスト可能にしている。ここを誤ると
 * 「アイコンを押しても何も起きない」という最悪の症状になるため。
 */

/**
 * 明らかに注入できないページか判定する。
 *
 * **重要**: activeTab しか持たない拡張では、アイコンをクリックした時点の
 * `tab.url` が `undefined` になる（URL の読み取りには `tabs` 権限か
 * `host_permissions` が必要）。したがって url が無いことを理由に弾くと、
 * 通常のページでも一切注入されなくなる。
 *
 * ここでの判定はあくまで補助で、本来の可否は `executeScript` の
 * 成否で決まる。
 */
export function isRestrictedUrl(url: string | undefined): boolean {
	// url が読めない = 制限ページとは限らない。必ず注入を試させる。
	if (!url) return false;
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
