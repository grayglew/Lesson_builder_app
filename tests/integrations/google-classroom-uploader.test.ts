import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

const uploaderPath = resolve(
  process.cwd(),
  "integrations/google-classroom-uploader/Code.gs",
);
const uploaderIndexPath = resolve(
  process.cwd(),
  "integrations/google-classroom-uploader/Index.html",
);

type MockBlob = {
  getBytes: () => number[];
  getName: () => string;
  getDataAsString: () => string;
};

function zipEntry(name: string, text = ""): MockBlob {
  return {
    getName: () => name,
    getBytes: () => [1, 2, 3],
    getDataAsString: () => text,
  };
}

function extract(entries: MockBlob[]) {
  const sandbox = {
    Utilities: {
      unzip: () => entries,
    },
  };
  const source = readFileSync(uploaderPath, "utf8");
  vm.runInNewContext(source, sandbox, { filename: uploaderPath });

  return (sandbox as typeof sandbox & {
    extractLessonBundleFiles_: (zipBlob: unknown) => Array<{
      fileName: string;
      mimeType: string;
      blob: MockBlob;
    }>;
  }).extractLessonBundleFiles_({});
}

function lessonTitleFromBundleName(name: string) {
  const source = readFileSync(uploaderIndexPath, "utf8");
  const script = source.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  if (!script) throw new Error("Could not find the uploader script.");

  const sandbox = {
    window: {
      addEventListener: () => {},
    },
  };
  vm.runInNewContext(script, sandbox, { filename: uploaderIndexPath });

  return (sandbox as typeof sandbox & {
    lessonTitleFromBundleName: (bundleName: string) => string;
  }).lessonTitleFromBundleName(name);
}

describe("Google Classroom lesson bundle uploader", () => {
  it("derives a title from the current lesson-bundle filename", () => {
    expect(lessonTitleFromBundleName("Algebra-bundle.zip")).toBe("Algebra");
  });

  it("removes complete legacy PowerPoint bundle suffixes", () => {
    expect(lessonTitleFromBundleName("Algebra-PowerPoint-bundle.zip")).toBe(
      "Algebra",
    );
    expect(lessonTitleFromBundleName("Algebra PowerPoint bundle.zip")).toBe(
      "Algebra",
    );
    expect(lessonTitleFromBundleName("Algebra_PowerPoint_bundle (2).zip")).toBe(
      "Algebra",
    );
  });

  it.each(["first", "last"])("attaches saved then answers then sorted worksheets with README %s", (readmeOrder) => {
    const readme = zipEntry("README.txt", "Lesson Builder bundle format: 2");
    const attachments = extract([
      ...(readmeOrder === "first" ? [readme] : []),
      zipEntry("worksheets/zebra.pdf"),
      zipEntry("Lesson-answers.pdf"),
      zipEntry("Lesson.pdf"),
      zipEntry("worksheets/alpha.pdf"),
      ...(readmeOrder === "last" ? [readme] : []),
    ]);

    expect(attachments.map((attachment) => attachment.fileName)).toEqual([
      "Lesson.pdf",
      "Lesson-answers.pdf",
      "alpha.pdf",
      "zebra.pdf",
    ]);
    expect(attachments.map((attachment) => attachment.mimeType)).toEqual([
      "application/pdf",
      "application/pdf",
      "application/pdf",
      "application/pdf",
    ]);
  });

  it.each([false, true])("accepts a legacy one-PDF bundle with optional ignored PowerPoint (%s)", (includePowerPoint) => {
    const attachments = extract([
      zipEntry("worksheets/zebra.pdf"),
      zipEntry("Lesson.pdf"),
      ...(includePowerPoint ? [zipEntry("Lesson - PowerPoint bundle.pptx")] : []),
      zipEntry("README.txt", "Legacy lesson bundle"),
      zipEntry("worksheets/alpha.pdf"),
    ]);

    expect(attachments.map((attachment) => attachment.fileName)).toEqual([
      "Lesson.pdf",
      "alpha.pdf",
      "zebra.pdf",
    ]);
  });

  it("rejects a bundle without a root lesson PDF", () => {
    expect(() => extract([zipEntry("worksheets/practice.pdf")])).toThrow(
      "A current lesson bundle must contain one saved-state PDF and one matching -answers PDF. Found 0 root PDFs.",
    );
  });

  it("rejects two unrelated root PDFs", () => {
    expect(() =>
      extract([zipEntry("Lesson.pdf"), zipEntry("Lesson copy.pdf")]),
    ).toThrow(
      "The two root PDFs must be named <lesson>.pdf and <lesson>-answers.pdf.",
    );
  });

  it.each(["first", "last"])("rejects format 2 without answers even when README is %s", (readmeOrder) => {
    const readme = zipEntry("README.txt", "Lesson Builder bundle format: 2\nLesson export");
    expect(() => extract([
      ...(readmeOrder === "first" ? [readme] : []),
      zipEntry("Lesson.pdf"),
      ...(readmeOrder === "last" ? [readme] : []),
    ])).toThrow("A current lesson bundle must contain one saved-state PDF and one matching -answers PDF. Found 1 root PDFs.");
  });

  it("rejects three root PDFs even when two form a valid pair", () => {
    expect(() => extract([
      zipEntry("Lesson.pdf"),
      zipEntry("Lesson-answers.pdf"),
      zipEntry("Other.pdf"),
    ])).toThrow("A current lesson bundle must contain one saved-state PDF and one matching -answers PDF. Found 3 root PDFs.");
  });

  it("pairs a lesson whose title already ends in -answers", () => {
    const attachments = extract([
      zipEntry("Title-answers-answers.pdf"),
      zipEntry("Title-answers.pdf"),
      zipEntry("README.txt", "Lesson Builder bundle format: 2"),
    ]);
    expect(attachments.map((attachment) => attachment.fileName)).toEqual([
      "Title-answers.pdf", "Title-answers-answers.pdf",
    ]);
  });

  it("pairs case-insensitively while preserving original filenames", () => {
    const attachments = extract([
      zipEntry("LESSON-ANSWERS.PDF"),
      zipEntry("Lesson.pdf"),
      zipEntry("readme.TXT", "Lesson Builder bundle format: 2"),
    ]);
    expect(attachments.map((attachment) => attachment.fileName)).toEqual([
      "Lesson.pdf", "LESSON-ANSWERS.PDF",
    ]);
  });

  it("rejects ambiguous legacy root PowerPoint files", () => {
    expect(() =>
      extract([
        zipEntry("Lesson.pdf"),
        zipEntry("Lesson.pptx"),
        zipEntry("Lesson copy.pptx"),
      ]),
    ).toThrow(
      "The legacy lesson bundle may contain at most one root PowerPoint file (.pptx). Found 2.",
    );
  });
});
