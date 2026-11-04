import letterheadLogo from "./letterhead-logo.js";

export const LETTERHEAD_CONTACT = "Ramanathan Road, Jaffna  |  +94 714312534  |  info@theneonlabz.com  |  www.theneonlabz.com";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

export function formatCoverDate(value) {
  const raw = String(value || "").trim();
  let date = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) date = new Date(`${raw.slice(0, 10)}T00:00:00`);
  else if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split("/");
    date = new Date(`${year}-${month}-${day}T00:00:00`);
  }
  if (!date || Number.isNaN(date.getTime())) {
    date = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
  }
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function wrapLetterhead({ title, body, extraCss = "", cover = {}, profile = false, skipCover = false }) {
  const heading = cover.title || title || "Report";
  const preparedFor = cover.preparedFor || "Client";
  const department = cover.department || "Neon Labz CRM";
  const source = cover.source || "Neon CRM";
  const preparedBy = cover.preparedBy || "Neon Labz";
  const subtitle = [cover.period, department, preparedFor ? `Prepared for ${preparedFor}` : ""].filter(Boolean).join("  •  ");
  const dateLabel = formatCoverDate(cover.date);
  const kicker = profile ? "CLIENT PROFILE / CRM REPORT" : "CRM REPORT";
  const headClass = profile ? "doc-head profile-head" : "doc-head";
  const footClass = profile ? "doc-foot profile-foot" : "doc-foot";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title || heading)}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #E8EAF3; color: #1A2042; }
    body { font: 13px/1.45 "Segoe UI", Arial, sans-serif; }
    .print { margin: 16px; padding: 10px 14px; border: 0; border-radius: 8px; background: #873CFF; color: #fff; font-weight: 700; cursor: pointer; }
    .pdf-doc { width: 794px; margin: 0 auto; }
    .pdf-page {
      width: 794px;
      min-height: 1123px;
      height: auto;
      margin: 0 auto 16px;
      background: #fff;
      display: flex;
      flex-direction: column;
      overflow: visible;
      box-shadow: 0 12px 40px rgba(11, 16, 38, 0.12);
    }
    .pdf-cover { height: 1123px; }
    .doc-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 18px 40px 12px; border-bottom: 3px solid #873CFF; }
    .doc-head img { height: 28px; width: auto; display: block; }
    .doc-kicker { color: #873CFF; font-weight: 800; letter-spacing: .16em; font-size: 12px; }
    .doc-foot { display: flex; justify-content: space-between; gap: 16px; padding: 12px 40px 18px; border-top: 1px solid #C412FC; color: #69708A; font-size: 10px; letter-spacing: .04em; }
    .profile-head { justify-content: flex-start; gap: 14px; padding: 22px 42px 10px; border-bottom: 2px solid #873CFF; }
    .profile-head .doc-kicker { font-size: 11px; letter-spacing: .14em; font-weight: 700; }
    .profile-foot { border-top: 0; justify-content: center; gap: 42px; padding: 8px 42px 28px; color: #8B90A5; letter-spacing: .12em; }
    .cover-main { flex: 1 1 auto; display: flex; flex-direction: column; padding: 64px 48px 36px; }
    .cover-main h1 { margin: 0; max-width: 16em; font-size: 40px; line-height: 1.08; letter-spacing: -.03em; color: #0B1026; }
    .cover-rule { width: 72px; height: 4px; margin: 22px 0 16px; background: #873CFF; border-radius: 4px; }
    .cover-sub { margin: 0; max-width: 36em; color: #69708A; font-size: 15px; line-height: 1.5; }
    .cover-cards { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-top: auto; }
    .cover-cards article { background: #F7F8FC; border-radius: 12px; padding: 16px 16px 18px; border-top: 3px solid #873CFF; }
    .cover-cards span { display: block; color: #873CFF; font-size: 10px; font-weight: 700; letter-spacing: .12em; }
    .cover-cards strong { display: block; margin-top: 8px; font-size: 15px; line-height: 1.3; color: #0B1026; }
    .doc-body { flex: 1 1 auto; min-height: 0; padding: 28px 40px 20px; }
    .doc-body h1 { margin: 0 0 6px; font-size: 26px; line-height: 1.15; letter-spacing: -.02em; color: #0B1026; }
    .doc-body h2 { margin: 18px 0 8px; font-size: 15px; color: #0B1026; border-bottom: 2px solid #873CFF; padding-bottom: 4px; }
    table.fields { margin: 0 0 4px; }
    table.fields th { width: 38%; background: transparent; color: #69708A; font-size: 11px; font-weight: 700; letter-spacing: 0; text-transform: none; }
    table.fields td { color: #0B1026; font-weight: 600; }
    table.fields th, table.fields td { padding: 8px 10px; border-bottom: 1px solid #E6E8F2; }
    .grid-2 > div > h2:first-child, .grid-3 > div > h2:first-child { margin-top: 0; }
    .doc-body h3 { margin: 12px 0 6px; font-size: 13px; color: #873CFF; }
    .doc-body p, .doc-body li { margin: 0 0 8px; }
    .doc-body ul, .doc-body ol { margin: 0 0 12px; padding-left: 18px; }
    .kicker { margin: 0 0 6px; color: #873CFF; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    .meta { color: #69708A; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 14px; }
    th, td { text-align: left; padding: 7px 8px; vertical-align: top; }
    th { background: #873CFF; color: #fff; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
    td { border-bottom: 1px solid #E6E8F2; font-size: 12px; }
    tbody tr:nth-child(even) td { background: #F7F8FC; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .card { background: #F7F8FC; border: 1px solid #E6E8F2; border-radius: 10px; padding: 12px; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px; }
    .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0 0 12px; }
    .metrics div { background: #F7F8FC; border: 1px solid #E6E8F2; border-radius: 8px; padding: 8px 10px; }
    .metrics span { display: block; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #69708A; }
    .metrics strong { font-size: 15px; color: #0B1026; }
    .platform-block { margin: 0 0 8px; }
    .analysis-shot { margin: 0 0 12px; }
    .analysis-shot img { display: block; width: auto; height: auto; max-width: 100%; object-fit: contain; background: #fff; border: 1px solid #E6E8F2; border-radius: 8px; }
    .analysis-shot figcaption { margin-top: 4px; color: #69708A; font-size: 11px; }
    ${extraCss}
    @media print {
      html, body { background: #fff; }
      .print { display: none; }
      .pdf-page { margin: 0; box-shadow: none; page-break-after: always; }
    }
  </style>
</head>
<body>
  <button class="print" type="button" onclick="window.print()">Print / Save as PDF</button>
  <article class="pdf-doc">
    ${profile || skipCover ? "" : `<section class="pdf-page pdf-cover">
      <header class="doc-head">
        <img src="${letterheadLogo}" alt="NeonLabz" />
        <span class="doc-kicker">CRM REPORT</span>
      </header>
      <div class="cover-main">
        <div>
          <h1>${escapeHtml(heading)}</h1>
          <div class="cover-rule"></div>
          <p class="cover-sub">${escapeHtml(subtitle || "Prepared by Neon Labz")}</p>
        </div>
        <div class="cover-cards">
          <article><span>PREPARED BY</span><strong>${escapeHtml(preparedBy)}</strong></article>
          <article><span>REPORT DATE</span><strong>${escapeHtml(dateLabel)}</strong></article>
          <article><span>DATA SOURCE</span><strong>${escapeHtml(source)}</strong></article>
        </div>
      </div>
      <footer class="doc-foot">
        <span>CONFIDENTIAL  •  ${escapeHtml(preparedFor)}</span>
        <span>NEONLABZ  •  <b class="doc-page">1</b></span>
      </footer>
    </section>`}
    <section class="pdf-page pdf-content">
      <header class="${headClass}">
        <img src="${letterheadLogo}" alt="NeonLabz" />
        <span class="doc-kicker">${kicker}</span>
      </header>
      <div class="doc-body"><div class="pdf-flow">${body}</div></div>
      <footer class="${footClass}">
        <span>CONFIDENTIAL  •  ${escapeHtml(preparedFor)}</span>
        <span>NEONLABZ  •  <b class="doc-page">${profile || skipCover ? "1" : "2"}</b></span>
      </footer>
    </section>
  </article>
</body>
</html>`;
}

export { downloadDocumentPdf as downloadLetterhead } from "./downloadPdf.js";
