import type { BuilderAsset, BuilderSlide } from "./schema";
import { createBuilderId } from "./schema";

export const CFU_PLACEMENTS = ["full", "top-left", "top-center"] as const;

export type CfuPlacement = (typeof CFU_PLACEMENTS)[number];

export function createCfuSlide(
  image: BuilderAsset,
  placement: CfuPlacement,
  createdAt = new Date().toISOString(),
): BuilderSlide {
  return {
    id: createBuilderId("slide"),
    type: "cfu",
    title: "Check for Understanding",
    placement,
    image,
    createdAt,
  };
}
