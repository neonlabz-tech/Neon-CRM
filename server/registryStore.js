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
    next[book].sequence = Math.max(next[book].sequence, ...numbers, 0);
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

export async function unionRegistryIds(incoming) {
  const normalized = normalizeRegistry(incoming);
  const set = {};
  const max = {};
  for (const book of Object.keys(BOOKS)) {
    Object.keys(normalized[book].ids).forEach((id) => {
      set[`data.${book}.ids.${id}`] = true;
    });
    if (normalized[book].sequence) max[`data.${book}.sequence`] = normalized[book].sequence;
  }
  if (!Object.keys(set).length && !Object.keys(max).length) return;
  await ensureRegistry();
  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(max).length) update.$max = max;
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

export async function claimRegistryCode(book, preferred = "", { exact = false } = {}) {
  const spec = BOOKS[book];
  if (!spec) throw new RegistryError("Unknown ID book.", 400);
  await ensureRegistry();
  const wanted = preferred ? safeKey(canonical(spec, preferred)) : "";
  if (exact) {
    if (!wanted) throw new RegistryError("ID is required.", 400);
    const reserved = await reserveExact(book, wanted);
    if (!reserved) throw new RegistryError("That ID is already used.", 409);
    return wanted;
  }
  if (wanted) {
    const reserved = await reserveExact(book, wanted);
    if (reserved) return wanted;
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const bumped = await Store.findOneAndUpdate(
      { key: REGISTRY_KEY, owner: COMPANY },
      { $inc: { [`data.${book}.sequence`]: 1 } },
      { new: true }
    );
    const sequence = Number(bumped?.data?.[book]?.sequence) || 0;
    if (!sequence) continue;
    const code = formatCode(spec.prefix, spec.width, sequence);
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
