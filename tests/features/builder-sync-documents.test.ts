import { describe, expect, it } from "vitest";
import {
  builderSyncCompletionConflict,
  builderSyncSnapshotRevision,
} from "@/lib/builder-sync/documents";

const userId = "teacher";
const kind = "workspace" as const;

describe("builder sync revision checks", () => {
  it("accepts a snapshot whose previous revision matches the ticket baseline", () => {
    const previousName = "2026-07-19T01-00-00-000Z-old.json";
    const currentName = "2026-07-19T01-00-02-000Z-current.json";

    expect(
      builderSyncCompletionConflict({
        userId,
        kind,
        path: builderSyncSnapshotRevision(userId, kind, currentName),
        expectedRevision: builderSyncSnapshotRevision(
          userId,
          kind,
          previousName,
        ),
        snapshots: [
          {
            name: currentName,
            created_at: "2026-07-19T01:00:02.000Z",
          },
          {
            name: previousName,
            created_at: "2026-07-19T01:00:00.000Z",
          },
        ],
      }),
    ).toBe("");
  });

  it("rejects a stale baseline and an upload superseded before completion", () => {
    const currentName = "2026-07-19T01-00-02-000Z-current.json";
    const newerName = "2026-07-19T01-00-03-000Z-newer.json";
    const snapshots = [
      { name: newerName, created_at: "2026-07-19T01:00:03.000Z" },
      { name: currentName, created_at: "2026-07-19T01:00:02.000Z" },
    ];

    expect(
      builderSyncCompletionConflict({
        userId,
        kind,
        path: builderSyncSnapshotRevision(userId, kind, currentName),
        expectedRevision: "",
        snapshots,
      }),
    ).toContain("newer workspace snapshot");
  });
});
