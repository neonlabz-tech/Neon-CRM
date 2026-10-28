import { api } from "./api.js";

const COMPANY = "company";
const SHARED_KEYS = new Set([
  "neon-crm-packages",
  "neon-crm-finance",
  "neon-crm-hrms",
  "neon-crm-notices",
  "neon-crm-lead-index",
  "neon-crm-incoming-projects",
  "neon-crm-paying-clients",
  "neon-crm-ceo-sales",
  "neon-crm-users",
]);

let memory = new Map();
let users = [];
const dirty = new Set();
let flushTimer = 0;
let flushing = false;

function parseKey(fullKey) {
  const value = String(fullKey || "");
  const split = value.lastIndexOf(":");
  if (split > 0 && !SHARED_KEYS.has(value)) {
    return { key: value.slice(0, split), owner: value.slice(split + 1) };
  }
  return { key: value, owner: COMPANY };
}

function storeKey(key, owner) {
  if (!owner || owner === COMPANY || SHARED_KEYS.has(key)) return key;
  return `${key}:${owner}`;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = 0;
    flushStores();
  }, 250);
}

export async function flushStores() {
  if (flushing || dirty.size === 0) return;
  const keys = [...dirty];
  dirty.clear();
  flushing = true;
  try {
    await api("/api/stores/batch", {
      method: "PUT",
      body: {
        items: keys.map((fullKey) => {
          const parsed = parseKey(fullKey);
          if (!memory.has(fullKey)) return { ...parsed, deleted: true };
          let data = null;
          try {
            data = JSON.parse(memory.get(fullKey));
          } catch {
            data = memory.get(fullKey);
          }
          return { ...parsed, data };
        }),
      },
    });
  } catch (error) {
    keys.forEach((key) => dirty.add(key));
    console.error("Could not save CRM data.", error);
  } finally {
    flushing = false;
    if (dirty.size) scheduleFlush();
  }
}

export const crmStorage = {
  getItem(key) {
    return memory.has(key) ? memory.get(key) : null;
  },
  setItem(key, value) {
    memory.set(String(key), String(value));
    dirty.add(String(key));
    scheduleFlush();
  },
  removeItem(key) {
    memory.delete(String(key));
    dirty.add(String(key));
    scheduleFlush();
  },
  key(index) {
    return [...memory.keys()][index] ?? null;
  },
  get length() {
    return memory.size;
  },
};

export function getUsers() {
  return users.map((user) => ({ ...user }));
}

export function setUsers(next) {
  users = Array.isArray(next) ? next.map((user) => ({ ...user })) : [];
}

export async function persistUsers(next) {
  setUsers(next);
  const data = await api("/api/users", { method: "PUT", body: { users: next } });
  if (Array.isArray(data.users)) setUsers(data.users);
}

export async function hydrateFromApi() {
  const data = await api("/api/bootstrap");
  memory = new Map();
  dirty.clear();
  (data.stores || []).forEach((item) => {
    memory.set(storeKey(item.key, item.owner), JSON.stringify(item.data ?? null));
  });
  setUsers(data.users || []);
  return data;
}

export async function clearOwnerStores(owner) {
  await api(`/api/stores/owner/${encodeURIComponent(owner)}`, { method: "DELETE" });
  [...memory.keys()].forEach((key) => {
    if (key.endsWith(`:${owner}`)) {
      memory.delete(key);
      dirty.delete(key);
    }
  });
}

export { parseKey, storeKey };
