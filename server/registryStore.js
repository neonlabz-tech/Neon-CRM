import { COMPANY } from "./access.js";
import { Store } from "./models.js";

export const REGISTRY_KEY = "neon-crm-registry";

const BOOKS = {
  leads: { prefix: "LEAD-", width: 4 },
  clients: { prefix: "CLI", width: 3 },
  projects: { prefix: "NPRJ", width: 3 },
};

export class RegistryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

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

function canonical(spec, code) {
  const number = codeNumber(spec.prefix, code);
  if (number) return formatCode(spec.prefix, spec.width, number);
  return String(code || "").trim().toUpperCase();
}

function phoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "").slice(0, 10);
}

function safeKey(value) {
  const key = String(value || "").trim();
  if (!key || key.includes(".") || key.includes("$")) return "";
  return key;
}

export function normalizeRegistry(raw) {
  const next = blank();
  if (!raw || typeof raw !== "object") return next;
  for (const book of Object.keys(BOOKS)) {
    const stored = raw[book];
    next[book].sequence = Number(stored?.sequence) || 0;
    const ids = stored?.ids && typeof stored.ids === "object" ? stored.ids : {};
    Object.keys(ids).forEach((id) => {
      const key = safeKey(canonical(BOOKS[book], id));
      if (key) next[book].ids[key] = true;
    });
    const numbers = Object.keys(next[book].ids).map((id) => codeNumber(BOOKS[book].prefix, id)).filter(Boolean);
    next[book].sequence = numbers.length ? Math.max(...numbers) : 0;
  }
  const phones = raw.phones && typeof raw.phones === "object" ? raw.phones : {};
  Object.entries(phones).forEach(([digits, id]) => {
    const key = phoneDigits(digits);
    const leadId = safeKey(id);
    if (key.length === 10 && leadId) next.phones[key] = leadId;
  });
  return next;
}

export async function ensureRegistry() {
  await Store.updateOne(
    { key: REGISTRY_KEY, owner: COMPANY },
    { $setOnInsert: { key: REGISTRY_KEY, owner: COMPANY, data: blank() } },
    { upsert: true }
  );
}

async function highestSavedLeadNumber() {
  const docs = await Store.find({ key: "neon-crm-sales" }).select("data.leads.id").lean();
  let highest = 0;
  for (const doc of docs) {
    for (const lead of doc.data?.leads || []) {
      highest = Math.max(highest, codeNumber("LEAD-", lead?.id));
    }
  }
  return highest;
}

function keptLeadIds(savedHighest, ids, { keepReservations = true } = {}) {
  const keep = new Set();
  Object.keys(ids || {}).forEach((id) => {
    const number = codeNumber("LEAD-", id);
    if (number > 0 && number <= savedHighest) keep.add(formatCode("LEAD-", 4, number));
  });
  if (!keepReservations) return keep;
  for (let number = savedHighest + 1; ; number += 1) {
    const id = formatCode("LEAD-", 4, number);
    if (!ids?.[id]) break;
    keep.add(id);
  }
  return keep;
}

async function dropPhantomLeadIds() {
  const highest = await highestSavedLeadNumber();
  const registry = await readRegistry();
  const keep = keptLeadIds(highest, registry.leads.ids);
  const unset = {};
  Object.keys(registry.leads.ids).forEach((id) => {
    if (!keep.has(id)) unset[`data.leads.ids.${id}`] = "";
  });
  const sequence = [...keep].reduce((max, id) => Math.max(max, codeNumber("LEAD-", id)), 0);
  if (!Object.keys(unset).length) return { highest, sequence };
  await Store.updateOne(
    { key: REGISTRY_KEY, owner: COMPANY },
    { $unset: unset, $set: { "data.leads.sequence": sequence } }
  );
  return { highest, sequence };
}

