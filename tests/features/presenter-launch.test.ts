import { afterEach, expect, it, vi } from "vitest";
import { openRecoverablePresenter } from "@/features/presenter/session-launch";
import { currentPresenterOwner } from "@/features/presenter/session-identity";
import { createPresenterSession } from "@/features/presenter/session-storage";
import { buildStandaloneLessonHtml } from "@/features/builder/lesson-export";
import { createInitialBuilderDocument } from "@/features/builder/schema";

vi.mock("@/features/presenter/session-identity", () => ({ currentPresenterOwner: vi.fn() }));
vi.mock("@/features/presenter/session-storage", () => ({ createPresenterSession: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const html = buildStandaloneLessonHtml(createInitialBuilderDocument(), { presenterConfig: {
  enabled: true, sourceLessonId: "lesson", originalTitle: "Test", className: "Y7", teachingDate: "2026-11-16",
  uploadEndpoint: "/upload", completeEndpoint: "/complete", taughtEndpoint: "/taught",
} });

it("navigates only after the local source has committed under the authenticated account", async () => {
  vi.mocked(currentPresenterOwner).mockResolvedValue("actor:teacher");
  let commit!: (id: string) => void;
  vi.mocked(createPresenterSession).mockImplementation(() => new Promise(resolve => { commit = resolve; }));
  const replace = vi.fn();
  const opened = openRecoverablePresenter({ location: { replace } } as unknown as Window, html);
  await vi.waitFor(() => expect(createPresenterSession).toHaveBeenCalled());
  expect(replace).not.toHaveBeenCalled();
  expect(createPresenterSession).toHaveBeenCalledWith("actor:teacher", expect.objectContaining({ document: expect.any(Object) }));
  commit("session-id");
  await opened;
  expect(replace).toHaveBeenCalledWith("/builder/presenter/session-id");
});

it("does not navigate to an unrecoverable presenter when local storage fails", async () => {
  vi.mocked(currentPresenterOwner).mockResolvedValue("actor:teacher");
  vi.mocked(createPresenterSession).mockRejectedValue(new Error("Storage is full"));
  const replace = vi.fn();
  await expect(openRecoverablePresenter({ location: { replace } } as unknown as Window, html)).rejects.toThrow("Storage is full");
  expect(replace).not.toHaveBeenCalled();
});
