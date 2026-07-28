export type InlineMarkdownPart = {
  type: "text" | "strong" | "emphasis" | "code" | "link";
  text: string;
  href?: string;
};

const INLINE_MARKDOWN = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*([^*]+)\*|_([^_]+)_)/g;

export function parseInlineMarkdown(value: string): InlineMarkdownPart[] {
  const parts: InlineMarkdownPart[] = [];
  let cursor = 0;
  for (const match of value.matchAll(INLINE_MARKDOWN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push({ type: "text", text: value.slice(cursor, index) });
    }
    if (match[2] || match[3]) {
      parts.push({ type: "strong", text: match[2] || match[3] });
    } else if (match[4]) {
      parts.push({ type: "code", text: match[4] });
    } else if (match[5] && match[6]) {
      parts.push({ type: "link", text: match[5], href: match[6] });
    } else {
      parts.push({ type: "emphasis", text: match[7] || match[8] || "" });
    }
    cursor = index + match[0].length;
  }
  if (cursor < value.length) {
    parts.push({ type: "text", text: value.slice(cursor) });
  }
  return parts.length ? parts : [{ type: "text", text: value }];
}

export function inlineMarkdownToHtml(value: string) {
  return parseInlineMarkdown(value)
    .map((part) => {
      const text = escapeHtml(part.text);
      if (part.type === "strong") return `<strong>${text}</strong>`;
      if (part.type === "emphasis") return `<em>${text}</em>`;
      if (part.type === "code") return `<code>${text}</code>`;
      if (part.type === "link") {
        return `<a href="${escapeHtml(part.href || "")}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
      return text;
    })
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
