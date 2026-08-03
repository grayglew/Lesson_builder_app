import { afterEach, describe, expect, it, vi } from "vitest";
import { saveCurrentLesson } from "@/features/builder/api-client";
import {
  buildStandaloneLessonHtml,
  parseStandaloneLessonHtml,
} from "@/features/builder/lesson-export";
import {
  createInitialBuilderDocument,
  normalizeBuilderDocument,
  serializeBuilderDocument,
  toWorkspaceDocument,
} from "@/features/builder/schema";

const NOW = "2026-08-03T08:00:00.000Z";

function documentWithSlides() {
  const document = createInitialBuilderDocument(NOW);
  document.slides = [
    { id: "first", type: "blank", title: "First" },
    { id: "second", type: "placeholder", title: "Second", text: "Body" },
    { id: "third", type: "blank", title: "Third" },
  ];
  return document;
}

describe("persistent handout slide selection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes missing, duplicate, stale, and out-of-order IDs", () => {
    const legacy = documentWithSlides();
    delete (legacy as Partial<typeof legacy>).handoutSlideIds;
    expect(normalizeBuilderDocument(legacy).handoutSlideIds).toEqual([]);

    const untrusted = {
      ...documentWithSlides(),
      handoutSlideIds: ["third", "missing", "first", "third"],
    };
    expect(normalizeBuilderDocument(untrusted).handoutSlideIds).toEqual([
      "first",
      "third",
    ]);
  });

  it("keeps the selection in recovery and workspace documents", () => {
    const document = documentWithSlides();
    document.handoutSlideIds = ["first", "third"];

    const recovered = normalizeBuilderDocument(
      JSON.parse(serializeBuilderDocument(document)),
    );
    expect(recovered.handoutSlideIds).toEqual(["first", "third"]);
    expect(toWorkspaceDocument(document).handoutSlideIds).toEqual([
      "first",
      "third",
    ]);
  });

  it("round-trips the selection through standalone HTML", () => {
    const document = documentWithSlides();
    document.handoutSlideIds = ["second"];

    const imported = parseStandaloneLessonHtml(
      buildStandaloneLessonHtml(document),
    );

    expect(imported.handoutSlideIds).toEqual(["second"]);
  });

  it("writes the selection into named saves and Save As copies", async () => {
    const document = documentWithSlides();
    document.title = "Selected handout";
    document.handoutSlideIds = ["first", "third"];
    const fetchMock = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      void init;
      const url = String(input);
      if (url.endsWith("/api/builder-lessons/upload-url")) {
        return Response.json({
          ok: true,
          id: "saved-copy",
          path: "owner/lessons/saved-copy/lesson.json",
          signedUrl: "https://storage.example/upload",
        });
      }
      if (url === "https://storage.example/upload") {
        return new Response(null, { status: 200 });
      }
      return Response.json({
        ok: true,
        lesson: {
          id: "saved-copy",
          title: "Selected handout",
          className: "",
          teachingDate: document.teachingDate,
          byteSize: 100,
          taughtAt: "",
          isTaught: false,
          createdAt: NOW,
          updatedAt: NOW,
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await saveCurrentLesson(document, { copy: true });

    const uploadCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === "https://storage.example/upload",
    );
    const formData = uploadCall?.[1]?.body as FormData;
    const file = formData.get("") as File;
    const fileText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result)));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsText(file);
    });
    const saved = JSON.parse(fileText) as Record<string, unknown>;
    expect(saved.handoutSlideIds).toEqual(["first", "third"]);
  });
});
