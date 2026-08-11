/**
 * 文言の取得。
 *
 * chrome.i18n.getMessage は拡張コンテキストでのみ使える。テストや
 * 開発時に API が無い場合でも UI が壊れないよう、フォールバックを持たせる。
 */

/** API が使えないときに出す最低限の英語。UI が空欄になるよりはましという水準。 */
const FALLBACK: Record<string, string> = {
	toolPen: "Pen",
	toolArrow: "Arrow",
	toolLine: "Line",
	toolRect: "Rectangle",
	toolEllipse: "Ellipse",
	toolSpotlight: "Spotlight",
	toolText: "Text",
	toolStep: "Step",
	toolLaser: "Laser",
	sizeSmall: "S",
	sizeMedium: "M",
	sizeLarge: "L",
	btnUndo: "Undo",
	btnClear: "Clear",
	btnSave: "Save PNG",
	btnFade: "Fading ink",
	btnPageMode: "Use page",
	btnDrawMode: "Back to drawing",
	btnClose: "Exit",
	hintSuffix: "Esc to exit",
};

/**
 * メッセージを取得する。
 *
 * @param key _locales の messages.json のキー
 * @param substitutions プレースホルダに差し込む値
 */
export function t(key: string, substitutions?: string[]): string {
	try {
		// 拡張コンテキスト外では存在しないので、型を緩めて存在チェックする
		const g = globalThis as unknown as {
			chrome?: { i18n?: { getMessage?: (k: string, s?: string[]) => string } };
			browser?: { i18n?: { getMessage?: (k: string, s?: string[]) => string } };
		};
		const api = g.chrome ?? g.browser;
		const msg = api?.i18n?.getMessage?.(key, substitutions);
		if (msg) return msg;
	} catch {
		// 拡張コンテキスト外。フォールバックへ落とす。
	}
	return FALLBACK[key] ?? key;
}
