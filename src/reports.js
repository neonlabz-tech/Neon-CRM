import { wrapLetterhead } from "./letterhead.js";
import { readScoped, writeScoped } from "./scope.js";
import { escapeHtml, formatQuoteDate } from "./sales.js";

const STORAGE_KEY = "neon-crm-reports";

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyStore() {
  return { srs: [], proposals: [], videos: [] };
}

export function loadReports() {
  try {
    return normalizeStore(readScoped(STORAGE_KEY));
  } catch {
    return emptyStore();
  }
}

export function saveReports(data) {
  const next = normalizeStore(data);
  writeScoped(STORAGE_KEY, next);
  return next;
}

function normalizeStore(raw) {
  const base = emptyStore();
  if (!raw || typeof raw !== "object") return base;
  return {
    srs: Array.isArray(raw.srs) ? raw.srs.map(normalizeSrs).filter(Boolean) : [],
    proposals: Array.isArray(raw.proposals) ? raw.proposals.map(normalizeProposal).filter(Boolean) : [],
    videos: Array.isArray(raw.videos) ? raw.videos.map(normalizeVideo).filter(Boolean) : [],
  };
}

function text(value) {
  return String(value || "");
}

function rows(list, map) {
  return Array.isArray(list) ? list.map(map).filter(Boolean) : [];
}

function normalizeSrs(item) {
  if (!item?.id) return null;
  const sections = rows(item.sections, (section) => {
    const heading = text(section?.heading).trim();
    const body = text(section?.body).trim();
    if (!heading && !body) return null;
    return { heading, body };
  });
  return {
    id: String(item.id),
    projectId: text(item.projectId),
    title: text(item.title).trim(),
    preparedFor: text(item.preparedFor).trim(),
    date: text(item.date),
    introduction: text(item.introduction).trim(),
    functional: text(item.functional).trim(),
    nonFunctional: text(item.nonFunctional).trim(),
    assumptions: text(item.assumptions).trim(),
    sections,
  };
}

function normalizeProposal(item) {
  if (!item?.id) return null;
  return {
    id: String(item.id),
    projectId: text(item.projectId),
    title: text(item.title).trim(),
    subtitle: text(item.subtitle).trim(),
    preparedFor: text(item.preparedFor).trim(),
    date: text(item.date),
    companyScope: text(item.companyScope).trim(),
    validity: text(item.validity).trim(),
    summary: text(item.summary).trim(),
    customerTitle: text(item.customerTitle).trim(),
    customerRole: text(item.customerRole).trim(),
    customerFeatures: text(item.customerFeatures).trim(),
    adminTitle: text(item.adminTitle).trim(),
    adminRole: text(item.adminRole).trim(),
    adminFeatures: text(item.adminFeatures).trim(),
    stack: rows(item.stack, (row) => ({
      layer: text(row?.layer).trim(),
      technology: text(row?.technology).trim(),
      purpose: text(row?.purpose).trim(),
    })).filter((row) => row.layer || row.technology || row.purpose),
    brand: rows(item.brand, (row) => ({
      title: text(row?.title).trim(),
      text: text(row?.text).trim(),
    })).filter((row) => row.title || row.text),
    packageName: text(item.packageName).trim(),
    packageStats: rows(item.packageStats, (row) => ({
      value: text(row?.value).trim(),
      label: text(row?.label).trim(),
    })).filter((row) => row.value || row.label),
    packageInvestment: text(item.packageInvestment).trim(),
    budget: rows(item.budget, (row) => ({
      deliverable: text(row?.deliverable).trim(),
      fee: text(row?.fee).trim(),
      amount: text(row?.amount).trim(),
    })).filter((row) => row.deliverable || row.fee || row.amount),
    totalAmount: text(item.totalAmount).trim(),
    totalNote: text(item.totalNote).trim(),
    duration: text(item.duration).trim(),
    startDate: text(item.startDate),
    launchDate: text(item.launchDate),
    terms: text(item.terms).trim(),
    clientSignName: text(item.clientSignName).trim(),
    clientSignTitle: text(item.clientSignTitle).trim(),
    clientSignDate: text(item.clientSignDate),
    companySignName: text(item.companySignName).trim(),
    companySignTitle: text(item.companySignTitle).trim(),
    companySignDate: text(item.companySignDate),
  };
}

