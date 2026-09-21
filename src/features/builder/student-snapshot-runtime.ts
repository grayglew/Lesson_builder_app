const STUDENT_SHARED_VIEW_CSS =
  "html,body{margin:0;padding:0;min-height:100%;background:#eef5f3;color:#111827;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;touch-action:pan-y pinch-zoom;overscroll-behavior-y:auto;-webkit-overflow-scrolling:touch}" +
  "body.student-shared-view .lesson-header{position:static;display:flex;justify-content:space-between;gap:18px;max-width:1120px;margin:12px auto 0;padding:10px 14px;box-sizing:border-box;background:#fff;border:1px solid #cad7d7;border-radius:8px;box-shadow:0 4px 14px rgba(19,37,42,.08)}" +
  "body.student-shared-view .lesson-deck{display:grid;gap:16px;place-items:center;margin:0;padding:16px;box-sizing:border-box;touch-action:pan-y pinch-zoom}" +
  "body.student-shared-view .lesson-slide{display:block;width:min(1120px,calc(100vw - 32px));height:auto;max-height:none;aspect-ratio:var(--slide-aspect,1.6);margin:0;box-shadow:0 8px 22px rgba(19,37,42,.12);zoom:1!important}" +
  "body.student-shared-view .lesson-slide,body.student-shared-view .lesson-slide *{touch-action:pan-y pinch-zoom!important}" +
  "body.student-shared-view .annotation-svg{pointer-events:none!important}" +
  "@media(max-width:760px){body.student-shared-view .lesson-header{margin:8px 8px 0}body.student-shared-view .lesson-deck{padding:8px}body.student-shared-view .lesson-slide{width:calc(100vw - 16px)}}";

