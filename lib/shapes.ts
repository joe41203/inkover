/**
 * 描画物のデータモデルと、描画に必要な純粋計算。
 * DOM / Canvas に依存しないのでユニットテストできる。
 *
 * 座標はすべて CSS px（ビューポート基準）。
 */

/** 入力点。pressure は 0〜1。 */
export type InputPoint = {
	x: number;
	y: number;
	pressure: number;
};

export type Point = { x: number; y: number };

export type ShapeKind =
	| "pen"
	| "arrow"
	| "line"
	| "rect"
	| "ellipse"
	| "text"
	| "spotlight"
	| "step";

type Base = {
	id: number;
	color: string;
	/** 線幅（CSS px）。 */
	size: number;
	/** 描き終えた時刻（ms）。描画中は null。フェードの起点。 */
	finishedAt: number | null;
	/**
	 * 描いた時点のスクロール位置。
	 *
	 * 座標はページ基準で保持し、描画時に現在のスクロール量との差を引く。
	 * これによりスクロールしても図形が同じ要素に貼り付いて見える。
	 */
	scroll: { x: number; y: number };
};

export type PenShape = Base & { kind: "pen"; points: InputPoint[] };
/** 始点と終点で決まる図形（矢印・直線・矩形・楕円・スポットライト）。 */
export type TwoPointShape = Base & {
	kind: "arrow" | "line" | "rect" | "ellipse" | "spotlight";
	from: Point;
	to: Point;
};
export type TextShape = Base & {
	kind: "text";
	at: Point;
	text: string;
	/** フォントサイズ（CSS px）。size とは別に持つ。 */
	fontSize: number;
};
export type StepShape = Base & {
	kind: "step";
	at: Point;
	/** 1 から始まる連番。 */
	index: number;
};

export type Shape = PenShape | TwoPointShape | TextShape | StepShape;

/** 始点・終点で描く種別か。ドラッグ操作の分岐に使う。 */
export function isTwoPoint(kind: ShapeKind): kind is TwoPointShape["kind"] {
	return (
		kind === "arrow" ||
		kind === "line" ||
		kind === "rect" ||
		kind === "ellipse" ||
		kind === "spotlight"
	);
}

/** クリック 1 回で置く種別か。 */
export function isClickPlaced(kind: ShapeKind): boolean {
	return kind === "text" || kind === "step";
}

// --- フェード（消えるインク） ---

/** 消えるインクの既定の待機時間（ms）。Loom の 5 秒より少し長く取る。 */
export const DEFAULT_FADE_MS = 6000;
/** フェードにかける時間（ms）。不透明度が 1 → 0 になる。 */
export const FADE_DURATION_MS = 800;

/**
 * 不透明度を返す（0〜1）。
 *
 * - 描画中（finishedAt が null）は常に 1
 * - 描き終えてから fadeMs までは 1
 * - そこから FADE_DURATION_MS かけて 0 へ
 * - fadeMs が null ならフェードしない
 */
export function shapeOpacity(
	shape: Shape,
	now: number,
	fadeMs: number | null,
): number {
	if (fadeMs === null) return 1;
	if (shape.finishedAt === null) return 1;
	const elapsed = now - shape.finishedAt;
	if (elapsed <= fadeMs) return 1;
	const faded = (elapsed - fadeMs) / FADE_DURATION_MS;
	if (faded >= 1) return 0;
	return 1 - faded;
}

/** 完全に消えたものを取り除く。描画対象を減らして無駄な再描画を避ける。 */
export function dropFaded(
	shapes: Shape[],
	now: number,
	fadeMs: number | null,
): Shape[] {
	if (fadeMs === null) return shapes;
	return shapes.filter((s) => shapeOpacity(s, now, fadeMs) > 0);
}

/**
 * まだ動いているものが残っているか。
 * false なら rAF ループを止めてよい（アイドル時の CPU を使わない）。
 */
export function hasAnimating(
	shapes: Shape[],
	now: number,
	fadeMs: number | null,
): boolean {
	if (fadeMs === null) return false;
	return shapes.some((s) => {
		if (s.finishedAt === null) return true;
		return shapeOpacity(s, now, fadeMs) > 0;
	});
}

// --- 幾何計算 ---

/** perfect-freehand に渡す [x, y, pressure] の三つ組へ変換する。 */
export function toFreehandInput(
	points: InputPoint[],
): [number, number, number][] {
	return points.map((p) => [p.x, p.y, p.pressure]);
}

/** 輪郭ポリゴンを Path2D 用の SVG パス文字列にする。 */
export function outlineToPath(outline: number[][]): string {
	const first = outline[0];
	if (!first) return "";
	const parts: string[] = [
		`M ${(first[0] ?? 0).toFixed(2)} ${(first[1] ?? 0).toFixed(2)}`,
	];
	for (let i = 1; i < outline.length; i++) {
		const p = outline[i];
		if (!p) continue;
		parts.push(`L ${(p[0] ?? 0).toFixed(2)} ${(p[1] ?? 0).toFixed(2)}`);
	}
	parts.push("Z");
	return parts.join(" ");
}

