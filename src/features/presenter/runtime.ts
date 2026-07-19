import {
  clonePresenterAnnotations,
  normalizePresenterAnnotations,
  presenterPathFromPoints,
  presenterStrokeIntersectsPoint,
} from "./annotations";
import {
  PRESENTER_RUNTIME_VERSION,
  type PresenterAnnotationMode,
  type PresenterAnnotations,
  type PresenterPoint,
  type PresenterRuntimeController,
  type PresenterRuntimeOptions,
  type PresenterRuntimeSelectors,
  type PresenterStroke,
  type PresenterStrokeMode,
  type PresenterViewBox,
} from "./types";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DEFAULT_COLOR = "#2563eb";
const TOUCH_MOVE_THRESHOLD = 6;
const REVEAL_CLICK_SUPPRESSION_MS = 900;

const DEFAULT_SELECTORS: PresenterRuntimeSelectors = {
  slide: ".lesson-slide",
  deck: ".lesson-deck",
  toolbar: ".presenter-tools",
  annotationsData: "#lesson-annotations-data",
  panButton: "#presenter-pan",
  penButton: "#presenter-pen",
  highlighterButton: "#presenter-highlighter",
  eraserButton: "#presenter-eraser",
  colorInput: "#presenter-color",
  colorButtons: "[data-presenter-color]",
  sizeInput: "#presenter-size",
  undoButton: "#presenter-undo",
  clearButton: "#presenter-clear",
};

const DEFAULT_VIEW_BOX: PresenterViewBox = { width: 1600, height: 1000 };

interface AddHistoryEntry {
  type: "add";
  slideIndex: string;
  stroke: PresenterStroke;
}

interface DeleteHistoryEntry {
  type: "delete";
  slideIndex: string;
  strokes: PresenterStroke[];
}

type HistoryEntry = AddHistoryEntry | DeleteHistoryEntry;

interface ActivePointer {
  pointerId: number;
  mode: PresenterStrokeMode | "eraser";
  slide: HTMLElement;
  overlay: SVGSVGElement;
  slideIndex: string;
  stroke: PresenterStroke | null;
  path: SVGPathElement | null;
}

interface TouchPoint {
  pointerId: number;
  slide: HTMLElement;
  clientX: number;
  clientY: number;
  allowTap: boolean;
}

interface TouchPan {
  pointerId: number;
  slide: HTMLElement;
  target: Element;
  lastX: number;
  lastY: number;
  travel: number;
  moved: boolean;
  allowTap: boolean;
}

interface PinchGesture {
  pointerIds: [number, number];
  startDistance: number;
}

function asQueryRoot(
  root: Document | HTMLElement,
): Document | HTMLElement {
  return root;
}

function queryOne<T extends Element>(
  root: Document | HTMLElement,
  selector: string,
): T | null {
  return asQueryRoot(root).querySelector<T>(selector);
}

function queryAll<T extends Element>(
  root: Document | HTMLElement,
  selector: string,
): T[] {
  return Array.from(asQueryRoot(root).querySelectorAll<T>(selector));
}

function isElementTarget(target: EventTarget | null): target is Element {
  return target instanceof Element;
}

function isAnswerRevealTarget(target: EventTarget | null): boolean {
  return (
    isElementTarget(target) &&
    !!target.closest("[data-qa-toggle],[data-example-reveal]")
  );
}

function isInteractivePointerTarget(target: EventTarget | null): boolean {
  return (
    isElementTarget(target) &&
    !!target.closest(
      "button,input,select,textarea,a,label,summary,[role='button'],[contenteditable='true'],.presenter-tools,[data-ignore-annotation]",
    )
  );
}

