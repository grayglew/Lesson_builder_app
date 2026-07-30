import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashImportManifest } from "./lib/drfrost-import.mjs";
import {
  applyApprovedGlobalPromotion,
  inspectGlobalPromotion,
} from "./lib/drfrost-global-promotion.mjs";

const args = parseArgs(process.argv.slice(2));

try {
  if (args.apply) await applyPromotion();
  else await inspectPromotion();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function inspectPromotion() {
  const manifestPath = path.resolve(requireArg("manifest"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const manifestHash = hashImportManifest(manifest);
  const projectRef = requireArg("projectRef");
  assertProject(manifest.targetProjectRef, projectRef);
  const adapter = await createAdapter(projectRef);
  const { plan, planHash } = await inspectGlobalPromotion({ manifest, manifestHash, adapter });
  const outputPath = path.resolve(args.output || `${manifestPath}.global-promotion-plan.json`);
  await writeJson(outputPath, plan);
  const approvalPath = `${outputPath}.approval-template.json`;
  await writeJson(approvalPath, {
    approved: false,
    planHash,
    sourceManifestHash: plan.sourceManifestHash,
    targetProjectRef: plan.targetProjectRef,
    ownerEmail: plan.ownerEmail,
    loCount: plan.loCount,
    imageReferenceCount: plan.imageReferenceCount,
    conflictCount: plan.conflictCount,
    approvedAt: null,
  });
  console.log(JSON.stringify({ mode: "inspection", mutated: false, outputPath, approvalPath, planHash, ...summary(plan) }, null, 2));
}

async function applyPromotion() {
  const planPath = path.resolve(requireArg("plan"));
  const approvalPath = path.resolve(requireArg("approval"));
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  const approval = JSON.parse(await readFile(approvalPath, "utf8"));
  const projectRef = requireArg("projectRef");
  assertProject(plan.targetProjectRef, projectRef);
  const report = await applyApprovedGlobalPromotion({
    plan,
    approval,
    adapter: await createAdapter(projectRef),
  });
  const reportPath = path.resolve(args.report || `${planPath}.report.json`);
  await writeJson(reportPath, report);
  console.log(JSON.stringify({ mode: "apply", uploaded: false, reportPath, ...summary(report) }, null, 2));
}

async function createAdapter(projectRef) {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  if (!new URL(supabaseUrl).hostname.startsWith(`${projectRef}.`)) {
    throw new Error("SUPABASE_URL does not match --project-ref.");
  }
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return createSupabasePromotionAdapter(supabase);
}

function createSupabasePromotionAdapter(supabase) {
  return {
    async resolveOwnerId(email) {
      const normalized = String(email).trim().toLowerCase();
      for (let page = 1; page <= 100; page += 1) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        const user = data.users.find((entry) => String(entry.email || "").trim().toLowerCase() === normalized);
        if (user) return user.id;
        if (data.users.length < 1000) break;
      }
      throw new Error(`No Supabase user found for ${email}.`);
    },
    loadCanonicalPersonalLos(ownerId, codes) {
      return selectInChunks(supabase, "retrieval_los", "lo_code", codes, (query) =>
        query.select("id,owner_id,lo_code,archived_at,scope").eq("owner_id", ownerId).eq("scope", "personal").is("archived_at", null));
    },
    loadCanonicalPersonalImages(ownerId, ids) {
      return selectInChunks(supabase, "retrieval_lo_images", "retrieval_lo_id", ids, (query) =>
        query.select("id,owner_id,retrieval_lo_id,seen_count,role,asset_id,scope,is_hidden").eq("owner_id", ownerId).eq("scope", "personal"));
    },
    async loadOtherPersonalLos(ownerId, codes) {
      const rows = await selectInChunks(supabase, "retrieval_los", "lo_code", codes, (query) =>
        query.select("id,owner_id,lo_code,archived_at,scope").eq("scope", "personal").is("archived_at", null));
      return rows.filter((row) => row.owner_id !== ownerId);
    },
    loadProgressRows(ids) {
      return selectInChunks(supabase, "retrieval_class_progress", "retrieval_lo_id", ids, (query) =>
        query.select("id,owner_id,retrieval_lo_id,class_name,archived_at").is("archived_at", null));
    },
    loadPersonalImageRows(ids) {
      return selectInChunks(supabase, "retrieval_lo_images", "retrieval_lo_id", ids, (query) =>
        query.select("id,owner_id,retrieval_lo_id,seen_count,role,scope,is_hidden").eq("scope", "personal"));
    },
    async applyPromotion(plan) {
      try {
        await updateIdsInChunks(supabase, "retrieval_lo_images", plan.canonicalImageIds, { scope: "global", is_hidden: false });
        await updateIdsInChunks(supabase, "retrieval_los", plan.canonicalLoIds, { scope: "global" });
        for (const change of plan.repointImages) await updateOne(supabase, "retrieval_lo_images", change.id, { retrieval_lo_id: change.to });
        for (const change of plan.repointProgress) await updateOne(supabase, "retrieval_class_progress", change.id, { retrieval_lo_id: change.to });
        const archivedAt = new Date().toISOString();
        for (const change of plan.archivePersonalLos) await updateOne(supabase, "retrieval_los", change.id, { archived_at: archivedAt });
      } catch (error) {
        await rollbackPromotion(supabase, plan).catch(() => undefined);
        throw error;
      }
      return {
        canonicalLoIds: plan.canonicalLoIds,
        canonicalImageIds: plan.canonicalImageIds,
        repointProgress: plan.repointProgress,
        repointImages: plan.repointImages,
        archivePersonalLos: plan.archivePersonalLos,
      };
    },
  };
}

async function rollbackPromotion(supabase, plan) {
  for (const change of [...plan.archivePersonalLos].reverse()) await updateOne(supabase, "retrieval_los", change.id, { archived_at: change.previousArchivedAt });
  for (const change of [...plan.repointProgress].reverse()) await updateOne(supabase, "retrieval_class_progress", change.id, { retrieval_lo_id: change.from });
  for (const change of [...plan.repointImages].reverse()) await updateOne(supabase, "retrieval_lo_images", change.id, { retrieval_lo_id: change.from });
  await updateIdsInChunks(supabase, "retrieval_los", plan.canonicalLoIds, { scope: "personal" });
  await updateIdsInChunks(supabase, "retrieval_lo_images", plan.canonicalImageIds, { scope: "personal", is_hidden: false });
}

async function selectInChunks(supabase, table, column, values, configure) {
  const rows = [];
  for (let index = 0; index < values.length; index += 200) {
    const query = configure(supabase.from(table)).in(column, values.slice(index, index + 200));
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

async function updateIdsInChunks(supabase, table, ids, values) {
  for (let index = 0; index < ids.length; index += 200) {
    const { error } = await supabase.from(table).update(values).in("id", ids.slice(index, index + 200));
    if (error) throw error;
  }
}

async function updateOne(supabase, table, id, values) {
  const { error } = await supabase.from(table).update(values).eq("id", id);
  if (error) throw error;
}

function assertProject(expected, actual) {
  if (expected !== actual) throw new Error("Project ref does not match the approved source.");
}

function summary(value) {
  return {
    targetProjectRef: value.targetProjectRef,
    ownerEmail: value.ownerEmail,
    loCount: value.loCount,
    imageReferenceCount: value.imageReferenceCount,
    conflictCount: value.conflictCount,
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function requireArg(name) {
  const value = args[name];
  if (!value || value === true) throw new Error(`--${toKebab(name)} is required.`);
  return String(value);
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = values[index + 1];
    if (!next || next.startsWith("--")) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function toKebab(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
