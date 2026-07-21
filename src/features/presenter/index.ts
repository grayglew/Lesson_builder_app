export {
  autoMountPresenterRuntime,
  mountPresenterRuntime,
  PRESENTER_RUNTIME_VERSION,
} from "./runtime";
export {
  clonePresenterAnnotations,
  normalizePresenterAnnotations,
  normalizePresenterPoint,
  normalizePresenterStroke,
  presenterPathFromPoints,
  presenterStrokeIntersectsPoint,
} from "./annotations";
export type {
  LessonPresenterRuntimeGlobal,
  PresenterAnnotationMode,
  PresenterAnnotations,
  PresenterPoint,
  PresenterRuntimeAssets,
  PresenterRuntimeController,
  PresenterRuntimeOptions,
  PresenterRuntimeSelectors,
  PresenterStandaloneExportInput,
  PresenterStroke,
  PresenterStrokeMode,
  PresenterViewBox,
} from "./types";
