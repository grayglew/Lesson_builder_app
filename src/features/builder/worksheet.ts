import type { BuilderAsset, BuilderSlide } from "./schema";
import { createBuilderId } from "./schema";

type WorksheetDraft = {
  title: string;
  worksheet: BuilderAsset;
  answers: BuilderAsset | null;
};

export function createWorksheetSlide(
  { title, worksheet, answers }: WorksheetDraft,
  createdAt = new Date().toISOString(),
): BuilderSlide {
  return {
    id: createBuilderId("slide"),
    type: "worksheet",
    title: title.trim() || "Worksheet",
    worksheet,
    answers,
    createdAt,
  };
}
