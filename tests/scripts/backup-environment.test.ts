import { describe, expect, it } from "vitest";

const backupEnvironmentModule = "../../scripts/backup-environment.mjs";

describe("backup environment loading", () => {
  it("loads credentials from the current process without writing an env file", async () => {
    const { loadBackupEnvironment } = await import(
      /* @vite-ignore */ backupEnvironmentModule
    );

    await expect(
      loadBackupEnvironment("process", {
        NEXT_PUBLIC_SUPABASE_URL: "https://production-ref.supabase.co",
        SUPABASE_SECRET_KEY: "server-secret",
      }),
    ).resolves.toEqual({
      url: "https://production-ref.supabase.co",
      key: "server-secret",
    });
  });
});