function normalizeVideo(item) {
  if (!item?.id) return null;
  return {
    id: String(item.id),
    projectId: text(item.projectId),
    title: text(item.title).trim(),
    url: text(item.url).trim(),
    notes: text(item.notes).trim(),
    date: text(item.date),
  };
}

function commitList(data, key, record, label) {
  if (!record.projectId) return { ok: false, error: "Choose a project." };
  if (!record.title) return { ok: false, error: `${label} title is required.` };
  const existing = data[key].some((item) => item.id === record.id);
  const next = { ...record, id: record.id || uid() };
  return {
    ok: true,
    data: {
      ...data,
      [key]: existing ? data[key].map((item) => (item.id === next.id ? next : item)) : [next, ...data[key]],
    },
  };
}

export function saveSrs(data, draft) {
  return commitList(data, "srs", {
    id: draft.id,
    projectId: draft.projectId,
    title: text(draft.title).trim(),
    preparedFor: text(draft.preparedFor).trim(),
    date: draft.date,
    introduction: text(draft.introduction).trim(),
    functional: text(draft.functional).trim(),
    nonFunctional: text(draft.nonFunctional).trim(),
    assumptions: text(draft.assumptions).trim(),
    sections: draft.sections || [],
  }, "SRS");
}

export function saveProposal(data, draft) {
  const saved = commitList(data, "proposals", { ...draft, title: text(draft.title).trim() }, "Proposal");
  if (!saved.ok) return saved;
  return { ok: true, data: normalizeStore(saved.data) };
}

export function saveVideo(data, draft) {
  const url = text(draft.url).trim();
  if (url && !/^https?:\/\//i.test(url)) return { ok: false, error: "The video link must start with http:// or https://." };
  return commitList(data, "videos", {
    id: draft.id,
    projectId: draft.projectId,
    title: text(draft.title).trim(),
    url,
    notes: text(draft.notes).trim(),
    date: draft.date,
  }, "Demo video");
}

export function deleteReport(data, key, id) {
  if (!data[key]?.some((item) => item.id === id)) return { ok: false, error: "That record was not found." };
  return { ok: true, data: { ...data, [key]: data[key].filter((item) => item.id !== id) } };
}

export function moneyLabel(value) {
  const raw = text(value).trim();
  if (!raw) return "";
  if (/^lkr/i.test(raw)) return raw;
  const number = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(number)) return raw;
  return `LKR ${number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function featureLines(value) {
  return text(value).split(/\n/).map((line) => line.trim()).filter(Boolean);
}

function hasText(value) {
  return Boolean(text(value).trim());
}

function joinHtml(parts) {
  return parts.filter(Boolean).join("");
}

function labeled(label, value) {
  if (!hasText(value)) return "";
  return `<p><strong>${escapeHtml(label)}</strong></p><p>${escapeHtml(value)}</p>`;
}

function miniCard(kicker, value) {
  if (!hasText(value)) return "";
  return `<div class="card"><p class="kicker">${escapeHtml(kicker)}</p><strong>${escapeHtml(value)}</strong></div>`;
}

function textBlock(heading, body) {
  const lines = featureLines(body);
  if (!lines.length) return "";
  const content = lines.length > 1
    ? `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
    : `<p>${escapeHtml(text(body).trim())}</p>`;
  return `<h2>${escapeHtml(heading)}</h2>${content}`;
}

