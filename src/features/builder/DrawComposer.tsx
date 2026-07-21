"use client";

import { Eraser, PenLine, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "./DrawComposer.module.css";
import {
  DRAWING_RESOLUTIONS,
  type DrawingResolution,
  type DrawingStroke,
  createDrawingStroke,
  drawStrokePoint,
  drawStrokeSegment,
  exportDrawingImage,
  normalizeDrawingPoint,
  parseDrawingResolution,
  redrawDrawingCanvas,
} from "./drawing";
import { type BuilderSlide, createBuilderId } from "./schema";
import { useBuilderStore } from "./store";

const DEFAULT_RESOLUTION = DRAWING_RESOLUTIONS[1];
const DRAWING_COLORS = [
  { value: "#111827", label: "Black pen colour" },
  { value: "#2563eb", label: "Blue pen colour" },
  { value: "#dc2626", label: "Red pen colour" },
  { value: "#16a34a", label: "Green pen colour" },
] as const;

export function DrawComposer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStrokeRef = useRef<DrawingStroke | null>(null);
  const addSlides = useBuilderStore((state) => state.addSlides);
  const setStatus = useBuilderStore((state) => state.setStatus);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [mode, setMode] = useState<DrawingStroke["mode"]>("pen");
  const [color, setColor] = useState("#2563eb");
  const [penSize, setPenSize] = useState(2);
  const [resolution, setResolution] =
    useState<DrawingResolution>(DEFAULT_RESOLUTION);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) redrawDrawingCanvas(canvas, strokes);
  }, [resolution, strokes]);

  function startStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    const point = normalizeDrawingPoint(
      event.clientX,
      event.clientY,
      canvas.getBoundingClientRect(),
    );
    const stroke = createDrawingStroke(
      mode,
      color,
      penSize,
      resolution.height,
      point,
    );
    activeStrokeRef.current = stroke;
    const context = canvas.getContext("2d");
    if (context) drawStrokePoint(context, canvas, stroke, point);
  }

  function continueStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const stroke = activeStrokeRef.current;
    if (!canvas || !stroke) return;
    event.preventDefault();
    const point = normalizeDrawingPoint(
      event.clientX,
      event.clientY,
      canvas.getBoundingClientRect(),
    );
    const previous = stroke.points[stroke.points.length - 1];
    stroke.points.push(point);
    const context = canvas.getContext("2d");
    if (context) drawStrokeSegment(context, canvas, stroke, previous, point);
  }

  function finishStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    event.preventDefault();
    setStrokes((current) => [...current, stroke]);
    activeStrokeRef.current = null;
  }

  function undoDrawing() {
    if (!strokes.length) {
      setStatus({
        tone: "warning",
        message: "Nothing to undo on the drawing canvas.",
      });
      return;
    }
    setStrokes((current) => current.slice(0, -1));
    setStatus({ tone: "success", message: "Undid the last stroke." });
  }

  function clearDrawing() {
    if (strokes.length && !window.confirm("Clear the drawing canvas?")) return;
    activeStrokeRef.current = null;
    setStrokes([]);
    setStatus({ tone: "success", message: "Cleared the drawing canvas." });
  }

  function changeResolution(value: string) {
    const next = parseDrawingResolution(value);
    if (!next) return;
    setResolution(next);
    setStatus({
      tone: "success",
      message: `Drawing canvas set to ${next.width} x ${next.height}.`,
    });
  }

  function addDrawingSlide() {
    const canvas = canvasRef.current;
    if (!strokes.length || !canvas) {
      setStatus({
        tone: "error",
        message: "Draw something before saving a drawing slide.",
      });
      return;
    }
    const image = exportDrawingImage(canvas);
    if (!image) {
      setStatus({
        tone: "error",
        message: "The drawing could not be exported by this browser.",
      });
      return;
    }
    const slide: BuilderSlide = {
      id: createBuilderId("slide"),
      type: "drawing",
      title: "Drawing",
      width: resolution.width,
      height: resolution.height,
      image,
      createdAt: new Date().toISOString(),
    };
    addSlides([slide]);
    setStatus({
      tone: "success",
      message: "Added a legacy-compatible drawing slide after the selected slide.",
    });
  }

  return (
    <section className={styles.panel} data-testid="drawing-panel">
      <div className={styles.panelHead}>
        <h3>High-resolution drawing</h3>
        <div className={styles.inlineActions}>
          <button
            className={`${styles.secondaryButton} ${styles.compactButton}`}
            type="button"
            onClick={undoDrawing}
          >
            <RotateCcw size={15} aria-hidden />
            Undo
          </button>
          <button
            className={`${styles.dangerButton} ${styles.compactButton}`}
            type="button"
            onClick={clearDrawing}
          >
            <Trash2 size={15} aria-hidden />
            Clear
          </button>
        </div>
      </div>

      <div className={styles.toolbar} aria-label="Drawing tools">
        <div>
          <span className={styles.fieldLabel}>Mode</span>
          <div className={styles.segment} role="group" aria-label="Drawing mode">
            <button
              className={`${styles.toolButton} ${mode === "pen" ? styles.toolButtonActive : ""}`}
              type="button"
              aria-pressed={mode === "pen"}
              onClick={() => setMode("pen")}
            >
              <PenLine size={15} aria-hidden />
              Pen
            </button>
            <button
              className={`${styles.toolButton} ${mode === "eraser" ? styles.toolButtonActive : ""}`}
              type="button"
              aria-pressed={mode === "eraser"}
              onClick={() => setMode("eraser")}
            >
              <Eraser size={15} aria-hidden />
              Eraser
            </button>
          </div>
        </div>

        <div>
          <span className={styles.fieldLabel}>Colour</span>
          <div className={styles.palette} aria-label="Drawing colours">
            {DRAWING_COLORS.map((entry) => (
              <input
                key={entry.value}
                className={`${styles.colorInput} ${color === entry.value ? styles.colorInputActive : ""}`}
                type="color"
                value={entry.value}
                aria-label={entry.label}
                onInput={() => setColor(entry.value)}
                onClick={() => setColor(entry.value)}
                readOnly
              />
            ))}
          </div>
        </div>

        <label>
          <span className={styles.fieldLabel}>Size</span>
          <input
            className={styles.input}
            type="range"
            min={0}
            max={4}
            step={0.5}
            value={penSize}
            aria-label="Drawing size"
            onChange={(event) => setPenSize(Number(event.target.value))}
          />
        </label>

        <label>
          <span className={styles.fieldLabel}>Resolution</span>
          <select
            className={styles.input}
            value={`${resolution.width}x${resolution.height}`}
            aria-label="Drawing resolution"
            onChange={(event) => changeResolution(event.target.value)}
          >
            {DRAWING_RESOLUTIONS.map((entry) => (
              <option
                key={`${entry.width}x${entry.height}`}
                value={`${entry.width}x${entry.height}`}
              >
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.canvasFrame}>
        <canvas
          ref={canvasRef}
          className={`${styles.canvas} ${mode === "eraser" ? styles.canvasEraser : styles.canvasPen}`}
          width={resolution.width}
          height={resolution.height}
          aria-label="Drawing canvas"
          onPointerDown={startStroke}
          onPointerMove={continueStroke}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={finishStroke}
        />
      </div>

      <div className={styles.actionRow}>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={addDrawingSlide}
        >
          <Plus size={16} aria-hidden />
          Save drawing as slide
        </button>
      </div>
    </section>
  );
}
