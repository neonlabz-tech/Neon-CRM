import { loadUsers } from "./crm.js";
import { downloadLetterhead, formatCoverDate, wrapLetterhead } from "./letterhead.js";
import { readAccount, readScoped, writeScoped } from "./scope.js";

const STORAGE_KEY = "neon-crm-marketing";

export function loadMarketing() {
  try {
    const data = readScoped(STORAGE_KEY);
    if (!data || !Array.isArray(data.clients)) {
      return { clients: [], plans: [], reports: [] };
    }
    return {
      clients: data.clients,
      plans: Array.isArray(data.plans) ? data.plans : [],
      reports: Array.isArray(data.reports) ? data.reports.map(normalizeReport) : [],
    };
  } catch {
    return { clients: [], plans: [], reports: [] };
  }
}

export function saveMarketing(data) {
  writeScoped(STORAGE_KEY, data);
}

export function plansForProject(project, data = loadMarketing()) {
  const code = String(project?.code || "").trim().toLowerCase();
  const name = String(project?.client || project?.name || "").trim().toLowerCase();
  const clientIds = new Set(
    (data.clients || [])
      .filter((client) => {
        const clientCode = String(client.projectId || "").trim().toLowerCase();
        const brand = String(client.brandName || "").trim().toLowerCase();
        return (code && clientCode === code) || (name && brand === name);
      })
      .map((client) => client.id),
  );
  return (data.plans || []).filter((plan) => clientIds.has(plan.clientId));
}

export function savePlanPostStatus(planId, monthId, postId, status) {
  const data = loadMarketing();
  const nextStatus = postStatusLabel(status);
  let found = false;
  const plans = data.plans.map((plan) => {
    if (plan.id !== planId) return plan;
    return {
      ...plan,
      months: (plan.months || []).map((month) => {
        if (month.id !== monthId) return month;
        return {
          ...month,
          posts: (month.posts || []).map((post) => {
            if (post.id !== postId) return post;
            found = true;
            return { ...post, status: nextStatus };
          }),
        };
      }),
    };
  });
  if (!found) return { ok: false, error: "That content item was not found." };
  saveMarketing({ ...data, plans });
  return { ok: true, data: loadMarketing() };
}

export function loadCompanyMarketing() {
  const clients = [];
  const plans = [];
  const reports = [];
  loadUsers()
    .filter((user) => user.active && user.role === "marketing")
    .forEach((user) => {
      const data = readAccount(STORAGE_KEY, user.username);
      if (!data || typeof data !== "object") return;
      (Array.isArray(data.clients) ? data.clients : []).forEach((item) => {
        if (item) clients.push({ ...item, owner: user.username });
      });
      (Array.isArray(data.plans) ? data.plans : []).forEach((item) => {
        if (item) plans.push({ ...item, owner: user.username });
      });
      (Array.isArray(data.reports) ? data.reports.map(normalizeReport) : []).forEach((item) => {
        if (item) reports.push({ ...item, owner: user.username });
      });
    });
  return { clients, plans, reports };
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function blankClient() {
  return {
    id: uid(),
    projectId: "",
    mainContactName: "",
    mainContactTitle: "",
    assignedContactName: "",
    assignedContactTitle: "",
    brandName: "",
    legalName: "",
    industry: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    hours: "",
    preferredContact: "",
    primaryColor: "",
    secondaryColors: "",
    fonts: "",
    tagline: "",
    social: {
      email: { username: "", password: "" },
      facebook: { username: "", password: "", pageLink: "" },
      instagram: { username: "", password: "" },
      tiktok: { username: "", password: "" },
      youtube: { username: "", password: "" },
      linkedin: { username: "", password: "" },
    },
    pmClientId: "",
    origin: "marketing",
  };
}

export const POST_TYPES = ["Poster", "Reel"];

export function postTypeLabel(value) {
  const text = String(value || "").trim();
  if (/^video$/i.test(text) || /^reel$/i.test(text)) return "Reel";
  return "Poster";
}

export function postStatusLabel(value) {
  return /^completed$/i.test(String(value || "").trim()) ? "Completed" : "Pending";
}

export function blankPost() {
  return { id: uid(), date: "", time: "", topic: "", type: "Poster", status: "Pending" };
}

export function blankMonth(index) {
  return {
    id: uid(),
    label: `Month ${index}`,
    startDate: "",
    endDate: "",
    theme: "",
    posts: [blankPost()],
    ad: {
      date: "",
      time: "",
      platforms: "",
      adType: "",
      objective: "",
      target: "",
      product: "",
      offer: "",
      duration: "",
      message: "",
      creative: "",
    },
  };
}

export function blankPlan() {
  return {
    id: uid(),
    clientId: "",
    title: "",
    startDate: "",
    endDate: "",
    address: "",
    cadence: "",
    months: [blankMonth(1)],
    confirmNotes: "",
  };
}

export const REPORT_PLATFORMS = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "linkedin", label: "LinkedIn" },
];

