import { readSession } from "./api.js";
import { crmStorage } from "./storage.js";

const REGISTRY_KEY = "neon-crm-registry";

const BOOKS = {
  leads: { prefix: "LEAD-", width: 4 },
  clients: { prefix: "CLI", width: 3 },
  projects: { prefix: "NPRJ", width: 3 },
};

function blank() {
  return {
    leads: { sequence: 0, ids: {} },
    clients: { sequence: 0, ids: {} },
    projects: { sequence: 0, ids: {} },
    phones: {},
  };
}

function codeNumber(prefix, code) {
  const match = new RegExp(`^${prefix}(\\d+)$`, "i").exec(String(code || "").trim());
  return match ? Number(match[1]) : 0;
}

function formatCode(prefix, width, number) {
  return `${prefix}${String(number).padStart(width, "0")}`;
}

function load() {
  try {
    const raw = JSON.parse(crmStorage.getItem(REGISTRY_KEY) || "null");
    const next = blank();
    if (!raw || typeof raw !== "object") return next;
    for (const book of Object.keys(BOOKS)) {
      const stored = raw[book];
      next[book].sequence = Number(stored?.sequence) || 0;
      next[book].ids = stored?.ids && typeof stored.ids === "object" ? { ...stored.ids } : {};
    }
    next.phones = raw.phones && typeof raw.phones === "object" ? { ...raw.phones } : {};
    return next;
  } catch {
    return blank();
  }
}

function save(registry) {
  crmStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
}

function registryRequest(method, path, body) {
  if (typeof XMLHttpRequest === "undefined") return null;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open(method, path, false);
    xhr.withCredentials = true;
    if (body !== undefined) xhr.setRequestHeader("Content-Type", "application/json");
    const token = readSession()?.token || "";
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(body === undefined ? null : JSON.stringify(body));
    let data = {};
    try {
      data = JSON.parse(xhr.responseText || "{}");
    } catch {
      data = {};
    }
    if (xhr.status === 409) return { conflict: true, ...data };
    if (xhr.status < 200 || xhr.status >= 300) return null;
    return data;
  } catch {
    return null;
  }
}

function canonical(spec, code) {
  const number = codeNumber(spec.prefix, code);
  if (number) return formatCode(spec.prefix, spec.width, number);
  return String(code || "").trim().toUpperCase();
}

function remember(book, code) {
  const spec = BOOKS[book];
  const value = String(code || "").trim();
  if (!spec || !value) return;
  const registry = load();
  const key = canonical(spec, value);
  if (!key) return;
  registry[book].ids[key] = true;
  registry[book].sequence = Math.max(registry[book].sequence, codeNumber(spec.prefix, key));
  save(registry);
}

function taken(book, code) {
  const spec = BOOKS[book];
  const value = String(code || "").trim();
  if (!spec || !value) return false;
  return Boolean(load()[book].ids[canonical(spec, value)]);
}

function refreshRegistry() {
  const remote = registryRequest("GET", "/api/bootstrap");
  const stores = Array.isArray(remote?.stores) ? remote.stores : null;
  if (!stores) return;
  const registry = load();
  const record = stores.find((item) => item?.key === REGISTRY_KEY);
  const incoming = record?.data && typeof record.data === "object" ? record.data : {};
  for (const book of Object.keys(BOOKS)) {
    const ids = incoming[book]?.ids && typeof incoming[book].ids === "object" ? incoming[book].ids : {};
    Object.keys(ids).forEach((id) => {
      const key = canonical(BOOKS[book], id);
      if (key) registry[book].ids[key] = true;
    });
  }
  stores.forEach((item) => {
    if (item?.key !== "neon-crm-sales" || !item.data) return;
    const leads = [
      ...(Array.isArray(item.data.leads) ? item.data.leads : []),
      ...(Array.isArray(item.data.followUps) ? item.data.followUps : []),
    ];
    leads.forEach((lead) => {
      const key = canonical(BOOKS.leads, lead?.id);
      if (key) registry.leads.ids[key] = true;
    });
  });
  for (const book of Object.keys(BOOKS)) {
    const numbers = Object.keys(registry[book].ids).map((id) => codeNumber(BOOKS[book].prefix, id)).filter(Boolean);
    registry[book].sequence = Math.max(registry[book].sequence, Number(incoming[book]?.sequence) || 0, ...numbers, 0);
  }
  const phones = incoming.phones && typeof incoming.phones === "object" ? incoming.phones : {};
  Object.entries(phones).forEach(([digits, id]) => {
    const key = String(digits || "").replace(/\D/g, "").slice(0, 10);
    if (key.length === 10 && id && !registry.phones[key]) registry.phones[key] = id;
  });
  crmStorage.keep(REGISTRY_KEY, JSON.stringify(registry));
}

