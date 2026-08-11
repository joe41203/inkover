import { drawShape, drawTextCaret } from "@/lib/draw";
import {
	canvasToPngBlob,
	downloadBlob,
	exportFilename,
	loadImage,
} from "@/lib/export";
import { canvasSizeFor, captureScale, toCanvasPoint } from "@/lib/geometry";
import {
	type CaptureResponse,
	DEFAULT_PREFS,
	type Message,
	type PenPrefs,
	PREFS_KEY,
} from "@/lib/messages";
import {
	DEFAULT_FADE_MS,
	dropFaded,
	hasAnimating,
	type InputPoint,
	isClick,
	isTwoPoint,
	nextStepIndex,
	type Point,
	type Shape,
	type ShapeKind,
} from "@/lib/shapes";
import { PEN_COLORS, PEN_SIZES, theme } from "@/lib/theme";
import {
	ACTION_KEYS,
	constrain,
	TOOLS,
	toolByKey,
	toolByKind,
} from "@/lib/tools";

/**
 * 再注入検知用の window センチネル。content script は isolated world で動くので
 * ページや他拡張の変数とは干渉しない。2 回目の注入はトグル終了として扱う。
 */
const SENTINEL = "__inkoverOverlay";

export default defineContentScript({
	registration: "runtime",
	main() {
		const w = window as unknown as Record<string, unknown>;
		const existing = w[SENTINEL];
		if (typeof existing === "function") {
			(existing as () => void)();
			return;
		}
		void startOverlay(
			(dispose) => {
				w[SENTINEL] = dispose;
			},
			() => {
				delete w[SENTINEL];
			},
		);
	},
});

function send(message: Message): void {
	void browser.runtime.sendMessage(message);
}

/**
 * テキスト注釈用フォントを document に登録する。
 *
 * canvas の ctx.font は Shadow DOM 内の @font-face を解決できず、
 * document.fonts に載っている必要がある。読み込み完了を待ってから
 * 再描画しないと初回だけフォールバックのまま描かれる。
 */
async function ensureAnnotationFont(): Promise<void> {
	const FAMILY = "Mochiy Pop One";
	// 既に読み込み済みなら何もしない（再注入時の二重登録を避ける）
	for (const f of document.fonts) {
		if (f.family === FAMILY) return;
	}
	try {
		const url = browser.runtime.getURL(
			"/fonts/mochiy-pop-one/MochiyPopOne-Regular.woff2",
		);
		const face = new FontFace(FAMILY, `url(${url}) format("woff2")`, {
			weight: "400",
			style: "normal",
		});
		await face.load();
		document.fonts.add(face);
	} catch {
		// 読み込めなくてもシステムフォントで描ける。描画自体は止めない。
	}
}

async function loadPrefs(): Promise<PenPrefs> {
	try {
		// storage が応答しない環境でも起動を止めない。設定は次善のもの（既定値）で
		// よく、ここで待ち続けるとオーバーレイが一切出なくなる方が損失が大きい。
		const stored = await Promise.race([
			browser.storage.local.get(PREFS_KEY),
			new Promise<Record<string, unknown>>((resolve) =>
				setTimeout(() => resolve({}), 1000),
			),
		]);
		const value = stored[PREFS_KEY];
		if (value && typeof value === "object") {
			return { ...DEFAULT_PREFS, ...(value as Partial<PenPrefs>) };
		}
	} catch {
		// storage が読めなくても描画自体はできる。既定値で続行する。
	}
	return DEFAULT_PREFS;
}

