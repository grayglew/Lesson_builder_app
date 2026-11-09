import type { UnitResourceLinks } from "./schema";

export const UNIT_RESOURCE_GROUPS = [
  { title: "Support", key: "support", fields: [
    { key: "video", label: "Video" },
    { key: "supportSheet", label: "Scaffolded support sheet" },
    { key: "email", label: "Email your teacher" },
  ] },
  { title: "Practice", key: "practice", fields: [
    { key: "practice", label: "Extra practice resources" },
  ] },
  { title: "Going deeper", key: "deeper", fields: [
    { key: "examQuestions", label: "Challenging exam questions" },
    { key: "mathsChallenge", label: "Maths challenge questions" },
    { key: "investigation", label: "Investigation task" },
  ] },
] as const;

export function emptyUnitResources(): UnitResourceLinks {
  return { video: "", supportSheet: "", email: "", practice: "", examQuestions: "", mathsChallenge: "", investigation: "" };
}

/** Self-contained so the exact same policy can be embedded in student HTML. */
export function safeUnitResourceHref(value: string, allowEmail = false): string | null {
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      return !url.username && !url.password ? url.href : null;
    }
    if (!allowEmail) return null;
    const emailSource = raw.replace(/^mailto:/i, "");
    const queryStart = emailSource.indexOf("?");
    const encodedAddress = queryStart < 0 ? emailSource : emailSource.slice(0, queryStart);
    const query = queryStart < 0 ? "" : emailSource.slice(queryStart + 1);
    const address = decodeURIComponent(encodedAddress);
    if (!/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}$/i.test(address)) return null;
    const [local, domain] = address.split("@");
    if (local.startsWith(".") || local.endsWith(".") || local.includes("..") ||
      domain.split(".").some(label => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) return null;
    if (query && !/^mailto:/i.test(raw)) return null;
    const params = new URLSearchParams(query);
    for (const [key, text] of params) {
      if (!["subject", "body"].includes(key.toLowerCase()) || /[\u0000-\u001f\u007f]/.test(text)) return null;
    }
    const encodedQuery = Array.from(params, ([key, text]) => encodeURIComponent(key) + "=" + encodeURIComponent(text)).join("&");
    return "mailto:" + encodeURI(address) + (query ? "?" + encodedQuery : "");
  } catch { return null; }
}

export function hasUnitResources(value: unknown): value is UnitResourceLinks {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function renderUnitResourceCards(title: string, value: unknown): string {
  const resources = hasUnitResources(value) ? value : emptyUnitResources();
  return `<div class="unit-resource-board"><h4 class="unit-resource-title">${escapeText(title)}</h4><div class="unit-resource-columns">${UNIT_RESOURCE_GROUPS.map(group => {
    const items = group.fields.flatMap(field => {
      const raw = typeof resources[field.key] === "string" ? resources[field.key] : "";
      if (!raw.trim()) return [];
      const href = safeUnitResourceHref(raw, field.key === "email");
      return [href
        ? `<a class="unit-resource-action" href="${escapeText(href)}" target="_blank" rel="noopener noreferrer"><span>${field.label}</span><span aria-hidden="true">↗</span></a>`
        : `<div class="unit-resource-action is-note">${escapeText(raw.trim())}</div>`];
    });
    return `<section class="unit-resource-category unit-resource-${group.key}" aria-label="${group.title}"><h5>${group.title}</h5><div class="unit-resource-items">${items.join("") || '<p class="unit-resource-empty">No resources added</p>'}</div></section>`;
  }).join("")}</div></div>`;
}

function escapeText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const UNIT_RESOURCE_CSS = `
.unit-resource-surface{width:100%;height:100%;min-width:0}
.unit-resource-board{container-type:inline-size;box-sizing:border-box;width:100%;height:100%;padding:1rem;display:flex;flex-direction:column;gap:1rem;background:#fff;color:#172124;text-align:left;font-family:inherit}
.unit-resource-board .unit-resource-title{margin:0;font-size:1.5rem;line-height:1.15;text-align:left;overflow-wrap:anywhere}
.unit-resource-columns{display:grid;grid-template-columns:minmax(0,1fr);gap:1rem;flex:1;min-height:0}
.unit-resource-category{min-width:0;border:1px solid #d1ded9;border-top:4px solid #247569;padding:1rem;background:#f0f7f4;border-radius:4px}
.unit-resource-category.unit-resource-practice{border-top-color:#a36b25;background:#fcf8ee}
.unit-resource-category.unit-resource-deeper{border-top-color:#405a82;background:#f1f4f9}
.unit-resource-category h5{margin:0 0 1rem;font-size:1.1rem;line-height:1.2;font-weight:800;color:#172124}
.unit-resource-items{display:grid;gap:.75rem}
.unit-resource-action{box-sizing:border-box;display:flex;justify-content:space-between;align-items:center;gap:.5rem;min-height:44px;padding:.75rem;border:1px solid #9cb9ae;border-radius:4px;background:#fff;color:#174f46;font-size:1rem;font-weight:700;line-height:1.3;text-decoration:none;overflow-wrap:anywhere;min-width:0}
.unit-resource-action:hover{background:#e2f3ed;border-color:#247569}
.unit-resource-action:focus-visible{outline:3px solid #0f766e;outline-offset:3px}
.unit-resource-action.is-note{border-style:dashed;border-color:#c3cbc8;background:transparent;color:#3b4944;font-weight:500;cursor:default}
.unit-resource-action.is-note:hover{background:transparent}
.unit-resource-empty{margin:0;color:#68766f;font-size:.875rem;line-height:1.4}
@container(min-width:600px){
 .unit-resource-board .unit-resource-title{font-size:3.8cqw}
 .unit-resource-columns{grid-template-columns:repeat(3,minmax(0,1fr));gap:2cqw}
 .unit-resource-category{padding:1.7cqw}
 .unit-resource-category h5{font-size:2.5cqw;margin-bottom:2cqw}
 .unit-resource-items{gap:1.4cqw}
 .unit-resource-action{font-size:1.85cqw;min-height:6cqw;padding:1.4cqw}
 .unit-resource-empty{font-size:1.65cqw}
}
.student-shared-view .unit-resource-action{min-height:44px;font-size:max(14px,1.85cqw)}
@media(max-width:760px){.student-shared-view .lesson-slide:has(.unit-resource-board){aspect-ratio:auto}}
`;