export function blankPlatformStats() {
  return {
    overview: "",
    totalViews: "",
    viewers: "",
    visits: "",
    interactions: "",
    videoViews: "",
    watchTime: "",
    newFollowers: "",
    conversations: "",
    nonFollowerPercent: "",
    followerPercent: "",
    audienceNote: "",
    contentIntro: "",
    reelsViews: "",
    photoViews: "",
    contentInteractions: "",
    photoInteractions: "",
    reelsInteractions: "",
    storiesInteractions: "",
    videoNote: "",
    analysisImages: [],
  };
}

function normalizeAnalysisImages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((image) => image && typeof image.src === "string" && image.src.startsWith("data:image/"))
    .map((image) => ({
      id: image.id || uid(),
      name: String(image.name || "Image").slice(0, 180),
      src: image.src,
    }));
}

function blankPlatforms() {
  return Object.fromEntries(REPORT_PLATFORMS.map(({ id }) => [id, blankPlatformStats()]));
}

export function platformHasData(stats) {
  if (!stats) return false;
  if (Array.isArray(stats.analysisImages) && stats.analysisImages.some((image) => image?.src)) return true;
  return Object.entries(stats).some(([key, value]) => key !== "analysisImages" && String(value ?? "").trim());
}

function platformIdFromLabel(value) {
  const needle = String(value || "").toLowerCase();
  return REPORT_PLATFORMS.find(({ id, label }) => needle.includes(id) || needle.includes(label.toLowerCase()))?.id || "";
}

export function blankReport() {
  return {
    id: uid(),
    clientId: "",
    clientName: "",
    projectId: "",
    title: "",
    startDate: "",
    endDate: "",
    platforms: blankPlatforms(),
    nextActions: [""],
    contentDirection: "",
    clientSummary: "",
    savedAt: "",
  };
}

export function normalizeReport(report = {}) {
  const next = {
    ...blankReport(),
    id: report.id || uid(),
    clientId: report.clientId || "",
    clientName: report.clientName || "",
    projectId: report.projectId || "",
    title: report.title || "",
    startDate: report.startDate || "",
    endDate: report.endDate || "",
    nextActions: Array.isArray(report.nextActions) && report.nextActions.length ? report.nextActions : [""],
    contentDirection: report.contentDirection || "",
    clientSummary: report.clientSummary || "",
    savedAt: report.savedAt || "",
  };
  next.platforms = blankPlatforms();
  if (report.platforms && typeof report.platforms === "object") {
    for (const { id } of REPORT_PLATFORMS) {
      const stats = { ...blankPlatformStats(), ...(report.platforms[id] || {}) };
      stats.analysisImages = normalizeAnalysisImages(report.platforms[id]?.analysisImages);
      next.platforms[id] = stats;
    }
  } else {
    const id = platformIdFromLabel(report.platform) || "facebook";
    const stats = blankPlatformStats();
    for (const key of Object.keys(stats)) {
      if (key === "analysisImages") continue;
      if (report[key] != null) stats[key] = report[key];
    }
    stats.analysisImages = normalizeAnalysisImages(stats.analysisImages);
    next.platforms[id] = stats;
  }
  return next;
}

