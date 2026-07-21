import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const fromRoot = (path: string) => resolve(process.cwd(), path);

describe("transition architecture retirement", () => {
  it("removes predecessor application surfaces", () => {
    expect(existsSync(fromRoot("public/builder/index.html"))).toBe(false);
    expect(existsSync(fromRoot("public/builder/app.js"))).toBe(false);
    expect(existsSync(fromRoot("src/app/lessons/page.tsx"))).toBe(false);
    expect(existsSync(fromRoot("src/app/lessons/[id]/lesson-editor.tsx"))).toBe(
      false,
    );
    expect(existsSync(fromRoot("src/lib/lesson/types.ts"))).toBe(false);
  });

  it("removes one-off migration routes but retains active workspace sync", () => {
    expect(
      existsSync(fromRoot("src/app/api/builder-global/migrate-from-json/route.ts")),
    ).toBe(false);
    expect(
      existsSync(
        fromRoot(
          "src/app/api/builder-lessons/recover-dividing-20260519/route.ts",
        ),
      ),
    ).toBe(false);
    expect(existsSync(fromRoot("src/app/api/builder-sync/latest/route.ts"))).toBe(
      true,
    );
    expect(existsSync(fromRoot("src/app/api/builder-sync/complete/route.ts"))).toBe(
      true,
    );
  });
});
