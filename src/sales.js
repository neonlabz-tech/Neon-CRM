import neonLogo from "./assets/neonlabz-logo.png";
import { blankClient, clientCodeNumber, formatClientCode, loadClients, nextClientCode, saveClients } from "./clients.js";
import { formatScopeHtml, sanitizeScopeHtml, scopeHasText } from "./richText.js";
import { loadUsers } from "./crm.js";
import { invoiceDocumentFromPayment, invoiceDocumentFromQuote } from "./brandDocument.js";
import { approveProjectInvoice, loadFinance, notifyRole, notifyUser, projectInvoiceFor, queueProjectInvoice, rememberPayingClient } from "./finance.js";
import { formatPhone } from "./hrms.js";
import { dataOwner, readAccount, sessionAccount, writeScoped } from "./scope.js";
import { crmStorage } from "./storage.js";

const STORAGE_KEY = "neon-crm-sales";
const PACKAGES_KEY = "neon-crm-packages";
const INCOMING_KEY = "neon-crm-incoming-projects";
const PAYING_CLIENTS_KEY = "neon-crm-paying-clients";
const LEAD_INDEX_KEY = "neon-crm-lead-index";
export const LEAD_PHONE_EXISTS_MESSAGE = "This phone number already exists in the system.";

export const SERVICES = [
  "Website Development",
  "Digital Marketing",
  "Software Development",
  "POS & Billing",
  "UI/UX Design",
];

export const PRICE_BASIS = ["Per project", "Per month", "3 months"];

export const LEAD_STAGES = ["New", "Connected", "Interested", "Quotation Sent", "Demo Scheduled", "Payment Promised", "Follow-up", "Converted", "Lost"];
export const LEAD_SOURCES = ["Google Maps", "Facebook", "Instagram", "Referral", "Website", "Other"];
export const LEAD_SERVICES = ["Software development", "Marketing", "Both"];

export function leadServiceOptions(current) {
  const value = String(current || "").trim();
  if (value && !LEAD_SERVICES.includes(value)) return [value, ...LEAD_SERVICES];
  return LEAD_SERVICES;
}

export function packagesForCategory(packages, category) {
  const list = Array.isArray(packages) ? packages : [];
  if (!category || category === "Both") return list;
  return list.filter((item) => item.category === category || item.category === "Both");
}
export const CALL_OUTCOMES = ["Answered", "Not Answered"];

export const PAYMENT_TYPES = ["First installment", "Second installment", "Full payment", "Other installment"];

export const FOLLOW_UP_STATUSES = [
  { id: "success", label: "Success" },
  { id: "failed", label: "Failed" },
  { id: "in-progress", label: "In progress" },
];

export const PAYMENT_STATUSES = [
  { id: "pending", label: "Pending confirmation" },
  { id: "confirmed", label: "Confirmed" },
  { id: "cancelled", label: "Cancelled" },
];

export const DEFAULT_MEMBER = { target: 0, salary: 0, allowance: 0 };

const DUMMY_RATES = { rate: 2, bonus: 5000, threshold: 100 };
const DUMMY_GOALS = { monthly: 1500000, projects: 15, daily: 50, leadTarget: 40 };
const DUMMY_CAMPAIGN = { name: "Quarterly growth goal", start: "2026-10-01", end: "2026-12-31", target: 4000000 };
const DUMMY_MEMBER = { target: 500000, salary: 30000, allowance: 3000 };

function blankSales() {
  return {
    packages: [],
    quotes: [],
    payments: [],
    leads: [],
    sequence: 0,
    rates: { rate: 0, bonus: 0, threshold: 0 },
    goals: { monthly: 0, projects: 0, daily: 0, leadTarget: 0 },
    campaign: {
      name: "",
      start: "",
      end: "",
      target: 0,
    },
    team: {},
    monthTargets: {},
    followUps: [],
  };
}

function dropDummy(value, dummy, empty) {
  return value === dummy ? empty : value;
}

function numberOr(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export const COVER_HEIGHT = 112;
export const COVER_ZOOM_MIN = 1;
export const COVER_ZOOM_MAX = 3;
export const COVER_ZOOM_STEP = 0.1;

export function defaultCoverFit() {
  return { zoom: 1, x: 50, y: 50 };
}

export function normalizeCoverFit(value) {
  const src = value && typeof value === "object" ? value : {};
  return {
    zoom: Math.round(clampNumber(src.zoom, COVER_ZOOM_MIN, COVER_ZOOM_MAX, 1) * 10) / 10,
    x: Math.round(clampNumber(src.x, 0, 100, 50) * 10) / 10,
    y: Math.round(clampNumber(src.y, 0, 100, 50) * 10) / 10,
  };
}

function clampNumber(value, min, max, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, next));
}

export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const MISSION_RESET_HOUR = 8;
const COLOMBO_OFFSET = "+05:30";

