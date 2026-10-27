import letterheadLogo from "./letterhead-logo.js";
import { escapeHtml } from "./sales.js";

export const LETTERHEAD_CONTACT = "Ramanathan Road, Jaffna  |  +94 714312534  |  info@theneonlabz.com  |  www.theneonlabz.com";

export function wrapLetterhead({ title, body, extraCss = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title || "Neon Labz")}</title>
  <style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; background: #F5F6FC; color: #1A2042; }
    body { font: 13.5px/1.5 "Segoe UI", Arial, sans-serif; }
    .print { margin: 16px; padding: 10px 14px; border: 0; border-radius: 8px; background: #873CFF; color: #fff; font-weight: 700; cursor: pointer; }
    .lh {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto 24px;
      background: #fff;
      box-sizing: border-box;
      padding: 14mm 20mm 16mm;
      display: flex;
      flex-direction: column;
      box-shadow: 0 12px 40px rgba(22, 18, 43, 0.1);
    }
    .lh-head { padding: 0 0 8px; border-bottom: 2.25pt solid #873CFF; margin-bottom: 16mm; }
    .lh-head img { height: 7.4mm; width: auto; display: block; }
    .lh-body { flex: 1; }
    .lh-body h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: -0.02em; }
    .lh-body h2 { font-size: 14px; margin: 18px 0 8px; color: #1A2042; }
    .lh-body h3 { font-size: 13px; margin: 14px 0 6px; }
    .lh-body p, .lh-body li { margin: 0 0 8px; }
    .lh-body ul { margin: 0 0 12px; padding-left: 18px; }
    .kicker { margin: 0 0 6px; color: #873CFF; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
    .meta { color: #646473; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #e4e0ea; vertical-align: top; }
    th { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #646473; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .card { background: #F5F6FC; border: 1px solid #E2E5F0; border-radius: 10px; padding: 12px; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 18px; }
    .lh-foot {
      margin-top: 18mm;
      padding-top: 8px;
      border-top: 1pt solid #C412FC;
      text-align: center;
      color: #646473;
      font-size: 10px;
      letter-spacing: 0.06em;
    }
    ${extraCss}
    @media print {
      body { background: #fff; }
      .print { display: none; }
      .lh { margin: 0; box-shadow: none; width: auto; }
    }
  </style>
</head>
<body>
  <button class="print" type="button" onclick="window.print()">Print / Save as PDF</button>
  <article class="lh">
    <header class="lh-head"><img src="${letterheadLogo}" alt="NeonLabz" /></header>
    <div class="lh-body">${body}</div>
    <footer class="lh-foot">${escapeHtml(LETTERHEAD_CONTACT)}</footer>
  </article>
</body>
</html>`;
}

export { downloadDocumentPdf as downloadLetterhead } from "./downloadPdf.js";
