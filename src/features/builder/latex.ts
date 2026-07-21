type LatexBlock = {
  type: "text" | "display" | "align";
  value: string;
};

const SYMBOLS: Record<string, string> = {
  alpha: "&alpha;",
  beta: "&beta;",
  gamma: "&gamma;",
  delta: "&delta;",
  epsilon: "&epsilon;",
  theta: "&theta;",
  lambda: "&lambda;",
  mu: "&mu;",
  pi: "&pi;",
  rho: "&rho;",
  sigma: "&sigma;",
  phi: "&phi;",
  omega: "&omega;",
  Gamma: "&Gamma;",
  Delta: "&Delta;",
  Theta: "&Theta;",
  Lambda: "&Lambda;",
  Pi: "&Pi;",
  Sigma: "&Sigma;",
  Phi: "&Phi;",
  Omega: "&Omega;",
  cdot: "&middot;",
  times: "&times;",
  div: "&divide;",
  pm: "&plusmn;",
  le: "&le;",
  leq: "&le;",
  ge: "&ge;",
  geq: "&ge;",
  neq: "&ne;",
  ne: "&ne;",
  approx: "&asymp;",
  equiv: "&equiv;",
  infty: "&infin;",
  partial: "&part;",
  nabla: "&nabla;",
  angle: "&ang;",
  perp: "&perp;",
  in: "&isin;",
  notin: "&notin;",
  subset: "&sub;",
  subseteq: "&sube;",
  cup: "&cup;",
  cap: "&cap;",
  emptyset: "&empty;",
  forall: "&forall;",
  exists: "&exist;",
  to: "&rarr;",
  rightarrow: "&rarr;",
  leftarrow: "&larr;",
  leftrightarrow: "&harr;",
  implies: "&rArr;",
  therefore: "&there4;",
  int: "&int;",
  sum: "&sum;",
  prod: "&prod;",
};

const FUNCTION_NAMES = new Set([
  "sin",
  "cos",
  "tan",
  "sec",
  "csc",
  "cot",
  "log",
  "ln",
  "exp",
  "lim",
  "min",
  "max",
]);

export function renderLatexDocument(source: string) {
  const text = source.replace(/\r\n?/g, "\n").trim();
  if (!text) return "";
  return tokenizeLatexDocument(text)
    .map((block) => {
      if (block.type === "display") return renderLatexMath(block.value, true);
      if (block.type === "align") return renderLatexAlign(block.value);
      return renderLatexTextBlock(block.value);
    })
    .join("");
}

function tokenizeLatexDocument(text: string): LatexBlock[] {
  const blocks: LatexBlock[] = [];
  let buffer = "";
  let index = 0;

  function flushText() {
    if (buffer.trim()) blocks.push({ type: "text", value: buffer });
    buffer = "";
  }

  while (index < text.length) {
    const displayStart = findDisplayStart(text, index);
    if (!displayStart) {
      buffer += text.slice(index);
      break;
    }
    buffer += text.slice(index, displayStart.index);
    flushText();
    const closeIndex = text.indexOf(
      displayStart.close,
      displayStart.index + displayStart.open.length,
    );
    if (closeIndex < 0) {
      buffer += text.slice(displayStart.index);
      break;
    }
    blocks.push({
      type: displayStart.align ? "align" : "display",
      value: text
        .slice(displayStart.index + displayStart.open.length, closeIndex)
        .trim(),
    });
    index = closeIndex + displayStart.close.length;
  }
  flushText();
  return blocks;
}

function findDisplayStart(text: string, fromIndex: number) {
  const candidates = [
    { open: "\\begin{align*}", close: "\\end{align*}", align: true },
    { open: "\\begin{align}", close: "\\end{align}", align: true },
    { open: "\\begin{aligned}", close: "\\end{aligned}", align: true },
    { open: "\\begin{gather*}", close: "\\end{gather*}", align: true },
    { open: "\\begin{gather}", close: "\\end{gather}", align: true },
    { open: "\\begin{equation*}", close: "\\end{equation*}", align: false },
    { open: "\\begin{equation}", close: "\\end{equation}", align: false },
    { open: "$$", close: "$$", align: false },
    { open: "\\[", close: "\\]", align: false },
  ];
  return (
    candidates
      .map((candidate) => ({
        ...candidate,
        index: text.indexOf(candidate.open, fromIndex),
      }))
      .filter((candidate) => candidate.index >= 0)
      .sort((left, right) => left.index - right.index)[0] ?? null
  );
}

