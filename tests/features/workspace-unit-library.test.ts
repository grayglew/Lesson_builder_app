import { describe, expect, it } from "vitest";
import { mergeWorkspaceUnitLibraries } from "@/features/builder/workspace-unit-library";

const unit = (id: string, updatedAt: string, title: string) => ({ id, name: id, updatedAt, slides: [{ id: `resource-${id}`, title, bullets: [] }] });
describe("append-only workspace unit recovery", () => {
  it("keeps both local-only and cloud-only units, in chosen workspace order", () => {
    const local = [unit("new-local", "2026-11-17", "Local resources")];
    const remote = [unit("11.05", "2026-11-16", "Histograms resources")];
    expect(mergeWorkspaceUnitLibraries(local, remote).map(unit => unit.id)).toEqual(["new-local", "11.05"]);
  });
  it("keeps the most recently edited resource version of each stable unit ID", () => {
    const local = [unit("11.05", "2026-11-15", "Old resources"), unit("local-newer", "2026-11-17", "New local resources")];
    const remote = [unit("11.05", "2026-11-17", "Updated cloud resources"), unit("local-newer", "2026-11-15", "Old resources")];
    expect(mergeWorkspaceUnitLibraries(local, remote).map(unit => unit.slides[0].title)).toEqual(["Updated cloud resources", "New local resources"]);
  });
});
