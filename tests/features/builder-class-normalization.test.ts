import { describe, expect, it } from "vitest";
import {
  createInitialBuilderDocument,
  mergeWorkspaceAndGlobal,
  normalizeBuilderDocument,
} from "@/features/builder/schema";

describe("builder class normalization", () => {
  it("keeps an explicit managed class list without restoring deleted defaults", () => {
    const normalized = normalizeBuilderDocument({
      classNames: ["Year 9 Maths"],
      retrievalItems: [],
    });

    expect(normalized.classNames).toEqual(["Year 9 Maths"]);
  });

  it("keeps an explicitly empty managed class list after all classes are deleted", () => {
    const workspace = createInitialBuilderDocument("2026-07-18T06:00:00.000Z");
    workspace.className = "";

    const merged = mergeWorkspaceAndGlobal(workspace, {
      classNames: [],
      retrievalItems: [],
      slideTemplates: [],
    });

    expect(merged.classNames).toEqual([]);
  });
});
