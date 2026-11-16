import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useLessonExportActions } from "@/features/builder/useLessonExportActions";
import { AppNotificationsProvider } from "@/features/builder/AppNotifications";
import { createInitialBuilderDocument } from "@/features/builder/schema";
import { useBuilderStore } from "@/features/builder/store";
import { openRecoverablePresenter } from "@/features/presenter/session-launch";

vi.mock("@/features/presenter/session-launch", () => ({ openRecoverablePresenter: vi.fn() }));
vi.mock("@/features/builder/prepare-export-document", () => ({ prepareBuilderDocumentForExport: vi.fn(async value => value) }));
vi.mock("@/features/builder/api-client", async importOriginal => ({ ...await importOriginal<typeof import("@/features/builder/api-client")>(), createPresenterStudentSession: vi.fn(async () => ({ sessionId: "student", code: "ABC-123" })) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([false, true])("Builder uses durable presenter launch and handles local failure=%s", async fails => {
  const lesson = createInitialBuilderDocument();
  lesson.activeLessonId = "active";
  useBuilderStore.getState().hydrate(lesson);
  const popup = { document: { write: vi.fn() }, close: vi.fn(), focus: vi.fn() } as unknown as Window;
  vi.spyOn(window, "open").mockReturnValue(popup);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "runtime-assets" })));
  if (fails) vi.mocked(openRecoverablePresenter).mockRejectedValue(new Error("Storage full"));
  else vi.mocked(openRecoverablePresenter).mockResolvedValue();
  const { result, unmount } = renderHook(() => useLessonExportActions(), { wrapper: AppNotificationsProvider });
  await act(() => result.current.previewLesson());
  expect(openRecoverablePresenter).toHaveBeenCalledWith(popup, expect.stringContaining('id="lesson-presenter-config"'));
  if (fails) expect(popup.close).toHaveBeenCalled();
  else expect(popup.focus).toHaveBeenCalled();
  unmount();
});
