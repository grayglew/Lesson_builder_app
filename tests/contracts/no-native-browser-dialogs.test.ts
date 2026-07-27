import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("browser dialog contract", () => {
  it("keeps production builder and presenter code free of native dialogs", () => {
    const root = process.cwd();
    const productionFiles = [
      ...sourceFiles(resolve(root, "src")),
      resolve(root, "public/builder-v2-assets/presenter-runtime.js"),
    ];
    const violations = productionFiles.flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return /window\.(?:alert|confirm|prompt)\s*\(|(^|[^.\w])alert\s*\(/m.test(source)
        ? [path]
        : [];
    });

    expect(violations).toEqual([]);
  });
});
