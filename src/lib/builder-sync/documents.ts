export const BUILDER_SYNC_DOCUMENT_KINDS = ["workspace", "global"] as const;
export const BUILDER_SYNC_RETAINED_SNAPSHOTS = 4;

export type BuilderSyncDocumentKind = (typeof BUILDER_SYNC_DOCUMENT_KINDS)[number];

type StorageSnapshot = {
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
  last_accessed_at?: string | null;
  metadata?: {
    size?: number | string | null;
    [key: string]: unknown;
  } | null;
};

export function normalizeBuilderSyncKind(value: unknown): BuilderSyncDocumentKind {
  const text = String(value || "").trim();
  return BUILDER_SYNC_DOCUMENT_KINDS.includes(text as BuilderSyncDocumentKind)
    ? (text as BuilderSyncDocumentKind)
    : "workspace";
}

export function builderSyncDocumentFolder(userId: string, kind: BuilderSyncDocumentKind) {
  return `${userId}/builder-state/${kind}`;
}

export function builderSyncDocumentPath(userId: string, kind: BuilderSyncDocumentKind) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${builderSyncDocumentFolder(userId, kind)}/${timestamp}-${crypto.randomUUID()}.json`;
}

export function isBuilderSyncDocumentPath(userId: string, kind: BuilderSyncDocumentKind, path: string) {
  return path.startsWith(`${builderSyncDocumentFolder(userId, kind)}/`) && path.endsWith(".json");
}

export function storageSnapshotTimestamp(snapshot: StorageSnapshot) {
  return String(snapshot.updated_at || snapshot.created_at || snapshot.last_accessed_at || "");
}

export function storageSnapshotByteSize(snapshot: StorageSnapshot) {
  const size = Number(snapshot.metadata?.size || 0);
  return Number.isFinite(size) ? Math.max(0, Math.round(size)) : 0;
}

export function sortBuilderSyncSnapshots(snapshots: StorageSnapshot[]) {
  return [...snapshots]
    .filter((snapshot) => snapshot.name.endsWith(".json"))
    .sort((left, right) => {
      const leftTime = Date.parse(storageSnapshotTimestamp(left));
      const rightTime = Date.parse(storageSnapshotTimestamp(right));
      const leftSort = Number.isNaN(leftTime) ? 0 : leftTime;
      const rightSort = Number.isNaN(rightTime) ? 0 : rightTime;
      if (rightSort !== leftSort) return rightSort - leftSort;
      return right.name.localeCompare(left.name);
    });
}

export function latestBuilderSyncSnapshot(snapshots: StorageSnapshot[]) {
  return sortBuilderSyncSnapshots(snapshots)[0] || null;
}

export function oldBuilderSyncSnapshotPaths(
  userId: string,
  kind: BuilderSyncDocumentKind,
  snapshots: StorageSnapshot[],
  retainedCount = BUILDER_SYNC_RETAINED_SNAPSHOTS,
) {
  return sortBuilderSyncSnapshots(snapshots)
    .slice(Math.max(0, retainedCount))
    .map((snapshot) => `${builderSyncDocumentFolder(userId, kind)}/${snapshot.name}`);
}
