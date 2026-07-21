import { readFile } from "node:fs/promises";

function parseEnvFile(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export async function loadBackupEnvironment(source, environment = process.env) {
  const values = source === "process" ? environment : parseEnvFile(await readFile(source, "utf8"));
  const url = String(values.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = String(values.SUPABASE_SERVICE_ROLE_KEY || values.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !key) {
    throw new Error(`${source} does not contain a Supabase URL and server-side secret key.`);
  }
  return { url, key };
}
