import { describe, expect, it, vi } from "vitest";
import {
  applyApprovedGlobalPromotion,
  hashPromotionPlan,
} from "../../scripts/lib/drfrost-global-promotion.mjs";

describe("Doctor Frost global promotion approval gate", () => {
  it("does not mutate without an exact explicit approval", async () => {
    const plan = samplePlan();
    const adapter = { applyPromotion: vi.fn() };

    await expect(
      applyApprovedGlobalPromotion({ plan, approval: null, adapter }),
    ).rejects.toThrow(/approval/i);
    expect(adapter.applyPromotion).not.toHaveBeenCalled();
  });

  it("rejects a plan with unresolved conflicts even when counts match", async () => {
    const plan = { ...samplePlan(), conflictCount: 1 };
    const adapter = { applyPromotion: vi.fn() };

    await expect(
      applyApprovedGlobalPromotion({
        plan,
        approval: approvalFor(plan),
        adapter,
      }),
    ).rejects.toThrow(/unresolved/i);
    expect(adapter.applyPromotion).not.toHaveBeenCalled();
  });

  it("applies only the exact approved plan and records rollback material", async () => {
    const plan = samplePlan();
    const rollback = { canonicalLoIds: plan.canonicalLoIds };
    const adapter = { applyPromotion: vi.fn().mockResolvedValue(rollback) };

    const report = await applyApprovedGlobalPromotion({
      plan,
      approval: approvalFor(plan),
      adapter,
    });

    expect(adapter.applyPromotion).toHaveBeenCalledWith(plan);
    expect(report).toMatchObject({
      sourceManifestHash: plan.sourceManifestHash,
      loCount: 1645,
      imageReferenceCount: 26320,
      rollback,
    });
  });
});

function samplePlan() {
  return {
    schemaVersion: "drfrost-global-promotion/v1",
    sourceManifestHash:
      "ed76a3c2d9e6a42dd41097fc79c4b84725494a04305fba69b5ca98e765c6288b",
    targetProjectRef: "fjrukfawhmbdmrztznlf",
    ownerEmail: "grayglew@gmail.com",
    ownerId: "owner-1",
    loCount: 1645,
    imageReferenceCount: 26320,
    conflictCount: 0,
    canonicalLoIds: ["lo-1"],
    canonicalImageIds: ["image-1"],
    repointProgress: [],
    repointImages: [],
    archivePersonalLos: [],
    conflicts: [],
    inspectedAt: "2026-07-30T00:00:00.000Z",
  };
}

function approvalFor(plan: ReturnType<typeof samplePlan>) {
  return {
    approved: true,
    planHash: hashPromotionPlan(plan),
    sourceManifestHash: plan.sourceManifestHash,
    targetProjectRef: plan.targetProjectRef,
    ownerEmail: plan.ownerEmail,
    loCount: plan.loCount,
    imageReferenceCount: plan.imageReferenceCount,
    conflictCount: plan.conflictCount,
    approvedAt: "2026-07-30T00:00:00.000Z",
  };
}
