export const PRESENTER_RUNTIME_VERSION = "0.1.0";

export type PresenterAnnotationMode = "pan" | "pen" | "highlighter" | "eraser";
export type PresenterStrokeMode = Exclude<PresenterAnnotationMode, "pan" | "eraser">;

export interface PresenterPoint {
  x: number;
  y: number;
}

export interface PresenterStroke {
  id: string;
  mode: PresenterStrokeMode;
  color: string;
  width: number;
  opacity?: number;
  createdAt: number;
  points: PresenterPoint[];
}

export type PresenterAnnotations = Record<string, PresenterStroke[]>;

export interface PresenterViewBox {
  width: number;
  height: number;
}

export interface PresenterRuntimeSelectors {
  slide: string;
  deck: string;
  toolbar: string;
  annotationsData: string;
  panButton: string;
  penButton: string;
  highlighterButton: string;
  eraserButton: string;
  colorInput: string;
  colorButtons: string;
  sizeInput: string;
  undoButton: string;
  clearButton: string;
}

export interface PresenterRuntimeOptions {
  root?: Document | HTMLElement;
  selectors?: Partial<PresenterRuntimeSelectors>;
  viewBox?: Partial<PresenterViewBox>;
  initialMode?: PresenterAnnotationMode;
  initialColor?: string;
  initialSize?: number;
  initialAnnotations?: PresenterAnnotations;
  confirmClear?: (annotations: PresenterAnnotations) => boolean;
  onAnnotationsChange?: (annotations: PresenterAnnotations) => void;
  onPinchZoom?: (scale: number, clientPoint: PresenterPoint) => void;
}

export interface PresenterRuntimeController {
  readonly version: string;
  refresh(): void;
  destroy(): void;
  setMode(mode: PresenterAnnotationMode): void;
  getMode(): PresenterAnnotationMode;
  setColor(color: string): void;
  setSize(size: number): void;
  undo(): boolean;
  clear(): void;
  getAnnotations(): PresenterAnnotations;
}

export interface PresenterRuntimeAssets {
  scriptUrl: string;
  styleUrl: string;
  globalName: "LessonPresenterRuntime";
  version: string;
}

export interface PresenterStandaloneExportInput {
  title: string;
  bodyHtml: string;
  annotations: PresenterAnnotations;
  runtimeJavaScript: string;
  runtimeCss: string;
}

export interface LessonPresenterRuntimeGlobal {
  mountPresenterRuntime(options?: PresenterRuntimeOptions): PresenterRuntimeController;
  autoMountPresenterRuntime(): PresenterRuntimeController | null;
  PRESENTER_RUNTIME_VERSION: string;
}

declare global {
  interface Window {
    LessonPresenterRuntime?: LessonPresenterRuntimeGlobal;
    __lessonPresenterRuntimeController?: PresenterRuntimeController;
  }
}
