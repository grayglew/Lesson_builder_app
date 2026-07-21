"use client";

import { Check, Highlighter, PenLine, RotateCcw, Trash2, X } from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import styles from "./ImageDrawingEditor.module.css";
import {
  IMAGE_DRAWING_HEIGHT,
  IMAGE_DRAWING_WIDTH,
  type ImageDrawingMode,
  type ImageDrawingStroke,
  createImageDrawingStroke,
  drawImageEditorCanvas,
  drawingCanvasToAsset,
  imageDrawingPointFromClient,
  loadImageDrawingBackground,
  resolveImageDrawingBackground,
} from "./image-drawing";
import type { BuilderAsset } from "./schema";
import { useDialogFocus } from "./useDialogFocus";

const DRAWING_COLORS = [
  {
    value: "#111827",
    label: "Black pen",
    style: { "--image-drawing-swatch": "#111827" } as CSSProperties,
  },
  {
    value: "#2563eb",
    label: "Blue pen",
    style: { "--image-drawing-swatch": "#2563eb" } as CSSProperties,
  },
  {
    value: "#dc2626",
    label: "Red pen",
    style: { "--image-drawing-swatch": "#dc2626" } as CSSProperties,
  },
  {
    value: "#16a34a",
    label: "Green pen",
    style: { "--image-drawing-swatch": "#16a34a" } as CSSProperties,
  },
] as const;

type ImageDrawingEditorProps = {
  asset: BuilderAsset | null | undefined;
  label: string;
  onDone: (asset: BuilderAsset, file: File) => void;
  onCancel: () => void;
  onError: (message: string) => void;
};

export function ImageDrawingEditor({
  asset,
  label,
  onDone,
  onCancel,
  onError,
}: ImageDrawingEditorProps) {
  const titleId = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStrokeRef = useRef<ImageDrawingStroke | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [background, setBackground] = useState<HTMLImageElement | null>(null);
  const [strokes, setStrokes] = useState<ImageDrawingStroke[]>([]);
  const [mode, setMode] = useState<ImageDrawingMode>("pen");
  const [color, setColor] = useState("#2563eb");
  const [size, setSize] = useState(8);
  const [isLoading, setIsLoading] = useState(Boolean(asset?.dataUrl));
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const dialogRef = useDialogFocus<HTMLElement>(onCancel);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadBackground() {
      if (!asset?.dataUrl) {
        setIsLoading(false);
        return;
      }
      try {
        const dataUrl = await resolveImageDrawingBackground(asset);
        const image = await loadImageDrawingBackground(dataUrl);
        if (!cancelled) setBackground(image);
      } catch {
        if (!cancelled) {
          setNotice(
            "Could not load the existing image as a drawing background. Starting blank.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadBackground();
    return () => {
      cancelled = true;
    };
  }, [asset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawImageEditorCanvas(canvas, background, strokes);
  }, [background, strokes]);

  function startStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (isLoading || isSaving) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    pointerIdRef.current = event.pointerId;
    activeStrokeRef.current = createImageDrawingStroke(
      mode,
      color,
      size,
      canvas.getBoundingClientRect().width,
      imageDrawingPointFromClient(
        event.clientX,
        event.clientY,
        canvas.getBoundingClientRect(),
      ),
    );
  }

  function continueStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const stroke = activeStrokeRef.current;
    const canvas = canvasRef.current;
    if (!stroke || !canvas || pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const point = imageDrawingPointFromClient(
      event.clientX,
      event.clientY,
      canvas.getBoundingClientRect(),
    );
    const previous = stroke.points[stroke.points.length - 1];
    if (Math.hypot(previous.x - point.x, previous.y - point.y) >= 0.5) {
      stroke.points.push(point);
      drawImageEditorCanvas(canvas, background, [...strokes, stroke]);
    }
  }

  function finishStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const stroke = activeStrokeRef.current;
    const canvas = canvasRef.current;
    if (!stroke || pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    setStrokes((current) => [...current, stroke]);
    activeStrokeRef.current = null;
    pointerIdRef.current = null;
    try {
      canvas?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
  }

  function undo() {
    activeStrokeRef.current = null;
    pointerIdRef.current = null;
    setStrokes((current) => current.slice(0, -1));
  }

  function clear() {
    activeStrokeRef.current = null;
    pointerIdRef.current = null;
    setStrokes([]);
  }

  function done() {
    const canvas = canvasRef.current;
    if (!canvas || isLoading) return;
    setIsSaving(true);
    try {
      drawImageEditorCanvas(canvas, background, strokes);
      const result = drawingCanvasToAsset(canvas, asset);
      onDone(result.asset, result.file);
    } catch {
      setIsSaving(false);
      onError("Could not paste the drawing into the image box.");
    }
  }

  return (
    <div className={styles.overlay} role="presentation">
      <section
        ref={dialogRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className={styles.toolbar}>
          <div className={styles.titleGroup}>
            <span className={styles.eyebrow}>Pen image</span>
            <h2 className={styles.title} id={titleId}>
              Draw {label}
            </h2>
          </div>
          <div className={styles.controls} aria-label="Drawing controls">
            {DRAWING_COLORS.map((entry) => (
              <button
                key={entry.value}
                className={`${styles.swatch} ${color === entry.value ? styles.swatchActive : ""}`}
                type="button"
                aria-label={entry.label}
                aria-pressed={color === entry.value}
                style={entry.style}
                onClick={() => setColor(entry.value)}
              />
            ))}
            <button
              className={`${styles.button} ${mode === "pen" ? styles.buttonActive : ""}`}
              type="button"
              autoFocus
              aria-pressed={mode === "pen"}
              onClick={() => setMode("pen")}
            >
              <PenLine size={15} aria-hidden />
              Pen
            </button>
            <button
              className={`${styles.button} ${mode === "highlighter" ? styles.buttonActive : ""}`}
              type="button"
              aria-pressed={mode === "highlighter"}
              onClick={() => setMode("highlighter")}
            >
              <Highlighter size={15} aria-hidden />
              Highlighter
            </button>
            <label className={styles.sizeLabel} htmlFor={`${titleId}-size`}>
              Size
            </label>
            <input
              className={styles.size}
              id={`${titleId}-size`}
              type="range"
              min={2}
              max={24}
              step={1}
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
            />
            <button className={styles.button} type="button" onClick={undo}>
              <RotateCcw size={15} aria-hidden />
              Undo
            </button>
            <button className={styles.button} type="button" onClick={clear}>
              <Trash2 size={15} aria-hidden />
              Clear
            </button>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={isLoading || isSaving}
              onClick={done}
            >
              <Check size={15} aria-hidden />
              {isSaving ? "Saving..." : "Done"}
            </button>
            <button
              className={styles.closeButton}
              type="button"
              aria-label="Cancel drawing"
              onClick={onCancel}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>
        <div className={styles.stage}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            width={IMAGE_DRAWING_WIDTH}
            height={IMAGE_DRAWING_HEIGHT}
            aria-label="Image drawing canvas"
            onPointerDown={startStroke}
            onPointerMove={continueStroke}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            onPointerLeave={finishStroke}
          />
          {notice ? <p className={styles.notice}>{notice}</p> : null}
        </div>
      </section>
    </div>
  );
}
