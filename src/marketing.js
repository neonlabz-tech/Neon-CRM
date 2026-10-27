import { loadUsers } from "./crm.js";
import { downloadLetterhead, wrapLetterhead } from "./letterhead.js";
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

export function blankPost() {
  return { id: uid(), date: "", time: "", topic: "", type: "Image", goal: "" };
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
  };
}

function blankPlatforms() {
  return Object.fromEntries(REPORT_PLATFORMS.map(({ id }) => [id, blankPlatformStats()]));
}

export function platformHasData(stats) {
  if (!stats) return false;
  return Object.values(stats).some((value) => String(value ?? "").trim());
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
      next.platforms[id] = { ...blankPlatformStats(), ...(report.platforms[id] || {}) };
    }
  } else {
    const id = platformIdFromLabel(report.platform) || "facebook";
    const stats = blankPlatformStats();
    for (const key of Object.keys(stats)) {
      if (report[key] != null) stats[key] = report[key];
    }
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
    </section>
  `;
}

export function reportHtml(report) {
  const data = normalizeReport(report);
  const actions = data.nextActions.map((item) => item.trim()).filter(Boolean);
  const platforms = reportPlatformsLabel(data) || "Social media";
  const sections = REPORT_PLATFORMS.map(({ id, label }) => platformLetterhead(label, data.platforms[id])).join("");
  return wrapLetterhead({
    title: `${data.clientName || "Client"} ${data.title || "Report"}`.trim(),
    extraCss: `
      .metrics { display:grid; grid-template-columns:1fr 1fr; gap:8px 12px; margin:0 0 14px; }
      .metrics div { background:#F5F6FC; border:1px solid #E2E5F0; border-radius:8px; padding:8px 10px; }
      .metrics span { display:block; font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:#646473; }
      .metrics strong { font-size:15px; }
      .platform-block { margin:0 0 8px; padding-bottom:8px; border-bottom:1px solid #E2E5F0; }
      .platform-block:last-of-type { border-bottom:0; }
    `,
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

function socialLine(label, account = {}) {
  const bits = [account.username, account.password, account.pageLink].filter(Boolean);
  return `<li>${escapeHtml(label)}: ${escapeHtml(bits.join(" / ") || "—")}</li>`;
}

export function infoDocFileName(client) {
  return `${fileSlug(`${client.projectId || "project"}-${client.brandName || "client"}`) || "info-doc"}.html`;
}

export function infoDocHtml(client) {
  const social = client.social || {};
  return wrapLetterhead({
    title: `${client.brandName || "Client"} info doc`,
    body: `
      <p class="kicker">Client info doc</p>
      <h1>${escapeHtml(client.brandName || "Client")}</h1>
      <p class="meta">Project ID ${escapeHtml(client.projectId || "—")}</p>
      <h2>Client details</h2>
      <ul>
        <li>Main contact: ${escapeHtml(contactLine(client.mainContactName, client.mainContactTitle))}</li>
        <li>Assigned contact: ${escapeHtml(contactLine(client.assignedContactName, client.assignedContactTitle))}</li>
      </ul>
      <h2>Business details</h2>
      <ul>
        <li>Legal name: ${escapeHtml(client.legalName || "—")}</li>
        <li>Industry: ${escapeHtml(client.industry || "—")}</li>
        <li>Email: ${escapeHtml(client.email || "—")}</li>
        <li>Phone: ${escapeHtml(client.phone || "—")}</li>
        <li>Website: ${escapeHtml(client.website || "—")}</li>
        <li>Address: ${escapeHtml(client.address || "—")}</li>
        <li>Hours: ${escapeHtml(client.hours || "—")}</li>
        <li>Preferred contact: ${escapeHtml(client.preferredContact || "—")}</li>
      </ul>
      <h2>Brand identity</h2>
      <ul>
        <li>Primary colour: ${escapeHtml(client.primaryColor || "—")}</li>
        <li>Accent colours: ${escapeHtml(client.secondaryColors || "—")}</li>
        <li>Fonts: ${escapeHtml(client.fonts || "—")}</li>
        <li>Tagline: ${escapeHtml(client.tagline || "—")}</li>
      </ul>
      <h2>Social credentials</h2>
      <ul>
        ${socialLine("Business mail", social.email)}
        ${socialLine("Facebook", social.facebook)}
        ${socialLine("Instagram", social.instagram)}
        ${socialLine("TikTok", social.tiktok)}
        ${socialLine("YouTube", social.youtube)}
        ${socialLine("LinkedIn", social.linkedin)}
      </ul>
    `,
  });
}

export function downloadInfoDoc(client) {
  downloadLetterhead(infoDocFileName(client), infoDocHtml(client));
}

export function planFileName(plan, clientName) {
  return `${fileSlug(`${clientName || "client"}-${plan.title || "content-plan"}`) || "content-plan"}.html`;
}

export function planHtml(plan, clientName) {
  const notes = String(plan.confirmNotes || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const months = (plan.months || []).map((month) => `
    <h2>${escapeHtml(month.label || "Month")}${month.theme ? ` · ${escapeHtml(month.theme)}` : ""}</h2>
    <p class="meta">${escapeHtml(periodLabel(month.startDate, month.endDate))}</p>
    <ul>
      ${(month.posts || []).map((post) => `<li>${escapeHtml([
        formatDate(post.date) || "Date not set",
        weekday(post.date),
        formatTime(post.time),
        "—",
        post.topic || "Untitled",
        `(${post.type || "Image"}, ${post.goal || "no goal"})`,
      ].filter(Boolean).join(" "))}</li>`).join("") || "<li>—</li>"}
    </ul>
    <p>Paid ad: ${escapeHtml([
      formatDate(month.ad?.date) || "date not set",
      formatTime(month.ad?.time),
      month.ad?.platforms,
      month.ad?.adType,
      month.ad?.objective,
    ].filter(Boolean).join(" · "))}</p>
  `).join("");
  return wrapLetterhead({
    title: plan.title || "Content plan",
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