async function startOverlay(
	onReady: (dispose: () => void) => void,
	onDispose: () => void,
): Promise<void> {
	const prefs = await loadPrefs();

	let color =
		PEN_COLORS.find((c) => c.id === prefs.colorId)?.value ??
		PEN_COLORS[0].value;
	let size =
		PEN_SIZES.find((s) => s.id === prefs.sizeId)?.value ?? PEN_SIZES[1].value;
	let fadeMs = prefs.fadeMs;
	let tool: ShapeKind = (prefs.toolKind as ShapeKind) ?? "pen";
	/** false のときはページ操作モード（クリックがページへ抜ける）。 */
	let drawing = true;

	function persist(): void {
		const colorId = PEN_COLORS.find((c) => c.value === color)?.id ?? "coral";
		const sizeId = PEN_SIZES.find((s) => s.value === size)?.id ?? "m";
		void browser.storage.local.set({
			[PREFS_KEY]: { colorId, sizeId, fadeMs, toolKind: tool },
		});
	}

	// --- DOM 構築（Shadow DOM でページ CSS から隔離する） ---

	const host = document.createElement("div");
	host.style.cssText =
		"position:fixed;inset:0;margin:0;padding:0;border:0;z-index:2147483647;";
	const shadow = host.attachShadow({ mode: "closed" });

	const style = document.createElement("style");
	style.textContent = `
    /* テキスト注釈用の同梱フォント。外部リクエストは行わず拡張内の WOFF2 を参照する。
       canvas の ctx.font は Shadow DOM 内の @font-face を解決できないため、
       document 側にも同じ定義を注入する（下の ensureAnnotationFont）。 */
    @font-face {
      font-family: "Mochiy Pop One";
      src: url("${browser.runtime.getURL("/fonts/mochiy-pop-one/MochiyPopOne-Regular.woff2")}") format("woff2");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    :host { all: initial; }
    canvas {
      position: fixed; inset: 0;
      /* 256px 超の fixed+z-index canvas で GPU 合成が乱れる Chrome のバグ対策。
         合成レイヤーを明示的に固定する。 */
      will-change: transform;
      touch-action: none;
      cursor: crosshair;
    }
    canvas.passthrough { pointer-events: none; cursor: default; }
    canvas.texting { cursor: text; }
    .bar {
      position: fixed; bottom: 20px; left: 50%;
      transform: translateX(-50%);
      display: flex; align-items: center; gap: 5px;
      background: ${theme.surface2};
      border: 1px solid ${theme.border};
      box-shadow: 0 12px 32px rgba(0,0,0,.5);
      border-radius: 14px; padding: 7px 9px;
      font: 12px/1.6 ${theme.fontSans};
      color: ${theme.text};
      user-select: none;
      max-width: calc(100vw - 32px);
      flex-wrap: wrap;
      justify-content: center;
    }
    .bar button { font-family: ${theme.fontSans}; }
    .tool {
      min-width: 28px; height: 26px; border-radius: 8px; cursor: pointer;
      background: transparent; color: ${theme.textMuted};
      border: 1px solid ${theme.border};
      font-size: 13px; line-height: 1; padding: 0 5px;
    }
    .tool[aria-pressed="true"] {
      color: ${theme.text}; border-color: ${theme.accent};
      background: rgba(56,189,248,.12);
    }
    .swatch {
      width: 20px; height: 20px; border-radius: 50%;
      border: 2px solid transparent; cursor: pointer; padding: 0;
    }
    .swatch[aria-pressed="true"] { border-color: ${theme.text}; }
    .size {
      min-width: 26px; height: 24px; border-radius: 8px; cursor: pointer;
      background: transparent; color: ${theme.textMuted};
      border: 1px solid ${theme.border};
      font-size: 11px; line-height: 1;
    }
    .size[aria-pressed="true"] { color: ${theme.text}; border-color: ${theme.accent}; }
    .sep { width: 1px; height: 18px; background: ${theme.border}; margin: 0 2px; }
    .btn {
      height: 24px; padding: 0 9px; border-radius: 8px; cursor: pointer;
      background: transparent; color: ${theme.textMuted};
      border: 1px solid ${theme.border};
      font-size: 11px; line-height: 1;
      white-space: nowrap;
    }
    .btn:hover { color: ${theme.text}; }
    .btn[aria-pressed="true"] { color: ${theme.text}; border-color: ${theme.accent}; }
    .toast {
      position: fixed; bottom: 76px; left: 50%;
      transform: translateX(-50%) translateY(6px);
      background: ${theme.surface2}; color: ${theme.text};
      border: 1px solid ${theme.border};
      box-shadow: 0 8px 24px rgba(0,0,0,.45);
      font: 12px/2 ${theme.fontSans};
      padding: 3px 14px; border-radius: 10px;
      pointer-events: none;
      opacity: 0;
      transition: opacity .18s ease, transform .18s ease;
    }
    .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .hint {
      position: fixed; top: 12px; left: 50%;
      transform: translateX(-50%);
      background: ${theme.surface2}; color: ${theme.textMuted};
      border: 1px solid ${theme.border};
      box-shadow: 0 8px 24px rgba(0,0,0,.45);
      font: 12px/2 ${theme.fontSans};
      padding: 2px 12px; border-radius: 10px;
      pointer-events: none;
      max-width: calc(100vw - 40px);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
  `;

	const canvas = document.createElement("canvas");
	const maybeCtx = canvas.getContext("2d");
	if (!maybeCtx) {
		console.error("[inkover] 2D コンテキストを取得できませんでした");
		return;
	}
	// 以降のクロージャで null 判定を繰り返さないよう、確定した型で束ね直す
	const ctx: CanvasRenderingContext2D = maybeCtx;

	const hint = document.createElement("div");
	hint.className = "hint";

	const toast = document.createElement("div");
	toast.className = "toast";

	const bar = document.createElement("div");
	bar.className = "bar";

	// ツール
	const toolButtons = TOOLS.map((t) => {
		const b = document.createElement("button");
		b.className = "tool";
		b.textContent = t.short;
		b.title = `${t.label} (${t.key.toUpperCase()})`;
		b.setAttribute("aria-pressed", String(t.kind === tool));
		b.addEventListener("click", () => setTool(t.kind));
		return { el: b, kind: t.kind };
	});

	// 色
	const swatches = PEN_COLORS.map((c) => {
		const b = document.createElement("button");
		b.className = "swatch";
		b.style.background = c.value;
		b.title = c.label;
		b.setAttribute("aria-pressed", String(c.value === color));
		b.addEventListener("click", () => {
			color = c.value;
			syncPressed();
			persist();
		});
		return { el: b, value: c.value };
	});

	// 太さ
	const sizeButtons = PEN_SIZES.map((s) => {
		const b = document.createElement("button");
		b.className = "size";
		b.textContent = s.label;
		b.setAttribute("aria-pressed", String(s.value === size));
		b.addEventListener("click", () => {
			size = s.value;
			syncPressed();
			persist();
		});
		return { el: b, value: s.value };
	});

	const undoBtn = document.createElement("button");
	undoBtn.className = "btn";
	undoBtn.textContent = "戻す";
	undoBtn.title = "取り消し (Cmd/Ctrl+Z)";
	undoBtn.addEventListener("click", () => undo());

	const clearBtn = document.createElement("button");
	clearBtn.className = "btn";
	clearBtn.textContent = "全消去";
	clearBtn.title = "全消去 (E)";
	clearBtn.addEventListener("click", () => {
		commitText();
		shapes.length = 0;
		requestRender();
	});

	const saveBtn = document.createElement("button");
	saveBtn.className = "btn";
	saveBtn.textContent = "PNG保存";
	saveBtn.title = "描画込みでこの画面を保存 (Cmd/Ctrl+S)";
	saveBtn.addEventListener("click", () => void exportPng());

	const fadeBtn = document.createElement("button");
	fadeBtn.className = "btn";
	fadeBtn.textContent = "消えるインク";
	fadeBtn.title = "一定時間で自動的に消す (F)";
	fadeBtn.setAttribute("aria-pressed", String(fadeMs !== null));
	fadeBtn.addEventListener("click", () => toggleFade());

	const modeBtn = document.createElement("button");
	modeBtn.className = "btn";
	modeBtn.textContent = "ページ操作";
	modeBtn.title = "ページを操作する (H)";
	modeBtn.setAttribute("aria-pressed", "false");
	modeBtn.addEventListener("click", () => setDrawing(!drawing));

	const closeBtn = document.createElement("button");
	closeBtn.className = "btn";
	closeBtn.textContent = "終了";
	closeBtn.title = "終了 (Esc)";
	closeBtn.addEventListener("click", () => cleanup());

	const sep = () => {
		const d = document.createElement("div");
		d.className = "sep";
		return d;
	};

	for (const t of toolButtons) bar.appendChild(t.el);
	bar.appendChild(sep());
	for (const s of swatches) bar.appendChild(s.el);
	bar.appendChild(sep());
	for (const s of sizeButtons) bar.appendChild(s.el);
	bar.appendChild(sep());
	bar.append(undoBtn, clearBtn, saveBtn, fadeBtn, modeBtn, sep(), closeBtn);

	shadow.append(style, canvas, hint, toast, bar);

	function syncPressed(): void {
		for (const t of toolButtons) {
			t.el.setAttribute("aria-pressed", String(t.kind === tool));
		}
		for (const s of swatches) {
			s.el.setAttribute("aria-pressed", String(s.value === color));
		}
		for (const s of sizeButtons) {
			s.el.setAttribute("aria-pressed", String(s.value === size));
		}
		fadeBtn.setAttribute("aria-pressed", String(fadeMs !== null));
		canvas.classList.toggle("texting", tool === "text" && drawing);
	}

	function updateHint(): void {
		if (!drawing) {
			hint.textContent =
				"ページを操作できます / H または「描画に戻る」で復帰 / Esc で終了";
			return;
		}
		if (textInput) {
			hint.textContent =
				"入力して Enter で確定 / Shift+Enter で改行 / Esc で取り消し";
			return;
		}
		const def = toolByKind(tool);
		hint.textContent = def
			? `${def.label}: ${def.hint} / Esc で終了`
			: "Esc で終了";
	}

	function setTool(next: ShapeKind): void {
		// テキスト入力中に別ツールへ移ると入力が宙に浮くので確定させる
		commitText();
		tool = next;
		syncPressed();
		updateHint();
		persist();
		requestRender();
	}

	function toggleFade(): void {
		fadeMs = fadeMs === null ? DEFAULT_FADE_MS : null;
		syncPressed();
		persist();
		requestRender();
	}

	/** 描画モードとページ操作モードを切り替える。canvas の pointer-events で制御する。 */
	function setDrawing(next: boolean): void {
		commitText();
		drawing = next;
		canvas.classList.toggle("passthrough", !drawing);
		modeBtn.setAttribute("aria-pressed", String(!drawing));
		modeBtn.textContent = drawing ? "ページ操作" : "描画に戻る";
		syncPressed();
		updateHint();
	}

	// --- キャンバスのサイズ管理 ---

	function resize(): void {
		const dpr = window.devicePixelRatio;
		const s = canvasSizeFor(window.innerWidth, window.innerHeight, dpr);
		canvas.width = s.bufferWidth;
		canvas.height = s.bufferHeight;
		canvas.style.width = `${s.cssWidth}px`;
		canvas.style.height = `${s.cssHeight}px`;
		// バッファを DPR 倍にしたので、描画座標系を CSS px に戻す。
		// これを忘れると線が DPR 倍の位置に出る（競合拡張で多い「ズレる」不具合の原因）。
		const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		requestRender();
	}

	// --- 状態 ---

	const shapes: Shape[] = [];
	/** ドラッグ中・入力中の未確定図形。確定時に shapes へ push する。 */
	let draft: Shape | null = null;
	/** テキスト入力中のバッファ。null なら入力していない。 */
	let textInput: { at: Point; text: string } | null = null;
	/** テキスト入力を始めた時点のスクロール位置。確定時に図形へ引き継ぐ。 */
	let textInputScroll = { x: 0, y: 0 };
	let nextId = 1;
	let rafId = 0;
	let pending = false;
	let shiftHeld = false;
	/** PNG 書き出し中は多重実行を防ぐ。 */
	let exporting = false;
	let toastTimer = 0;

	/** 現在のスクロール位置。図形はページ座標で持ち、描画時に差を取る。 */
	function currentScroll(): { x: number; y: number } {
		return { x: window.scrollX, y: window.scrollY };
	}

	function requestRender(): void {
		if (pending) return;
		pending = true;
		rafId = requestAnimationFrame(render);
	}

	function render(): void {
		pending = false;
		const now = performance.now();

		const alive = dropFaded(shapes, now, fadeMs);
		if (alive.length !== shapes.length) {
			shapes.length = 0;
			shapes.push(...alive);
		}

		ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

		const dc = {
			ctx,
			width: window.innerWidth,
			height: window.innerHeight,
			now,
			fadeMs,
			scroll: currentScroll(),
		};
		for (const shape of shapes) drawShape(shape, dc);
		if (draft) drawShape(draft, dc);
		if (textInput) {
			// 入力中のテキストと点滅カーソルを重ねる
			drawShape(
				{
					id: 0,
					kind: "text",
					color,
					size,
					at: textInput.at,
					text: textInput.text,
					fontSize: textFontSize(),
					finishedAt: null,
					scroll: textInputScroll,
				},
				dc,
			);
			drawTextCaret(
				caretPos(textInput.text, textInput.at),
				textFontSize(),
				ctx,
				now,
			);
		}

		// フェード中・入力中なら次フレームも回す。何も動いていなければ止めて CPU を使わない。
		if (draft || textInput || hasAnimating(shapes, now, fadeMs)) {
			pending = true;
			rafId = requestAnimationFrame(render);
		}
	}

	/** テキストのフォントサイズ。線の太さに連動させる。 */
	function textFontSize(): number {
		return Math.max(16, size * 2.5);
	}

	/** 入力中カーソルの位置（最終行の末尾）。 */
	function caretPos(text: string, at: Point): Point {
		const lines = text.split("\n");
		const last = lines[lines.length - 1] ?? "";
		ctx.save();
		// 描画側（lib/draw.ts の drawText）と同じ指定にしないとカーソル位置がずれる
		ctx.font = `400 ${textFontSize()}px ${theme.fontAnnotation}`;
		const w = ctx.measureText(last).width;
		ctx.restore();
		return {
			x: at.x + w + 2,
			y: at.y + (lines.length - 1) * textFontSize() * 1.35,
		};
	}

	/** 入力中のテキストを確定する。空文字なら破棄。 */
	function commitText(): void {
		if (!textInput) return;
		const value = textInput.text;
		const at = textInput.at;
		textInput = null;
		if (value.trim() !== "") {
			shapes.push({
				id: nextId++,
				kind: "text",
				color,
				size,
				at,
				text: value,
				fontSize: textFontSize(),
				finishedAt: performance.now(),
				scroll: textInputScroll,
			});
		}
		updateHint();
		requestRender();
	}

	/**
	 * 画面のスクリーンショットと描画を合成して PNG で保存する。
	 *
	 * captureVisibleTab は content script から直接呼べないので background に
	 * 依頼する。ツールバーとヒントは写り込ませたくないので一時的に隠す。
	 */
	async function exportPng(): Promise<void> {
		if (exporting) return;
		exporting = true;
		commitText();

		// UI を隠し、描画が確定してからキャプチャする（rAF 2 回待つ）
		bar.style.visibility = "hidden";
		hint.style.visibility = "hidden";
		await new Promise((r) =>
			requestAnimationFrame(() => requestAnimationFrame(r)),
		);

		try {
			const res = (await browser.runtime.sendMessage({
				type: "CAPTURE_TAB",
			})) as CaptureResponse | undefined;

			if (!res?.ok) {
				showToast(`保存できませんでした（${res?.error ?? "不明なエラー"}）`);
				return;
			}

			const shot = await loadImage(res.dataUrl);
			// 画像の実サイズとビューポートから軸別のスケールを求める。
			// devicePixelRatio と一致しないことがある（ブラウザズーム時）。
			const scale = captureScale(
				shot.naturalWidth,
				shot.naturalHeight,
				window.innerWidth,
				window.innerHeight,
			);

			const out = document.createElement("canvas");
			out.width = shot.naturalWidth;
			out.height = shot.naturalHeight;
			const octx = out.getContext("2d");
			if (!octx) {
				showToast("保存できませんでした（キャンバスを作れません）");
				return;
			}
			octx.drawImage(shot, 0, 0);
			// 描画レイヤーはビューポート基準なので、画像の倍率に合わせて拡大する
			octx.scale(scale.x, scale.y);
			octx.drawImage(canvas, 0, 0, window.innerWidth, window.innerHeight);

			const blob = await canvasToPngBlob(out);
			downloadBlob(blob, exportFilename(new Date()));
			showToast("PNG を保存しました");
		} catch (err) {
			console.error("[inkover] 書き出しに失敗しました", err);
			showToast("保存できませんでした");
		} finally {
			bar.style.visibility = "";
			hint.style.visibility = "";
			exporting = false;
		}
	}

	/** 一時的なメッセージを出す。alert はページを止めるので使わない。 */
	function showToast(text: string): void {
		toast.textContent = text;
		toast.classList.add("show");
		clearTimeout(toastTimer);
		toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
	}

	function undo(): void {
		if (textInput) {
			textInput = null;
			updateHint();
			requestRender();
			return;
		}
		shapes.pop();
		requestRender();
	}

	// --- ポインタ操作 ---

	function pointFrom(e: PointerEvent): InputPoint {
		const rect = canvas.getBoundingClientRect();
		const p = toCanvasPoint(e.clientX, e.clientY, rect);
		return {
			x: p.x,
			y: p.y,
			// マウスは常に 0.5。ペンのみ実測値が入る。
			pressure: e.pressure > 0 ? e.pressure : 0.5,
		};
	}

	const onPointerDown = (e: PointerEvent): void => {
		if (!drawing || e.button !== 0) return;
		e.preventDefault();

		// テキスト入力中に別の場所を押したら、まず確定する
		if (textInput) {
			commitText();
			if (tool === "text") return;
		}

		const p = pointFrom(e);
		// キャンバス外へドラッグしても追従させる。ただし pointerId が既に
		// 解放されている場合など NotFoundError を投げることがあるため、
		// 失敗しても描画は続行する（捕捉できなくても描けはする）。
		try {
			canvas.setPointerCapture(e.pointerId);
		} catch {
			// キャプチャできなくても描画自体には影響しない
		}

		if (tool === "pen") {
			draft = {
				id: nextId++,
				kind: "pen",
				color,
				size,
				points: [p],
				finishedAt: null,
				scroll: currentScroll(),
			};
		} else if (isTwoPoint(tool)) {
			draft = {
				id: nextId++,
				kind: tool,
				color,
				size,
				from: { x: p.x, y: p.y },
				to: { x: p.x, y: p.y },
				finishedAt: null,
				scroll: currentScroll(),
			};
		} else if (tool === "step") {
			shapes.push({
				id: nextId++,
				kind: "step",
				color,
				size,
				at: { x: p.x, y: p.y },
				index: nextStepIndex(shapes),
				finishedAt: performance.now(),
				scroll: currentScroll(),
			});
		} else if (tool === "text") {
			textInput = { at: { x: p.x, y: p.y }, text: "" };
			textInputScroll = currentScroll();
			updateHint();
		}
		requestRender();
	};

	const onPointerMove = (e: PointerEvent): void => {
		if (!draft) return;
		e.preventDefault();
		const p = pointFrom(e);

		if (draft.kind === "pen") {
			// 高頻度入力でブラウザが間引いた座標も回収する。
			// これをしないと速く描いたときに線がカクつく。
			const coalesced = e.getCoalescedEvents?.() ?? [];
			if (coalesced.length > 0) {
				for (const ce of coalesced) draft.points.push(pointFrom(ce));
			} else {
				draft.points.push(p);
			}
		} else if (draft.kind !== "text" && draft.kind !== "step") {
			draft.to = shiftHeld
				? constrain(draft.kind, draft.from, { x: p.x, y: p.y })
				: { x: p.x, y: p.y };
		}
		// ここでは描画しない。rAF に任せて 1 フレーム 1 回に抑える。
		requestRender();
	};

	const onPointerUp = (e: PointerEvent): void => {
		if (!draft) return;
		e.preventDefault();

		// 動きが小さすぎる図形は誤操作とみなして捨てる（ペンは点でも残す）
		if (
			draft.kind !== "pen" &&
			draft.kind !== "text" &&
			draft.kind !== "step"
		) {
			if (isClick(draft.from, draft.to)) {
				draft = null;
				requestRender();
				return;
			}
		}

		draft.finishedAt = performance.now();
		shapes.push(draft);
		draft = null;
		requestRender();
	};

	// --- キーボード ---

	const onKeyDown = (e: KeyboardEvent): void => {
		// テキスト入力中はほぼ全キーを入力として扱う
		if (textInput) {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				textInput = null;
				updateHint();
				requestRender();
				return;
			}
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				commitText();
				return;
			}
			if (e.key === "Enter" && e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				textInput.text += "\n";
				requestRender();
				return;
			}
			if (e.key === "Backspace") {
				e.preventDefault();
				e.stopPropagation();
				textInput.text = textInput.text.slice(0, -1);
				requestRender();
				return;
			}
			// IME 変換中は composing フラグが立つ。確定文字だけ拾う。
			if (e.isComposing) return;
			if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
				e.preventDefault();
				e.stopPropagation();
				textInput.text += e.key;
				requestRender();
			}
			return;
		}

		if (e.key === "Shift") {
			shiftHeld = true;
			// 押した時点のドラッフトへ即座に反映する
			if (
				draft &&
				draft.kind !== "pen" &&
				draft.kind !== "text" &&
				draft.kind !== "step"
			) {
				draft.to = constrain(draft.kind, draft.from, draft.to);
				requestRender();
			}
			return;
		}

		if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			cleanup();
			return;
		}

		// 保存はページ側の「名前を付けて保存」を抑止して奪う
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
			e.preventDefault();
			e.stopPropagation();
			void exportPng();
			return;
		}

		// 取り消しは修飾キー付き
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
			e.preventDefault();
			e.stopPropagation();
			undo();
			return;
		}

		// 以降は修飾キーなしの単キーのみ。ページ側のショートカット誤爆を避ける
		if (e.metaKey || e.ctrlKey || e.altKey) return;

		const def = toolByKey(e.key);
		if (def) {
			e.preventDefault();
			e.stopPropagation();
			setTool(def.kind);
			return;
		}

		// 全消去は Delete / Backspace（ツールのキーと衝突させないため）
		if ((ACTION_KEYS.clear as readonly string[]).includes(e.key)) {
			e.preventDefault();
			e.stopPropagation();
			shapes.length = 0;
			requestRender();
			return;
		}

		const lower = e.key.toLowerCase();
		if (lower === ACTION_KEYS.toggleMode) {
			e.preventDefault();
			setDrawing(!drawing);
		} else if (lower === ACTION_KEYS.toggleFade) {
			e.preventDefault();
			toggleFade();
		} else if (lower >= "1" && lower <= "7") {
			// 数字キーで色を切り替える（パレットは 7 色）
			const picked = PEN_COLORS[Number(lower) - 1];
			if (picked) {
				e.preventDefault();
				color = picked.value;
				syncPressed();
				persist();
			}
		}
	};

	const onKeyUp = (e: KeyboardEvent): void => {
		if (e.key === "Shift") shiftHeld = false;
	};

	const onResize = (): void => resize();

	/**
	 * スクロール追従。図形はページ座標で持っているので、位置が変われば
	 * 描き直すだけで貼り付いて見える。
	 */
	const onScroll = (): void => requestRender();

	// --- 後片付け ---

	function cleanup(): void {
		cancelAnimationFrame(rafId);
		canvas.removeEventListener("pointerdown", onPointerDown);
		canvas.removeEventListener("pointermove", onPointerMove);
		canvas.removeEventListener("pointerup", onPointerUp);
		canvas.removeEventListener("pointercancel", onPointerUp);
		window.removeEventListener("keydown", onKeyDown, true);
		window.removeEventListener("keyup", onKeyUp, true);
		window.removeEventListener("resize", onResize);
		window.removeEventListener("scroll", onScroll, true);
		host.remove();
		onDispose();
		send({ type: "OVERLAY_CLOSED" });
	}

	canvas.addEventListener("pointerdown", onPointerDown);
	canvas.addEventListener("pointermove", onPointerMove);
	canvas.addEventListener("pointerup", onPointerUp);
	canvas.addEventListener("pointercancel", onPointerUp);
	window.addEventListener("keydown", onKeyDown, true);
	window.addEventListener("keyup", onKeyUp, true);
	window.addEventListener("resize", onResize);
	window.addEventListener("scroll", onScroll, { passive: true, capture: true });

	document.documentElement.appendChild(host);
	syncPressed();
	updateHint();
	resize();
	onReady(cleanup);
	send({ type: "OVERLAY_OPENED" });

	// フォントは非同期に読み込まれる。届いたら描き直して字形を差し替える
	// （待たずに起動するのは、ペンなど文字を使わない操作を遅らせないため）。
	void ensureAnnotationFont().then(() => requestRender());
}
