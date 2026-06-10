export const LEGACY_BUILDER_STATE_RETAINED_SNAPSHOTS = 1;

export type LegacyBuilderStateSnapshot = {
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  last_accessed_at?: string | null;
  metadata?: {
    size?: number | string | null;
    [key: string]: unknown;
  } | null;
};

export type LegacyBuilderStateCleanupSummary = {
  kept: LegacyBuilderStateFileSummary[];
  removable: LegacyBuilderStateFileSummary[];
  removableBytes: number;
  retainedCount: number;
};

export type LegacyBuilderStateFileSummary = {
  name: string;
  path: string;
  byteSize: number;
  updatedAt: string;
};

export function legacyBuilderStateFolder(userId: string) {
  return `${userId}/builder-state`;
}

export function legacyBuilderStateTimestamp(snapshot: LegacyBuilderStateSnapshot) {
  return String(snapshot.updated_at || snapshot.created_at || snapshot.last_accessed_at || "");
}

export function legacyBuilderStateByteSize(snapshot: LegacyBuilderStateSnapshot) {
  const size = Number(snapshot.metadata?.size || 0);
  return Number.isFinite(size) ? Math.max(0, Math.round(size)) : 0;
}

export function sortLegacyBuilderStateSnapshots(snapshots: LegacyBuilderStateSnapshot[]) {
  return [...snapshots]
    .filter((snapshot) => snapshot.name.endsWith(".json"))
    .sort((left, right) => {
      const leftTime = Date.parse(legacyBuilderStateTimestamp(left));
      const rightTime = Date.parse(legacyBuilderStateTimestamp(right));
      const leftSort = Number.isNaN(leftTime) ? 0 : leftTime;
      const rightSort = Number.isNaN(rightTime) ? 0 : rightTime;
      if (rightSort !== leftSort) return rightSort - leftSort;
      return right.name.localeCompare(left.name);
    });
}

export function legacyBuilderStateCleanupSummary(
  userId: string,
  snapshots: LegacyBuilderStateSnapshot[],
  retainedCount = LEGACY_BUILDER_STATE_RETAINED_SNAPSHOTS,
): LegacyBuilderStateCleanupSummary {
  const folder = legacyBuilderStateFolder(userId);
  const sorted = sortLegacyBuilderStateSnapshots(snapshots);
  const normalizedRetainedCount = Math.max(0, Math.round(retainedCount));

  const toSummary = (snapshot: LegacyBuilderStateSnapshot): LegacyBuilderStateFileSummary => ({
    name: snapshot.name,
    path: `${folder}/${snapshot.name}`,
    byteSize: legacyBuilderStateByteSize(snapshot),
    updatedAt: legacyBuilderStateTimestamp(snapshot),
  });

  const kept = sorted.slice(0, normalizedRetainedCount).map(toSummary);
  const removable = sorted.slice(normalizedRetainedCount).map(toSummary);

  return {
    kept,
    removable,
    removableBytes: removable.reduce((total, snapshot) => total + snapshot.byteSize, 0),
    retainedCount: normalizedRetainedCount,
  };
}