function colomboClock(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Colombo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function shiftIsoDate(iso, days) {
  const [year, month, day] = String(iso).split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function missionDay(now = new Date()) {
  const clock = colomboClock(now);
  return clock.hour < MISSION_RESET_HOUR ? shiftIsoDate(clock.date, -1) : clock.date;
}

export function msUntilMissionReset(now = new Date()) {
  const clock = colomboClock(now);
  const nextDate = clock.hour < MISSION_RESET_HOUR ? clock.date : shiftIsoDate(clock.date, 1);
  const target = new Date(`${nextDate}T${String(MISSION_RESET_HOUR).padStart(2, "0")}:00:00${COLOMBO_OFFSET}`).getTime();
  return Math.max(250, target - now.getTime());
}

export function startMissionClock(onTick) {
  let timeout;
  const tick = () => onTick(missionDay());
  const arm = () => {
    timeout = setTimeout(() => {
      tick();
      arm();
    }, msUntilMissionReset());
  };
  arm();
  const interval = setInterval(tick, 30000);
  return () => {
    clearTimeout(timeout);
    clearInterval(interval);
  };
}

export function addDays(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatMoney(value) {
  return `LKR ${Number(value || 0).toLocaleString("en-LK", { maximumFractionDigits: 2 })}`;
}

export const QUOTE_VAT_RATE = 0.08;

export function quotationFigures(subtotal, discount) {
  const price = Math.round((Number(subtotal) || 0) * 100) / 100;
  const offer = Math.round((Number(discount) || 0) * 100) / 100;
  const net = Math.max(0, Math.round((price - offer) * 100) / 100);
  const vat = Math.round(net * QUOTE_VAT_RATE * 100) / 100;
  const grand = Math.round((net + vat) * 100) / 100;
  const percent = price > 0 ? (offer / price) * 100 : 0;
  return { subtotal: price, discount: offer, net, vat, grand, percent };
}

export function formatQuoteAmount(value) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatQuoteDate(iso) {
  if (!iso) return "";
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(iso);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function formatDiscountPercent(percent) {
  const rounded = Math.round(Number(percent) * 10) / 10;
  if (!Number.isFinite(rounded)) return "0";
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function defaultTerms() {
  return "";
}

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readSalesAccount(username) {
  const raw = readAccount(STORAGE_KEY, username);
  return raw ? normalizeSales(raw) : null;
}

export function loadPackages() {
  try {
    const raw = crmStorage.getItem(PACKAGES_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizePackage).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function storePackages(packages) {
  crmStorage.setItem(PACKAGES_KEY, JSON.stringify(packages));
}

function withPackages(data) {
  return { ...data, packages: loadPackages() };
}

function persistSales(data) {
  const { packages, ...rest } = data;
  writeScoped(STORAGE_KEY, rest);
  publishLeadDirectory();
}

export function loadSales() {
  try {
    const owner = dataOwner();
    const stored = owner ? readSalesAccount(owner) : null;
    if (stored) {
      publishIncoming(stored);
      return withPackages(stored);
    }
    const seeded = blankSales();
    const session = sessionAccount();
    if (owner && session?.role !== "ceo" && session?.username === owner) persistSales(seeded);
    return withPackages(seeded);
  } catch {
    return withPackages(blankSales());
  }
}

export function saveSales(data) {
  persistSales(data);
}

function quoteAudience(projectId, client, address) {
  const ownerName = String(projectId || "").split(":")[0];
  const owner = loadUsers().find((user) => user.active && user.username === ownerName);
  if (!owner || owner.role === "ceo") {
    return { ceoConfirmed: false, pmOwners: [], salesOwners: [], sharedWithPms: false };
  }
  const names = [client, address].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
  if (owner.role === "pm") {
    return { ceoConfirmed: true, pmOwners: [owner.username], salesOwners: salesForNames(names), sharedWithPms: false };
  }
  if (owner.role === "sales") {
    return { ceoConfirmed: true, pmOwners: [], salesOwners: [owner.username], sharedWithPms: true };
  }
  return { ceoConfirmed: false, pmOwners: [], salesOwners: [], sharedWithPms: false };
}

function salesForNames(names) {
  if (!names.length) return [];
  return loadUsers()
    .filter((user) => user.active && user.role === "sales")
    .filter((user) => {
      const sales = readSalesAccount(user.username);
      return (sales?.followUps || []).some((item) => item.status === "success" && names.includes(String(item.name || "").trim().toLowerCase()));
    })
    .map((user) => user.username);
}

export function allCeoQuotes() {
  const quotes = [];
  const seen = new Set();
  loadUsers()
    .filter((item) => item.active && item.role === "ceo")
    .forEach((ceo) => {
      const sales = readSalesAccount(ceo.username);
      (sales?.quotes || []).forEach((quote) => {
        if (!quote?.id || seen.has(quote.id)) return;
        const audience = quote.ceoConfirmed ? quote : { ...quote, ...quoteAudience(quote.projectId, quote.client, quote.address) };
        if (!audience.ceoConfirmed) return;
        seen.add(quote.id);
        quotes.push({ ...audience, owner: ceo.username });
      });
    });
  return quotes;
}

export function confirmedCeoQuotes(username) {
  const user = loadUsers().find((item) => item.active && item.username === username);
  if (!user || (user.role !== "pm" && user.role !== "sales")) return [];
  return allCeoQuotes().filter((quote) => (
    user.role === "pm"
      ? quote.pmOwners.includes(username) || quote.sharedWithPms
      : quote.salesOwners.includes(username)
  ));
}

export function ceoQuotesForSalesClient(salesUsername, clientName, followUpId = "") {
  const projectKey = followUpId ? `${salesUsername}:${followUpId}` : "";
  return allCeoQuotes().filter((quote) => {
    if (projectKey && quote.projectId === projectKey) return true;
    return quoteMatchesClient(quote, clientName);
  });
}

export function paymentsForQuote(quoteId) {
  if (!quoteId) return [];
  return loadUsers()
    .filter((user) => user.active)
    .flatMap((user) => (readSalesAccount(user.username)?.payments || []).map((payment) => ({ ...payment, salesOwner: user.username })))
    .filter((payment) => payment.quoteId === quoteId && payment.status !== "cancelled");
}

export function approvedInstallments(quoteId) {
  return paymentsForQuote(quoteId).filter((payment) => payment.status === "confirmed" && payment.approval !== "pending");
}

export function quotationDirectory() {
  const seen = new Set();
  const quotes = [];
  loadUsers()
    .filter((user) => user.active && user.role === "pm")
    .forEach((user) => {
      const sales = readSalesAccount(user.username);
      (sales?.quotes || []).forEach((quote) => {
        if (seen.has(quote.id)) return;
        seen.add(quote.id);
        quotes.push({ ...quote, owner: user.username });
      });
    });
  return quotes;
}

function locateQuote(data, quoteId) {
  if (!quoteId) return null;
  return (data?.quotes || []).find((item) => item.id === quoteId)
    || quotationDirectory().find((item) => item.id === quoteId)
    || allCeoQuotes().find((item) => item.id === quoteId)
    || null;
}

function paymentsOnOtherAccounts(quoteId, exceptId = "") {
  const owner = dataOwner();
  return loadUsers()
    .filter((user) => user.active && user.username !== owner && (user.role === "sales" || user.role === "pm"))
    .flatMap((user) => readSalesAccount(user.username)?.payments || [])
    .filter((payment) => payment.quoteId === quoteId && payment.status !== "cancelled" && payment.id !== exceptId);
}

function normalizeSales(raw) {
  const base = blankSales();
  if (!raw || typeof raw !== "object") return base;
  const packages = Array.isArray(raw.packages) ? raw.packages.map(normalizePackage).filter(Boolean) : [];
  return {
    packages: packages.length ? packages : base.packages,
    quotes: Array.isArray(raw.quotes) ? raw.quotes.map(normalizeQuote).filter(Boolean) : [],
    payments: Array.isArray(raw.payments) ? raw.payments.map(normalizePayment).filter(Boolean) : [],
    leads: leadsFrom(raw),
    sequence: numberOr(raw.sequence, 0),
    rates: {
      rate: numberOr(raw.rates?.rate, 0),
      bonus: numberOr(raw.rates?.bonus, 0),
      threshold: numberOr(raw.rates?.threshold, 0),
    },
    goals: {
      monthly: dropDummy(numberOr(raw.goals?.monthly, 0), DUMMY_GOALS.monthly, 0),
      projects: dropDummy(numberOr(raw.goals?.projects, 0), DUMMY_GOALS.projects, 0),
      daily: dropDummy(numberOr(raw.goals?.daily, 0), DUMMY_GOALS.daily, 0),
      leadTarget: dropDummy(numberOr(raw.goals?.leadTarget, 0), DUMMY_GOALS.leadTarget, 0),
    },
    campaign: {
      name: dropDummy(String(raw.campaign?.name || ""), DUMMY_CAMPAIGN.name, ""),
      start: dropDummy(String(raw.campaign?.start || ""), DUMMY_CAMPAIGN.start, ""),
      end: dropDummy(String(raw.campaign?.end || ""), DUMMY_CAMPAIGN.end, ""),
      target: dropDummy(numberOr(raw.campaign?.target, 0), DUMMY_CAMPAIGN.target, 0),
    },
    team: raw.team && typeof raw.team === "object" ? raw.team : {},
    monthTargets: normalizeMonthTargets(raw.monthTargets),
    followUps: followUpsFrom(raw),
  };
}

export function packageCategory(value, service = "") {
  if (LEAD_SERVICES.includes(value)) return value;
  if (String(service).toLowerCase().includes("marketing")) return "Marketing";
  return LEAD_SERVICES[0];
}

function normalizePackage(item) {
  if (!item?.id || !item.name) return null;
  const category = packageCategory(item.category, item.service);
  const service = String(item.service || "").trim();
  const cover = String(item.cover || "").startsWith("data:image/") ? String(item.cover) : "";
  return {
    id: String(item.id),
    name: String(item.name),
    price: numberOr(item.price, 0),
    period: PRICE_BASIS.includes(item.period) ? item.period : "Per project",
    service: service || category,
    category,
    scope: String(item.scope || ""),
    cover,
    coverFit: cover ? normalizeCoverFit(item.coverFit) : defaultCoverFit(),
  };
}

function normalizeLine(item) {
  const packageName = String(item?.packageName || "").trim();
  if (!packageName) return null;
  return {
    service: String(item.service || ""),
    category: packageCategory(item.category, item.service),
    packageName,
    period: String(item.period || ""),
    price: numberOr(item.price, 0),
    scope: String(item.scope || ""),
  };
}

function normalizeQuote(item) {
  if (!item?.id) return null;
  const stored = Array.isArray(item.items) ? item.items.map(normalizeLine).filter(Boolean) : [];
  const items = stored.length
    ? stored
    : [normalizeLine(item)].filter(Boolean);
  const subtotal = items.reduce((sum, line) => sum + line.price, 0);
  const discount = numberOr(item.discount, 0);
  const applyVat = item.applyVat === false || (item.applyVat == null && Boolean(item.clientId)) ? false : true;
  const figures = applyVat
    ? quotationFigures(subtotal || numberOr(item.price, 0), discount)
    : (() => {
      const base = subtotal || numberOr(item.price, 0);
      const offer = discount > 0 ? discount : 0;
      const net = Math.max(0, Math.round((base - offer) * 100) / 100);
      return { subtotal: base, discount: offer, net, vat: 0, grand: net };
    })();
  const periods = [...new Set(items.map((line) => line.period).filter(Boolean))];
  return {
    id: String(item.id),
    number: String(item.number || ""),
    executive: String(item.executive || ""),
    projectId: String(item.projectId || ""),
    client: String(item.client || ""),
    contact: String(item.contact || ""),
    email: String(item.email || ""),
    phone: String(item.phone || ""),
    address: String(item.address || ""),
    projectName: String(item.projectName || ""),
    items,
    service: [...new Set(items.map((line) => line.service).filter(Boolean))].join(", "),
    packageName: items.map((line) => line.packageName).join(", "),
    period: periods.length === 1 ? periods[0] : periods.length ? "Mixed" : String(item.period || ""),
    price: figures.subtotal,
    discount: figures.discount,
    total: figures.grand,
    scope: items.map((line) => `${line.packageName}\n${line.scope}`).join("\n\n"),
    terms: String(item.terms || ""),
    date: String(item.date || ""),
    valid: String(item.valid || ""),
    ceoConfirmed: item.ceoConfirmed === true,
    pmOwners: Array.isArray(item.pmOwners) ? item.pmOwners.map(String) : [],
    salesOwners: Array.isArray(item.salesOwners) ? item.salesOwners.map(String) : [],
    sharedWithPms: item.sharedWithPms === true,
    clientId: String(item.clientId || ""),
    clientCode: String(item.clientCode || "").trim(),
    applyVat,
  };
}

function parseSaleCode(value, prefix) {
  const match = new RegExp(`^${prefix}-(\\d+)$`, "i").exec(String(value || "").trim());
  return match ? Number(match[1]) : 0;
}

function paddedSaleCode(prefix, value) {
  const number = parseSaleCode(value, prefix);
  return number ? `${prefix}-${String(number).padStart(4, "0")}` : "";
}

function nextSaleCode(prefix, used) {
  let number = 1;
  while (used.has(number)) number += 1;
  used.add(number);
  return `${prefix}-${String(number).padStart(4, "0")}`;
}

function usedSaleNumbers(prefix, values) {
  const used = new Set();
  (values || []).forEach((value) => {
    const number = parseSaleCode(value, prefix);
    if (number) used.add(number);
  });
  return used;
}

function departmentSaleAccounts() {
  return salesStaff().map((user) => ({
    username: user.username,
    data: loadSalesAccountData(user.username),
  }));
}

export function nextDepartmentSaleCode() {
  const used = usedSaleNumbers(
    "SID",
    departmentSaleAccounts().flatMap(({ data }) => (data.payments || []).map((payment) => payment.saleCode))
  );
  return nextSaleCode("SID", used);
}

function ensureDepartmentSaleCodes() {
  const accounts = departmentSaleAccounts();
  const used = usedSaleNumbers(
    "SID",
    accounts.flatMap(({ data }) => (data.payments || []).map((payment) => payment.saleCode))
  );
  accounts.forEach(({ username, data }) => {
    let changed = false;
    const payments = (data.payments || []).map((payment) => {
      if (parseSaleCode(payment.saleCode, "SID")) return payment;
      changed = true;
      return { ...payment, saleCode: nextSaleCode("SID", used) };
    });
    if (!changed) return;
    try {
      const { packages, ...rest } = { ...data, payments };
      crmStorage.setItem(`${STORAGE_KEY}:${username}`, JSON.stringify(rest));
    } catch {
      // Codes still show for this visit.
    }
  });
}

function normalizePayment(item) {
  if (!item?.id) return null;
  const status = PAYMENT_STATUSES.some((entry) => entry.id === item.status) ? item.status : "pending";
  return {
    id: String(item.id),
    quoteId: String(item.quoteId || ""),
    executive: String(item.executive || ""),
    amount: numberOr(item.amount, 0),
    date: String(item.date || ""),
    status,
    type: PAYMENT_TYPES.includes(item.type) ? item.type : PAYMENT_TYPES[0],
    reference: String(item.reference || ""),
    method: String(item.method || ""),
    transactionId: String(item.transactionId || ""),
    approval: item.approval === "pending" || item.approval === "approved" ? item.approval : "",
    receiptName: String(item.receiptName || ""),
    receiptData: String(item.receiptData || ""),
    clientId: String(item.clientId || ""),
    clientOwner: String(item.clientOwner || ""),
    clientName: String(item.clientName || ""),
    clientCode: String(item.clientCode || ""),
    saleCode: paddedSaleCode("SID", item.saleCode),
  };
}

function mapLeadStatus(value) {
  if (LEAD_STAGES.includes(value)) return value;
  if (value === "Contacted") return "Connected";
  if (value === "Quotation sent") return "Quotation Sent";
  if (value === "success") return "Converted";
  if (value === "failed") return "Lost";
  if (value === "in-progress") return "Follow-up";
  return "New";
}

function normalizeCall(item) {
  if (!item) return null;
  return {
    date: String(item.date || ""),
    outcome: CALL_OUTCOMES.includes(item.outcome) ? item.outcome : "Answered",
    status: mapLeadStatus(item.status),
    next: String(item.next || ""),
    note: String(item.note || ""),
  };
}

function normalizeLead(item) {
  if (!item?.id) return null;
  const business = String(item.business || item.name || "").trim();
  const phone = formatPhone(item.phone || item.contact);
  const email = String(item.email || "").trim();
  return {
    id: String(item.id),
    date: String(item.date || ""),
    business,
    name: business,
    phone,
    email,
    address: String(item.address || "").trim(),
    businessType: String(item.businessType || item.industry || "").trim(),
    source: LEAD_SOURCES.includes(item.source) ? item.source : "Other",
    service: String(item.service || "").trim(),
    status: mapLeadStatus(item.status),
    next: String(item.next || ""),
    notes: String(item.notes || ""),
    executive: String(item.executive || ""),
    clientCode: String(item.clientCode || "").trim(),
    contact: email && phone ? `${email} · ${phone}` : String(item.contact || phone || email),
    calls: Array.isArray(item.calls) ? item.calls.map(normalizeCall).filter(Boolean) : [],
  };
}

function followUpToLead(item) {
  const status = item.status === "success" ? "Converted" : item.status === "failed" ? "Lost" : "Follow-up";
  return normalizeLead({
    id: item.id,
    date: item.date,
    business: item.name,
    phone: item.phone,
    email: item.email,
    address: item.address,
    businessType: item.businessType,
    source: "Other",
    service: "",
    status,
    next: item.date,
    notes: item.notes,
    executive: item.executive,
    calls: [],
  });
}

function leadsFrom(raw) {
  const leads = Array.isArray(raw.leads) ? raw.leads.map(normalizeLead).filter(Boolean) : [];
  const ids = new Set(leads.map((item) => item.id));
  const extra = (Array.isArray(raw.followUps) ? raw.followUps : [])
    .map(normalizeFollowUp)
    .filter((item) => item && !ids.has(item.id))
    .map(followUpToLead)
    .filter(Boolean);
  extra.forEach((item) => ids.add(item.id));
  return [...leads, ...extra];
}

function phoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "").slice(0, 10);
}

function formatLeadId(value) {
  return `LEAD-${String(value).padStart(4, "0")}`;
}

function leadIdNumber(id) {
  const match = /^LEAD-(\d+)$/i.exec(String(id || ""));
  return match ? Number(match[1]) : 0;
}

export function sortLeadsById(leads) {
  return [...(leads || [])].sort((a, b) => {
    const byNumber = leadIdNumber(a?.id) - leadIdNumber(b?.id);
    return byNumber || String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

function eachSalesAccount(visit) {
  for (let index = 0; index < crmStorage.length; index += 1) {
    const key = crmStorage.key(index);
    if (!key?.startsWith(`${STORAGE_KEY}:`)) continue;
    let raw = null;
    try {
      raw = JSON.parse(crmStorage.getItem(key) || "null");
    } catch {
      raw = null;
    }
    visit(raw && typeof raw === "object" ? raw : {}, key.slice(`${STORAGE_KEY}:`.length));
  }
}

function directoryLead(lead, owner) {
  return {
    id: lead.id,
    business: lead.business || lead.name || "",
    name: lead.business || lead.name || "",
    address: lead.address || "",
    phone: lead.phone || "",
    email: lead.email || "",
    status: lead.status || "",
    owner,
    date: lead.date || "",
  };
}

function directoryLeads() {
  const rows = [];
  eachSalesAccount((raw, owner) => {
    leadsFrom(raw).forEach((lead) => {
      if (lead?.id) rows.push(directoryLead(lead, owner));
    });
  });
  return sortLeadsById(rows);
}

function publishLeadDirectory() {
  const harvested = harvestLeadIndex();
  const stored = loadLeadIndex();
  saveLeadIndex({
    sequence: Math.max(harvested.sequence, stored.sequence),
    ids: { ...stored.ids, ...harvested.ids },
    leads: directoryLeads(),
  });
}

function harvestLeadIndex() {
  const ids = {};
  const phones = {};
  let sequence = 0;
  eachSalesAccount((raw) => {
    leadsFrom(raw).forEach((lead) => {
      if (!lead?.id) return;
      ids[lead.id] = true;
      sequence = Math.max(sequence, leadIdNumber(lead.id));
      const digits = phoneDigits(lead.phone);
      if (digits.length === 10 && !phones[digits]) phones[digits] = lead.id;
    });
  });
  return { sequence, ids, phones };
}

function loadLeadIndex() {
  try {
    const raw = JSON.parse(crmStorage.getItem(LEAD_INDEX_KEY) || "null");
    if (!raw || typeof raw !== "object") return { sequence: 0, ids: {} };
    return {
      sequence: Number(raw.sequence) || 0,
      ids: raw.ids && typeof raw.ids === "object" ? raw.ids : {},
    };
  } catch {
    return { sequence: 0, ids: {} };
  }
}

function saveLeadIndex(index) {
  crmStorage.setItem(LEAD_INDEX_KEY, JSON.stringify({
    sequence: index.sequence,
    ids: index.ids,
    leads: Array.isArray(index.leads) ? index.leads : directoryLeads(),
  }));
}

function claimLeadId(preferred) {
  const harvested = harvestLeadIndex();
  const stored = loadLeadIndex();
  const ids = { ...stored.ids, ...harvested.ids };
  let sequence = Math.max(Number(stored.sequence) || 0, harvested.sequence);
  const wanted = String(preferred || "").trim();
  let id = wanted && !harvested.ids[wanted] ? wanted : "";
  if (!id) {
    do {
      sequence += 1;
      id = formatLeadId(sequence);
    } while (ids[id]);
  } else {
    sequence = Math.max(sequence, leadIdNumber(id));
  }
  ids[id] = true;
  saveLeadIndex({ sequence, ids });
  return id;
}

export function nextLeadId() {
  const harvested = harvestLeadIndex();
  const stored = loadLeadIndex();
  const ids = { ...stored.ids, ...harvested.ids };
  let sequence = Math.max(Number(stored.sequence) || 0, harvested.sequence);
  let id;
  do {
    sequence += 1;
    id = formatLeadId(sequence);
  } while (ids[id]);
  return id;
}

export function leadPhoneTaken(phone, exceptId = "") {
  const digits = phoneDigits(phone);
  if (digits.length !== 10) return false;
  const holder = harvestLeadIndex().phones[digits];
  return Boolean(holder && holder !== exceptId);
}

export function dueLeads(leads, day = todayISO()) {
  return (leads || [])
    .filter((item) => item.next && item.next <= day && item.status !== "Converted" && item.status !== "Lost")
    .sort((a, b) => a.next.localeCompare(b.next) || a.business.localeCompare(b.business));
}

export function answeredCallsOn(leads, day = todayISO()) {
  return (leads || []).reduce((sum, lead) => sum + (lead.calls || []).filter((call) => call.date === day && call.outcome === "Answered").length, 0);
}

export function leadsLoggedToday(leads, status, day = todayISO()) {
  const ids = new Set();
  (leads || []).forEach((lead) => {
    if ((lead.calls || []).some((call) => call.date === day && call.status === status)) ids.add(lead.id);
  });
  return ids.size;
}

export function outstandingBalance(username) {
  const sales = username ? readSalesAccount(username) : null;
  if (sales?.quotes?.length) {
    return sales.quotes.reduce((sum, quote) => sum + quoteCollection(sales, quote).remaining, 0);
  }
  return confirmedCeoQuotes(username).reduce((sum, quote) => {
    const paid = approvedInstallments(quote.id).reduce((total, payment) => total + payment.amount, 0);
    return sum + Math.max(0, quote.total - paid);
  }, 0);
}

export function saveSalesSettings(data, draft) {
  const callTarget = Number(draft.callTarget);
  const leadTarget = Number(draft.leadTarget);
  const rate = Number(draft.rate);
  if (![callTarget, leadTarget].every((value) => Number.isInteger(value) && value >= 0)) {
    return { ok: false, error: "Call and lead targets must be whole numbers, zero or more." };
  }
  if (!Number.isFinite(rate) || rate < 0) return { ok: false, error: "Commission rate must be zero or more." };
  return {
    ok: true,
    data: {
      ...data,
      goals: { ...data.goals, daily: callTarget, leadTarget },
      rates: { ...data.rates, rate },
    },
  };
}

function normalizeMonthTargets(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([month]) => /^\d{4}-\d{2}$/.test(month))
      .map(([month, counts]) => [
        month,
        {
          leads: wholeNumber(counts?.leads),
          clients: wholeNumber(counts?.clients),
          achieved: wholeNumber(counts?.achieved),
          ...(Number.isFinite(Number(counts?.collection)) && Number(counts.collection) >= 0
            ? { collection: dropDummy(Number(counts.collection), DUMMY_MEMBER.target, 0) }
            : {}),
        },
      ])
  );
}

function wholeNumber(value) {
  const next = Number(value);
  return Number.isInteger(next) && next >= 0 ? next : 0;
}

function followUpsFrom(raw) {
  return Array.isArray(raw.followUps) ? raw.followUps.map(normalizeFollowUp).filter(Boolean) : [];
}

function followUpFromLead(lead) {
  const converted = lead.status === "Converted";
  const lost = lead.status === "Lost";
  return {
    id: lead.id,
    name: lead.business,
    contact: lead.contact,
    email: lead.email,
    phone: lead.phone,
    address: lead.address,
    executive: lead.executive,
    date: lead.next || lead.date,
    notes: lead.notes,
    status: converted ? "success" : lost ? "failed" : "in-progress",
  };
}

function normalizeFollowUp(item) {
  if (!item?.id || !item.name) return null;
  return {
    id: String(item.id),
    name: String(item.name),
    contact: String(item.contact || ""),
    email: String(item.email || ""),
    phone: String(item.phone || ""),
    address: String(item.address || ""),
    executive: String(item.executive || ""),
    date: String(item.date || ""),
    notes: String(item.notes || ""),
    status: FOLLOW_UP_STATUSES.some((entry) => entry.id === item.status) ? item.status : "in-progress",
  };
}

export function monthTarget(data, month) {
  const saved = data.monthTargets?.[month] || {};
  return {
    leads: wholeNumber(saved.leads),
    clients: wholeNumber(saved.clients),
    achieved: wholeNumber(saved.achieved),
  };
}

export function achievedClients(data, month) {
  return (data.followUps || []).filter((item) => item.status === "success" && monthKey(item.date) === month).length;
}

export function saveMonthTarget(data, month, draft) {
  const leads = Number(draft.leads);
  const clients = Number(draft.clients);
  if ([leads, clients].some((value) => !Number.isInteger(value) || value < 0)) {
    return { ok: false, error: "Enter each count as a whole number, zero or more." };
  }
  const previous = data.monthTargets?.[month] || {};
  return {
    ok: true,
    data: {
      ...data,
      monthTargets: {
        ...data.monthTargets,
        [month]: { ...previous, leads, clients, achieved: wholeNumber(previous.achieved) },
      },
    },
  };
}

export function collectionTarget(data, month, usernames = []) {
  const saved = data.monthTargets?.[month]?.collection;
  if (Number.isFinite(saved) && saved >= 0) return saved;
  return usernames.reduce((sum, username) => sum + memberConfig(data, username).target, 0);
}

export function saveCollectionTarget(data, month, amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) return { ok: false, error: "Monthly target must be zero or more." };
  const previous = data.monthTargets?.[month] || { leads: 0, clients: 0, achieved: 0 };
  return {
    ok: true,
    data: {
      ...data,
      monthTargets: {
        ...data.monthTargets,
        [month]: { ...previous, collection: Math.round(value * 100) / 100 },
      },
    },
  };
}

export function confirmedCollections(data, month) {
  return (data.payments || [])
    .filter((payment) => payment.status === "confirmed" && payment.approval !== "pending" && monthKey(payment.date) === month)
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function salesPaymentRevenue() {
  const rows = [];
  loadUsers()
    .filter((user) => user.active && user.role === "sales")
    .forEach((user) => {
      const sales = readSalesAccount(user.username);
      (sales?.payments || []).forEach((payment) => {
        if (!payment || payment.status === "cancelled" || payment.approval === "pending") return;
        const counted = payment.approval === "approved" || payment.status === "confirmed";
        if (!counted) return;
        const client = String(payment.clientName || "").trim();
        const type = String(payment.type || "").trim();
        rows.push({
          id: `sales-payment:${user.username}:${payment.id}`,
          source: "sales",
          salesPerson: user.username,
          date: String(payment.date || ""),
          description: [client, type].filter(Boolean).join(" · ") || "Sales payment",
          amount: Number(payment.amount) || 0,
          approval: "approved",
        });
      });
    });
  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.amount - a.amount);
}

export function saveFollowUp(data, draft) {
  const name = draft.name.trim();
  const email = String(draft.email || "").trim();
  const phone = formatPhone(draft.phone);
  const address = String(draft.address || "").trim();
  if (!name || !email || !address || phone.replace(/\D/g, "").length !== 10) {
    return { ok: false, error: "Enter the client name, email, address, and a 10-digit phone number." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (!draft.date) return { ok: false, error: "Follow-up date is required." };
  if (!draft.executive) return { ok: false, error: "Choose the sales executive." };
  if (!FOLLOW_UP_STATUSES.some((entry) => entry.id === draft.status)) {
    return { ok: false, error: "Choose a status." };
  }
  const next = {
    id: draft.id || uid(),
    name,
    email,
    phone,
    address,
    contact: `${email} · ${phone}`,
    executive: draft.executive,
    date: draft.date,
    notes: String(draft.notes || "").trim(),
    status: draft.status,
  };
  const list = data.followUps || [];
  const exists = list.some((item) => item.id === next.id);
  const saved = {
    ...data,
    followUps: exists ? list.map((item) => (item.id === next.id ? next : item)) : [...list, next],
  };
  publishIncoming(saved);
  return { ok: true, data: saved };
}

export function loadIncomingProjects() {
  try {
    const raw = crmStorage.getItem(INCOMING_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeIncoming).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function publishIncoming(data) {
  const owner = dataOwner();
  const session = sessionAccount();
  if (!owner || session?.role !== "sales" || session.username !== owner) return;
  publishIncomingFor(owner, data);
}

function publishIncomingFor(owner, data) {
  if (!owner) return;
  const others = loadIncomingProjects().filter((item) => item.salesOwner !== owner);
  const mine = (data.followUps || [])
    .filter((item) => item.status === "success" && String(item.name || "").trim())
    .map((item) => ({
      id: `${owner}:${item.id}`,
      followUpId: item.id,
      salesOwner: owner,
      name: item.name.trim(),
      client: item.name.trim(),
      contact: item.contact,
      email: item.email || "",
      phone: item.phone || "",
      address: item.address || "",
      executive: item.executive,
      date: item.date,
      notes: item.notes,
    }));
  crmStorage.setItem(INCOMING_KEY, JSON.stringify([...others, ...mine]));
}

function normalizeIncoming(item) {
  if (!item?.id || !item.name || !item.salesOwner) return null;
  return {
    id: String(item.id),
    followUpId: String(item.followUpId || ""),
    salesOwner: String(item.salesOwner),
    name: String(item.name),
    client: String(item.client || item.name),
    contact: String(item.contact || ""),
    email: String(item.email || ""),
    phone: String(item.phone || ""),
    address: String(item.address || ""),
    executive: String(item.executive || ""),
    date: String(item.date || ""),
    notes: String(item.notes || ""),
  };
}

export function salesClientDirectory() {
  const byName = new Map();
  loadUsers()
    .filter((user) => user.active && user.role === "sales")
    .forEach((user) => {
      const raw = readAccount(STORAGE_KEY, user.username);
      const follows = Array.isArray(raw?.followUps) ? raw.followUps : [];
      follows.forEach((item) => {
        const name = String(item?.name || "").trim();
        const email = String(item?.email || "").trim();
        const phone = String(item?.phone || "").trim();
        const address = String(item?.address || "").trim();
        if (!name || (!email && !phone && !address)) return;
        const key = name.toLowerCase();
        const current = byName.get(key);
        const date = String(item?.date || "");
        if (!current || date >= current.date) byName.set(key, { name, email, phone, address, date });
      });
    });
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function salesClientByName(name) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  return salesClientDirectory().find((item) => item.name.toLowerCase() === key) || null;
}

function sharedPayingClients() {
  try {
    const raw = JSON.parse(crmStorage.getItem(PAYING_CLIENTS_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function addPayingClient(byName, next) {
  const name = String(next?.name || "").trim();
  if (!name) return;
  const key = name.toLowerCase();
  const current = byName.get(key);
  if (!current) {
    byName.set(key, {
      name,
      code: next.code || "",
      email: next.email || "",
      phone: next.phone || "",
      address: next.address || "",
    });
    return;
  }
  byName.set(key, {
    ...current,
    code: current.code || next.code || "",
    email: current.email || next.email || "",
    phone: current.phone || next.phone || "",
    address: current.address || next.address || "",
  });
}

export function payingClientsForPm(username) {
  const user = loadUsers().find((item) => item.active && item.username === username);
  if (!user || user.role !== "pm") return [];
  const byName = new Map();
  sharedPayingClients().forEach((item) => addPayingClient(byName, item));
  let sawSalesPayment = false;
  loadUsers()
    .filter((item) => item.active && item.role === "sales")
    .forEach((salesUser) => {
      const sales = readSalesAccount(salesUser.username);
      (sales?.payments || []).forEach((payment) => {
        if (!payment || payment.status === "cancelled") return;
        const approved = payment.approval === "approved" || (payment.status === "confirmed" && payment.approval !== "pending");
        if (!approved) return;
        sawSalesPayment = true;
        const quote = (sales?.quotes || []).find((item) => item.id === payment.quoteId);
        const name = String(payment.clientName || quote?.client || "").trim();
        if (!name) return;
        const key = name.toLowerCase();
        const lead = (sales?.leads || []).find((item) => item.id === payment.clientId || item.id === quote?.clientId)
          || (sales?.leads || []).find((item) => String(item.business || "").trim().toLowerCase() === key);
        const details = salesClientByName(name);
        addPayingClient(byName, {
          name,
          code: lead?.clientCode || quote?.clientCode || payment.clientCode || "",
          email: details?.email || lead?.email || quote?.email || "",
          phone: details?.phone || lead?.phone || quote?.phone || "",
          address: details?.address || lead?.address || "",
        });
      });
    });
  if (sessionAccount()?.role === "ceo" && sawSalesPayment) {
    crmStorage.setItem(PAYING_CLIENTS_KEY, JSON.stringify([...byName.values()]));
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function clientsWithPaying(clients, username) {
  const paying = payingClientsForPm(username);
  let next = [...clients];
  let changed = false;
  paying.forEach((item) => {
    const existing = next.find((client) => client.name.trim().toLowerCase() === item.name.toLowerCase());
    if (!existing) {
      next = [{
        ...blankClient(),
        name: item.name,
        contactEmail: item.email,
        contactPhone: item.phone,
        address: item.address,
        code: item.code || nextClientCode(next),
        origin: "sales",
      }, ...next];
      changed = true;
      return;
    }
    const patch = {};
    if (!existing.contactEmail && item.email) patch.contactEmail = item.email;
    if (!existing.contactPhone && item.phone) patch.contactPhone = item.phone;
    if (!existing.address && item.address) patch.address = item.address;
    if (!existing.code && item.code) patch.code = item.code;
    if (!Object.keys(patch).length) return;
    next = next.map((client) => (client.id === existing.id ? { ...client, ...patch } : client));
    changed = true;
  });
  if (changed) saveClients(next);
  return next;
}

export function successfulPaymentClients(followUps) {
  return convertedPaymentClients({ followUps, leads: [], quotes: [] });
}

export function convertedClients(data) {
  return (data?.leads || [])
    .filter((lead) => lead.status === "Converted" && String(lead.business || "").trim())
    .slice()
    .sort((a, b) => a.business.localeCompare(b.business));
}

export function convertedPaymentClients(data) {
  const owner = dataOwner();
  const quoted = new Set((data?.quotes || []).map((quote) => quote.clientId).filter(Boolean));
  const fromLeads = convertedClients(data)
    .filter((lead) => quoted.has(lead.id) || (data?.quotes || []).some((quote) => quoteMatchesClient(quote, lead.business)))
    .map((lead) => ({
      id: lead.id,
      owner,
      name: lead.business,
      code: lead.clientCode || "",
    }));
  if (fromLeads.length) return fromLeads;
  const byName = new Map();
  for (const item of data?.followUps || []) {
    if (item.status !== "success" || !String(item.name || "").trim()) continue;
    const key = item.name.trim().toLowerCase();
    const current = byName.get(key);
    if (!current || String(item.date) > String(current.date)) byName.set(key, item);
  }
  return [...byName.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({
      id: item.id,
      owner,
      name: item.name.trim(),
      code: "",
    }));
}

function nextSalesClientCode(data) {
  let max = 0;
  (data?.leads || []).forEach((lead) => {
    max = Math.max(max, clientCodeNumber(lead.clientCode));
  });
  (data?.quotes || []).forEach((quote) => {
    max = Math.max(max, clientCodeNumber(quote.clientCode));
  });
  return formatClientCode(max + 1);
}

export function assignConvertedClientCodes(data) {
  let max = 0;
  (data?.leads || []).forEach((lead) => {
    max = Math.max(max, clientCodeNumber(lead.clientCode));
  });
  let changed = false;
  const leads = (data?.leads || []).map((lead) => {
    if (lead.status !== "Converted" || lead.clientCode) return lead;
    max += 1;
    changed = true;
    return { ...lead, clientCode: formatClientCode(max) };
  });
  return changed ? { ...data, leads } : data;
}

export function quoteForClient(data, clientId, clientName = "") {
  return (data?.quotes || []).find((quote) => quote.clientId === clientId)
    || (data?.quotes || []).find((quote) => quoteMatchesClient(quote, clientName))
    || null;
}

export function quoteCollection(data, quote) {
  const payments = (data?.payments || []).filter((payment) => payment.quoteId === quote.id && payment.status !== "cancelled");
  const collected = payments
    .filter((payment) => payment.approval === "approved" || (payment.status === "confirmed" && payment.approval !== "pending"))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const awaiting = payments
    .filter((payment) => payment.approval === "pending")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const total = Number(quote.total || 0);
  const remaining = Math.max(0, Math.round((total - collected) * 100) / 100);
  return {
    total,
    collected,
    awaiting,
    remaining,
    status: remaining <= 0 && total > 0 ? "fully-paid" : "pending",
  };
}

export function quoteMatchesClient(quote, name) {
  const client = String(name || "").trim().toLowerCase();
  if (!client) return false;
  return [quote?.client, quote?.address].some((value) => String(value || "").trim().toLowerCase() === client);
}

export function memberConfig(data, username) {
  const saved = data.team?.[username] || {};
  const rate = saved.rate == null || saved.rate === "" ? null : numberOr(saved.rate, Number.NaN);
  return {
    target: numberOr(saved.target, 0),
    salary: numberOr(saved.salary, 0),
    allowance: numberOr(saved.allowance, 0),
    rate: Number.isFinite(rate) && rate >= 0 ? rate : null,
  };
}

export function monthKey(date) {
  return String(date || "").slice(0, 7);
}

export function confirmedRevenue(data, username, month) {
  return data.payments
    .filter((payment) => payment.executive === username && payment.status === "confirmed" && monthKey(payment.date) === month)
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function payout(data, username, month) {
  const config = memberConfig(data, username);
  const revenue = confirmedRevenue(data, username, month);
  const commission = (revenue * data.rates.rate) / 100;
  const reached = config.target > 0 && (revenue / config.target) * 100 >= data.rates.threshold;
  const bonus = reached ? data.rates.bonus : 0;
  return {
    ...config,
    revenue,
    commission,
    bonus,
    total: config.salary + config.allowance + commission + bonus,
  };
}

export function campaignCollected(data) {
  const { start, end } = data.campaign;
  return data.payments
    .filter((payment) => payment.status === "confirmed" && payment.date >= start && payment.date <= end)
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function reservedAmount(data, quoteId, exceptId = "") {
  const own = data.payments.filter((payment) => payment.quoteId === quoteId && payment.status !== "cancelled" && payment.id !== exceptId);
  const rest = paymentsOnOtherAccounts(quoteId, exceptId).filter((payment) => !own.some((item) => item.id === payment.id));
  return [...own, ...rest].reduce((sum, payment) => sum + payment.amount, 0);
}

export function nextQuoteNumber(data, date) {
  const sequence = data.sequence + 1;
  const year = String(date || todayISO()).slice(0, 4);
  return { sequence, number: `NL-Q-${year}-${String(sequence).padStart(4, "0")}` };
}

function quoteFromDraft(data, draft) {
  const converted = (data.leads || []).find((lead) => lead.id === draft.clientId && lead.status === "Converted");
  const salesQuote = Boolean(converted);
  const client = String(salesQuote ? converted.business : draft.client || "").trim();
  const discount = Number(draft.discount);
  if (!salesQuote && (!draft.projectId || !client)) return { ok: false, error: "Choose a project." };
  if (salesQuote && !client) return { ok: false, error: "Choose a converted client." };
  if (!draft.date) return { ok: false, error: "Quotation date is required." };
  const valid = draft.valid || (salesQuote ? addDays(draft.date, 14) : "");
  if (!salesQuote && !valid) return { ok: false, error: "Quotation date and validity are required." };
  if (valid && valid < draft.date) return { ok: false, error: "Validity date cannot be before the quotation date." };
  const lines = Array.isArray(draft.lines) ? draft.lines : [];
  if (!lines.length) return { ok: false, error: "Add at least one package." };
  const items = [];
  for (const line of lines) {
    const price = Number(line.price);
    const custom = line.packageId === "custom";
    const pkg = data.packages.find((item) => item.id === line.packageId);
    if (!pkg && !custom) return { ok: false, error: "Choose a package on every line." };
    const packageName = custom ? String(line.customName || "").trim() : pkg.name;
    if (!packageName) return { ok: false, error: "Each custom package needs a title." };
    const scope = sanitizeScopeHtml(line.scope) || (salesQuote ? packageName : "");
    if (!scopeHasText(scope)) return { ok: false, error: "Each package needs a scope." };
    if (!Number.isFinite(price) || price <= 0) return { ok: false, error: "Each package price must be greater than zero." };
    items.push({
      service: line.service || pkg?.service || "",
      packageName,
      period: custom ? "Custom quotation" : pkg.period,
      price,
      scope,
    });
  }
  const subtotal = Math.round(items.reduce((sum, line) => sum + line.price, 0) * 100) / 100;
  if (!Number.isFinite(discount) || discount < 0 || discount >= subtotal) {
    return { ok: false, error: "Discount must be less than the quotation value." };
  }
  const figures = salesQuote
    ? {
      subtotal,
      discount: Number.isFinite(discount) && discount > 0 ? discount : 0,
      net: Math.max(0, subtotal - (Number.isFinite(discount) && discount > 0 ? discount : 0)),
      vat: 0,
      grand: Math.round(Math.max(0, subtotal - (Number.isFinite(discount) && discount > 0 ? discount : 0)) * 100) / 100,
    }
    : quotationFigures(subtotal, discount);
  const terms = String(draft.terms || "").trim() || (salesQuote ? "As agreed with the client." : "");
  if (!terms) return { ok: false, error: "Payment terms are required." };
  const periods = [...new Set(items.map((line) => line.period))];
  const audience = sessionAccount()?.role === "ceo" ? quoteAudience(draft.projectId, client, draft.address) : {};
  const owner = dataOwner();
  return {
    ok: true,
    quote: {
      executive: draft.executive || converted?.executive || "",
      projectId: salesQuote ? `lead:${converted.id}` : draft.projectId,
      ...audience,
      client,
      clientId: salesQuote ? converted.id : String(draft.clientId || ""),
      clientCode: salesQuote ? converted.clientCode : String(draft.clientCode || ""),
      contact: salesQuote
        ? [converted.email, converted.phone].filter(Boolean).join(" · ")
        : [draft.email, draft.phone].filter(Boolean).join(" · ") || String(draft.contact || "").trim(),
      email: salesQuote ? converted.email : String(draft.email || "").trim(),
      phone: salesQuote ? converted.phone : String(draft.phone || "").trim(),
      address: salesQuote ? converted.address : String(draft.address || "").trim(),
      projectName: salesQuote ? converted.business : String(draft.projectName || "").trim(),
      items,
      service: [...new Set(items.map((line) => line.service).filter(Boolean))].join(", "),
      packageName: items.map((line) => line.packageName).join(", "),
      period: periods.length === 1 ? periods[0] : "Mixed",
      price: figures.subtotal,
      discount: figures.discount,
      total: figures.grand,
      scope: items.map((line) => `${line.packageName}\n${line.scope}`).join("\n\n"),
      terms,
      date: draft.date,
      valid,
      applyVat: !salesQuote,
      salesOwners: salesQuote && owner ? [owner] : Array.isArray(draft.salesOwners) ? draft.salesOwners : [],
    },
  };
}

export function previewQuote(data, draft) {
  const built = quoteFromDraft(data, draft);
  if (!built.ok) return built;
  const existing = draft.id ? data.quotes.find((item) => item.id === draft.id) : null;
  return {
    ok: true,
    quote: {
      ...built.quote,
      id: existing?.id || "",
      number: existing?.number || "",
    },
  };
}

export function saveClientQuote(data, draft) {
  if (draft.id) return updateQuote(data, draft);
  const existing = (data.quotes || []).find((item) => item.clientId === draft.clientId);
  if (existing) return updateQuote(data, { ...draft, id: existing.id });
  return createQuote(data, draft);
}

export function createQuote(data, draft) {
  const built = quoteFromDraft(data, draft);
  if (!built.ok) return built;
  if (built.quote.clientId) {
    const existing = data.quotes.find((item) => item.clientId === built.quote.clientId && item.id !== draft.id);
    if (existing) return { ok: false, error: "This client already has a quotation. Edit it instead." };
  }
  const issued = nextQuoteNumber(data, draft.date);
  const quote = { ...built.quote, id: uid(), number: issued.number };
  const type = projectTypeFromQuote(quote);
  if (type === "marketing" || type === "both") {
    const who = sessionAccount()?.username || "Sales";
    const service = type === "both" ? "software and marketing" : "marketing";
    notifyRole("marketing", `${who} added ${quote.client} as a ${service} client. Open Project maintenance.`);
  }
  return { ok: true, data: { ...data, sequence: issued.sequence, quotes: [...data.quotes, quote] } };
}

export function updateQuote(data, draft) {
  const existing = data.quotes.find((item) => item.id === draft.id);
  if (!existing) return { ok: false, error: "That quotation was not found." };
  const built = quoteFromDraft(data, draft);
  if (!built.ok) return built;
  const quote = { ...built.quote, id: existing.id, number: existing.number };
  const reserved = reservedAmount(data, existing.id);
  if (Math.round(reserved * 100) > Math.round(quote.total * 100)) {
    return { ok: false, error: "The project budget is below payments already recorded for this quotation." };
  }
  return {
    ok: true,
    data: { ...data, quotes: data.quotes.map((item) => (item.id === quote.id ? quote : item)) },
  };
}

export function deleteQuote(data, id) {
  const quote = data.quotes.find((item) => item.id === id);
  if (!quote) return { ok: false, error: "That quotation was not found." };
  if (reservedAmount(data, id) > 0) {
    return { ok: false, error: "Cancel the payments on this quotation before deleting it." };
  }
  return {
    ok: true,
    data: {
      ...data,
      quotes: data.quotes.filter((item) => item.id !== id),
      payments: data.payments.filter((payment) => payment.quoteId !== id),
    },
  };
}

function paymentClient(data, draft) {
  const owner = dataOwner();
  const lead = (data.leads || []).find((item) => item.id === draft.clientId && item.status === "Converted" && String(item.business || "").trim());
  if (lead && (!draft.clientOwner || draft.clientOwner === owner)) {
    return { id: lead.id, owner, name: lead.business.trim(), code: lead.clientCode || "" };
  }
  const followUp = (data.followUps || []).find((item) => item.id === draft.clientId && item.status === "success" && String(item.name || "").trim());
  if (followUp && draft.clientOwner === owner) {
    return { id: followUp.id, owner, name: followUp.name.trim(), code: "" };
  }
  if (!draft.clientOwner || draft.clientOwner !== owner) return null;
  const own = loadClients().find((item) => item.id === draft.clientId && item.status === "active" && item.name.trim());
  return own ? { ...own, owner: draft.clientOwner } : null;
}

export function createPayment(data, draft) {
  const quote = locateQuote(data, draft.quoteId);
  const client = paymentClient(data, draft);
  if (!client) {
    const salesPayment = sessionAccount()?.role === "sales";
    return { ok: false, error: salesPayment ? "Choose a converted client with a saved quotation." : "Choose a client." };
  }
  if (!quote) return { ok: false, error: "Choose a saved quotation." };
  if (quote.owner && quote.owner !== client.owner && !quoteMatchesClient(quote, client.name)) {
    return { ok: false, error: "Choose a quotation for this client." };
  }
  const amount = Number(draft.amount);
  if (!draft.date) return { ok: false, error: "Payment date is required." };
  const sendForApproval = sessionAccount()?.role === "sales" && draft.status !== "cancelled";
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Received amount must be greater than zero." };
  const used = reservedAmount(data, quote.id);
  if (Math.round((used + amount) * 100) > Math.round(quote.total * 100)) {
    return { ok: false, error: "Payment exceeds the remaining quotation balance, including pending receipts." };
  }
  const payment = {
    id: uid(),
    quoteId: quote.id,
    executive: quote.executive,
    amount,
    date: draft.date,
    status: draft.status || "pending",
    type: draft.type,
    reference: "",
    method: String(draft.method || "").trim(),
    transactionId: String(draft.transactionId || "").trim(),
    approval: sendForApproval ? "pending" : "",
    receiptName: String(draft.receiptName || ""),
    receiptData: String(draft.receiptData || ""),
    clientId: client.id,
    clientOwner: client.owner,
    clientName: client.name,
    clientCode: client.code,
    saleCode: nextDepartmentSaleCode(),
  };
  if (sendForApproval) submitInvoice(payment, quote);
  return { ok: true, data: { ...data, payments: [...data.payments, payment] } };
}

export function releaseSalesPaymentsForApproval() {
  loadUsers().filter((user) => user.active && user.role === "sales").forEach((user) => {
    const sales = readSalesAccount(user.username);
    if (!sales) return;
    const queued = [];
    sales.payments.forEach((payment) => {
      if (payment.status === "cancelled" || payment.approval === "approved") return;
      const quote = locateQuote(sales, payment.quoteId);
      if (!quote) return;
      const invoice = queueProjectInvoice(invoiceDraft(payment, quote, user.username));
      if (invoice && payment.approval !== "pending") queued.push(payment.id);
    });
    if (!queued.length) return;
    const key = `${STORAGE_KEY}:${user.username}`;
    try {
      const raw = JSON.parse(crmStorage.getItem(key) || "null");
      if (!raw || !Array.isArray(raw.payments)) return;
      raw.payments = raw.payments.map((payment) => (
        queued.includes(payment.id) ? { ...payment, approval: "pending" } : payment
      ));
      crmStorage.setItem(key, JSON.stringify(raw));
    } catch {
      // The invoice is already with the CEO. The sales row updates the next time that payment is saved.
    }
  });
}

function invoiceDraft(payment, quote, salesOwner) {
  return {
    paymentId: payment.id,
    salesOwner,
    pmOwners: quote.pmOwners || [],
    sharedWithPms: quote.sharedWithPms === true,
    quoteId: quote.id,
    quoteNumber: quote.number,
    quoteTotal: quote.total,
    projectName: quote.projectName || quote.address || quote.client,
    projectDetail: quote.service || quote.packageName || "",
    clientName: payment.clientName || quote.client,
    company: quote.client,
    contact: [quote.email, quote.phone].filter(Boolean).join(" · ") || quote.contact || "",
    amount: payment.amount,
    type: payment.type,
    method: payment.method,
    transactionId: payment.transactionId,
    date: payment.date,
  };
}

function submitInvoice(payment, quote) {
  const session = sessionAccount();
  if (session?.role !== "sales") return;
  queueProjectInvoice(invoiceDraft(payment, quote, session.username));
}

export function setPaymentStatus(data, paymentId, status, receipt) {
  const payment = data.payments.find((item) => item.id === paymentId);
  if (!payment) return { ok: false, error: "That payment was not found." };
  if (status === "cancelled" && sessionAccount()?.role === "sales") {
    return { ok: false, error: "Sales admin cannot cancel a payment." };
  }
  if (status === "confirmed") {
    const quote = locateQuote(data, payment.quoteId);
    const others = reservedAmount(data, payment.quoteId, payment.id);
    if (!quote || Math.round((others + payment.amount) * 100) > Math.round(quote.total * 100)) {
      return { ok: false, error: "Cannot confirm. Receipts would exceed the quotation total." };
    }
  }
  return {
    ok: true,
    data: {
      ...data,
      payments: data.payments.map((item) => {
        if (item.id !== paymentId) return item;
        if (status !== "confirmed") return { ...item, status, approval: "" };
        const next = {
          ...item,
          status,
          approval: "pending",
          method: receipt?.method || item.method || "",
          transactionId: receipt?.transactionId || item.transactionId || "",
          receiptName: receipt?.name || item.receiptName,
          receiptData: receipt?.data || item.receiptData,
        };
        const quote = locateQuote(data, item.quoteId);
        if (quote) submitInvoice(next, quote);
        return next;
      }),
    },
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === "\"" && source[index + 1] === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => String(value).trim()));
}

function csvDate(value, fallback = todayISO()) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parts = raw.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
  if (!parts) return fallback;
  return `${parts[3]}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
}

const LEAD_CSV_FIELDS = {
  business: ["business", "customer", "business / customer", "business/customer", "name", "customer name"],
  phone: ["phone", "mobile", "contact number"],
  date: ["date", "lead date"],
  source: ["source"],
  service: ["service", "interested service"],
  status: ["status", "lead status"],
  email: ["email", "email address"],
  address: ["address"],
  businessType: ["business type", "industry"],
  next: ["next", "next follow-up", "next follow up"],
  notes: ["notes", "note"],
};

function csvHeaderMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    const key = String(header || "").trim().toLowerCase();
    Object.entries(LEAD_CSV_FIELDS).forEach(([field, names]) => {
      if (names.includes(key)) map[field] = index;
    });
  });
  return map.business === undefined ? null : map;
}

function csvValue(row, map, field, fallback) {
  if (!map) return row[fallback] || "";
  const index = map[field];
  return index === undefined ? "" : row[index] || "";
}

export function importLeadsFromCsv(data, text, options = {}) {
  const rows = parseCsv(text);
  if (!rows.length) return { ok: false, error: "The CSV file has no lead rows." };
  const map = csvHeaderMap(rows[0]);
  const body = map ? rows.slice(1) : rows;
  if (!body.length) return { ok: false, error: "The CSV file has headings but no lead rows." };
  let current = data;
  let imported = 0;
  const skipped = [];
  body.forEach((row, index) => {
    const line = (map ? index + 2 : index + 1);
    const business = String(csvValue(row, map, "business", 0)).trim();
    if (!business) {
      skipped.push(`Row ${line} has no customer name.`);
      return;
    }
    const result = saveLead(current, {
      date: csvDate(csvValue(row, map, "date", 2)),
      business,
      phone: csvValue(row, map, "phone", 1),
      source: csvValue(row, map, "source", 3),
      service: csvValue(row, map, "service", 4),
      status: csvValue(row, map, "status", 5) || "New",
      email: csvValue(row, map, "email", 6),
      address: csvValue(row, map, "address", 7),
      next: csvDate(csvValue(row, map, "next", 8), ""),
      notes: csvValue(row, map, "notes", 9),
      businessType: csvValue(row, map, "businessType", 10),
      executive: options.executive || "",
    });
    if (!result.ok) {
      skipped.push(`Row ${line}: ${result.error}`);
      return;
    }
    current = result.data;
    imported += 1;
  });
  if (!imported) return { ok: false, error: skipped[0] || "No leads were imported." };
  const skipNote = skipped.length ? ` Skipped ${skipped.length}: ${skipped.slice(0, 3).join(" ")}` : "";
  return {
    ok: true,
    data: current,
    message: `Imported ${imported} lead${imported === 1 ? "" : "s"}.${skipNote}`,
  };
}

export function saveLead(data, draft) {
  const business = String(draft.business || draft.name || "").trim();
  if (!business) return { ok: false, error: "Business / customer name is required." };
  if (!draft.date) return { ok: false, error: "Lead date is required." };
  const existing = (data.leads || []).find((item) => item.id && item.id === draft.id);
  const status = mapLeadStatus(draft.status || existing?.status || "New");
  const phone = formatPhone(draft.phone);
  const digits = phoneDigits(phone);
  if (digits.length && digits.length !== 10) {
    return { ok: false, error: "Enter a 10-digit phone number." };
  }
  if (digits.length === 10 && leadPhoneTaken(phone, existing?.id || "")) {
    return { ok: false, error: LEAD_PHONE_EXISTS_MESSAGE };
  }
  const email = String(draft.email || "").trim();
  const address = String(draft.address || "").trim();
  if (status === "Converted") {
    if (!email || !address || digits.length !== 10) {
      return { ok: false, error: "Enter email, a 10-digit phone number, and address before marking Converted. That lead is then listed under Quotations as a client." };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };
  }
  const id = existing ? existing.id : claimLeadId(draft.id);
  if (!id) return { ok: false, error: "Lead ID is required." };
  let calls = Array.isArray(existing?.calls) ? existing.calls.map(normalizeCall).filter(Boolean) : [];
  if (draft.call) {
    const rec = normalizeCall({
      date: draft.call.date || todayISO(),
      outcome: draft.call.outcome,
      status: draft.call.status || status,
      next: draft.call.next,
      note: draft.call.note,
    });
    if (rec) {
      if (Number.isInteger(draft.callIndex) && draft.callIndex >= 0 && draft.callIndex < calls.length) {
        calls = calls.map((item, index) => (index === draft.callIndex ? rec : item));
      } else {
        calls = [...calls, rec];
      }
    }
  }
  const lastCall = calls[calls.length - 1];
  const nextStatus = draft.call?.status || status;
  const next = normalizeLead({
    id,
    date: draft.date,
    business,
    phone,
    email,
    address,
    businessType: String(draft.businessType || existing?.businessType || "").trim(),
    source: draft.source,
    service: draft.service,
    status: nextStatus,
    next: draft.call?.next ?? draft.next ?? existing?.next ?? "",
    notes: String(draft.notes || "").trim(),
    executive: String(draft.executive || existing?.executive || ""),
    clientCode: existing?.clientCode || (nextStatus === "Converted" ? nextSalesClientCode(data) : ""),
    calls,
  });
  if (lastCall && draft.call) {
    next.status = lastCall.status || next.status;
    next.next = lastCall.next || next.next;
  }
  if (next.status === "Converted" && !next.clientCode) next.clientCode = nextSalesClientCode(data);
  const currentLeads = Array.isArray(data.leads) ? data.leads : [];
  const leads = existing
    ? currentLeads.map((item) => (item.id === existing.id ? next : item))
    : [...currentLeads, next];
  const followUp = followUpFromLead(next);
  const followUps = (data.followUps || []).some((item) => item.id === next.id)
    ? data.followUps.map((item) => (item.id === next.id ? followUp : item))
    : next.status === "Converted" || next.status === "Lost" || next.next
      ? [...(data.followUps || []), followUp]
      : (data.followUps || []);
  const saved = { ...data, leads, followUps };
  publishIncoming(saved);
  return { ok: true, data: saved };
}

export function deleteLead(data, id) {
  const lead = (data.leads || []).find((item) => item.id === id);
  if (!lead) return { ok: false, error: "Lead not found." };
  const quotes = (data.quotes || []).filter((quote) => quote.clientId === id || quoteMatchesClient(quote, lead.business));
  const payments = (data.payments || []).filter((payment) => payment.clientId === id);
  if (quotes.length) return { ok: false, error: "This lead already has a quotation. Remove the quotation first." };
  if (payments.length) return { ok: false, error: "This lead already has a payment. Cancel the payment first." };
  const saved = {
    ...data,
    leads: (data.leads || []).filter((item) => item.id !== id),
    followUps: (data.followUps || []).filter((item) => item.id !== id),
  };
  publishIncoming(saved);
  return { ok: true, data: saved };
}

function canChangePackages() {
  return sessionAccount()?.role === "ceo";
}

export function loadCeoSales(username) {
  try {
    const stored = username ? readSalesAccount(username) : null;
    return withPackages(stored || blankSales());
  } catch {
    return withPackages(blankSales());
  }
}

export function saveCeoSales(username, data) {
  const session = sessionAccount();
  if (!username || session?.username !== username || session.role !== "ceo") return;
  const { packages, ...rest } = data;
  crmStorage.setItem(`${STORAGE_KEY}:${username}`, JSON.stringify(rest));
  publishLeadDirectory();
}

const CEO_SALES_KEY = "neon-crm-ceo-sales";
export const SALE_STATUSES = ["pending", "confirmed", "rejected"];
export const SALE_STATUS_LABEL = {
  pending: "Pending Approval",
  confirmed: "Confirmed",
  rejected: "Rejected",
};

function blankCeoSalesControl() {
  return {
    monthlyTarget: 0,
    dailyLeads: 0,
    dailyCalls: 0,
    defaultRate: 0,
    names: {},
    sales: [],
  };
}

export function loadCeoSalesControl() {
  try {
    const raw = JSON.parse(crmStorage.getItem(CEO_SALES_KEY) || "null");
    if (!raw || typeof raw !== "object") return blankCeoSalesControl();
    return {
      monthlyTarget: numberOr(raw.monthlyTarget, 0),
      dailyLeads: wholeNumber(raw.dailyLeads),
      dailyCalls: wholeNumber(raw.dailyCalls),
      defaultRate: numberOr(raw.defaultRate, 0),
      names: raw.names && typeof raw.names === "object" ? raw.names : {},
      sales: Array.isArray(raw.sales) ? raw.sales.map(normalizeManualSale).filter(Boolean) : [],
    };
  } catch {
    return blankCeoSalesControl();
  }
}

function saveCeoSalesControl(next) {
  const session = sessionAccount();
  if (session?.role !== "ceo") return;
  crmStorage.setItem(CEO_SALES_KEY, JSON.stringify(next));
}

function normalizeManualSale(item) {
  if (!item?.id || !item.business) return null;
  const status = SALE_STATUSES.includes(item.status) ? item.status : "pending";
  const id = paddedSaleCode("SL", item.id) || String(item.id);
  return {
    kind: "manual",
    id,
    saleId: id,
    date: String(item.date || ""),
    business: String(item.business || "").trim(),
    leadId: String(item.leadId || "").trim(),
    service: String(item.service || "").trim(),
    owner: String(item.owner || ""),
    amount: numberOr(item.amount, 0),
    collected: numberOr(item.collected, 0),
    status,
  };
}

export const UNASSIGNED_OWNER = "unassigned";

export function salesStaff() {
  return loadUsers().filter((user) => user.active && user.role === "sales");
}

export function salesStaffName(username) {
  if (!username || username === UNASSIGNED_OWNER) return "Not assigned";
  return String(loadCeoSalesControl().names?.[username] || username);
}

export function loadSalesAccountData(username) {
  try {
    return withPackages(readSalesAccount(username) || blankSales());
  } catch {
    return withPackages(blankSales());
  }
}

function addQuoteKeys(target, name, code) {
  const client = String(name || "").trim().toLowerCase();
  const id = String(code || "").trim().toLowerCase();
  if (client) target.names.add(client);
  if (id) target.codes.add(id);
}

function quoteRowsFor(match) {
  const rows = [];
  const seen = new Set();
  salesStaff().forEach((user) => {
    const data = loadSalesAccountData(user.username);
    (data.quotes || []).forEach((quote) => {
      if (!match(quote, data, user)) return;
      const key = `${user.username}:${quote.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        ...quote,
        salesOwner: user.username,
        serviceType: projectTypeFromQuote(quote),
        summary: quoteCollection(data, quote),
      });
    });
  });
  return rows.sort((a, b) => String(a.client || "").localeCompare(String(b.client || "")) || String(a.number || "").localeCompare(String(b.number || "")));
}

export function quotesForProjects(projects) {
  const keys = { names: new Set(), codes: new Set() };
  (projects || []).forEach((project) => {
    addQuoteKeys(keys, project?.client, project?.clientCode);
  });
  if (!keys.names.size && !keys.codes.size) {
    (projects || []).forEach((project) => addQuoteKeys(keys, project?.name, ""));
  }
  if (!keys.names.size && !keys.codes.size) return [];
  return quoteRowsFor((quote) => {
    const name = String(quote.client || "").trim().toLowerCase();
    const code = String(quote.clientCode || "").trim().toLowerCase();
    return (name && keys.names.has(name)) || (code && keys.codes.has(code));
  });
}

export function quotesByServiceType(types) {
  const allowed = Array.isArray(types) && types.length ? new Set(types) : null;
  return quoteRowsFor((quote) => !allowed || allowed.has(projectTypeFromQuote(quote)));
}

export function quotesForDelivery({ clients = [], projects = [], types } = {}) {
  const keys = { names: new Set(), codes: new Set() };
  const allowed = Array.isArray(types) && types.length ? new Set(types) : null;
  (clients || []).forEach((item) => addQuoteKeys(keys, item?.name || item?.client, item?.code || item?.clientCode));
  (projects || []).forEach((item) => addQuoteKeys(keys, item?.client || item?.name, item?.clientCode || item?.code));
  const approvedIds = new Set();
  salesStaff().forEach((user) => {
    const data = loadSalesAccountData(user.username);
    convertedClients(data).forEach((client) => addQuoteKeys(keys, client.business, client.clientCode));
    (data.payments || []).forEach((payment) => {
      if (!payment || payment.status === "cancelled") return;
      const approved = payment.approval === "approved" || (payment.status === "confirmed" && payment.approval !== "pending");
      if (!approved) return;
      if (payment.quoteId) approvedIds.add(`${user.username}:${payment.quoteId}`);
      addQuoteKeys(keys, payment.clientName, payment.clientCode);
    });
  });
  return quoteRowsFor((quote, data, user) => {
    if (allowed && !allowed.has(projectTypeFromQuote(quote))) return false;
    const name = String(quote.client || "").trim().toLowerCase();
    const code = String(quote.clientCode || "").trim().toLowerCase();
    return approvedIds.has(`${user.username}:${quote.id}`)
      || (name && keys.names.has(name))
      || (code && keys.codes.has(code));
  });
}

export function quoteForClientRecord(client) {
  const name = String(client?.name || client?.client || "").trim();
  const code = String(client?.code || client?.clientCode || "").trim();
  if (!name && !code) return null;
  const rows = quotesForProjects([{ client: name, clientCode: code }]);
  if (!rows.length) return null;
  return [...rows].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.number || "").localeCompare(String(a.number || "")))[0];
}

export function projectTypeFromQuote(quote) {
  const categories = [];
  (quote?.items || []).forEach((line) => {
    categories.push(packageCategory(line.category, line.service));
  });
  if (!categories.length) {
    String(quote?.service || "").split(",").forEach((part) => {
      const value = part.trim();
      if (value) categories.push(packageCategory(value, value));
    });
  }
  const unique = [...new Set(categories.filter(Boolean))];
  if (unique.includes("Both") || (unique.includes("Software development") && unique.includes("Marketing"))) return "both";
  if (unique.includes("Marketing") && !unique.includes("Software development")) return "marketing";
  return "software";
}

export function applyClientQuote(client) {
  const quote = quoteForClientRecord(client);
  return {
    quote,
    type: quote ? projectTypeFromQuote(quote) : "software",
    packageName: quote?.packageName || "",
    quoteNumber: quote?.number || "",
    quoteId: quote?.id || "",
    service: quote?.service || "",
  };
}

export function persistSalesAccount(username, data) {
  const session = sessionAccount();
  if (!username || session?.role !== "ceo") return;
  const { packages, ...rest } = data;
  crmStorage.setItem(`${STORAGE_KEY}:${username}`, JSON.stringify(rest));
  publishLeadDirectory();
  if (username !== UNASSIGNED_OWNER) publishIncomingFor(username, rest);
}

function isSalesUsername(username) {
  return salesStaff().some((user) => user.username === username);
}

export function companyLeads() {
  const fromStaff = salesStaff().flatMap((user) => (
    (loadSalesAccountData(user.username).leads || []).map((lead) => ({
      ...lead,
      owner: user.username,
      executive: lead.executive || user.username,
    }))
  ));
  const fromUnassigned = (loadSalesAccountData(UNASSIGNED_OWNER).leads || []).map((lead) => ({
    ...lead,
    owner: UNASSIGNED_OWNER,
    executive: "",
  }));
  return sortLeadsById([...fromStaff, ...fromUnassigned]);
}

export function companyConvertedQuotes() {
  return salesStaff().flatMap((user) => {
    const data = loadSalesAccountData(user.username);
    return convertedClients(data).map((client) => {
      const quote = quoteForClient(data, client.id, client.business);
      return {
        key: `${user.username}:${client.id}`,
        owner: user.username,
        client,
        quote,
        summary: quote ? quoteCollection(data, quote) : null,
        date: quote?.date || client.date || "",
      };
    });
  }).sort((a, b) => {
    const byDate = String(b.date).localeCompare(String(a.date));
    return byDate || String(a.client.business || "").localeCompare(String(b.client.business || ""));
  });
}

export function nextCompanyLeadId() {
  return nextLeadId();
}

function findLeadStore(id) {
  if (!id) return "";
  const stores = [...salesStaff().map((user) => user.username), UNASSIGNED_OWNER];
  return stores.find((username) => (loadSalesAccountData(username).leads || []).some((lead) => lead.id === id)) || "";
}

export function saveCompanyLead(draft) {
  const session = sessionAccount();
  if (session?.role !== "ceo") return { ok: false, error: "Only the CEO can assign company leads." };
  const assigned = String(draft.executive || "").trim();
  const isAssigned = assigned && assigned !== UNASSIGNED_OWNER && isSalesUsername(assigned);
  if (assigned && assigned !== UNASSIGNED_OWNER && !isAssigned) {
    return { ok: false, error: "Choose a salesperson." };
  }
  const storeAs = isAssigned ? assigned : UNASSIGNED_OWNER;
  const previousStore = findLeadStore(draft.id);
  if (previousStore && previousStore !== storeAs) {
    const from = loadSalesAccountData(previousStore);
    persistSalesAccount(previousStore, {
      ...from,
      leads: (from.leads || []).filter((item) => item.id !== draft.id),
      followUps: (from.followUps || []).filter((item) => item.id !== draft.id),
    });
  }
  const result = saveLead(loadSalesAccountData(storeAs), {
    ...draft,
    executive: isAssigned ? assigned : "",
  });
  if (!result.ok) return result;
  persistSalesAccount(storeAs, result.data);
  if (isAssigned && previousStore !== storeAs) {
    const saved = (result.data.leads || []).find((item) => item.id === draft.id) || draft;
    notifyUser(
      assigned,
      `The CEO assigned ${saved.business || "a lead"} (${saved.id || draft.id}) to you. Open Leads & Follow-ups.`
    );
  }
  return { ok: true };
}

function paymentSaleStatus(payment) {
  if (payment.status === "cancelled") return "rejected";
  if (payment.status === "confirmed" && payment.approval !== "pending") return "confirmed";
  return "pending";
}

export function companySalesRows() {
  ensureDepartmentSaleCodes();
  const rows = [];
  salesStaff().forEach((user) => {
    const data = loadSalesAccountData(user.username);
    (data.payments || []).forEach((payment) => {
      const quote = locateQuote(data, payment.quoteId);
      const saleId = paddedSaleCode("SID", payment.saleCode) || payment.saleCode || payment.id;
      rows.push({
        kind: "payment",
        id: payment.id,
        saleId,
        date: String(payment.date || ""),
        business: String(payment.clientName || quote?.client || "").trim(),
        leadId: "",
        service: String(quote?.service || quote?.packageName || payment.type || "").trim(),
        owner: user.username,
        amount: numberOr(quote?.total, 0) || numberOr(payment.amount, 0),
        collected: numberOr(payment.amount, 0),
        status: paymentSaleStatus(payment),
      });
    });
  });
  return [...rows, ...loadCeoSalesControl().sales];
}

export function nextManualSaleId(sales = loadCeoSalesControl().sales) {
  const used = usedSaleNumbers("SL", (sales || []).map((item) => item.id));
  return nextSaleCode("SL", used);
}

export function saveCeoManualSale(draft, originalId = "") {
  const session = sessionAccount();
  if (session?.role !== "ceo") return { ok: false, error: "Only the CEO can record this sale." };
  const business = String(draft.business || "").trim();
  const service = String(draft.service || "").trim();
  const owner = String(draft.owner || "").trim();
  const amount = Number(draft.amount);
  const collected = Number(draft.collected);
  const status = SALE_STATUSES.includes(draft.status) ? draft.status : "pending";
  if (!business) return { ok: false, error: "Client is required." };
  if (!draft.date) return { ok: false, error: "Sale date is required." };
  if (!service) return { ok: false, error: "Service / package is required." };
  if (!owner || !salesStaff().some((user) => user.username === owner)) {
    return { ok: false, error: "Choose a salesperson." };
  }
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "Sale value must be zero or more." };
  if (!Number.isFinite(collected) || collected < 0) return { ok: false, error: "Collected amount must be zero or more." };
  if (collected > amount) return { ok: false, error: "Collection cannot exceed sale value." };
  const control = loadCeoSalesControl();
  const id = paddedSaleCode("SL", draft.id) || String(draft.id || nextManualSaleId(control.sales)).trim();
  if (!id) return { ok: false, error: "Sale ID is required." };
  if (control.sales.some((item) => item.id === id && item.id !== originalId) || companySalesRows().some((item) => item.kind === "payment" && item.id === id)) {
    return { ok: false, error: "That sale ID is already used." };
  }
  const next = normalizeManualSale({
    id,
    date: draft.date,
    business,
    leadId: draft.leadId,
    service,
    owner,
    amount,
    collected,
    status,
  });
  const sales = originalId
    ? control.sales.map((item) => (item.id === originalId ? next : item))
    : [...control.sales, next];
  saveCeoSalesControl({ ...control, sales });
  return { ok: true };
}

export const OPEN_SALES_APPROVAL = "neon-crm-open-sales-approval";
export const CEO_SALES_TAB_KEY = "neon-crm-ceo-sales-tab";
export const CEO_SALES_FOCUS_KEY = "neon-crm-ceo-sales-focus";

export function openCeoSalesApprovals(detail = {}) {
  try {
    sessionStorage.setItem(CEO_SALES_TAB_KEY, "approvals");
    sessionStorage.setItem(CEO_SALES_FOCUS_KEY, detail.paymentId || "");
  } catch {
    // Tab still opens from the event even if sessionStorage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(OPEN_SALES_APPROVAL, { detail }));
}

export function ceoSetSaleStatus(row, status, patch = {}) {
  const session = sessionAccount();
  if (session?.role !== "ceo") return { ok: false, error: "Only the CEO can approve sales." };
  const nextStatus = SALE_STATUSES.includes(status) ? status : "pending";
  if (row.kind === "manual") {
    return saveCeoManualSale({ ...row, ...patch, status: nextStatus }, row.id);
  }
  const data = loadSalesAccountData(row.owner);
  const payment = (data.payments || []).find((item) => item.id === row.id);
  if (!payment) return { ok: false, error: "That sale was not found." };
  if (nextStatus === "rejected") {
    persistSalesAccount(row.owner, {
      ...data,
      payments: data.payments.map((item) => (item.id === row.id ? { ...item, status: "cancelled", approval: "" } : item)),
    });
    return { ok: true };
  }
  if (nextStatus === "confirmed") {
    const quote = locateQuote(data, payment.quoteId);
    if (quote) queueProjectInvoice(invoiceDraft(payment, quote, row.owner));
    const invoice = projectInvoiceFor(row.owner, row.id);
    if (invoice && invoice.approval !== "approved") {
      const result = approveProjectInvoice(invoice.id);
      if (!result.ok) return result;
      return { ok: true };
    }
    persistSalesAccount(row.owner, {
      ...data,
      payments: data.payments.map((item) => (
        item.id === row.id
          ? { ...item, status: "confirmed", approval: "approved" }
          : item
      )),
    });
    const clientName = payment.clientName || quote?.client || "";
    const lead = (data.leads || []).find((item) => item.id === payment.clientId || item.id === quote?.clientId)
      || (data.leads || []).find((item) => String(item.business || "").trim().toLowerCase() === String(clientName).trim().toLowerCase());
    rememberPayingClient({
      name: clientName,
      code: payment.clientCode || lead?.clientCode || quote?.clientCode || "",
      email: lead?.email || quote?.email || "",
      phone: lead?.phone || quote?.phone || "",
      address: lead?.address || quote?.address || "",
    });
    notifyRole("pm", `The CEO confirmed ${clientName || "a client"}. This client is now available under Clients.`);
    return { ok: true };
  }
  persistSalesAccount(row.owner, {
    ...data,
    payments: data.payments.map((item) => (
      item.id === row.id ? { ...item, status: "pending", approval: item.approval || "pending" } : item
    )),
  });
  return { ok: true };
}

export function staffCommissionRate(username) {
  const data = loadSalesAccountData(username);
  const personal = memberConfig(data, username).rate;
  if (personal != null) return personal;
  const rate = Number(data.rates?.rate);
  if (Number.isFinite(rate) && rate > 0) return rate;
  return Number(loadCeoSalesControl().defaultRate) || 0;
}

export function staffMonthlyTarget(username) {
  return memberConfig(loadSalesAccountData(username), username).target;
}

export function staffDailyGoals(username) {
  const data = username ? loadSalesAccountData(username) : null;
  return {
    leads: wholeNumber(data?.goals?.leadTarget),
    calls: wholeNumber(data?.goals?.daily),
  };
}

export function saveCeoStaffMember(username, draft) {
  const session = sessionAccount();
  if (session?.role !== "ceo") return { ok: false, error: "Only the CEO can change team targets." };
  if (!salesStaff().some((user) => user.username === username)) {
    return { ok: false, error: "That salesperson was not found." };
  }
  const name = String(draft.name || "").trim() || username;
  const target = Number(draft.target);
  const rate = Number(draft.rate);
  const dailyLeads = Number(draft.dailyLeads);
  const dailyCalls = Number(draft.dailyCalls);
  if (!Number.isFinite(target) || target < 0) return { ok: false, error: "Monthly target must be zero or more." };
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { ok: false, error: "Commission rate must be between 0 and 100." };
  if (!Number.isInteger(dailyLeads) || dailyLeads < 0 || !Number.isInteger(dailyCalls) || dailyCalls < 0) {
    return { ok: false, error: "Daily lead and call targets must be whole numbers, zero or more." };
  }
  const data = loadSalesAccountData(username);
  const member = memberConfig(data, username);
  persistSalesAccount(username, {
    ...data,
    rates: { ...data.rates, rate },
    goals: { ...data.goals, leadTarget: dailyLeads, daily: dailyCalls },
    team: { ...data.team, [username]: { ...member, target, rate } },
  });
  const control = loadCeoSalesControl();
  saveCeoSalesControl({ ...control, names: { ...control.names, [username]: name } });
  return { ok: true };
}

export function saveCeoOrgSettings(draft) {
  const session = sessionAccount();
  if (session?.role !== "ceo") return { ok: false, error: "Only the CEO can change these settings." };
  const monthlyTarget = Number(draft.monthlyTarget);
  const dailyLeads = Number(draft.dailyLeads);
  const dailyCalls = Number(draft.dailyCalls);
  const defaultRate = Number(draft.defaultRate);
  if (![monthlyTarget, dailyLeads, dailyCalls, defaultRate].every((value) => Number.isFinite(value) && value >= 0)) {
    return { ok: false, error: "Enter zero or more for each setting." };
  }
  if (!Number.isInteger(dailyLeads) || !Number.isInteger(dailyCalls)) {
    return { ok: false, error: "Daily lead and call targets must be whole numbers." };
  }
  const control = loadCeoSalesControl();
  saveCeoSalesControl({
    ...control,
    monthlyTarget,
    dailyLeads,
    dailyCalls,
    defaultRate,
  });
  return { ok: true };
}

export function inDateRange(value, from, to) {
  const day = String(value || "");
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function proratedTarget(monthly, from, to) {
  const amount = Number(monthly) || 0;
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (!amount || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
  let total = 0;
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 370) {
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    total += amount / days;
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return Math.round(total);
}

export function monthBounds(day = todayISO()) {
  const month = String(day).slice(0, 7);
  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
  };
}

export function savePackage(data, draft) {
  if (!canChangePackages()) return { ok: false, error: "Only the CEO can change packages." };
  const name = draft.name.trim();
  const scope = sanitizeScopeHtml(draft.scope);
  const price = Number(draft.price);
  if (!name || !scopeHasText(scope)) return { ok: false, error: "Package name and scope are required." };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: "Price must be greater than zero." };
  const current = loadPackages();
  const category = packageCategory(draft.category, draft.service);
  const cover = String(draft.cover || "").startsWith("data:image/") ? String(draft.cover) : "";
  const next = {
    id: draft.id || uid(),
    name,
    price,
    period: draft.period,
    service: category,
    category,
    scope,
    cover,
    coverFit: cover ? normalizeCoverFit(draft.coverFit) : defaultCoverFit(),
  };
  const exists = current.some((item) => item.id === next.id);
  const packages = exists ? current.map((item) => (item.id === next.id ? next : item)) : [...current, next];
  storePackages(packages);
  return { ok: true, data: { ...data, packages } };
}

export function deletePackage(data, id) {
  if (!canChangePackages()) return data;
  const packages = loadPackages().filter((item) => item.id !== id);
  storePackages(packages);
  return { ...data, packages };
}

export function saveGoals(data, draft) {
  const monthly = Number(draft.monthly);
  const projects = Number(draft.projects);
  const daily = Number(draft.daily);
  const target = Number(draft.target);
  if ([monthly, projects, daily, target].some((value) => !Number.isFinite(value) || value <= 0)) {
    return { ok: false, error: "Enter a positive goal for each field." };
  }
  if (!Number.isInteger(projects) || !Number.isInteger(daily)) {
    return { ok: false, error: "Project and call goals must be whole numbers." };
  }
  if (!draft.name.trim()) return { ok: false, error: "Campaign name is required." };
  if (!draft.start || !draft.end || draft.end < draft.start) {
    return { ok: false, error: "Campaign end must be on or after the start date." };
  }
  return {
    ok: true,
    data: {
      ...data,
      goals: { monthly, projects, daily },
      campaign: { name: draft.name.trim(), start: draft.start, end: draft.end, target },
    },
  };
}

export function saveRates(data, draft) {
  const rate = Number(draft.rate);
  const bonus = Number(draft.bonus);
  const threshold = Number(draft.threshold);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { ok: false, error: "Commission must be between 0 and 100." };
  if (!Number.isFinite(bonus) || bonus < 0) return { ok: false, error: "Bonus cannot be negative." };
  if (!Number.isFinite(threshold) || threshold <= 0) return { ok: false, error: "Bonus threshold must be greater than zero." };
  return { ok: true, data: { ...data, rates: { rate, bonus, threshold } } };
}

export function saveMember(data, username, draft) {
  const target = Number(draft.target);
  const salary = Number(draft.salary);
  const allowance = Number(draft.allowance);
  if (!Number.isFinite(target) || target <= 0) return { ok: false, error: "Monthly target must be greater than zero." };
  if (!Number.isFinite(salary) || salary < 0 || !Number.isFinite(allowance) || allowance < 0) {
    return { ok: false, error: "Salary and allowance cannot be negative." };
  }
  return {
    ok: true,
    data: { ...data, team: { ...data.team, [username]: { target, salary, allowance } } },
  };
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function quoteHasApprovedPayment(quoteId) {
  if (!quoteId) return false;
  try {
    return (loadFinance().projectInvoices || []).some((item) => item.quoteId === quoteId && item.approval === "approved");
  } catch {
    return false;
  }
}

export function quotationDocument(quote, heading = "QUOTATION") {
  if (String(heading || "").toUpperCase() === "INVOICE") {
    return invoiceDocumentFromQuote(quote, { approved: quoteHasApprovedPayment(quote?.id) });
  }
  const figures = quotationFigures(quote.price, quote.discount);
  const lines = quote.items?.length
    ? quote.items
    : [{ packageName: quote.packageName, price: quote.price, scope: quote.scope }];
  const rows = lines.map((line, index) => `<tr><td><strong>${index + 1}. ${escapeHtml(line.packageName)}</strong><div class="scope">${formatScopeHtml(line.scope)}</div></td><td>${escapeHtml(formatQuoteAmount(line.price))}</td></tr>`).join("");
  const percent = formatDiscountPercent(figures.percent);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(quote.number || heading)}</title><style>
    body{margin:0;background:#f3f1f6;color:#1c1a24;font:15px/1.45 "Segoe UI",Arial,sans-serif}
    .sheet{max-width:820px;margin:28px auto;background:#fff;border-radius:28px;padding:42px 48px 28px;box-shadow:0 12px 40px rgba(22,18,43,.08)}
    .head{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}
    .brand{display:flex;align-items:center}
    .brand .logo{height:52px;width:auto;display:block}
    .party{margin:18px 0 0;color:#3a3648;white-space:pre-wrap}
    .party strong{display:block;color:#1c1a24}
    .id{text-align:right}
    .id strong{display:block;letter-spacing:.14em;font-size:18px}
    .id span{display:block;margin-top:6px;color:#3a3648}
    hr{border:0;border-top:1.5px solid #1c1a24;margin:22px 0}
    table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #e4e0ea;border-radius:12px;overflow:hidden}
    th,td{padding:16px 18px;vertical-align:top;text-align:left}
    th{font-size:12px;letter-spacing:.08em;text-transform:uppercase}
    td p,td .scope{margin:6px 0 0;color:#5c566c} td .scope p,td .scope div{margin:0 0 6px} td .scope :last-child{margin-bottom:0}
    td:last-child,th:last-child{text-align:right;width:180px;font-variant-numeric:tabular-nums}
    tbody tr+tr td{border-top:1px solid #ece8f2}
    .totals{width:min(360px,100%);margin-left:auto;display:grid;gap:10px;padding:22px 4px 8px}
    .totals p{display:flex;justify-content:space-between;gap:18px;margin:0}
    .totals .discount{color:#1aa36a}
    .totals .grand{border-top:1px solid #e4e0ea;padding-top:12px;font-weight:700}
    .totals .grand span{max-width:140px}
    h3{margin:0 0 8px;font-size:16px}
    .terms p{margin:0;color:#3a3648;white-space:pre-wrap}
    footer{color:#6d687c;font-size:13px}
    button{margin:0 0 16px;padding:10px 14px;border:0;border-radius:8px;background:#873CFF;color:#fff;font-weight:700}
    @page{size:A4;margin:14mm}
    @media print{body{background:#fff}button{display:none}.sheet{margin:0;box-shadow:none;border-radius:0;max-width:none}}
  </style><body><button onclick="window.print()">Print / Save as PDF</button><article class="sheet"><header class="head"><div><div class="brand"><img class="logo" src="${neonLogo}" alt="NeonLabz" /></div><p class="party"><strong>${escapeHtml(quote.client)}</strong>${escapeHtml(quote.address || "")}</p></div><div class="id"><strong>${escapeHtml(heading)}</strong><span>#${escapeHtml(quote.number || "")}</span><span>${escapeHtml(formatQuoteDate(quote.date))}</span></div></header><hr><table><thead><tr><th>Description</th><th>Total (LKR)</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><p><span>Subtotal</span><strong>LKR ${escapeHtml(formatQuoteAmount(figures.subtotal))}</strong></p><p class="discount"><span>Special Discount (${percent}%)</span><strong>-LKR ${escapeHtml(formatQuoteAmount(figures.discount))}</strong></p><p><span>VAT (8%)</span><strong>LKR ${escapeHtml(formatQuoteAmount(figures.vat))}</strong></p><p class="grand"><span>Estimated Grand Total</span><strong>LKR ${escapeHtml(formatQuoteAmount(figures.grand))}</strong></p></div><hr><section class="terms"><h3>Terms &amp; Conditions</h3><p>${escapeHtml(quote.terms || "")}</p></section><hr><footer>Neonlabz (Pvt) Ltd.</footer></article></body></html>`;
}

export function paymentReceiptDocument(invoice) {
  if (!invoice) return "";
  const quote = allCeoQuotes().find((item) => item.id === invoice.quoteId);
  return invoiceDocumentFromPayment(invoice, quote);
}