export function srsDocument(srs, projectLabel = "") {
  const meta = [projectLabel, srs.preparedFor, formatQuoteDate(srs.date)].filter(Boolean).join(" · ");
  const extra = (srs.sections || []).map((section) => textBlock(section.heading || "Section", section.body)).join("");
  return wrapLetterhead({
    title: srs.title || "SRS",
    body: joinHtml([
      `<p class="kicker">Software Requirements Specification</p>`,
      `<h1>${escapeHtml(srs.title || "SRS")}</h1>`,
      meta ? `<p class="meta">${escapeHtml(meta)}</p>` : "",
      textBlock("Introduction", srs.introduction),
      textBlock("Functional requirements", srs.functional),
      textBlock("Non-functional requirements", srs.nonFunctional),
      textBlock("Assumptions", srs.assumptions),
      extra,
    ]),
  });
}

function featureCard(title, role, body) {
  const items = featureLines(body);
  if (!hasText(title) && !hasText(role) && !items.length) return "";
  return `<article class="card">${joinHtml([
    hasText(role) ? `<p class="kicker">${escapeHtml(role)}</p>` : "",
    hasText(title) ? `<h3>${escapeHtml(title)}</h3>` : "",
    items.length ? `<ul>${items.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : "",
  ])}</article>`;
}

function signCard(kicker, name, title, date) {
  if (!hasText(name) && !hasText(title) && !hasText(date)) return "";
  return `<div class="card">${joinHtml([
    `<p class="kicker">${escapeHtml(kicker)}</p>`,
    hasText(name) ? `<strong>${escapeHtml(name)}</strong>` : "",
    hasText(title) ? `<p>${escapeHtml(title)}</p>` : "",
    hasText(date) ? `<p>${escapeHtml(formatQuoteDate(date) || date)}</p>` : "",
  ])}</div>`;
}

function numberedSections(sections) {
  return sections.filter((section) => hasText(section.html)).map((section, index) => (
    `<h2>${index + 1}. ${section.title}</h2>${section.html}`
  )).join("");
}

export function proposalDocument(proposal) {
  const dashboards = joinHtml([
    featureCard(proposal.customerTitle, proposal.customerRole, proposal.customerFeatures),
    featureCard(proposal.adminTitle, proposal.adminRole, proposal.adminFeatures),
  ]);
  const stackRows = (proposal.stack || []).filter((row) => hasText(row.technology) || hasText(row.purpose));
  const brandCards = (proposal.brand || []).filter((item) => hasText(item.title) || hasText(item.text)).map((item) => (
    `<article class="card">${joinHtml([
      hasText(item.title) ? `<strong>${escapeHtml(item.title)}</strong>` : "",
      hasText(item.text) ? `<p>${escapeHtml(item.text)}</p>` : "",
    ])}</article>`
  )).join("");
  const stats = (proposal.packageStats || []).filter((item) => hasText(item.value) || hasText(item.label)).map((item) => (
    `<div>${joinHtml([
      hasText(item.value) ? `<strong>${escapeHtml(item.value)}</strong>` : "",
      hasText(item.label) ? `<p>${escapeHtml(item.label)}</p>` : "",
    ])}</div>`
  )).join("");
  const pack = joinHtml([
    hasText(proposal.packageName) || stats
      ? `<div>${joinHtml([
        hasText(proposal.packageName) ? `<p class="kicker">One-time launch pack</p><strong>${escapeHtml(proposal.packageName)}</strong>` : "",
        stats ? `<div class="stats">${stats}</div>` : "",
      ])}</div>`
      : "",
    hasText(proposal.packageInvestment)
      ? `<div><p class="kicker">Investment</p><strong>${escapeHtml(moneyLabel(proposal.packageInvestment))}</strong></div>`
      : "",
  ]);
  const budgetRows = (proposal.budget || []).filter((row) => hasText(row.deliverable) || hasText(row.fee) || hasText(row.amount));
  const total = joinHtml([
    hasText(proposal.totalAmount) ? `<p><strong>Total project cost</strong> ${escapeHtml(moneyLabel(proposal.totalAmount))}</p>` : "",
    hasText(proposal.totalNote) ? `<p>${escapeHtml(proposal.totalNote)}</p>` : "",
  ]);
  const timeline = joinHtml([
    miniCard("Duration", proposal.duration),
    miniCard("Earliest start", formatQuoteDate(proposal.startDate)),
    miniCard("Production launch", formatQuoteDate(proposal.launchDate)),
  ]);
  const terms = featureLines(proposal.terms).map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  const signatures = joinHtml([
    signCard("Client authorized signatory", proposal.clientSignName, proposal.clientSignTitle, proposal.clientSignDate),
    signCard("Neon Labz (Pvt) Ltd", proposal.companySignName, proposal.companySignTitle, proposal.companySignDate),
  ]);
  const basicsLeft = joinHtml([labeled("Client details", proposal.companyScope), labeled("Summary", proposal.summary)]);
  const basicsRight = joinHtml([labeled("Prepared for", proposal.preparedFor), labeled("Validity", proposal.validity)]);
  const meta = [hasText(proposal.preparedFor) ? `Prepared for ${proposal.preparedFor}` : "", formatQuoteDate(proposal.date)].filter(Boolean).join(" · ");

  return wrapLetterhead({
    title: proposal.title || "Proposal",
    extraCss: ".stats{display:flex;gap:18px}.stats strong{display:block;font-size:20px}.pack{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:12px}",
    body: joinHtml([
      `<p class="kicker">Client proposal</p>`,
      `<h1>${escapeHtml(proposal.title || "Proposal")}</h1>`,
      hasText(proposal.subtitle) ? `<p class="meta">${escapeHtml(proposal.subtitle)}</p>` : "",
      meta ? `<p class="meta">${escapeHtml(meta)}</p>` : "",
      numberedSections([
        {
          title: "Basic details &amp; proposal foundation",
          html: basicsLeft || basicsRight
            ? `<div class="grid-2">${joinHtml([
              basicsLeft ? `<div>${basicsLeft}</div>` : "",
              basicsRight ? `<div class="card">${basicsRight}</div>` : "",
            ])}</div>`
            : "",
        },
        {
          title: "Website &amp; customer dashboard architecture",
          html: dashboards ? `<div class="grid-2">${dashboards}</div>` : "",
        },
        {
          title: "Admin &amp; technical setup",
          html: stackRows.length
            ? `<table><thead><tr><th>Layer / component</th><th>Technology</th><th>Purpose</th></tr></thead><tbody>${stackRows.map((row) => `<tr><td>${escapeHtml(row.layer)}</td><td>${escapeHtml(row.technology)}</td><td>${escapeHtml(row.purpose)}</td></tr>`).join("")}</tbody></table>`
            : "",
        },
        {
          title: "Marketing &amp; branding strategy",
          html: joinHtml([
            brandCards ? `<div class="grid-3">${brandCards}</div>` : "",
            pack ? `<div class="card pack">${pack}</div>` : "",
          ]),
        },
        {
          title: "Budget, payment &amp; timeline",
          html: joinHtml([
            budgetRows.length
              ? `<table><thead><tr><th>Deliverables</th><th>One-time fee</th><th>Investment (LKR)</th></tr></thead><tbody>${budgetRows.map((row) => `<tr><td>${escapeHtml(row.deliverable)}</td><td>${escapeHtml(row.fee)}</td><td>${escapeHtml(row.amount ? moneyLabel(row.amount) : "")}</td></tr>`).join("")}</tbody></table>`
              : "",
            total ? `<div class="card">${total}</div>` : "",
            timeline ? `<div class="grid-3">${timeline}</div>` : "",
          ]),
        },
        {
          title: "Scope, terms &amp; acceptance",
          html: joinHtml([
            terms ? `<ul>${terms}</ul>` : "",
            signatures ? `<div class="sign">${signatures}</div>` : "",
          ]),
        },
      ]),
    ]),
  });
}
