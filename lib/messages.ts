/**
 * service worker と content script 間のメッセージ契約。
 * 判別可能ユニオンにして、通信を足すときは必ずここへ型を追加してから実装する。
 */

export type Message =
	/** オーバーレイが終了した（Esc / トグル）。アイコンのバッジを戻すのに使う。 */
	| { type: "OVERLAY_CLOSED" }
	/** オーバーレイが起動した。 */
	| { type: "OVERLAY_OPENED" }
	/**
	 * 表示中のタブを撮影して data URL を返すよう background に依頼する。
	 * captureVisibleTab は content script から直接呼べないため経由する。
	 */
	| { type: "CAPTURE_TAB" };

/** CAPTURE_TAB への応答。 */
export type CaptureResponse =
	| { ok: true; dataUrl: string }
	| { ok: false; error: string };

/** ツール 1 つ分の見た目設定。 */
export type ToolStyle = {
	colorId: string;
	sizeId: string;
};

export type PenPrefs = {
	/** 直近に使った色・太さ（ツール別の記録が無いときのフォールバック）。 */
	colorId: string;
	sizeId: string;
	/** 消えるインクの待機時間（ms）。null ならフェードしない。 */
	fadeMs: number | null;
	/** 最後に選んでいたツール（ShapeKind の文字列）。 */
	toolKind: string;
	/**
	 * ツールごとの色・太さ。
	 *
	 * 「矢印は赤、ハイライトは黄」のような使い分けが定着したとき、毎回
	 * 切り替える手間をなくすため。未記録のツールは colorId / sizeId を使う。
	 */
	byTool?: Record<string, ToolStyle>;
};

export const DEFAULT_PREFS: PenPrefs = {
	// shotcraft と同じ既定色（モダンミュートのコーラル）
	colorId: "coral",
	sizeId: "m",
	fadeMs: 6000,
	toolKind: "pen",
	byTool: {},
};

/**
 * ツールに対する色・太さを解決する。
 * 記録があればそれを、無ければ直近の設定を返す。
 */
export function styleForTool(prefs: PenPrefs, toolKind: string): ToolStyle {
	const recorded = prefs.byTool?.[toolKind];
	if (recorded) return recorded;
	return { colorId: prefs.colorId, sizeId: prefs.sizeId };
}

/** ツールの色・太さを記録した新しい prefs を返す（元は変更しない）。 */
export function rememberToolStyle(
	prefs: PenPrefs,
	toolKind: string,
	style: ToolStyle,
): PenPrefs {
	return {
		...prefs,
		colorId: style.colorId,
		sizeId: style.sizeId,
		byTool: { ...prefs.byTool, [toolKind]: style },
	};
}

/** 設定の保存キー（storage.local）。 */
export const PREFS_KEY = "inkover:prefs";