export async function unionRegistryIds(incoming) {
  const savedLead = await highestSavedLeadNumber();
  const normalized = normalizeRegistry(incoming);
  const registry = await readRegistry();
  const leadIds = { ...registry.leads.ids, ...normalized.leads.ids };
  const keepLeads = keptLeadIds(savedLead, leadIds, { keepReservations: false });
  const set = {};
  const max = {};
  const unset = {};
  Object.keys(registry.leads.ids).forEach((id) => {
    if (!keepLeads.has(id)) unset[`data.leads.ids.${id}`] = "";
  });
  for (const book of Object.keys(BOOKS)) {
    Object.keys(normalized[book].ids).forEach((id) => {
      if (book === "leads" && !keepLeads.has(id)) return;
      set[`data.${book}.ids.${id}`] = true;
    });
    const sequence = book === "leads"
      ? [...keepLeads].reduce((highest, id) => Math.max(highest, codeNumber("LEAD-", id)), 0)
      : normalized[book].sequence;
    if (sequence) max[`data.${book}.sequence`] = sequence;
  }
  if (!Object.keys(set).length && !Object.keys(max).length && !Object.keys(unset).length) return;
  await ensureRegistry();
  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(max).length) update.$max = max;
  if (Object.keys(unset).length) update.$unset = unset;
  await Store.updateOne({ key: REGISTRY_KEY, owner: COMPANY }, update);
}

async function readRegistry() {
  const doc = await Store.findOne({ key: REGISTRY_KEY, owner: COMPANY }).lean();
  return normalizeRegistry(doc?.data);
}

async function reserveExact(book, code) {
  const spec = BOOKS[book];
  const number = codeNumber(spec.prefix, code);
  const update = { $set: { [`data.${book}.ids.${code}`]: true } };
  if (number) update.$max = { [`data.${book}.sequence`]: number };
  return Store.findOneAndUpdate(
    { key: REGISTRY_KEY, owner: COMPANY, [`data.${book}.ids.${code}`]: { $exists: false } },
    update,
    { new: true }
  );
}

function highestNumber(book, ids) {
  const spec = BOOKS[book];
  let number = 0;
  Object.keys(ids || {}).forEach((id) => {
    number = Math.max(number, codeNumber(spec.prefix, id));
  });
  return number;
}

async function nextRegistryCode(book) {
  const spec = BOOKS[book];
  const registry = await readRegistry();
  let number = highestNumber(book, registry[book].ids);
  let code = "";
  do {
    number += 1;
    code = formatCode(spec.prefix, spec.width, number);
  } while (registry[book].ids[code]);
  return code;
}

export async function claimRegistryCode(book, preferred = "", { exact = false } = {}) {
  const spec = BOOKS[book];
  if (!spec) throw new RegistryError("Unknown ID book.", 400);
  await ensureRegistry();
  if (book === "leads") await dropPhantomLeadIds();
  const wanted = preferred ? safeKey(canonical(spec, preferred)) : "";
  if (exact) {
    if (!wanted) throw new RegistryError("ID is required.", 400);
    const reserved = await reserveExact(book, wanted);
    if (!reserved) throw new RegistryError("That ID is already used.", 409);
    return wanted;
  }
  const registry = await readRegistry();
  const wantedNumber = wanted ? codeNumber(spec.prefix, wanted) : 0;
  const nextNumber = highestNumber(book, registry[book].ids) + 1;
  if (wanted && wantedNumber && wantedNumber <= nextNumber && !registry[book].ids[wanted]) {
    const reserved = await reserveExact(book, wanted);
    if (reserved) return wanted;
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = await nextRegistryCode(book);
    const reserved = await reserveExact(book, code);
    if (reserved) return code;
  }
  throw new RegistryError("Could not reserve an ID. Try again.", 409);
}

export async function leadPhoneOwner(phone) {
  const digits = phoneDigits(phone);
  if (digits.length !== 10) return "";
  const registry = await readRegistry();
  return String(registry.phones[digits] || "");
}