function renderLatexTextBlock(text: string) {
  return text
    .trim()
    .split(/\n{2,}/)
    .map(renderLatexParagraph)
    .join("");
}

function renderLatexParagraph(paragraph: string) {
  const lines = paragraph
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  const listItems = lines.map((line) => {
    const item = line.match(/^(?:[-*]\s+|\\item\s+)(.+)$/);
    return item?.[1] ?? null;
  });
  if (listItems.every((item): item is string => Boolean(item))) {
    return `<ul class="latex-list">${listItems
      .map((item) => `<li>${renderInlineLatexText(item)}</li>`)
      .join("")}</ul>`;
  }
  return `<p>${lines.map(renderInlineLatexText).join("<br>")}</p>`;
}

function renderInlineLatexText(text: string) {
  const parts: string[] = [];
  let buffer = "";
  let index = 0;

  function flushText() {
    if (buffer) parts.push(escapeHtml(buffer));
    buffer = "";
  }

  while (index < text.length) {
    if (text.startsWith("\\(", index)) {
      const close = text.indexOf("\\)", index + 2);
      if (close >= 0) {
        flushText();
        parts.push(renderLatexMath(text.slice(index + 2, close), false));
        index = close + 2;
        continue;
      }
    }
    if (text[index] === "$" && text[index + 1] !== "$") {
      const close = findClosingInlineDollar(text, index + 1);
      if (close >= 0) {
        flushText();
        parts.push(renderLatexMath(text.slice(index + 1, close), false));
        index = close + 1;
        continue;
      }
    }
    buffer += text[index];
    index += 1;
  }
  flushText();
  return parts.join("");
}

function findClosingInlineDollar(text: string, fromIndex: number) {
  for (let index = fromIndex; index < text.length; index += 1) {
    if (text[index] === "$" && text[index - 1] !== "\\") return index;
  }
  return -1;
}

function renderLatexAlign(source: string) {
  const rows = source
    .split(/\\\\/)
    .map((row) => row.replace(/&/g, "").trim())
    .filter(Boolean);
  return `<div class="latex-align">${rows
    .map(
      (row) =>
        `<div class="latex-align-row">${renderLatexMath(row, true)}</div>`,
    )
    .join("")}</div>`;
}

function renderLatexMath(source: string, display: boolean) {
  const parser = createLatexParser(source);
  return `<span class="latex-math ${display ? "latex-display" : "latex-inline"}">${parser.parse()}</span>`;
}

