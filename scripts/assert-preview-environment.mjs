const previewUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const productionRef = String(process.env.PRODUCTION_SUPABASE_PROJECT_REF || "").trim();

if (!previewUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for preview environment validation.");
}

if (!productionRef) {
  throw new Error("PRODUCTION_SUPABASE_PROJECT_REF is required for preview environment validation.");
}

let previewHost;
try {
  previewHost = new URL(previewUrl).hostname;
} catch {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
}

const previewRef = previewHost.split(".")[0] || "";
if (!previewRef) {
  throw new Error("Could not resolve the Supabase project ref from NEXT_PUBLIC_SUPABASE_URL.");
}

if (previewRef === productionRef) {
  throw new Error(
    `Preview deployment points to production Supabase project ${productionRef}. Refusing to continue.`,
  );
}

console.log(`Preview environment isolation verified for Supabase project ${previewRef}.`);
