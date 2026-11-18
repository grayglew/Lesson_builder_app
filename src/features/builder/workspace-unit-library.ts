import type { UnitOfWork } from "./schema";

// Units can be added/edited but not deleted. Keep both libraries when choosing
// between lesson workspaces, using the newest resource revision per stable ID.
export function mergeWorkspaceUnitLibraries(preferred: UnitOfWork[], other: UnitOfWork[]) {
  const byId = new Map(preferred.map(unit => [unit.id, unit]));
  for (const unit of other) {
    const existing = byId.get(unit.id);
    if (!existing || Date.parse(unit.updatedAt) > Date.parse(existing.updatedAt)) {
      byId.set(unit.id, unit);
    }
  }
  return [...byId.values()];
}
