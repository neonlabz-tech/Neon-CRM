const ALLOWED = new Set(["P", "DIV", "BR", "SPAN", "B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "FONT", "H1", "H2", "H3", "H4"]);

const FONT_SIZES = {
  1: "10px",
  2: "13px",
  3: "16px",
  4: "18px",
  5: "24px",
  6: "32px",
  7: "48px",
};

const NAMED_SIZES = {
  "xx-small": "10px",
  "x-small": "12px",
  small: "13px",
  medium: "16px",
  large: "18px",
  "x-large": "24px",
  "xx-large": "32px",
  "xxx-large": "48px",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function isSafeColor(value) {
  return /^(#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|0?\.\d+|1)\s*\)|[a-z]{3,20})$/i.test(String(value || "").trim());
}

function safeSize(value) {
  const raw = String(value || "").trim();
  if (/^\d{1,3}(\.\d+)?(px|pt|em|rem|%)$/i.test(raw)) return raw;
  if (FONT_SIZES[raw]) return FONT_SIZES[raw];
  return NAMED_SIZES[raw.toLowerCase()] || "";
}

function isSafeFont(value) {
  return /^[\w\s,"'-]{1,120}$/.test(String(value || "").trim());
}

function sanitizeStyle(style) {
  if (!style) return "";
  const keep = [];
  if (isSafeColor(style.color)) keep.push(`color: ${style.color}`);
  const size = safeSize(style.fontSize);
  if (size) keep.push(`font-size: ${size}`);
  if (isSafeFont(style.fontFamily)) keep.push(`font-family: ${style.fontFamily}`);
  if (["left", "right", "center", "justify"].includes(style.textAlign)) keep.push(`text-align: ${style.textAlign}`);
  if (style.fontWeight && /^(bold|bolder|normal|[1-9]00)$/i.test(style.fontWeight)) {
    keep.push(`font-weight: ${/^(normal|400)$/i.test(style.fontWeight) ? "normal" : "bold"}`);
  }
  if (style.fontStyle === "italic" || style.fontStyle === "normal") keep.push(`font-style: ${style.fontStyle}`);
  if (/underline/i.test(style.textDecoration)) keep.push("text-decoration: underline");
  return keep.join("; ");
}

function cleanNode(node, document) {
  if (node.nodeType === 3) return document.createTextNode(node.textContent);
  if (node.nodeType !== 1) return null;
  const tag = node.tagName;
  if (tag === "SCRIPT" || tag === "STYLE") return null;
  if (tag === "BR") return document.createElement("br");
  const allowed = ALLOWED.has(tag) ? tag.toLowerCase() : "span";
  const next = document.createElement(allowed === "font" ? "span" : allowed);
  const style = sanitizeStyle(node.style);
  if (style) next.setAttribute("style", style);
  if (tag === "FONT") {
    const color = node.getAttribute("color");
    const face = node.getAttribute("face");
    const size = safeSize(node.getAttribute("size"));
    if (isSafeColor(color)) next.style.color = color;
    if (isSafeFont(face)) next.style.fontFamily = face;
    if (size) next.style.fontSize = size;
  }
  [...node.childNodes].forEach((child) => {
    const cleaned = cleanNode(child, document);
    if (cleaned) next.appendChild(cleaned);
  });
  return next;
}

export function sanitizeScopeHtml(value) {
  const raw = String(value || "");
  if (!raw.trim()) return "";
  const parsed = new DOMParser().parseFromString(`<div>${raw}</div>`, "text/html");
  const root = parsed.body.firstChild;
  if (!root) return "";
  const wrap = parsed.createElement("div");
  [...root.childNodes].forEach((child) => {
    const cleaned = cleanNode(child, parsed);
    if (cleaned) wrap.appendChild(cleaned);
  });
  return wrap.innerHTML.trim();
}

export function scopeHasText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .length > 0;
}

export function toEditorHtml(value) {
  const raw = String(value || "");
  if (!raw.trim()) return "";
  if (/<[a-z][\s\S]*>/i.test(raw)) return sanitizeScopeHtml(raw);
  return raw
    .split(/\n/)
    .map((line) => `<div>${escapeHtml(line) || "<br>"}</div>`)
    .join("");
}

export function formatScopeHtml(value) {
  const raw = String(value || "");
  if (!raw.trim()) return "";
  if (/<[a-z][\s\S]*>/i.test(raw)) return sanitizeScopeHtml(raw);
  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}