export function studentSnapshotRuntimeSource() {
  const revealScript = String.raw`
document.addEventListener("click", event => {
  const origin = event.target instanceof Element ? event.target : null;
  const toggle = origin?.closest("[data-student-qa-toggle]");
  if (!(toggle instanceof HTMLButtonElement)) return;
  const showing = toggle.classList.toggle("is-showing-answer");
  toggle.setAttribute("aria-pressed", String(showing));
  const label = toggle.querySelector("[data-qa-toggle-label]");
  if (label) label.textContent = showing ? "Answer" : "Question";
});`;

  return String.raw`
const STUDENT_REVEAL_SCRIPT = ${JSON.stringify(revealScript)};
const STUDENT_SHARED_VIEW_CSS = ${JSON.stringify(STUDENT_SHARED_VIEW_CSS)};

function isUnsafeStudentUrl(name, value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.startsWith("javascript:") || normalized.startsWith("vbscript:")) {
    return true;
  }
  if (name === "href" && normalized.startsWith("data:")) return true;
  return name === "src" && normalized.startsWith("data:text/html");
}

function sanitizeImportedStudentStyle(node) {
  if (!node.hasAttribute("style")) return;
  // Keep only inert presentation primitives. In particular, no custom
  // properties, functions, escapes, URLs, selectors, or animation can survive.
  const allowed = new Set([
    "color", "background-color", "font-family", "font-size", "font-weight",
    "font-style", "line-height", "text-align", "text-decoration", "white-space",
    "display", "width", "height", "min-width", "min-height", "max-width", "max-height",
    "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border", "border-width", "border-style", "border-color", "border-radius",
    "vertical-align", "object-fit", "object-position",
  ]);
  const source = node.style;
  const safe = document.createElement("span").style;
  if (source) {
    Array.from(source).forEach(name => {
      const value = source.getPropertyValue(name);
      if (allowed.has(name) && /^[a-zA-Z0-9#.,%+\-/\s]+$/.test(value)) {
        safe.setProperty(name, value);
      }
    });
  }
  node.removeAttribute("style");
  if (safe.cssText) node.setAttribute("style", safe.cssText);
}

function buildStudentSnapshotHtml() {
  const snapshot = document.implementation.createHTMLDocument(
    document.title || "Lesson",
  );
  const nonceBytes = new Uint32Array(4);
  crypto.getRandomValues(nonceBytes);
  const nonce = Array.from(nonceBytes, value =>
    value.toString(16).padStart(8, "0"),
  ).join("");

  const viewport = snapshot.createElement("meta");
  viewport.name = "viewport";
  viewport.content = "width=device-width, initial-scale=1";
  snapshot.head.appendChild(viewport);

  const policy = snapshot.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content =
    "default-src 'none'; img-src data: blob: https:; style-src 'unsafe-inline'; " +
    "font-src data:; media-src data: blob: https:; script-src 'nonce-" + nonce +
    "'; connect-src 'none'; frame-src 'none'; object-src 'none'; " +
    "base-uri 'none'; form-action 'none'";
  snapshot.head.appendChild(policy);

  // Only exporter-owned head styles are trusted. Imported fragments are
  // normalized inside their slide by the exporter, never into this head.
  document.head.querySelectorAll(":scope > style[data-lesson-builder-style]").forEach(source => {
    const style = snapshot.createElement("style");
    style.textContent = source.textContent || "";
    snapshot.head.appendChild(style);
  });

  const studentStyle = snapshot.createElement("style");
  studentStyle.textContent = STUDENT_SHARED_VIEW_CSS;
  snapshot.head.appendChild(studentStyle);

  const header = document.querySelector(".lesson-header");
  const deck = document.querySelector("body > .lesson-deck");
  if (header) snapshot.body.appendChild(header.cloneNode(true));
  const studentDeck = deck ? deck.cloneNode(true) : null;
  if (studentDeck) snapshot.body.appendChild(studentDeck);

  snapshot.body.querySelectorAll("style").forEach(node => node.remove());
  snapshot.body.querySelectorAll('[data-builder-slide-type="imported-html"]').forEach(imported => {
    sanitizeImportedStudentStyle(imported);
    imported.querySelectorAll("[style]").forEach(sanitizeImportedStudentStyle);
  });

  snapshot.querySelectorAll("[data-student-qa-toggle]").forEach(node =>
    node.removeAttribute("data-student-qa-toggle"),
  );
  const allowedToggleSelector = [
    ':scope > [data-builder-slide-type="starter"] > .starter-grid > .starter-cell > .live-starter-image-host > button[data-qa-toggle]',
    ':scope > [data-builder-slide-type="example"] > .example-grid > .example-block > button[data-qa-toggle]',
    ':scope > [data-builder-slide-type="revision"] > .revision-slide-grid > .revision-question-cell > button[data-qa-toggle]',
  ].join(",");
  if (studentDeck) {
    studentDeck.querySelectorAll(allowedToggleSelector).forEach(button => {
      if (button.closest('[data-builder-slide-type="imported-html"]')) return;
      button.setAttribute("data-student-qa-toggle", "");
    });
  }
  snapshot.querySelectorAll("button:not([data-student-qa-toggle])").forEach(
    button => button.remove(),
  );

  snapshot.querySelectorAll(
    ".presenter-tools,script,input,.live-retrieval-controls," +
    "[data-ignore-annotation],iframe,object,embed,form,select,textarea," +
    "base,link,map,area,meta[http-equiv='refresh']",
  ).forEach(node => node.remove());

  snapshot.querySelectorAll("a,details,summary").forEach(node =>
    node.replaceWith(...Array.from(node.childNodes)),
  );

  snapshot.querySelectorAll("*").forEach(node => {
    Array.from(node.attributes).forEach(attribute => {
      const name = attribute.name.toLowerCase();
      if (
        name.startsWith("on") ||
        name === "nonce" ||
        name === "srcdoc" ||
        isUnsafeStudentUrl(name, attribute.value)
      ) {
        node.removeAttribute(attribute.name);
      }
    });
    node.removeAttribute("contenteditable");
    node.removeAttribute("data-bound");
    node.removeAttribute("data-pointer-input-bound");
    node.removeAttribute("controls");
    node.removeAttribute("autoplay");
    node.removeAttribute("draggable");
    node.removeAttribute("usemap");
    node.removeAttribute("ismap");
    if (!node.hasAttribute("data-student-qa-toggle")) {
      node.removeAttribute("tabindex");
      if (node.getAttribute("role") === "button") node.removeAttribute("role");
    }
  });

  snapshot.querySelectorAll(".annotation-svg").forEach(svg =>
    svg.setAttribute("pointer-events", "none"),
  );
  snapshot.body.className = "student-shared-view";

  const runtime = snapshot.createElement("script");
  runtime.setAttribute("nonce", nonce);
  runtime.textContent = STUDENT_REVEAL_SCRIPT;
  snapshot.body.appendChild(runtime);
  return "<!doctype html>\n" + snapshot.documentElement.outerHTML;
}`;
}
