export const COMPANY = "company";

export const SHARED_KEYS = new Set([
  "neon-crm-packages",
  "neon-crm-finance",
  "neon-crm-hrms",
  "neon-crm-notices",
  "neon-crm-lead-index",
  "neon-crm-incoming-projects",
  "neon-crm-ceo-sales",
]);

const CEO_WRITE = new Set([
  "neon-crm-packages",
  "neon-crm-finance",
  "neon-crm-hrms",
  "neon-crm-ceo-sales",
]);

const SALES_WRITE = new Set(["neon-crm-lead-index", "neon-crm-incoming-projects"]);
const OPEN_WRITE = new Set(["neon-crm-notices"]);

const CEO_READ_ONLY = new Set(["neon-crm-finance", "neon-crm-ceo-sales"]);
const SALES_READ = new Set(["neon-crm-lead-index"]);

export function isCeo(username, role = "") {
  const value = String(username || "").trim().toUpperCase();
  return role === "ceo" || /^CEO\d{3}$/.test(value);
}

export function roleFromUsername(username) {
  const value = String(username || "").trim().toUpperCase();
  if (/^CEO\d{3}$/.test(value)) return "ceo";
  if (/^PM\d{3}$/.test(value)) return "pm";
  if (/^MD\d{3}$/.test(value)) return "marketing";
  if (/^SD\d{3}$/.test(value)) return "sales";
  if (/^EMP\d{3}$/.test(value)) return "employee";
  return null;
}

export function canWriteStore(user, key, owner) {
  if (!user?.username || !key) return false;
  const storeOwner = String(owner || COMPANY).trim() || COMPANY;
  if (user.role === "ceo") return true;
  if (storeOwner === user.username) return true;
  if (storeOwner !== COMPANY) return false;
  if (OPEN_WRITE.has(key)) return true;
  if (SALES_WRITE.has(key)) return user.role === "sales" || user.role === "ceo";
  if (CEO_WRITE.has(key)) return false;
  return false;
}

export function canReadStore(user, key, owner) {
  if (!user?.username || !key) return false;
  const storeOwner = String(owner || COMPANY).trim() || COMPANY;
  if (user.role === "ceo") return true;
  if (storeOwner === user.username) return true;
  if (storeOwner !== COMPANY) return false;
  if (CEO_READ_ONLY.has(key)) return false;
  if (SALES_READ.has(key)) return user.role === "sales";
  return SHARED_KEYS.has(key);
}