/** 2 点から正規化した矩形（負の幅・高さを作らない）を返す。 */
export function normalizeRect(
	from: Point,
	to: Point,
): { x: number; y: number; width: number; height: number } {
	return {
		x: Math.min(from.x, to.x),
		y: Math.min(from.y, to.y),
		width: Math.abs(to.x - from.x),
		height: Math.abs(to.y - from.y),
	};
}

/**
 * 矢印の先端（三角形）の 3 頂点を返す。
 *
 * 線幅に比例させると細い線で頭でっかちになるため、頭の長さは
 * 線幅の 4 倍を基本にしつつ、矢印全体の長さの 1/3 を上限にする。
 */
export function arrowHead(
	from: Point,
	to: Point,
	size: number,
): [Point, Point, Point] | null {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const len = Math.hypot(dx, dy);
	// 長さがないと角度が定まらない
	if (len < 0.5) return null;
	const headLen = Math.min(size * 4, len / 3);
	const ux = dx / len;
	const uy = dy / len;
	// 先端から根元へ戻った位置
	const bx = to.x - ux * headLen;
	const by = to.y - uy * headLen;
	// 法線方向へ広げる
	const halfWidth = headLen * 0.5;
	return [
		{ x: to.x, y: to.y },
		{ x: bx - uy * halfWidth, y: by + ux * halfWidth },
		{ x: bx + uy * halfWidth, y: by - ux * halfWidth },
	];
}

/**
 * 矢印の軸線の終点を返す。
 * 先端の三角形と重ならないよう、頭の分だけ手前で止める。
 */
export function arrowShaftEnd(from: Point, to: Point, size: number): Point {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const len = Math.hypot(dx, dy);
	if (len < 0.5) return to;
	const headLen = Math.min(size * 4, len / 3);
	// 三角形の内側に少し食い込ませて隙間をなくす
	const back = Math.max(headLen - size * 0.5, 0);
	return { x: to.x - (dx / len) * back, y: to.y - (dy / len) * back };
}

/** ステップバッジの半径。線幅に応じて大きくする。 */
export function stepRadius(size: number): number {
	return Math.max(14, size * 2.2);
}

/** 次のステップ番号を返す（既存の step の最大値 + 1）。 */
export function nextStepIndex(shapes: Shape[]): number {
	let max = 0;
	for (const s of shapes) {
		if (s.kind === "step" && s.index > max) max = s.index;
	}
	return max + 1;
}

/**
 * ドラッグが「クリック」とみなせるほど小さいか。
 * 図形の誤作成を防ぐしきい値。
 */
export function isClick(from: Point, to: Point, threshold = 4): boolean {
	return Math.hypot(to.x - from.x, to.y - from.y) < threshold;
}

// --- スクロール追従 ---

/**
 * 図形を描くときの平行移動量を返す。
 *
 * 図形は「描いた時点のスクロール位置」を持つので、現在位置との差だけ
 * ずらして描けば、ページ上の同じ場所に留まって見える。
 */
export function scrollOffset(
	shape: Shape,
	current: { x: number; y: number },
): Point {
	return {
		x: shape.scroll.x - current.x,
		y: shape.scroll.y - current.y,
	};
}

/**
 * 図形がビューポートから完全に外れたか。
 *
 * 外れたものは描画を省ける。スクロールの多いページで図形が溜まっても
 * フレーム時間が伸びないようにするための枝刈り。
 */
export function isOffscreen(
	shape: Shape,
	offset: Point,
	viewport: { width: number; height: number },
): boolean {
	// 線幅と、テキスト・バッジのはみ出しを考慮した余白
	const margin = Math.max(shape.size * 2, 60);
	const ys: number[] = [];
	const xs: number[] = [];

	if (shape.kind === "pen") {
		for (const p of shape.points) {
			xs.push(p.x);
			ys.push(p.y);
		}
	} else if (shape.kind === "text" || shape.kind === "step") {
		xs.push(shape.at.x);
		ys.push(shape.at.y);
	} else {
		xs.push(shape.from.x, shape.to.x);
		ys.push(shape.from.y, shape.to.y);
	}
	if (xs.length === 0) return false;

	// スポットライトは画面全体を覆うので、範囲外判定から除く
	if (shape.kind === "spotlight") return false;

	const minX = Math.min(...xs) + offset.x;
	const maxX = Math.max(...xs) + offset.x;
	const minY = Math.min(...ys) + offset.y;
	const maxY = Math.max(...ys) + offset.y;

	return (
		maxX < -margin ||
		minX > viewport.width + margin ||
		maxY < -margin ||
		minY > viewport.height + margin
	);
}