function createStrokeId(): string {
  return `stroke_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseEmbeddedAnnotations(
  root: Document | HTMLElement,
  selector: string,
): PresenterAnnotations {
  const dataElement = queryOne<HTMLElement>(root, selector);
  if (!dataElement) return {};
  try {
    return normalizePresenterAnnotations(
      JSON.parse(dataElement.textContent || "{}"),
    );
  } catch {
    return {};
  }
}

function distance(first: TouchPoint, second: TouchPoint): number {
  return Math.hypot(
    second.clientX - first.clientX,
    second.clientY - first.clientY,
  );
}

function midpoint(first: TouchPoint, second: TouchPoint): PresenterPoint {
  return {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2,
  };
}

export function mountPresenterRuntime(
  options: PresenterRuntimeOptions = {},
): PresenterRuntimeController {
  const root = options.root ?? document;
  const documentRoot =
    root instanceof Document ? root : root.ownerDocument ?? document;
  const selectors = { ...DEFAULT_SELECTORS, ...options.selectors };
  const viewBox: PresenterViewBox = {
    width: Math.max(1, Number(options.viewBox?.width) || DEFAULT_VIEW_BOX.width),
    height: Math.max(
      1,
      Number(options.viewBox?.height) || DEFAULT_VIEW_BOX.height,
    ),
  };
  let mode: PresenterAnnotationMode = options.initialMode ?? "pan";
  let color = options.initialColor || DEFAULT_COLOR;
  let size = Number.isFinite(options.initialSize)
    ? Math.max(0.5, Number(options.initialSize))
    : 2;
  let annotations = normalizePresenterAnnotations(
    options.initialAnnotations ??
      parseEmbeddedAnnotations(root, selectors.annotationsData),
  );
  let history: HistoryEntry[] = [];
  let activePointer: ActivePointer | null = null;
  let activeTouchPan: TouchPan | null = null;
  let activePinch: PinchGesture | null = null;
  let suppressRevealClickUntil = 0;
  let destroyed = false;

  const touchPoints = new Map<number, TouchPoint>();
  const boundSlides = new Map<HTMLElement, () => void>();
  const cleanupCallbacks: Array<() => void> = [];

  function listen<K extends keyof DocumentEventMap>(
    target: Document,
    eventName: K,
    listener: (event: DocumentEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  function listen<K extends keyof WindowEventMap>(
    target: Window,
    eventName: K,
    listener: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  function listen(
    target: Document | Window,
    eventName: string,
    listener: EventListener,
    listenerOptions?: AddEventListenerOptions | boolean,
  ): void {
    target.addEventListener(eventName, listener, listenerOptions);
    cleanupCallbacks.push(() =>
      target.removeEventListener(eventName, listener, listenerOptions),
    );
  }

  function notifyChange(): void {
    options.onAnnotationsChange?.(clonePresenterAnnotations(annotations));
  }

  function slideStrokes(slideIndex: string): PresenterStroke[] {
    if (!annotations[slideIndex]) annotations[slideIndex] = [];
    return annotations[slideIndex];
  }

  function createPath(stroke: PresenterStroke): SVGPathElement {
    const path = documentRoot.createElementNS(
      SVG_NAMESPACE,
      "path",
    ) as SVGPathElement;
    path.setAttribute("d", presenterPathFromPoints(stroke.points));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", stroke.color || DEFAULT_COLOR);
    path.setAttribute("stroke-width", String(stroke.width));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("data-stroke-id", stroke.id);
    if (stroke.mode === "highlighter") {
      path.setAttribute(
        "stroke-opacity",
        String(Math.max(0.1, Math.min(1, Number(stroke.opacity) || 0.35))),
      );
      path.style.mixBlendMode = "multiply";
    }
    return path;
  }

  function getOverlay(slide: HTMLElement): SVGSVGElement {
    const directOverlay = Array.from(slide.children).find((child) =>
      child.classList.contains("annotation-svg"),
    );
    if (directOverlay instanceof SVGSVGElement) return directOverlay;

    const overlay = documentRoot.createElementNS(
      SVG_NAMESPACE,
      "svg",
    ) as SVGSVGElement;
    overlay.classList.add("annotation-svg");
    overlay.setAttribute("viewBox", `0 0 ${viewBox.width} ${viewBox.height}`);
    overlay.setAttribute("preserveAspectRatio", "none");
    overlay.setAttribute("aria-label", "Slide annotation layer");
    slide.appendChild(overlay);
    return overlay;
  }

  function renderSlide(slideIndex: string, slide?: HTMLElement): void {
    const targetSlide =
      slide ??
      queryAll<HTMLElement>(root, selectors.slide).find(
        (candidate) =>
          candidate.getAttribute("data-annotation-slide") === slideIndex,
      );
    if (!targetSlide) return;
    const overlay = getOverlay(targetSlide);
    overlay.replaceChildren(
      ...slideStrokes(slideIndex).map((stroke) => createPath(stroke)),
    );
  }

  function pointFromClient(
    clientX: number,
    clientY: number,
    overlay: SVGSVGElement,
  ): PresenterPoint {
    const rect = overlay.getBoundingClientRect();
    return {
      x: Math.min(
        viewBox.width,
        Math.max(
          0,
          ((clientX - rect.left) / Math.max(1, rect.width)) * viewBox.width,
        ),
      ),
      y: Math.min(
        viewBox.height,
        Math.max(
          0,
          ((clientY - rect.top) / Math.max(1, rect.height)) * viewBox.height,
        ),
      ),
    };
  }

  function pointsFromEvent(
    event: PointerEvent,
    overlay: SVGSVGElement,
  ): PresenterPoint[] {
    const sourceEvents =
      typeof event.getCoalescedEvents === "function"
        ? event.getCoalescedEvents()
        : [];
    return (sourceEvents.length ? sourceEvents : [event]).map((sourceEvent) =>
      pointFromClient(sourceEvent.clientX, sourceEvent.clientY, overlay),
    );
  }

  function strokeWidth(overlay: SVGSVGElement, strokeMode: PresenterStrokeMode): number {
    const rect = overlay.getBoundingClientRect();
    const baseWidth = Math.max(
      0.5,
      (size / Math.max(1, rect.width)) * viewBox.width,
    );
    return strokeMode === "highlighter"
      ? Math.max(18, baseWidth * 4)
      : baseWidth;
  }

  function pointerMode(event: PointerEvent): PresenterStrokeMode | "eraser" | null {
    if (event.pointerType === "touch") return null;
    if (event.button !== -1 && event.button !== 0) return null;
    if (event.pointerType === "pen") {
      if (mode === "eraser") return "eraser";
      return mode === "highlighter" ? "highlighter" : "pen";
    }
    if (mode === "pan") return null;
    return mode === "eraser"
      ? "eraser"
      : mode === "highlighter"
        ? "highlighter"
        : "pen";
  }

  function eraseAt(
    slideIndex: string,
    point: PresenterPoint,
    overlay: SVGSVGElement,
  ): void {
    const threshold = strokeWidth(overlay, "pen") * 1.8;
    const removed = slideStrokes(slideIndex).filter((stroke) =>
      presenterStrokeIntersectsPoint(stroke, point, threshold),
    );
    if (!removed.length) return;
    const removedIds = new Set(removed.map((stroke) => stroke.id));
    annotations[slideIndex] = slideStrokes(slideIndex).filter(
      (stroke) => !removedIds.has(stroke.id),
    );
    history.push({ type: "delete", slideIndex, strokes: removed });
    renderSlide(slideIndex);
    notifyChange();
  }

  function beginPointerAnnotation(
    event: PointerEvent,
    slide: HTMLElement,
  ): void {
    if (activePointer) return;
    const inputMode = pointerMode(event);
    if (!inputMode) return;
    if (
      isInteractivePointerTarget(event.target) &&
      !isAnswerRevealTarget(event.target)
    ) {
      return;
    }

    const overlay = getOverlay(slide);
    event.preventDefault();
    event.stopPropagation();
    if (isAnswerRevealTarget(event.target)) {
      suppressRevealClickUntil = Date.now() + REVEAL_CLICK_SUPPRESSION_MS;
    }
    try {
      slide.setPointerCapture(event.pointerId);
    } catch {
      // Document-level listeners still complete the stroke if capture is unavailable.
    }

    const slideIndex =
      slide.getAttribute("data-annotation-slide") ?? "0";
    const point = pointFromClient(event.clientX, event.clientY, overlay);
    if (inputMode === "eraser") {
      activePointer = {
        pointerId: event.pointerId,
        mode: inputMode,
        slide,
        overlay,
        slideIndex,
        stroke: null,
        path: null,
      };
      eraseAt(slideIndex, point, overlay);
      return;
    }

    const stroke: PresenterStroke = {
      id: createStrokeId(),
      mode: inputMode,
      color,
      width: strokeWidth(overlay, inputMode),
      opacity: inputMode === "highlighter" ? 0.35 : 1,
      createdAt: Date.now(),
      points: [point],
    };
    const path = createPath(stroke);
    overlay.appendChild(path);
    activePointer = {
      pointerId: event.pointerId,
      mode: inputMode,
      slide,
      overlay,
      slideIndex,
      stroke,
      path,
    };
  }

  function continuePointerAnnotation(event: PointerEvent): void {
    if (!activePointer || activePointer.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (activePointer.mode === "eraser") {
      pointsFromEvent(event, activePointer.overlay).forEach((point) =>
        eraseAt(activePointer!.slideIndex, point, activePointer!.overlay),
      );
      return;
    }
    if (!activePointer.stroke || !activePointer.path) return;
    pointsFromEvent(event, activePointer.overlay).forEach((point) => {
      const previous =
        activePointer?.stroke?.points[
          (activePointer.stroke.points.length ?? 1) - 1
        ];
      if (!previous || previous.x !== point.x || previous.y !== point.y) {
        activePointer?.stroke?.points.push(point);
      }
    });
    activePointer.path.setAttribute(
      "d",
      presenterPathFromPoints(activePointer.stroke.points),
    );
  }

  function finishPointerAnnotation(event: PointerEvent): void {
    if (!activePointer || activePointer.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const completed = activePointer;
    activePointer = null;
    if (completed.mode !== "eraser" && completed.stroke?.points.length) {
      slideStrokes(completed.slideIndex).push(completed.stroke);
      history.push({
        type: "add",
        slideIndex: completed.slideIndex,
        stroke: completed.stroke,
      });
      notifyChange();
    }
    if (isAnswerRevealTarget(event.target)) {
      suppressRevealClickUntil = Date.now() + REVEAL_CLICK_SUPPRESSION_MS;
    }
    try {
      completed.slide.releasePointerCapture(event.pointerId);
    } catch {
      // Capture can already be released by the browser.
    }
  }

  function panTarget(): Element {
    const deck = queryOne<Element>(root, selectors.deck);
    const body = documentRoot.body;
    const deckOwnsPresentationScroll =
      body?.classList.contains("focus-mode") ||
      body?.classList.contains("fullscreen-mode") ||
      body?.classList.contains("presenter-zoom-mode");
    return deck && deckOwnsPresentationScroll
      ? deck
      : documentRoot.scrollingElement ?? documentRoot.documentElement;
  }

  function beginTouch(event: PointerEvent, slide: HTMLElement): void {
    if (activePointer) return;
    const allowTap = isAnswerRevealTarget(event.target);
    if (isInteractivePointerTarget(event.target) && !allowTap) return;

    if (
      activeTouchPan &&
      activeTouchPan.pointerId !== event.pointerId &&
      activeTouchPan.moved
    ) {
      touchPoints.delete(activeTouchPan.pointerId);
      activeTouchPan = null;
      touchPoints.clear();
    }
    if (!allowTap) {
      event.preventDefault();
      event.stopPropagation();
    }
    try {
      slide.setPointerCapture(event.pointerId);
    } catch {
      // The document listeners provide a fallback.
    }

    touchPoints.set(event.pointerId, {
      pointerId: event.pointerId,
      slide,
      clientX: event.clientX,
      clientY: event.clientY,
      allowTap,
    });
    const points = Array.from(touchPoints.values()).slice(0, 2);
    if (points.length === 2) {
      const startDistance = distance(points[0], points[1]);
      if (startDistance >= 8) {
        activeTouchPan = null;
        activePinch = {
          pointerIds: [points[0].pointerId, points[1].pointerId],
          startDistance,
        };
        suppressRevealClickUntil =
          Date.now() + REVEAL_CLICK_SUPPRESSION_MS;
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    activeTouchPan = {
      pointerId: event.pointerId,
      slide,
      target: panTarget(),
      lastX: event.clientX,
      lastY: event.clientY,
      travel: 0,
      moved: false,
      allowTap,
    };
  }

  function continueTouch(event: PointerEvent): void {
    const point = touchPoints.get(event.pointerId);
    if (point) {
      point.clientX = event.clientX;
      point.clientY = event.clientY;
    }
    if (activePinch?.pointerIds.includes(event.pointerId)) {
      const [first, second] = activePinch.pointerIds.map((pointerId) =>
        touchPoints.get(pointerId),
      );
      if (!first || !second) return;
      event.preventDefault();
      event.stopPropagation();
      suppressRevealClickUntil = Date.now() + REVEAL_CLICK_SUPPRESSION_MS;
      options.onPinchZoom?.(
        distance(first, second) / activePinch.startDistance,
        midpoint(first, second),
      );
      return;
    }
    if (!activeTouchPan || activeTouchPan.pointerId !== event.pointerId) return;
    const dx = event.clientX - activeTouchPan.lastX;
    const dy = event.clientY - activeTouchPan.lastY;
    activeTouchPan.travel += Math.hypot(dx, dy);
    if (
      !activeTouchPan.moved &&
      activeTouchPan.travel >= TOUCH_MOVE_THRESHOLD
    ) {
      activeTouchPan.moved = true;
      suppressRevealClickUntil = Date.now() + REVEAL_CLICK_SUPPRESSION_MS;
    }
    if (activeTouchPan.moved) {
      event.preventDefault();
      event.stopPropagation();
      activeTouchPan.target.scrollLeft -= dx;
      activeTouchPan.target.scrollTop -= dy;
    }
    activeTouchPan.lastX = event.clientX;
    activeTouchPan.lastY = event.clientY;
  }

  function finishTouch(event: PointerEvent): void {
    if (activePinch?.pointerIds.includes(event.pointerId)) {
      event.preventDefault();
      event.stopPropagation();
      touchPoints.delete(event.pointerId);
      if (touchPoints.size < 2) activePinch = null;
      return;
    }
    if (activeTouchPan?.pointerId === event.pointerId) {
      if (activeTouchPan.moved || !activeTouchPan.allowTap) {
        event.preventDefault();
        event.stopPropagation();
      }
      activeTouchPan = null;
    }
    touchPoints.delete(event.pointerId);
  }

  function cancelInput(): void {
    activePointer = null;
    activeTouchPan = null;
    activePinch = null;
    touchPoints.clear();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (event.pointerType === "touch" || touchPoints.has(event.pointerId)) {
      continueTouch(event);
      return;
    }
    continuePointerAnnotation(event);
  }

  function handlePointerEnd(event: PointerEvent): void {
    if (event.pointerType === "touch" || touchPoints.has(event.pointerId)) {
      finishTouch(event);
      return;
    }
    finishPointerAnnotation(event);
  }

  function suppressRevealClick(event: MouseEvent): void {
    if (
      Date.now() <= suppressRevealClickUntil &&
      isAnswerRevealTarget(event.target)
    ) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }

  function suppressDrag(event: DragEvent): void {
    if (
      isElementTarget(event.target) &&
      event.target.closest(selectors.slide)
    ) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }

  function updateModeUi(): void {
    const buttons: Array<[PresenterAnnotationMode, string]> = [
      ["pan", selectors.panButton],
      ["pen", selectors.penButton],
      ["highlighter", selectors.highlighterButton],
      ["eraser", selectors.eraserButton],
    ];
    buttons.forEach(([buttonMode, selector]) => {
      const button = queryOne<HTMLElement>(root, selector);
      button?.classList.toggle("is-active", mode === buttonMode);
      button?.setAttribute(
        "aria-pressed",
        mode === buttonMode ? "true" : "false",
      );
    });
    documentRoot.body?.classList.toggle("annotation-pan", mode === "pan");
    documentRoot.body?.classList.toggle(
      "annotation-eraser",
      mode === "eraser",
    );
    documentRoot.body?.classList.toggle(
      "annotation-highlighter",
      mode === "highlighter",
    );
  }

  function setMode(nextMode: PresenterAnnotationMode): void {
    mode =
      nextMode === "pan" ||
      nextMode === "eraser" ||
      nextMode === "highlighter"
        ? nextMode
        : "pen";
    updateModeUi();
  }

  function setColor(nextColor: string): void {
    color = nextColor || DEFAULT_COLOR;
    const input = queryOne<HTMLInputElement>(root, selectors.colorInput);
    if (input) input.value = color;
    queryAll<HTMLElement>(root, selectors.colorButtons).forEach((button) => {
      button.classList.toggle(
        "is-active",
        (button.dataset.color || (button as HTMLInputElement).value) === color,
      );
    });
  }

  function setSize(nextSize: number): void {
    if (!Number.isFinite(nextSize)) return;
    size = Math.max(0.5, nextSize);
    const input = queryOne<HTMLInputElement>(root, selectors.sizeInput);
    if (input) input.value = String(size);
  }

  function undo(): boolean {
    const action = history.pop();
    if (!action) return false;
    if (action.type === "add") {
      annotations[action.slideIndex] = slideStrokes(action.slideIndex).filter(
        (stroke) => stroke.id !== action.stroke.id,
      );
    } else {
      annotations[action.slideIndex] = slideStrokes(action.slideIndex).concat(
        action.strokes,
      );
    }
    renderSlide(action.slideIndex);
    notifyChange();
    return true;
  }

  function clear(): void {
    annotations = {};
    history = [];
    queryAll<HTMLElement>(root, selectors.slide).forEach((slide, index) =>
      renderSlide(String(index), slide),
    );
    notifyChange();
  }

  function bindControls(): void {
    const bindClick = (
      selector: string,
      callback: (event: MouseEvent) => void,
    ): void => {
      const element = queryOne<HTMLElement>(root, selector);
      if (!element) return;
      element.addEventListener("click", callback);
      cleanupCallbacks.push(() =>
        element.removeEventListener("click", callback),
      );
    };
    bindClick(selectors.panButton, () => setMode("pan"));
    bindClick(selectors.penButton, () => setMode("pen"));
    bindClick(selectors.highlighterButton, () => setMode("highlighter"));
    bindClick(selectors.eraserButton, () => setMode("eraser"));
    bindClick(selectors.undoButton, () => undo());
    bindClick(selectors.clearButton, () => {
      const current = clonePresenterAnnotations(annotations);
      const hasAnnotations = Object.values(current).some(
        (strokes) => strokes.length > 0,
      );
      if (
        hasAnnotations &&
        options.confirmClear &&
        !options.confirmClear(current)
      ) {
        return;
      }
      clear();
    });

    queryAll<HTMLElement>(root, selectors.colorButtons).forEach((button) => {
      const onClick = () =>
        setColor(
          button.dataset.color || (button as HTMLInputElement).value || color,
        );
      button.addEventListener("click", onClick);
      cleanupCallbacks.push(() =>
        button.removeEventListener("click", onClick),
      );
    });
    const sizeInput = queryOne<HTMLInputElement>(root, selectors.sizeInput);
    if (sizeInput) {
      const onInput = () => setSize(Number(sizeInput.value));
      sizeInput.addEventListener("input", onInput);
      cleanupCallbacks.push(() =>
        sizeInput.removeEventListener("input", onInput),
      );
    }
  }

  function refresh(): void {
    if (destroyed) return;
    const currentSlides = new Set(
      queryAll<HTMLElement>(root, selectors.slide),
    );
    boundSlides.forEach((cleanup, slide) => {
      if (!currentSlides.has(slide)) {
        cleanup();
        boundSlides.delete(slide);
      }
    });
    Array.from(currentSlides).forEach((slide, index) => {
      const slideIndex = String(index);
      slide.setAttribute("data-annotation-slide", slideIndex);
      renderSlide(slideIndex, slide);
      if (boundSlides.has(slide)) return;
      const onPointerDown = (event: PointerEvent) => {
        if (event.pointerType === "touch") {
          beginTouch(event, slide);
        } else {
          beginPointerAnnotation(event, slide);
        }
      };
      const onLostCapture = (event: PointerEvent) => {
        if (activeTouchPan?.pointerId === event.pointerId) {
          activeTouchPan = null;
          touchPoints.delete(event.pointerId);
        }
      };
      slide.addEventListener("pointerdown", onPointerDown, true);
      slide.addEventListener("lostpointercapture", onLostCapture, true);
      boundSlides.set(slide, () => {
        slide.removeEventListener("pointerdown", onPointerDown, true);
        slide.removeEventListener("lostpointercapture", onLostCapture, true);
      });
    });
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    cancelInput();
    boundSlides.forEach((cleanup) => cleanup());
    boundSlides.clear();
    cleanupCallbacks.splice(0).forEach((cleanup) => cleanup());
  }

  bindControls();
  listen(documentRoot, "pointermove", handlePointerMove, true);
  listen(documentRoot, "pointerup", handlePointerEnd, true);
  listen(documentRoot, "pointercancel", handlePointerEnd, true);
  listen(documentRoot, "click", suppressRevealClick, true);
  listen(documentRoot, "dragstart", suppressDrag, true);
  listen(documentRoot.defaultView ?? window, "blur", cancelInput);
  setMode(mode);
  setColor(color);
  setSize(size);
  refresh();

  return {
    version: PRESENTER_RUNTIME_VERSION,
    refresh,
    destroy,
    setMode,
    getMode: () => mode,
    setColor,
    setSize,
    undo,
    clear,
    getAnnotations: () => clonePresenterAnnotations(annotations),
  };
}

export function autoMountPresenterRuntime(): PresenterRuntimeController | null {
  if (typeof document === "undefined") return null;
  if (window.__lessonPresenterRuntimeController) {
    return window.__lessonPresenterRuntimeController;
  }
  if (
    !document.querySelector(DEFAULT_SELECTORS.slide) ||
    !document.querySelector(DEFAULT_SELECTORS.annotationsData)
  ) {
    return null;
  }
  const controller = mountPresenterRuntime({
    confirmClear: () => window.confirm("Clear all presenter annotations?"),
    onPinchZoom: (scale, clientPoint) => {
      document.dispatchEvent(
        new CustomEvent("lessonpresenterpinch", {
          detail: { scale, clientPoint },
        }),
      );
    },
  });
  window.__lessonPresenterRuntimeController = controller;
  return controller;
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => autoMountPresenterRuntime(),
      { once: true },
    );
  } else {
    autoMountPresenterRuntime();
  }
}

export { PRESENTER_RUNTIME_VERSION };
