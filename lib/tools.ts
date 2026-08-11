/**
 * ツールの定義とキーバインド。
 *
 * ショートカットは shotcraft と同じ割り当てにする（A=矢印, L=直線, R=矩形,
 * E=楕円, O=スポットライト, T=テキスト, P=ペン, S=ステップ）。両拡張を
 * 行き来しても手が迷わないようにするため。
 *
 * 会議中に手元を見ずに切り替えられるよう単キーで扱う。ページ側のショートカットと
 * 衝突しうるので、修飾キー押下時とテキスト入力中は content script 側で無視する。
 */

import type { ShapeKind } from "@/lib/shapes";

export type ToolDef = {
	kind: ShapeKind;
	label: string;
	/** ツールバーに出す短いラベル。アイコンの代わり。 */
	short: string;
	key: string;
	hint: string;
};

export const TOOLS: ToolDef[] = [
	{
		kind: "pen",
		label: "ペン",
		short: "✎",
		key: "p",
		hint: "ドラッグで手描き",
	},
	{
		kind: "arrow",
		label: "矢印",
		short: "↗",
		key: "a",
		hint: "ドラッグで矢印 / Shift で角度を 45 度刻み",
	},
	{
		kind: "line",
		label: "直線",
		short: "／",
		key: "l",
		hint: "ドラッグで直線 / Shift で角度を 45 度刻み",
	},
	{
		kind: "rect",
		label: "矩形",
		short: "□",
		key: "r",
		hint: "ドラッグで矩形 / Shift で正方形",
	},
	{
		kind: "ellipse",
		label: "楕円",
		short: "○",
		key: "e",
		hint: "ドラッグで楕円 / Shift で正円",
	},
	{
		kind: "spotlight",
		label: "スポットライト",
		short: "◐",
		key: "o",
		hint: "ドラッグした範囲以外を暗くする",
	},
	{
		kind: "text",
		label: "テキスト",
		short: "T",
		key: "t",
		hint: "クリックして入力 / Enter で確定 / Shift+Enter で改行",
	},
	{
		kind: "step",
		label: "ステップ",
		short: "①",
		key: "s",
		hint: "クリックで連番バッジ",
	},
	{
		kind: "laser",
		label: "レーザー",
		short: "•",
		key: "w",
		hint: "ドラッグした軌跡が一瞬で消える。線を残さず指したいときに",
	},
];

/**
 * ツール以外の単キーショートカット。
 * ツールのキー（上記）と重複させないこと。tests/tools.test.ts で検証している。
 */
export const ACTION_KEYS = {
	/** 全消去。破壊的操作なので Delete と Backspace に割り当てる。 */
	clear: ["Delete", "Backspace"],
	/** ページ操作モードの切替。 */
	toggleMode: "h",
	/** 消えるインクの切替。 */
	toggleFade: "f",
} as const;

export function toolByKey(key: string): ToolDef | undefined {
	const lower = key.toLowerCase();
	return TOOLS.find((t) => t.key === lower);
}

export function toolByKind(kind: ShapeKind): ToolDef | undefined {
	return TOOLS.find((t) => t.kind === kind);
}

/**
 * Shift 押下時に始点・終点を制約する。
 *
 * - 直線・矢印: 45 度刻みに吸着
 * - 矩形・楕円・スポットライト: 正方形にする
 */
export function constrain(
	kind: ShapeKind,
	from: { x: number; y: number },
	to: { x: number; y: number },
): { x: number; y: number } {
	const dx = to.x - from.x;
	const dy = to.y - from.y;

	if (kind === "line" || kind === "arrow") {
		const len = Math.hypot(dx, dy);
		if (len < 0.5) return to;
		// 45 度刻みの最も近い角度へ丸める
		const step = Math.PI / 4;
		const angle = Math.round(Math.atan2(dy, dx) / step) * step;
		return {
			x: from.x + Math.cos(angle) * len,
			y: from.y + Math.sin(angle) * len,
		};
	}

	if (kind === "rect" || kind === "ellipse" || kind === "spotlight") {
		const side = Math.max(Math.abs(dx), Math.abs(dy));
		return {
			x: from.x + Math.sign(dx || 1) * side,
			y: from.y + Math.sign(dy || 1) * side,
		};
	}

	return to;
}
