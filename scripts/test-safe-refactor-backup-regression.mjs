import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dirname, "..", "..");
const backupsDir = resolve(workspaceRoot, "backups");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(existsSync(backupsDir), "Expected a backups directory before structural refactor work.");

const backupNames = readdirSync(backupsDir)
  .filter((name) => /^lesson-builder-online-\d{8}-\d{6}-before-structural-refactor$/.test(name))
  .sort();

assert(backupNames.length > 0, "Expected a timestamped pre-refactor lesson-builder-online backup.");

const latestBackup = resolve(backupsDir, backupNames[backupNames.length - 1]);
assert(statSync(latestBackup).isDirectory(), "Latest pre-refactor backup should be a directory.");

for (const requiredPath of [
  "public/builder/app.js",
  "public/builder/index.html",
  "src/app/api/builder-global/route.ts",
  "package.json",
  "ROLLBACK.md",
]) {
  assert(existsSync(resolve(latestBackup, requiredPath)), `Backup should include ${requiredPath}.`);
}

const rollback = readFileSync(resolve(latestBackup, "ROLLBACK.md"), "utf8");
assert(
  rollback.includes("https://lesson-builder-online.vercel.app") &&
    rollback.includes("lesson-builder-online-93zfu62yi-grayglew-8338s-projects.vercel.app") &&
    rollback.includes("robocopy") &&
    rollback.includes("No destructive database migration"),
  "Rollback note should record production deployment, local restore command, and database rollback assumptions.",
);

console.log(`Safe refactor backup regression checks passed for ${latestBackup}.`);
