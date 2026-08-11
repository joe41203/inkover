/**
 * デザイントークン。
 *
 * 姉妹プロダクト shotcraft の midnight テーマと同じ値を使う。両拡張を並べて
 * 使ったときに見た目が揃うようにするため、勝手に変えない。
 *
 * content script の Shadow DOM は拡張ページの CSS 変数を参照できないので、
 * TS 定数として持つ。
 */
export const theme = {
	bg: "#0b0f19", // 最深部
	surface: "#161b26", // ツールバーの面
	surface2: "#1f2632", // 面上の面
	surfaceHover: "#232b39", // hover 時の面
	// Shadow DOM は下地に半透明を合成できないため、border は surface 上に
	// rgba(255,255,255,0.09) を合成した実効色（不透明）を持たせる。
	border: "#2a303b",
	text: "#f2f5f9", // 主文字
	textMuted: "#9aa6b8", // 補助文字
	accent: "#10b981", // 主要アクション（emerald）
	danger: "#f87171", // 破壊的操作
	ring: "#38bdf8", // フォーカスリング・選択色
	// UI フォントは同梱せず OS のシステムフォントに依存する。
	fontSans:
		'-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif',
	// テキスト注釈で使う固定フォント。同梱するのはこの Mochiy Pop One 1 種だけで、
	// 以降はシステムフォールバック。shotcraft と同じ丸文字にする。
	fontAnnotation:
		'"Mochiy Pop One", "Hiragino Maru Gothic ProN", "Rounded Mplus 1c", -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif',
} as const;

/**
 * 色スウォッチ（モダンミュート）。既定はコーラル。
 * shotcraft の entrypoints/editor/toolbar.ts の COLORS と同じ並び・同じ値にする。
 */
export const PEN_COLORS = [
	{ id: "coral", labelKey: "colorCoral", value: "#fb7185" },
	{ id: "amber", labelKey: "colorAmber", value: "#fbbf24" },
	{ id: "emerald", labelKey: "colorEmerald", value: "#34d399" },
	{ id: "sky", labelKey: "colorSky", value: "#38bdf8" },
	{ id: "violet", labelKey: "colorViolet", value: "#a78bfa" },
	{ id: "black", labelKey: "colorBlack", value: "#18181b" },
	{ id: "white", labelKey: "colorWhite", value: "#fafafa" },
] as const;

/** 線の太さ（CSS px）。 */
export const PEN_SIZES = [
	{ id: "s", labelKey: "sizeSmall", value: 4 },
	{ id: "m", labelKey: "sizeMedium", value: 8 },
	{ id: "l", labelKey: "sizeLarge", value: 16 },
] as const;

export type PenColorId = (typeof PEN_COLORS)[number]["id"];
export type PenSizeId = (typeof PEN_SIZES)[number]["id"];
