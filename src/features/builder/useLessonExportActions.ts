"use client";

import { useBuilderStore } from "./store";
import {
  createPresenterStudentSession,
  downloadPresenterPdf,
  saveCurrentLesson,
  syncBuilderDocument,
} from "./api-client";
import {
  buildStandaloneLessonHtml,
  embedRemoteBuilderAssets,
  normalizeImportedBuilderDocument,
  parseStandaloneLessonHtml,
} from "./lesson-export";
import {
  buildA4Handout,
  selectHandoutDocument,
} from "./handout-export";

export function useLessonExportActions() {
  const document = useBuilderStore((state) => state.document);
  const selectedPreviewSlideIds = useBuilderStore(
    (state) => state.selectedPreviewSlideIds,
  );
  const hydrate = useBuilderStore((state) => state.hydrate);
  const markLessonSaved = useBuilderStore((state) => state.markLessonSaved);
  const setStatus = useBuilderStore((state) => state.setStatus);

  async function previewLesson(handout = false) {
    const previewWindow = window.open("", "_blank");
    if (!previewWindow) {
      setStatus({
        tone: "error",
        message: "Allow pop-ups for Lesson Builder to open the preview.",
      });
      return;
    }
    previewWindow.document.write(
      "<!doctype html><title>Preparing lesson</title><p>Preparing lesson...</p>",
    );
    try {
      let presenterLessonId = "";
      let studentSession: PresenterStudentSession | null = null;
      if (!handout) {
        setStatus({
          tone: "working",
          message: document.activeLessonId
            ? "Preparing the live presenter..."
            : "Saving the lesson before opening the live presenter...",
        });
        if (document.activeLessonId) {
          presenterLessonId = document.activeLessonId;
        } else {
          const saved = await saveCurrentLesson(document);
          markLessonSaved(saved);
          presenterLessonId = saved.id;
        }
        const createdSession =
          await createPresenterStudentSession(presenterLessonId);
        studentSession = {
          sessionId: createdSession.sessionId,
          code: createdSession.code,
          viewerUrl: createdSession.viewerUrl,
          expiresAt: createdSession.expiresAt,
        };
      } else {
        setStatus({
          tone: "working",
          message: "Preparing the production A4 handout...",
        });
      }
      const output = handout
        ? await prepareA4Handout()
        : {
            html: await prepareStandaloneHtml(
              false,
              presenterLessonId,
              studentSession,
            ),
            warnings: [] as string[],
          };
      const previewUrl = URL.createObjectURL(
        new Blob([output.html], { type: "text/html" }),
      );
      previewWindow.location.replace(previewUrl);
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000);
      previewWindow.focus();
      setStatus({
        tone: output.warnings.length ? "warning" : "success",
        message: handout
          ? output.warnings.length
            ? `Opened the lesson handout. ${output.warnings.join(" ")}`
            : "Opened the lesson handout."
          : "Opened the full lesson preview.",
      });
    } catch (error) {
      previewWindow.close();
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not open the lesson preview."),
      });
    }
  }

  async function exportHtml() {
    setStatus({ tone: "working", message: "Preparing standalone lesson HTML..." });
    try {
      const html = await prepareStandaloneHtml(false);
      downloadBlob(
        new Blob([html], { type: "text/html" }),
        `${safeFileName(document.title)}.html`,
      );
      setStatus({ tone: "success", message: "Exported standalone lesson HTML." });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not export lesson HTML."),
      });
    }
  }

  async function exportPdf() {
    if (!document.slides.length) {
      setStatus({
        tone: "warning",
        message: "Add at least one slide before exporting a PDF.",
      });
      return;
    }
    setStatus({ tone: "working", message: "Rendering the lesson PDF..." });
    try {
      const [html, saved] = await Promise.all([
        prepareStandaloneHtml(false),
        saveCurrentLesson(document),
        syncBuilderDocument(document),
      ]);
      markLessonSaved(saved);
      const pdf = await downloadPresenterPdf(saved.id, html);
      downloadBlob(pdf, `${safeFileName(document.title)}.pdf`);
      setStatus({ tone: "success", message: "Exported the lesson PDF." });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not export the lesson PDF."),
      });
    }
  }

  function exportJson() {
    const payload = {
      lessonBuilder: document,
      exportedAt: new Date().toISOString(),
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
      `${safeFileName(document.title)}.lesson.json`,
    );
    setStatus({
      tone: "success",
      message: "Exported the lesson JSON.",
    });
  }

  async function importJson(file: File) {
    try {
      const input = JSON.parse(await file.text());
      if (!replaceDocument(normalizeImportedBuilderDocument(input, document))) {
        return;
      }
      setStatus({ tone: "success", message: "Imported lesson JSON." });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not import that JSON file."),
      });
    }
  }

  async function importHtml(file: File) {
    try {
      const imported = parseStandaloneLessonHtml(await file.text());
      const importedLesson = normalizeImportedBuilderDocument(
        {
          lessonBuilder: {
            title: imported.title,
            className: imported.className,
            teachingDate: imported.teachingDate,
            overallLessonLo: imported.overallLessonLo,
            slides: imported.slides,
            updatedAt: imported.updatedAt,
          },
        },
        document,
      );
      if (!replaceDocument(importedLesson)) return;
      setStatus({
        tone: "success",
        message: `Imported ${imported.slides.length} slide${imported.slides.length === 1 ? "" : "s"} from HTML.`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: errorMessage(error, "Could not import that HTML lesson."),
      });
    }
  }

  function replaceDocument(nextDocument: unknown) {
    if (
      document.slides.length &&
      !window.confirm(
        "Import this file and replace the current lesson? Shared builder data is preserved unless it is explicitly included in the imported file.",
      )
    ) {
      return false;
    }
    hydrate(nextDocument);
    return true;
  }

  async function prepareStandaloneHtml(
    handout: boolean,
    presenterLessonId = "",
    studentSession: PresenterStudentSession | null = null,
  ) {
    const [runtimeCss, runtimeJavaScript, embeddedDocument] = await Promise.all([
      fetchAssetText("/builder-v2-assets/presenter-runtime.css"),
      fetchAssetText("/builder-v2-assets/presenter-runtime.js"),
      embedRemoteBuilderAssets(document),
    ]);
    return buildStandaloneLessonHtml(embeddedDocument, {
      handout,
      runtimeCss,
      runtimeJavaScript: runtimeJavaScript.replace(
        /<\/script/gi,
        "<\\/script",
      ),
      liveRetrieval: presenterLessonId
        ? {
            enabled: true,
            endpoint: appEndpoint("/api/presenter/retrieval-log"),
            nextEndpoint: appEndpoint("/api/presenter/retrieval-next"),
            lessonId: presenterLessonId,
            className: embeddedDocument.className,
            teachingDate: embeddedDocument.teachingDate,
          }
        : null,
      presenterConfig: presenterLessonId
        ? {
            enabled: true,
            sourceLessonId: presenterLessonId,
            originalTitle: embeddedDocument.title,
            className: embeddedDocument.className,
            teachingDate: embeddedDocument.teachingDate,
            uploadEndpoint: appEndpoint("/api/builder-lessons/upload-url"),
            completeEndpoint: appEndpoint("/api/builder-lessons/complete"),
            taughtEndpoint: appEndpoint("/api/builder-lessons/taught"),
            studentSession,
            studentSessionUploadEndpoint: appEndpoint(
              "/api/presenter/student-session/upload-url",
            ),
            studentSessionCompleteEndpoint: appEndpoint(
              "/api/presenter/student-session/complete",
            ),
          }
        : null,
    });
  }

  async function prepareA4Handout() {
    const selectedDocument = selectHandoutDocument(
      document,
      selectedPreviewSlideIds,
    );
    return buildA4Handout(await embedRemoteBuilderAssets(selectedDocument));
  }

  return {
    previewLesson,
    exportHtml,
    exportPdf,
    exportJson,
    importJson,
    importHtml,
  };
}

async function fetchAssetText(url: string) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Could not load presenter assets (${response.status}).`);
  }
  return response.text();
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

type PresenterStudentSession = {
  sessionId: string;
  code: string;
  viewerUrl: string;
  expiresAt: string;
};

function appEndpoint(path: string) {
  return new URL(path, window.location.origin).toString();
}

function safeFileName(value: string) {
  return (
    String(value || "lesson")
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "lesson"
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
