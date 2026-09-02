import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

const uploaderPath = resolve(
  process.cwd(),
  "integrations/google-classroom-uploader/Code.gs",
);

type MockBlob = {
  getBytes: () => number[];
  getName: () => string;
};

function zipEntry(name: string): MockBlob {
  return {
    getName: () => name,
    getBytes: () => [1, 2, 3],
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

describe("Google Classroom lesson bundle uploader", () => {
  it("attaches the root lesson PDF first and worksheet PDFs by filename", () => {
    const attachments = extract([
      zipEntry("worksheets/zebra.pdf"),
      zipEntry("Lesson.pdf"),
      zipEntry("README.txt"),
      zipEntry("worksheets/alpha.pdf"),
    ]);

    expect(attachments.map((attachment) => attachment.fileName)).toEqual([
      "Lesson.pdf",
      "alpha.pdf",
      "zebra.pdf",
    ]);
    expect(attachments.map((attachment) => attachment.mimeType)).toEqual([
      "application/pdf",
      "application/pdf",
      "application/pdf",
    ]);
  });

  it("accepts one legacy root PowerPoint file but does not attach it", () => {
    const attachments = extract([
      zipEntry("Lesson.pdf"),
      zipEntry("Lesson - PowerPoint bundle.pptx"),
    ]);

    expect(attachments.map((attachment) => attachment.fileName)).toEqual([
      "Lesson.pdf",
    ]);
  });

  it("rejects a bundle without a root lesson PDF", () => {
    expect(() => extract([zipEntry("worksheets/practice.pdf")])).toThrow(
      "The lesson bundle must contain exactly one root PDF file (.pdf). Found 0.",
    );
  });

  it("rejects a bundle with duplicate root lesson PDFs", () => {
    expect(() =>
      extract([zipEntry("Lesson.pdf"), zipEntry("Lesson copy.pdf")]),
    ).toThrow(
      "The lesson bundle must contain exactly one root PDF file (.pdf). Found 2.",
    );
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