export function reportPlatformsLabel(report) {
  const names = REPORT_PLATFORMS
    .filter(({ id }) => platformHasData(report?.platforms?.[id]))
    .map(({ label }) => label);
  return names.join(", ");
}

export function formatDate(iso) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatTime(value) {
  if (!value) return "";
  const [hour, minute] = value.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function weekday(iso) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", { weekday: "long" });
}

export function periodLabel(start, end) {
  if (!start && !end) return "Period not set";
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  return formatDate(start || end);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function reportFileName(report) {
  const slug = `${report.projectId || "report"}-${report.clientName || "client"}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "report"}.html`;
}

function percentValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.endsWith("%") ? text : `${text}%`;
}

function metricCards(pairs) {
  const filled = pairs.filter(([, value]) => String(value ?? "").trim());
  if (!filled.length) return "";
  return `<div class="metrics">${filled.map(([label, value]) => `
    <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
  `).join("")}</div>`;
}

function sectionBlock(title, intro, cards) {
  if (!intro && !cards) return "";
  return `<h2>${escapeHtml(title)}</h2>${intro ? `<p>${escapeHtml(intro)}</p>` : ""}${cards}`;
}

function platformLetterhead(label, stats) {
  if (!platformHasData(stats)) return "";
  return `
    <section class="platform-block">
      <p class="kicker">${escapeHtml(label)}</p>
      ${sectionBlock("Performance overview", stats.overview, metricCards([
        ["Total views", stats.totalViews],
        ["Viewers", stats.viewers],
        ["Visits", stats.visits],
        ["Content interactions", stats.interactions],
        ["Three-second video views", stats.videoViews],
        ["Watch time", stats.watchTime],
        ["New followers", stats.newFollowers],
        ["Conversations started", stats.conversations],
      ]))}
      ${sectionBlock("Audience reach", stats.audienceNote, metricCards([
        ["Non-follower views", percentValue(stats.nonFollowerPercent)],
        ["Follower views", percentValue(stats.followerPercent)],
      ]))}
      ${sectionBlock("Content performance", stats.contentIntro, metricCards([
        ["Reels views", stats.reelsViews],
        ["Photo views", stats.photoViews],
        ["Content interactions", stats.contentInteractions],
        ["Photo interactions", stats.photoInteractions],
        ["Reels interactions", stats.reelsInteractions],
        ["Stories interactions", stats.storiesInteractions],
      ]))}
      ${stats.videoNote ? `<h2>Video performance</h2><p>${escapeHtml(stats.videoNote)}</p>` : ""}
      ${analysisFigures(stats.analysisImages)}
    </section>
  `;
}

function analysisFigures(images) {
  const list = Array.isArray(images) ? images.filter((image) => image?.src) : [];
  if (!list.length) return "";
  return `<h2>Final analysis</h2>${list.map((image) => `
    <figure class="analysis-shot pdf-keep">
      <img src="${image.src}" alt="${escapeHtml(image.name || "Final analysis image")}" />
      ${image.name ? `<figcaption>${escapeHtml(image.name)}</figcaption>` : ""}
    </figure>
  `).join("")}`;
}

