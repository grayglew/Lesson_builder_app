import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyApprovedImport,
  buildDrFrostImportManifest,
  hashImportManifest,
  rollbackApprovedImport,
} from "./lib/drfrost-import.mjs";
import { createSupabaseDrFrostAdapter } from "./lib/supabase-drfrost-adapter.mjs";

const args = parseArgs(process.argv.slice(2));

try {
  if (args.apply) await applyImport();
  else if (args.rollback) await rollbackImport();
  else await createInventory();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function createInventory() {
  if (args.allowIncomplete && args.partialFinal) {
    throw new Error("Choose either --allow-incomplete or --partial-final, not both.");
  }
  const workspaceRoot = path.resolve(args.workspaceRoot || path.join(process.cwd(), ".."));
  const captureRoot = path.resolve(args.captureRoot || path.join(workspaceRoot, "drfrost-captures"));
  const registerFiles = args.register
    ? asArray(args.register).map((file) => path.resolve(file))
    : [1, 2, 3, 4].map((lane) =>
        path.join(workspaceRoot, `drfrost-capture-lane-${lane}.md`),
      );
  const targetProjectRef = requireArg("projectRef");
  const ownerEmail = args.ownerEmail || "grayglew@gmail.com";
  const outputPath = path.resolve(
    args.output || path.join(process.cwd(), "drfrost-import-reports", "import-manifest.json"),
  );
  const manifest = await buildDrFrostImportManifest({
    captureRoot,
    registerFiles,
    expectedTotal: Number(args.expectedTotal || 1809),
    requireAllChecked: !args.allowIncomplete && !args.partialFinal,
    partialFinal: Boolean(args.partialFinal),
    targetProjectRef,
    ownerEmail,
  });
  const manifestHash = hashImportManifest(manifest);
  await writeJson(outputPath, manifest);
  const approvalTemplatePath = `${outputPath}.approval-template.json`;
  await writeJson(approvalTemplatePath, {
    approved: false,
    applyEligible: manifest.inventoryMode !== "inspection-only",
    inventoryMode: manifest.inventoryMode,
    allowPartial: false,
    approvedEntryCount: manifest.entries.length,
    excludedEntryCount: manifest.exclusions.length,
    targetProjectRef: manifest.targetProjectRef,
    ownerEmail: manifest.ownerEmail,
    manifestHash,
    runId: manifest.runId,
    approvedAt: null,
  });
  console.log(
    JSON.stringify(
      {
        mode: manifest.inventoryMode,
        uploaded: false,
        manifestPath: outputPath,
        approvalTemplatePath,
        manifestHash,
        entries: manifest.entries.length,
        omissions: manifest.omissions.length,
        exclusions: manifest.exclusions.length,
        register: manifest.register,
      },
      null,
      2,
    ),
  );
}

async function applyImport() {
  const manifestPath = path.resolve(requireArg("manifest"));
  const approvalPath = path.resolve(requireArg("approval"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const approval = JSON.parse(await readFile(approvalPath, "utf8"));
  const manifestHash = hashImportManifest(manifest);
  const requestedProjectRef = requireArg("projectRef");
  if (requestedProjectRef !== manifest.targetProjectRef) {
    throw new Error("--project-ref does not match the import manifest target.");
  }
  const checkpointPath = path.resolve(
    args.checkpoint || `${manifestPath}.${manifest.runId}.checkpoint.json`,
  );
  const checkpointWriter = createCheckpointWriter(
    checkpointPath,
    Number(args.checkpointIntervalMs || 30000),
  );
  const createAdapter = createApprovedAdapterFactory(requestedProjectRef);
  let report;
  try {
    report = await applyApprovedImport({
      manifest,
      manifestHash,
      approval,
      createAdapter,
      uploadConcurrency: Number(args.uploadConcurrency || 8),
      onCheckpoint: checkpointWriter.write,
    });
  } finally {
    await checkpointWriter.flush();
  }
  const reportPath = path.resolve(args.report || `${manifestPath}.${manifest.runId}.report.json`);
  await writeJson(reportPath, report);
  console.log(
    JSON.stringify(
      {
        mode: "apply",
        reportPath,
        runId: report.runId,
        manifestHash: report.manifestHash,
        targetProjectRef: report.targetProjectRef,
        ownerEmail: report.ownerEmail,
        startedAt: report.startedAt,
        completedAt: report.completedAt,
        entries: report.entries.length,
        created: report.created,
        replaced: report.replaced,
      },
      null,
      2,
    ),
  );
}

async function rollbackImport() {
  const reportPath = path.resolve(requireArg("report"));
  const approvalPath = path.resolve(requireArg("approval"));
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const approval = JSON.parse(await readFile(approvalPath, "utf8"));
  const requestedProjectRef = requireArg("projectRef");
  if (requestedProjectRef !== report.targetProjectRef) {
    throw new Error("--project-ref does not match the import report target.");
  }
  const rollback = await rollbackApprovedImport({
    report,
    approval,
    createAdapter: createApprovedAdapterFactory(requestedProjectRef),
  });
  const rollbackPath = path.resolve(args.output || `${reportPath}.rollback.json`);
  await writeJson(rollbackPath, rollback);
  console.log(JSON.stringify({ mode: "rollback", rollbackPath, ...rollback }, null, 2));
}

function createApprovedAdapterFactory(projectRef) {
  return async () => {
    // These write-capable credentials are intentionally read only after the
    // approval gate in applyApprovedImport/rollbackApprovedImport has passed.
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required after approval.");
    }
    const hostname = new URL(supabaseUrl).hostname;
    if (!hostname.startsWith(`${projectRef}.`)) {
      throw new Error("SUPABASE_URL does not match the approved project ref.");
    }
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return createSupabaseDrFrostAdapter(supabase);
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createCheckpointWriter(filePath, minimumIntervalMs) {
  if (!Number.isFinite(minimumIntervalMs) || minimumIntervalMs < 1000) {
    throw new Error("Checkpoint interval must be at least 1000 milliseconds.");
  }
  let latest = null;
  let lastWrittenAt = 0;
  let lastReportedComplete = 0;
  return {
    write: async (checkpoint) => {
      latest = checkpoint;
      const complete = checkpoint.entries.filter((entry) => entry.status === "complete").length;
      if (complete >= lastReportedComplete + 10 || checkpoint.completedAt) {
        lastReportedComplete = complete;
        console.log(
          JSON.stringify({
            mode: "apply-progress",
            complete,
            total: checkpoint.entries.length,
            created: checkpoint.created,
            replaced: checkpoint.replaced,
          }),
        );
      }
      if (checkpoint.completedAt || Date.now() - lastWrittenAt >= minimumIntervalMs) {
        await writeJson(filePath, checkpoint);
        lastWrittenAt = Date.now();
      }
    },
    flush: async () => {
      if (latest) await writeJson(filePath, latest);
    },
  };
}

function requireArg(name) {
  const value = args[name];
  if (!value || Array.isArray(value)) throw new Error(`--${toKebab(name)} is required.`);
  return value;
}

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function parseArgs(tokens) {
  const parsed = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = toCamel(token.slice(2));
    const next = tokens[index + 1];
    const value = !next || next.startsWith("--") ? true : tokens[++index];
    if (parsed[key] === undefined) parsed[key] = value;
    else parsed[key] = [...asArray(parsed[key]), value];
  }
  if (parsed.apply && parsed.rollback) throw new Error("Choose either --apply or --rollback.");
  return parsed;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function toKebab(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
