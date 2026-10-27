import { useEffect, useRef, useState } from "react";
import { sanitizeScopeHtml, toEditorHtml } from "./richText.js";

const FONTS = [
  ["sans-serif", "Sans Serif"],
  ["serif", "Serif"],
  ["Arial, sans-serif", "Arial"],
  ["Georgia, serif", "Georgia"],
  ["\"Times New Roman\", Times, serif", "Times New Roman"],
  ["\"Courier New\", Courier, monospace", "Courier New"],
];

const SIZES = ["12px", "14px", "16px", "18px", "21px", "24px", "32px"];

const COLORS = [
  "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#ffffff",
  "#1A2042", "#070C2B", "#873CFF", "#C412FC", "#F103FA", "#68A8FF", "#1aa36a", "#ea4335",
  "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#9900ff",
  "#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#cfe2f3", "#d9d2e9",
];

export function ScopeEditor({ value, onChange }) {
  const surface = useRef(null);
  const saved = useRef(null);
  const sent = useRef("");
  const ready = useRef(false);
  const [palette, setPalette] = useState(false);
  const [color, setColor] = useState("#1A2042");

  useEffect(() => {
    const node = surface.current;
    if (!node) return;
    const next = toEditorHtml(value);
    if (!ready.current) {
      node.innerHTML = next;
      sent.current = next;
      ready.current = true;
      return;
    }
    if (next === sent.current) return;
    if (node.contains(document.activeElement)) return;
    node.innerHTML = next;
    sent.current = next;
  }, [value]);

  function remember() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!surface.current?.contains(range.commonAncestorContainer)) return;
    saved.current = range.cloneRange();
  }

  function restore() {
    const node = surface.current;
    const range = saved.current;
    if (!node || !range) return false;
    node.focus();
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function emit() {
    const html = sanitizeScopeHtml(surface.current?.innerHTML || "");
    sent.current = html;
    onChange(html);
    remember();
  }

  function command(name, arg) {
    restore();
    document.execCommand(name, false, arg);
    emit();
  }

  function paint(styles) {
    restore();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const span = document.createElement("span");
    Object.assign(span.style, styles);
    if (range.collapsed) {
      span.appendChild(document.createTextNode("\u200b"));
      range.insertNode(span);
      const caret = document.createRange();
      caret.setStart(span.firstChild, 1);
      caret.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caret);
    } else {
      span.appendChild(range.extractContents());
      range.insertNode(span);
      const wrapped = document.createRange();
      wrapped.selectNodeContents(span);
      selection.removeAllRanges();
      selection.addRange(wrapped);
    }
    saved.current = selection.getRangeAt(0).cloneRange();
    emit();
  }

  function applyColor(next) {
    setColor(next);
    setPalette(false);
    paint({ color: next });
  }

  function holdBar(event) {
    remember();
    if (event.target.closest("select")) return;
    event.preventDefault();
  }

  return (
    <div className="rte">
      <div className="rte-bar" onMouseDown={holdBar}>
        <IconButton label="Undo" onClick={() => command("undo")}>
          <path d="M8 8H4V4M4.6 14A7 7 0 1 0 5 8" />
        </IconButton>
        <IconButton label="Redo" onClick={() => command("redo")}>
          <path d="M16 8h4V4M19.4 14A7 7 0 1 1 19 8" />
        </IconButton>
        <span className="rte-rule" />
        <select className="rte-select" defaultValue="sans-serif" aria-label="Font" onChange={(event) => paint({ fontFamily: event.target.value })}>
          {FONTS.map(([item, label]) => <option key={item} value={item}>{label}</option>)}
        </select>
        <select className="rte-select rte-size" defaultValue="14px" aria-label="Text size" onChange={(event) => paint({ fontSize: event.target.value })}>
          {SIZES.map((size) => <option key={size} value={size}>{size.replace("px", "")}</option>)}
        </select>
        <span className="rte-rule" />
        <IconButton label="Bold" onClick={() => paint({ fontWeight: "bold" })}>
          <path d="M7 5h6a3.2 3.2 0 0 1 0 6.4H7V5Zm0 6.4h7A3.4 3.4 0 0 1 14 18.8H7V11.4Z" />
        </IconButton>
        <IconButton label="Italic" onClick={() => paint({ fontStyle: "italic" })}>
          <path d="M10 5h8M6 19h8M14 5l-4 14" />
        </IconButton>
        <IconButton label="Underline" onClick={() => paint({ textDecoration: "underline" })}>
          <path d="M7 5v6.5a5 5 0 0 0 10 0V5M6 20h12" />
        </IconButton>
        <div className="rte-color">
          <button className="rte-swatch" type="button" aria-label="Text colour" aria-expanded={palette} onClick={() => setPalette((open) => !open)}>
            <span>A</span>
            <i style={{ background: color }} />
          </button>
          {palette ? (
            <div className="rte-palette" role="listbox" aria-label="Colour palette">
              {COLORS.map((item) => (
                <button
                  key={item}
                  className={item === color ? "active" : ""}
                  type="button"
                  style={{ background: item }}
                  aria-label={item}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyColor(item)}
                />
              ))}
            </div>
          ) : null}
        </div>
        <span className="rte-rule" />
        <IconButton label="Align left" onClick={() => command("justifyLeft")}>
          <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />
        </IconButton>
        <IconButton label="Align centre" onClick={() => command("justifyCenter")}>
          <path d="M4 6h16M7 10h10M4 14h16M7 18h10" />
        </IconButton>
        <IconButton label="Align right" onClick={() => command("justifyRight")}>
          <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />
        </IconButton>
        <IconButton label="Justify" onClick={() => command("justifyFull")}>
          <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </IconButton>
        <span className="rte-rule" />
        <IconButton label="Bulleted list" onClick={() => command("insertUnorderedList")}>
          <path d="M9 7h11M9 12h11M9 17h11M5 7.2h.01M5 12h.01M5 17h.01" />
        </IconButton>
        <IconButton label="Numbered list" onClick={() => command("insertOrderedList")}>
          <path d="M10 7h10M10 12h10M10 17h10M4 6.5h2v4M4 14.5 6 14v5H4" />
        </IconButton>
        <IconButton label="Decrease indent" onClick={() => command("outdent")}>
          <path d="M4 6h16M10 10h10M10 14h10M4 18h16M8 12 5 10v4Z" />
        </IconButton>
        <IconButton label="Increase indent" onClick={() => command("indent")}>
          <path d="M4 6h16M10 10h10M10 14h10M4 18h16M5 12l3-2v4Z" />
        </IconButton>
      </div>
      <div
        ref={surface}
        className="rte-surface"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Approved scope"
        onInput={emit}
        onMouseUp={remember}
        onKeyUp={remember}
        onBlur={() => setPalette(false)}
      />
    </div>
  );
}

function IconButton({ label, onClick, children }) {
  return (
    <button className="rte-btn" type="button" aria-label={label} title={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
    </button>
  );
}

export function ScopeHtml({ value, className = "scope-html" }) {
  const html = toEditorHtml(value);
  if (!html) return null;
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
