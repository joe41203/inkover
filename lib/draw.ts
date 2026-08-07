/**
 * Shape を Canvas 2D へ描く。
 *
 * 描画専用でデータは書き換えない。ここを通せば描画中のプレビューも
 * 確定後の再描画も同じ見た目になる。
 */

import { getStroke } from "perfect-freehand";
import {
	arrowHead,
	arrowShaftEnd,
	normalizeRect,
	outlineToPath,
	type Shape,
	shapeOpacity,
	stepRadius,
	toFreehandInput,
} from "@/lib/shapes";
import { theme } from "@/lib/theme";

export type DrawContext = {
	ctx: CanvasRenderingContext2D;
	/** ビューポート幅（CSS px）。スポットライトの暗幕に使う。 */
	width: number;
	height: number;
	now: number;
	fadeMs: number | null;
};

export function drawShape(shape: Shape, dc: DrawContext): void {
	const opacity = shapeOpacity(shape, dc.now, dc.fadeMs);
	if (opacity <= 0) return;

	const { ctx } = dc;
	ctx.save();
	ctx.globalAlpha = opacity;
	ctx.strokeStyle = shape.color;
	ctx.fillStyle = shape.color;
	ctx.lineWidth = shape.size;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";

	switch (shape.kind) {
		case "pen":
			drawPen(shape.points, shape.size, shape.finishedAt !== null, ctx);
			break;
		case "line":
			strokeLine(shape.from, shape.to, ctx);
			break;
		case "arrow":
			drawArrow(shape.from, shape.to, shape.size, ctx);
			break;
		case "rect": {
			const r = normalizeRect(shape.from, shape.to);
			ctx.strokeRect(r.x, r.y, r.width, r.height);
			break;
		}
		case "ellipse": {
			const r = normalizeRect(shape.from, shape.to);
			ctx.beginPath();
			ctx.ellipse(
				r.x + r.width / 2,
				r.y + r.height / 2,
				r.width / 2,
				r.height / 2,
				0,
				0,
				Math.PI * 2,
			);
			ctx.stroke();
			break;
		}
		case "spotlight":
			drawSpotlight(shape.from, shape.to, dc);
			break;
		case "text":
			drawText(shape.text, shape.at, shape.fontSize, shape.color, ctx);
			break;
		case "step":
			drawStep(shape.index, shape.at, shape.size, shape.color, ctx);
			break;
	}

	ctx.restore();
}

function drawPen(
	points: { x: number; y: number; pressure: number }[],
	size: number,
	finished: boolean,
	ctx: CanvasRenderingContext2D,
): void {
	const outline = getStroke(toFreehandInput(points), {
		size,
		thinning: 0.5,
		smoothing: 0.5,
		streamline: 0.5,
		// 描き終わったら末端まで閉じる
		last: finished,
	});
	const d = outlineToPath(outline);
	if (!d) return;
	ctx.fill(new Path2D(d));
}

function strokeLine(
	from: { x: number; y: number },
	to: { x: number; y: number },
	ctx: CanvasRenderingContext2D,
): void {
	ctx.beginPath();
	ctx.moveTo(from.x, from.y);
	ctx.lineTo(to.x, to.y);
	ctx.stroke();
}

function drawArrow(
	from: { x: number; y: number },
	to: { x: number; y: number },
	size: number,
	ctx: CanvasRenderingContext2D,
): void {
	const head = arrowHead(from, to, size);
	// 長さが足りず頭を作れないうちは軸だけ描く
	if (!head) {
		strokeLine(from, to, ctx);
		return;
	}
	strokeLine(from, arrowShaftEnd(from, to, size), ctx);
	ctx.beginPath();
	ctx.moveTo(head[0].x, head[0].y);
	ctx.lineTo(head[1].x, head[1].y);
	ctx.lineTo(head[2].x, head[2].y);
	ctx.closePath();
	ctx.fill();
}

/**
 * 選択範囲以外を暗く覆う。
 * 矩形を 2 周（外周は時計回り、内側は反時計回り）描いて evenodd で抜く。
 */
function drawSpotlight(
	from: { x: number; y: number },
	to: { x: number; y: number },
	dc: DrawContext,
): void {
	const { ctx } = dc;
	const r = normalizeRect(from, to);
	ctx.beginPath();
	ctx.rect(0, 0, dc.width, dc.height);
	ctx.rect(r.x, r.y, r.width, r.height);
	ctx.fillStyle = "rgba(3, 6, 12, 0.55)";
	ctx.fill("evenodd");
	// 抜いた範囲の境界を薄く示す
	ctx.strokeStyle = "rgba(255,255,255,0.35)";
	ctx.lineWidth = 1;
	ctx.strokeRect(r.x, r.y, r.width, r.height);
}

function drawText(
	text: string,
	at: { x: number; y: number },
	fontSize: number,
	color: string,
	ctx: CanvasRenderingContext2D,
): void {
	if (!text) return;
	ctx.font = `400 ${fontSize}px ${theme.fontAnnotation}`;
	ctx.textBaseline = "top";
	const lines = text.split("\n");
	// 背景が明るくても暗くても読めるよう、縁取りしてから塗る
	ctx.lineWidth = Math.max(3, fontSize / 6);
	ctx.strokeStyle = "rgba(0,0,0,0.55)";
	ctx.lineJoin = "round";
	const lineHeight = fontSize * 1.35;
	lines.forEach((line, i) => {
		const y = at.y + i * lineHeight;
		ctx.strokeText(line, at.x, y);
	});
	ctx.fillStyle = color;
	lines.forEach((line, i) => {
		const y = at.y + i * lineHeight;
		ctx.fillText(line, at.x, y);
	});
}

function drawStep(
	index: number,
	at: { x: number; y: number },
	size: number,
	color: string,
	ctx: CanvasRenderingContext2D,
): void {
	const r = stepRadius(size);
	ctx.beginPath();
	ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
	ctx.fillStyle = color;
	ctx.fill();
	ctx.lineWidth = 2;
	ctx.strokeStyle = "rgba(255,255,255,0.9)";
	ctx.stroke();

	ctx.fillStyle = "#ffffff";
	ctx.font = `400 ${Math.round(r * 1.1)}px ${theme.fontAnnotation}`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	// 数字は視覚的な中心が少し下にずれるので補正する
	ctx.fillText(String(index), at.x, at.y + r * 0.06);
}

/** テキスト入力中のカーソル位置を示す枠を描く（確定前のプレビュー用）。 */
export function drawTextCaret(
	at: { x: number; y: number },
	fontSize: number,
	ctx: CanvasRenderingContext2D,
	now: number,
): void {
	// 500ms 周期で点滅させる
	if (Math.floor(now / 500) % 2 === 1) return;
	ctx.save();
	ctx.globalAlpha = 0.9;
	ctx.fillStyle = theme.accent;
	ctx.fillRect(at.x, at.y, 2, fontSize * 1.2);
	ctx.restore();
}