function createLatexParser(source: string) {
  const text = source.replace(/\r\n?/g, "\n");
  let index = 0;

  function parse(stopCharacter?: string): string {
    const atoms: string[] = [];
    while (index < text.length) {
      if (stopCharacter && text[index] === stopCharacter) {
        index += 1;
        break;
      }
      if (text[index] === "^" || text[index] === "_") {
        atoms.push(escapeHtml(text[index]));
        index += 1;
        continue;
      }
      const atom = readAtom();
      if (atom) atoms.push(attachScripts(atom));
    }
    return atoms.join("");
  }

  function attachScripts(base: string) {
    let superscript = "";
    let subscript = "";
    skipSpaces();
    while (text[index] === "^" || text[index] === "_") {
      const type = text[index];
      index += 1;
      if (type === "^") superscript = readScriptArgument();
      else subscript = readScriptArgument();
      skipSpaces();
    }
    if (!superscript && !subscript) return base;
    return `<span class="latex-script"><span class="latex-base">${base}</span>${subscript ? `<sub>${subscript}</sub>` : ""}${superscript ? `<sup>${superscript}</sup>` : ""}</span>`;
  }

  function readAtom(): string {
    const character = text[index];
    if (!character) return "";
    if (/\s/.test(character)) {
      index += 1;
      return " ";
    }
    if (character === "{") {
      index += 1;
      return `<span class="latex-group">${parse("}")}</span>`;
    }
    if (character === "}") {
      index += 1;
      return "";
    }
    if (character === "\\") return readCommand();
    if (/[A-Za-z]/.test(character)) {
      return `<span class="latex-var">${escapeHtml(readWhile(/[A-Za-z]/))}</span>`;
    }
    if (/[0-9.]/.test(character)) {
      return `<span class="latex-number">${escapeHtml(readWhile(/[0-9.]/))}</span>`;
    }
    index += 1;
    return `<span class="latex-operator">${escapeHtml(character)}</span>`;
  }

  function readCommand() {
    index += 1;
    if (index >= text.length) return "";
    if (!/[A-Za-z]/.test(text[index])) {
      const escaped = text[index];
      index += 1;
      return `<span class="latex-operator">${escapeHtml(escaped)}</span>`;
    }
    const command = readWhile(/[A-Za-z]/);
    if (command === "frac" || command === "dfrac" || command === "tfrac") {
      const numerator = readRequiredGroup();
      const denominator = readRequiredGroup();
      return `<span class="latex-frac"><span class="latex-frac-num">${numerator}</span><span class="latex-frac-den">${denominator}</span></span>`;
    }
    if (command === "sqrt") {
      const degree = readOptionalGroup("[", "]");
      const body = readRequiredGroup();
      return `<span class="latex-root">${degree ? `<sup>${degree}</sup>` : ""}<span class="latex-radical">&radic;</span><span class="latex-root-body">${body}</span></span>`;
    }
    if (command === "text") {
      return `<span class="latex-text">${escapeHtml(readRawGroup())}</span>`;
    }
    if (command === "mathrm" || command === "operatorname") {
      return `<span class="latex-text">${readRequiredGroup()}</span>`;
    }
    if (command === "mathbf") {
      return `<span class="latex-bold">${readRequiredGroup()}</span>`;
    }
    if (command === "mathit") {
      return `<span class="latex-italic">${readRequiredGroup()}</span>`;
    }
    if (command === "hat" || command === "bar" || command === "vec") {
      return `<span class="latex-accent latex-accent-${command}">${readRequiredGroup()}</span>`;
    }
    if (command === "left" || command === "right") {
      skipSpaces();
      if (text[index] === ".") {
        index += 1;
        return "";
      }
      return readAtom();
    }
    if (command === "quad") return '<span class="latex-quad"></span>';
    if (command === "qquad") return '<span class="latex-qquad"></span>';
    if (command === "," || command === ";" || command === ":") return " ";
    if (SYMBOLS[command]) {
      return `<span class="latex-symbol">${SYMBOLS[command]}</span>`;
    }
    if (FUNCTION_NAMES.has(command)) {
      return `<span class="latex-fn">${escapeHtml(command)}</span>`;
    }
    return `<span class="latex-command">${escapeHtml(command)}</span>`;
  }

  function readScriptArgument() {
    skipSpaces();
    if (text[index] === "{") {
      index += 1;
      return parse("}");
    }
    return readAtom();
  }

  function readRequiredGroup() {
    skipSpaces();
    if (text[index] !== "{") return readAtom();
    index += 1;
    return parse("}");
  }

  function readRawGroup() {
    skipSpaces();
    if (text[index] !== "{") return "";
    index += 1;
    let depth = 1;
    const start = index;
    while (index < text.length && depth > 0) {
      if (text[index] === "{") depth += 1;
      if (text[index] === "}") depth -= 1;
      index += 1;
    }
    return text.slice(start, Math.max(start, index - 1));
  }

  function readOptionalGroup(open: string, close: string) {
    skipSpaces();
    if (text[index] !== open) return "";
    index += 1;
    const start = index;
    while (index < text.length && text[index] !== close) index += 1;
    const raw = text.slice(start, index);
    if (text[index] === close) index += 1;
    return createLatexParser(raw).parse();
  }

  function readWhile(pattern: RegExp) {
    const start = index;
    while (index < text.length && pattern.test(text[index])) index += 1;
    return text.slice(start, index);
  }

  function skipSpaces() {
    while (index < text.length && /\s/.test(text[index])) index += 1;
  }

  return { parse };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