export async function reserveLeadPhone(leadId, phone) {
  const id = safeKey(leadId);
  if (!id) throw new RegistryError("Lead ID is required.", 400);
  const digits = phoneDigits(phone);
  if (phone && digits.length !== 10) throw new RegistryError("Enter a 10-digit phone number.", 400);
  await ensureRegistry();
  if (digits.length === 10) {
    const reserved = await Store.findOneAndUpdate(
      {
        key: REGISTRY_KEY,
        owner: COMPANY,
        $or: [
          { [`data.phones.${digits}`]: { $exists: false } },
          { [`data.phones.${digits}`]: id },
        ],
      },
      { $set: { [`data.phones.${digits}`]: id } },
      { new: true }
    );
    if (!reserved) throw new RegistryError("This phone number already exists in the system.", 409);
  }
  const registry = await readRegistry();
  const unset = {};
  Object.entries(registry.phones).forEach(([key, holder]) => {
    if (holder === id && key !== digits) unset[`data.phones.${key}`] = "";
  });
  if (Object.keys(unset).length) {
    await Store.updateOne({ key: REGISTRY_KEY, owner: COMPANY }, { $unset: unset });
  }
  return true;
}

function leadPhoneKey(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("94") && digits.length > 10) digits = `0${digits.slice(2)}`;
  if (digits.length === 9) digits = `0${digits}`;
  return digits.slice(0, 10);
}

function leadIdentity(lead) {
  const phone = leadPhoneKey(lead?.phone);
  if (phone.length === 10) return phone;
  const name = String(lead?.business || lead?.name || "").trim().toLowerCase();
  return name ? `name:${name}` : "";
}