function suggest(book) {
  refreshRegistry();
  const spec = BOOKS[book];
  const registry = load();
  let sequence = registry[book].sequence;
  let code = "";
  do {
    sequence += 1;
    code = formatCode(spec.prefix, spec.width, sequence);
  } while (registry[book].ids[code]);
  return code;
}

function claim(book, preferred = "", options = {}) {
  const exact = Boolean(options.exact);
  const remote = registryRequest("POST", "/api/registry/claim", { book, preferred, exact });
  if (remote?.conflict) return "";
  if (remote?.code) {
    remember(book, remote.code);
    return remote.code;
  }
  const spec = BOOKS[book];
  const registry = load();
  const wanted = String(preferred || "").trim();
  const normalized = wanted ? canonical(spec, wanted) : "";
  if (exact && (!normalized || registry[book].ids[normalized])) return "";
  let code = normalized && !registry[book].ids[normalized] ? normalized : "";
  let sequence = registry[book].sequence;
  if (!code) {
    do {
      sequence += 1;
      code = formatCode(spec.prefix, spec.width, sequence);
    } while (registry[book].ids[code]);
  }
  registry[book].ids[code] = true;
  registry[book].sequence = Math.max(sequence, codeNumber(spec.prefix, code));
  save(registry);
  return code;
}

export function noteLeadId(id) {
  remember("leads", id);
}

export function noteClientCode(code) {
  remember("clients", code);
}

export function noteProjectCode(code) {
  remember("projects", code);
}

export function leadIdTaken(id) {
  return taken("leads", id);
}

export function clientCodeTaken(code) {
  return taken("clients", code);
}

export function projectIdTaken(code) {
  return taken("projects", code);
}

export function suggestLeadId() {
  return suggest("leads");
}

export function suggestClientCode() {
  return suggest("clients");
}

export function suggestProjectCode() {
  return suggest("projects");
}

export function claimLeadId(preferred = "", options = {}) {
  return claim("leads", preferred, options);
}

export function claimClientCode(preferred = "", options = {}) {
  return claim("clients", preferred, options);
}

export function claimProjectCode(preferred = "", options = {}) {
  return claim("projects", preferred, options);
}

export function syncLeadPhones(phones) {
  const registry = load();
  Object.entries(phones || {}).forEach(([digits, id]) => {
    if (digits && id && !registry.phones[digits]) registry.phones[digits] = id;
  });
  save(registry);
}

export function leadPhoneHolder(phone) {
  const digits = String(phone || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length !== 10) return "";
  const remote = registryRequest("GET", `/api/registry/phone?phone=${encodeURIComponent(digits)}`);
  if (remote && remote.ok && typeof remote.holder === "string") return remote.holder;
  return String(load().phones[digits] || "");
}

export function rememberLeadPhone(leadId, phone) {
  const id = String(leadId || "").trim();
  const digits = String(phone || "").replace(/\D/g, "").slice(0, 10);
  if (!id) return false;
  const remote = registryRequest("POST", "/api/registry/phone", { leadId: id, phone: digits });
  if (remote?.conflict) return false;
  const registry = load();
  const holder = digits.length === 10 ? registry.phones[digits] : "";
  if (!remote?.ok && holder && holder !== id) return false;
  Object.keys(registry.phones).forEach((key) => {
    if (registry.phones[key] === id && key !== digits) delete registry.phones[key];
  });
  if (digits.length === 10) registry.phones[digits] = id;
  save(registry);
  return true;
}

export function forgetLeadPhone(leadId) {
  const id = String(leadId || "").trim();
  if (!id) return;
  registryRequest("POST", "/api/registry/phone/release", { leadId: id });
  const registry = load();
  let changed = false;
  Object.keys(registry.phones).forEach((key) => {
    if (registry.phones[key] === id) {
      delete registry.phones[key];
      changed = true;
    }
  });
  if (changed) save(registry);
}
