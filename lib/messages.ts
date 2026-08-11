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

export type PenPrefs = {
	colorId: string;
	sizeId: string;
	/** 消えるインクの待機時間（ms）。null ならフェードしない。 */
	fadeMs: number | null;
	/** 最後に選んでいたツール（ShapeKind の文字列）。 */
	toolKind: string;
};

export const DEFAULT_PREFS: PenPrefs = {
	// shotcraft と同じ既定色（モダンミュートのコーラル）
	colorId: "coral",
	sizeId: "m",
	fadeMs: 6000,
	toolKind: "pen",
};

/** 設定の保存キー（storage.local）。 */
export const PREFS_KEY = "inkover:prefs";