export function restoreClonedLeads(incoming, stored) {
  const incomingLeads = Array.isArray(incoming?.leads) ? incoming.leads : [];
  const counts = new Map();
  incomingLeads.forEach((lead) => {
    const key = leadPhoneKey(lead?.phone);
    if (key.length !== 10) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const cloned = new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
  if (!cloned.size) return incoming;
  const storedLeads = Array.isArray(stored?.leads) ? stored.leads : [];
  const seen = new Set();
  const leads = [];
  storedLeads.forEach((lead) => {
    const key = leadIdentity(lead);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const storedName = String(lead?.business || lead?.name || "").trim().toLowerCase();
    const edited = incomingLeads.find((item) => {
      const samePhone = leadPhoneKey(item?.phone) === leadPhoneKey(lead?.phone);
      const sameName = String(item?.business || item?.name || "").trim().toLowerCase() === storedName;
      return samePhone && sameName && storedName;
    });
    if (!edited) {
      leads.push(lead);
      return;
    }
    leads.push({
      ...lead,
      status: edited.status || lead.status,
      next: edited.next || lead.next,
      notes: edited.notes || lead.notes,
      calls: Array.isArray(edited.calls) && edited.calls.length ? edited.calls : (lead.calls || []),
    });
  });
  cloned.forEach((phone) => {
    if (seen.has(phone)) return;
    const group = incomingLeads.filter((lead) => leadPhoneKey(lead?.phone) === phone);
    const best = group.find((lead) => Array.isArray(lead.calls) && lead.calls.length) || group[0];
    if (!best) return;
    seen.add(phone);
    leads.push(best);
  });
  incomingLeads.forEach((lead) => {
    const phone = leadPhoneKey(lead?.phone);
    if (cloned.has(phone)) return;
    const key = leadIdentity(lead);
    if (!key || seen.has(key)) return;
    seen.add(key);
    leads.push(lead);
  });
  return { ...incoming, leads, followUps: Array.isArray(stored?.followUps) ? stored.followUps : incoming.followUps };
}

export function assignUniqueLeadIds(data, floor = 0, storedLeads = undefined) {
  if (!data || !Array.isArray(data.leads)) return data;
  const sequencingNewLeads = Array.isArray(storedLeads);
  const stored = new Set();
  let max = Number(floor) || 0;
  if (sequencingNewLeads) {
    storedLeads.forEach((lead) => {
      const number = codeNumber("LEAD-", lead?.id);
      if (!number) return;
      stored.add(formatCode("LEAD-", 4, number));
      max = Math.max(max, number);
    });
  }
  const seen = new Set();
  const leads = data.leads.map((lead) => {
    const number = codeNumber("LEAD-", lead?.id);
    const id = number ? formatCode("LEAD-", 4, number) : "";
    if (sequencingNewLeads) {
      if (id && stored.has(id)) return String(lead.id) === id ? lead : { ...lead, id };
      max += 1;
      const next = formatCode("LEAD-", 4, max);
      return { ...lead, id: next };
    }
    if (id && !seen.has(id)) {
      seen.add(id);
      max = Math.max(max, number);
      return String(lead.id) === id ? lead : { ...lead, id };
    }
    max += 1;
    while (seen.has(formatCode("LEAD-", 4, max))) max += 1;
    const next = formatCode("LEAD-", 4, max);
    seen.add(next);
    return { ...lead, id: next };
  });
  const byPhone = new Map();
  const byName = new Map();
  leads.forEach((lead) => {
    const digits = phoneDigits(lead.phone);
    const name = String(lead.business || lead.name || "").trim().toLowerCase();
    if (digits.length === 10) byPhone.set(digits, lead.id);
    if (name) byName.set(name, lead.id);
  });
  const followUps = Array.isArray(data.followUps)
    ? data.followUps.map((item) => {
      const digits = phoneDigits(item?.phone);
      const name = String(item?.name || "").trim().toLowerCase();
      const id = (digits.length === 10 && byPhone.get(digits)) || byName.get(name) || item?.id;
      return id && id !== item?.id ? { ...item, id } : item;
    })
    : data.followUps;
  return { ...data, leads, followUps };
}

export async function syncSavedLeadIds(leads, preservedIds = []) {
  const set = {};
  const saved = new Set();
  let sequence = 0;
  const remember = (value) => {
    const number = codeNumber("LEAD-", value);
    if (!number) return "";
    const id = formatCode("LEAD-", 4, number);
    saved.add(id);
    set[`data.leads.ids.${id}`] = true;
    sequence = Math.max(sequence, number);
    return id;
  };
  (leads || []).forEach((lead) => {
    const id = remember(lead?.id);
    const digits = phoneDigits(lead?.phone);
    if (id && digits.length === 10) set[`data.phones.${digits}`] = id;
  });
  preservedIds.forEach((id) => remember(id));
  await ensureRegistry();
  const registry = await readRegistry();
  const unset = {};
  Object.keys(registry.leads.ids || {}).forEach((id) => {
    const number = codeNumber("LEAD-", id);
    const canonical = number ? formatCode("LEAD-", 4, number) : "";
    if (!saved.has(canonical)) unset[`data.leads.ids.${id}`] = "";
  });
  Object.entries(registry.phones || {}).forEach(([digits, holder]) => {
    const number = codeNumber("LEAD-", holder);
    const canonical = number ? formatCode("LEAD-", 4, number) : "";
    if (canonical && !saved.has(canonical) && !set[`data.phones.${digits}`]) unset[`data.phones.${digits}`] = "";
  });
  const update = { $set: { ...set, "data.leads.sequence": sequence } };
  if (Object.keys(unset).length) update.$unset = unset;
  if (!Object.keys(set).length && !Object.keys(unset).length) return;
  await Store.updateOne({ key: REGISTRY_KEY, owner: COMPANY }, update);
}

export async function releaseLeadPhone(leadId) {
  const id = safeKey(leadId);
  if (!id) return false;
  const registry = await readRegistry();
  const unset = {};
  Object.entries(registry.phones).forEach(([key, holder]) => {
    if (holder === id) unset[`data.phones.${key}`] = "";
  });
  if (!Object.keys(unset).length) return false;
  await Store.updateOne({ key: REGISTRY_KEY, owner: COMPANY }, { $unset: unset });
  return true;
}