export function reportHtml(report) {
  const data = normalizeReport(report);
  const actions = data.nextActions.map((item) => item.trim()).filter(Boolean);
  const platforms = reportPlatformsLabel(data) || "Social media";
  const sections = REPORT_PLATFORMS.map(({ id, label }) => platformLetterhead(label, data.platforms[id])).join("");
  return wrapLetterhead({
    title: `${data.clientName || "Client"} ${data.title || "Report"}`.trim(),
    skipCover: true,
    cover: {
      title: data.title || "Monthly Social Media Report",
      preparedFor: data.clientName || "Client",
      period: periodLabel(data.startDate, data.endDate),
      department: "Marketing",
      source: "Social media report",
      date: data.endDate || data.savedAt,
      preparedBy: "Marketing team",
    },
    body: `
      <p class="kicker">Digital marketing report</p>
      <h1>${escapeHtml(data.clientName || "Client")}</h1>
      <p>${escapeHtml(data.title || "Monthly Social Media Report")}</p>
      <p class="meta">${escapeHtml(periodLabel(data.startDate, data.endDate))} · ${escapeHtml(platforms)} · Project ID ${escapeHtml(data.projectId || "—")}</p>
      ${sections || "<p>No platform metrics recorded.</p>"}
      ${actions.length ? `<h2>Monthly insights and next actions</h2><ul>${actions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      ${data.contentDirection ? `<h2>Content direction</h2><p>${escapeHtml(data.contentDirection)}</p>` : ""}
      ${data.clientSummary ? `<h2>Client summary</h2><p>${escapeHtml(data.clientSummary)}</p>` : ""}
    `,
  });
}

export function downloadReport(report) {
  downloadLetterhead(reportFileName(report), reportHtml(report));
}

function fileSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function contactLine(name, title) {
  if (!name && !title) return "—";
  return title ? `${name}, ${title}` : name;
}

function fieldValue(value) {
  const text = String(value ?? "").trim();
  return escapeHtml(text || "—");
}

function socialValue(account = {}) {
  return [account.username, account.password, account.pageLink].filter(Boolean).join(" / ");
}

export function infoDocFileName(client) {
  return `${fileSlug(`${client.projectId || "project"}-${client.brandName || "client"}`) || "info-doc"}.html`;
}

function detailLine(label, value) {
  return `<p>${escapeHtml(label)}: ${fieldValue(value)}</p>`;
}

const PROFILE_CSS = `
  .doc-body { padding: 26px 42px 12px; }
  .doc-body h1 { margin: 0 0 4px; font-size: 32px; line-height: 1.05; font-weight: 800; letter-spacing: -.03em; color: #0B1026; }
  .doc-body .meta { margin: 0 0 16px; color: #8B90A5; font-size: 13px; }
  table.profile-meta { margin: 0 0 22px; background: #F4F6FB; }
  table.profile-meta td { width: 33.33%; border: 0; background: #F4F6FB; padding: 12px 14px; vertical-align: top; }
  table.profile-meta span { display: block; color: #873CFF; font-size: 10px; font-weight: 700; letter-spacing: .08em; }
  table.profile-meta strong { display: block; margin-top: 4px; color: #1A2042; font-size: 13px; font-weight: 600; }
  h2.section-title { margin: 20px 0 0; padding: 0 0 8px; border-bottom: 2px solid #873CFF; font-size: 18px; font-weight: 800; color: #0B1026; }
  table.pair { margin: 14px 0 8px; }
  table.pair td { width: 50%; border: 0; background: transparent; padding: 0 28px 0 0; vertical-align: top; }
  table.pair td + td { padding: 0 0 0 12px; }
  table.pair h3 { margin: 0 0 8px; color: #873CFF; font-size: 11px; font-weight: 700; letter-spacing: .08em; }
  table.pair p { margin: 0 0 5px; color: #1A2042; font-size: 13px; }
  table.brand { width: 100%; margin: 12px 0 0; border: 1px solid #E4E7F0; }
  table.brand th { width: 28%; background: #F4F6FB; color: #1A2042; font-size: 13px; font-weight: 600; letter-spacing: 0; text-transform: none; padding: 10px 14px; border-bottom: 1px solid #E4E7F0; }
  table.brand td { background: #fff; color: #1A2042; font-size: 13px; font-weight: 500; padding: 10px 14px; border-bottom: 1px solid #E4E7F0; }
  table.brand tr:last-child th, table.brand tr:last-child td { border-bottom: 0; }
  table.credentials { margin-top: 14px; border: 1px solid #E4E7F0; }
  table.credentials th { background: #1A2042; color: #fff; font-size: 11px; letter-spacing: .08em; padding: 10px 14px; }
  table.credentials td { padding: 11px 14px; font-size: 13px; color: #1A2042; border-bottom: 1px solid #E8EAF2; }
  table.credentials td:first-child { width: 30%; font-weight: 700; background: #F4F6FB; }
  table.credentials tbody tr:nth-child(odd) td:last-child { background: #fff; }
  table.credentials tbody tr:nth-child(even) td:last-child { background: #F7F8FC; }
  .note { margin: 12px 0 0; color: #873CFF; font-size: 12px; }
`;

export function infoDocHtml(client) {
  const social = client.social || {};
  const brand = client.brandName || "Client";
  const project = client.projectId || "—";
  return wrapLetterhead({
    title: `${brand} client profile`,
    profile: true,
    cover: { preparedFor: brand },
    extraCss: PROFILE_CSS,
    body: `
      <h1>${escapeHtml(brand)}</h1>
      <p class="meta">Client information profile  •  Project ID ${escapeHtml(project)}</p>
      <table class="profile-meta"><tr>
        <td><span>PREPARED BY</span><strong>Marketing team</strong></td>
        <td><span>REPORT DATE</span><strong>${escapeHtml(formatCoverDate())}</strong></td>
        <td><span>DATA SOURCE</span><strong>Client info document</strong></td>
      </tr></table>
      <h2 class="section-title">01&nbsp;&nbsp;Client and business details</h2>
      <table class="pair"><tr>
        <td>
          <h3>CLIENT DETAILS</h3>
          ${detailLine("Main contact", contactLine(client.mainContactName, client.mainContactTitle))}
          ${detailLine("Assigned contact", contactLine(client.assignedContactName, client.assignedContactTitle))}
        </td>
        <td>
          <h3>BUSINESS DETAILS</h3>
          ${detailLine("Legal name", client.legalName)}
          ${detailLine("Industry", client.industry)}
          ${detailLine("Email", client.email)}
          ${detailLine("Phone", client.phone)}
          ${detailLine("Website", client.website)}
          ${detailLine("Address", client.address)}
          ${detailLine("Hours", client.hours)}
          ${detailLine("Preferred contact", client.preferredContact)}
        </td>
      </tr></table>
      <h2 class="section-title">02&nbsp;&nbsp;Brand identity</h2>
      <table class="brand"><tbody>
        <tr><th>Primary colour</th><td>${fieldValue(client.primaryColor)}</td></tr>
        <tr><th>Accent colours</th><td>${fieldValue(client.secondaryColors)}</td></tr>
        <tr><th>Fonts</th><td>${fieldValue(client.fonts)}</td></tr>
        <tr><th>Tagline</th><td>${fieldValue(client.tagline)}</td></tr>
      </tbody></table>
      <div class="pdf-break">
        <p class="meta">Social media and account credentials  •  Project ${escapeHtml(project)}</p>
        <h2 class="section-title">03&nbsp;&nbsp;Social media credentials</h2>
        <table class="credentials">
          <thead><tr><th>Platform</th><th>Account details</th></tr></thead>
          <tbody>
            <tr><td>Business mail</td><td>${fieldValue(socialValue(social.email))}</td></tr>
            <tr><td>Facebook</td><td>${fieldValue(socialValue(social.facebook))}</td></tr>
            <tr><td>Instagram</td><td>${fieldValue(socialValue(social.instagram))}</td></tr>
            <tr><td>TikTok</td><td>${fieldValue(socialValue(social.tiktok))}</td></tr>
            <tr><td>YouTube</td><td>${fieldValue(socialValue(social.youtube))}</td></tr>
            <tr><td>LinkedIn</td><td>${fieldValue(socialValue(social.linkedin))}</td></tr>
          </tbody>
        </table>
        <p class="note"><strong>Note:</strong> Account details are reproduced as provided in the source document.</p>
      </div>
    `,
  });
}

export function downloadInfoDoc(client) {
  downloadLetterhead(infoDocFileName(client), infoDocHtml(client));
}

export function planFileName(plan, clientName) {
  return `${fileSlug(`${clientName || "client"}-${plan.title || "content-plan"}`) || "content-plan"}.html`;
}

function planCell(value) {
  const text = String(value ?? "").trim();
  return escapeHtml(text || "—");
}

function planRows(posts) {
  const rows = Array.isArray(posts) ? posts : [];
  if (!rows.length) {
    return `<tr><td colspan="5">No posts recorded for this month.</td></tr>`;
  }
  return rows.map((post) => `<tr>
    <td>${planCell(formatDate(post.date) || "Date not set")}</td>
    <td>${planCell(weekday(post.date))}</td>
    <td>${planCell(formatTime(post.time))}</td>
    <td>${planCell(post.topic || "Untitled")}</td>
    <td>${planCell(postTypeLabel(post.type))}</td>
  </tr>`).join("");
}

function adTable(ad = {}) {
  const rows = [
    ["Date", formatDate(ad.date)],
    ["Day", weekday(ad.date)],
    ["Time", formatTime(ad.time)],
    ["Platforms", ad.platforms],
    ["Ad type", ad.adType],
    ["Objective", ad.objective],
    ["Duration", ad.duration],
    ["Target", ad.target],
    ["Product", ad.product],
    ["Offer", ad.offer],
    ["Main message", ad.message],
    ["Creative", ad.creative],
  ].filter(([, value]) => String(value ?? "").trim());
  if (!rows.length) return "";
  return `
    <h3>Paid ad campaign</h3>
    <table class="ad-table">
      <thead><tr><th>Detail</th><th>Value</th></tr></thead>
      <tbody>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}</tbody>
    </table>
  `;
}

export function planHtml(plan, clientName) {
  const notes = String(plan.confirmNotes || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const months = (plan.months || []).map((month) => `
    <h2>${escapeHtml(month.label || "Month")}${month.theme ? ` · ${escapeHtml(month.theme)}` : ""}</h2>
    <p class="meta">${escapeHtml(periodLabel(month.startDate, month.endDate))}</p>
    <table class="plan-table">
      <thead>
        <tr><th>Date</th><th>Day</th><th>Time</th><th>Topic</th><th>Type</th></tr>
      </thead>
      <tbody>${planRows(month.posts)}</tbody>
    </table>
    ${adTable(month.ad)}
  `).join("");
  return wrapLetterhead({
    title: plan.title || "Content plan",
    skipCover: true,
    cover: {
      title: plan.title || "Content plan",
      preparedFor: clientName || "Client",
      period: periodLabel(plan.startDate, plan.endDate),
      department: "Marketing",
      source: "Content plan",
      date: plan.endDate || plan.startDate,
      preparedBy: "Marketing team",
    },
    extraCss: `
      .plan-table { table-layout: fixed; }
      .plan-table th:nth-child(1), .plan-table td:nth-child(1) { width: 18%; }
      .plan-table th:nth-child(2), .plan-table td:nth-child(2) { width: 16%; }
      .plan-table th:nth-child(3), .plan-table td:nth-child(3) { width: 14%; }
      .plan-table th:nth-child(4), .plan-table td:nth-child(4) { width: 36%; }
      .plan-table th:nth-child(5), .plan-table td:nth-child(5) { width: 16%; }
      .plan-table td, .plan-table th, .ad-table td, .ad-table th { overflow-wrap: anywhere; }
      .ad-table td:first-child { width: 28%; font-weight: 700; }
    `,
    body: `
      <p class="kicker">Content plan</p>
      <h1>${escapeHtml(plan.title || "Content plan")}</h1>
      <p>${escapeHtml(clientName || "Client")}</p>
      <p class="meta">${escapeHtml(periodLabel(plan.startDate, plan.endDate))}${plan.address ? ` · ${escapeHtml(plan.address)}` : ""}</p>
      ${plan.cadence ? `<p>${escapeHtml(plan.cadence)}</p>` : ""}
      ${months}
      ${notes.length ? `<h2>To confirm</h2><ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : ""}
    `,
  });
}

export function downloadPlan(plan, clientName) {
  downloadLetterhead(planFileName(plan, clientName), planHtml(plan, clientName));
}
