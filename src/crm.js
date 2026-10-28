import { api } from "./api.js";
import { clearOwnerStores, crmStorage, getUsers, persistUsers, setUsers } from "./storage.js";

export const USER_DEPARTMENTS = [
  { role: "pm", label: "Project manager", prefix: "PM", hint: "Use this for a Technical department. The admin signs in as PM001, PM002, and onward." },
  { role: "marketing", label: "Marketing admin", prefix: "MD", hint: "Use this for a Marketing department. The admin signs in as MD001, MD002, and onward." },
  { role: "sales", label: "Sales admin", prefix: "SD", hint: "Use this for a Sales department. The admin signs in as SD001, SD002, and onward." },
];

const ACCOUNT_BASES = [
  "neon-crm-projects",
  "neon-crm-marketing",
  "neon-crm-tasks",
  "neon-crm-issues",
  "neon-crm-clients",
  "neon-crm-team",
  "neon-crm-sales",
  "neon-crm-reports",
  "neon-crm-activity",
];

export const ROLE_META = {
  ceo: {
    label: "Chief Executive Officer",
    short: "CEO",
    home: "overview",
  },
  pm: {
    label: "Project Manager",
    short: "Projects",
    home: "pm-overview",
  },
  marketing: {
    label: "Marketing",
    short: "Marketing",
    home: "marketing-overview",
  },
  sales: {
    label: "Sales Admin",
    short: "Sales",
    home: "sales-overview",
  },
  employee: {
    label: "Employee",
    short: "Work",
    home: "employee-home",
  },
};

const NAV = [
  {
    id: "overview",
    label: "Overview",
    roles: ["ceo"],
    access: { ceo: "full" },
  },
  {
    id: "own-projects",
    label: "Own projects",
    roles: ["ceo"],
    access: { ceo: "full" },
    children: [
      { id: "own-project-list", label: "Projects" },
      { id: "own-leads", label: "Leads & Follow-ups" },
      { id: "own-clients", label: "Clients" },
      { id: "own-marketing", label: "Marketing" },
      { id: "own-payments", label: "Payments" },
    ],
  },
  {
    id: "pm-overview",
    label: "Overview",
    roles: ["pm"],
    access: { pm: "full" },
  },
  {
    id: "projects",
    label: "Projects",
    roles: ["ceo", "pm"],
    access: { ceo: "view", pm: "full" },
  },
  {
    id: "task",
    label: "Task",
    roles: ["pm"],
    access: { pm: "full" },
  },
  {
    id: "issues",
    label: "Issues",
    roles: ["pm"],
    access: { pm: "full" },
  },
  {
    id: "clients",
    label: "Clients",
    roles: ["pm"],
    access: { pm: "full" },
  },
  {
    id: "packages",
    label: "Packages",
    roles: ["pm"],
    access: { pm: "view" },
  },
  {
    id: "reports",
    label: "Reports",
    roles: ["pm"],
    access: { pm: "full" },
  },
  {
    id: "team",
    label: "Team",
    roles: ["pm"],
    access: { pm: "view" },
  },
  {
    id: "marketing-overview",
    label: "Overview",
    roles: ["marketing"],
    access: { marketing: "full" },
  },
  {
    id: "marketing-projects",
    label: "Project maintenance",
    roles: ["marketing"],
    access: { marketing: "full" },
  },
  {
    id: "marketing-tasks",
    label: "Tasks",
    roles: ["marketing"],
    access: { marketing: "full" },
  },
  {
    id: "marketing-issues",
    label: "Issues",
    roles: ["marketing"],
    access: { marketing: "full" },
  },
  {
    id: "marketing",
    label: "Marketing",
    roles: ["ceo", "pm", "marketing"],
    access: { ceo: "view", pm: "view", marketing: "full" },
  },
  {
    id: "ceo-sales",
    label: "Sales",
    roles: ["ceo"],
    access: { ceo: "full" },
  },
  {
    id: "sales-overview",
    label: "Overview",
    roles: ["sales"],
    access: { sales: "full" },
  },
  {
    id: "sales-sample",
    label: "Quotation",
    roles: ["sales"],
    access: { sales: "full" },
  },
  {
    id: "sales-payments",
    label: "Payments",
    roles: ["sales"],
    access: { sales: "full" },
  },
  {
    id: "sales-follow",
    label: "Leads & Follow-ups",
    roles: ["sales"],
    access: { sales: "full" },
  },
  {
    id: "sales-packages",
    label: "Packages",
    roles: ["sales"],
    access: { sales: "view" },
  },
  {
    id: "ceo-packages",
    label: "Packages",
    roles: ["ceo"],
    access: { ceo: "full" },
  },
  {
    id: "hrms",
    label: "HRMS",
    roles: ["ceo"],
    access: { ceo: "full" },
  },
  {
    id: "finance",
    label: "Finance",
    roles: ["ceo"],
    access: { ceo: "full" },
  },
  {
    id: "users",
    label: "User Management",
    roles: ["ceo"],
    access: { ceo: "full" },
  },
  {
    id: "employee-home",
    label: "Dashboard",
    roles: ["employee"],
    access: { employee: "full" },
  },
  {
    id: "employee-projects",
    label: "My projects",
    roles: ["employee"],
    access: { employee: "full" },
  },
  {
    id: "employee-tasks",
    label: "My tasks",
    roles: ["employee"],
    access: { employee: "full" },
  },
  {
    id: "employee-productivity",
    label: "Productivity",
    roles: ["employee"],
    access: { employee: "full" },
  },
  {
    id: "employee-activity",
    label: "My activity",
    roles: ["employee"],
    access: { employee: "full" },
  },
];

export function roleFromUsername(username) {
  const value = username.trim().toUpperCase();
  if (/^CEO\d{3}$/.test(value)) return "ceo";
  if (/^PM\d{3}$/.test(value)) return "pm";
  if (/^MD\d{3}$/.test(value)) return "marketing";
  if (/^SD\d{3}$/.test(value)) return "sales";
  if (/^EMP\d{3}$/.test(value)) return "employee";
  return null;
}

function departmentLabel(role) {
  if (role === "ceo") return "Chief Executive Officer";
  if (role === "employee") return "Employee";
  return USER_DEPARTMENTS.find((item) => item.role === role)?.label ?? "";
}

function normalizeUser(user) {
  const username = String(user.username || "").trim().toUpperCase();
  const role = roleFromUsername(username);
  return {
    username,
    password: user.password ? String(user.password) : "",
    role,
    department: departmentLabel(role),
    passwordSource: user.passwordSource === "updated" ? "updated" : "issued",
    passwordUpdatedAt: user.passwordUpdatedAt ?? null,
    active: user.active !== false,
  };
}

function clearAccountStore(username) {
  if (!username) return;
  for (const base of ACCOUNT_BASES) crmStorage.removeItem(`${base}:${username}`);
  clearOwnerStores(username).catch(() => {});
}

function dropNonCeoUsers() {
  let stored = [];
  try {
    const raw = JSON.parse(localStorage.getItem(USERS_KEY) || "null");
    stored = Array.isArray(raw) ? raw : [];
  } catch {
    stored = [];
  }
  stored.forEach((user) => {
    const username = String(user?.username || "").trim().toUpperCase();
    const role = roleFromUsername(username);
    if (role && role !== "ceo") clearAccountStore(username);
  });
  const extraKeys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    const owner = key && /:([A-Z]+\d{3})$/.exec(key)?.[1];
    if (owner && roleFromUsername(owner) && roleFromUsername(owner) !== "ceo") extraKeys.push(key);
  }
  extraKeys.forEach((key) => localStorage.removeItem(key));
  let ceos = stored.filter((user) => roleFromUsername(String(user?.username || "").trim().toUpperCase()) === "ceo");
  if (!ceos.some((user) => String(user.username || "").trim().toUpperCase() === "CEO001")) {
    ceos = [{ ...SEED_USERS[0] }, ...ceos];
  }
  localStorage.setItem(
    USERS_KEY,
    JSON.stringify(
      ceos.map((user) => ({
        username: String(user.username || "").trim().toUpperCase(),
        password: String(user.password || ""),
        passwordSource: user.passwordSource === "updated" ? "updated" : "issued",
        passwordUpdatedAt: user.passwordUpdatedAt ?? null,
        active: user.active !== false,
      }))
    )
  );
  try {
    const raw = sessionStorage.getItem("neon-crm-session");
    const session = raw ? JSON.parse(raw) : null;
    if (roleFromUsername(String(session?.username || "")) !== "ceo") {
      sessionStorage.removeItem("neon-crm-session");
    }
  } catch {
    sessionStorage.removeItem("neon-crm-session");
  }
}

function purgeNonCeoUserTraces() {
  try {
    const hrms = JSON.parse(localStorage.getItem("neon-crm-hrms") || "null");
    if (hrms && typeof hrms === "object") {
      const kept = Array.isArray(hrms.employees)
        ? hrms.employees.filter((person) => roleFromUsername(String(person?.username || person?.code || "").trim().toUpperCase()) === "ceo")
        : [];
      const keptIds = new Set(kept.map((person) => person.id));
      localStorage.setItem(
        "neon-crm-hrms",
        JSON.stringify({
          ...hrms,
          employees: kept,
          leaves: Array.isArray(hrms.leaves) ? hrms.leaves.filter((leave) => keptIds.has(leave.employeeId)) : [],
        })
      );
    }
  } catch {
    // Employee records are dropped with the user list even if this store cannot be read.
  }
  try {
    const control = JSON.parse(localStorage.getItem("neon-crm-ceo-sales") || "null");
    if (control && typeof control === "object") {
      const names = {};
      if (control.names && typeof control.names === "object") {
        Object.entries(control.names).forEach(([username, name]) => {
          if (roleFromUsername(String(username || "").trim().toUpperCase()) === "ceo") names[username] = name;
        });
      }
      localStorage.setItem(
        "neon-crm-ceo-sales",
        JSON.stringify({
          ...control,
          names,
          sales: Array.isArray(control.sales)
            ? control.sales.filter((sale) => {
                const owner = roleFromUsername(String(sale?.owner || "").trim().toUpperCase());
                return !owner || owner === "ceo";
              })
            : [],
        })
      );
    }
  } catch {
    // Sales staff names are dropped with the user list even if this store cannot be read.
  }
}

function clearDummyRecords() {
  if (localStorage.getItem(CLEAR_DUMMY_KEY) === "1") return;
  let users = [];
  try {
    const raw = JSON.parse(localStorage.getItem(USERS_KEY) || "null");
    users = Array.isArray(raw) ? raw : [];
  } catch {
    users = [];
  }
  const keep = new Set([USERS_KEY, USERS_RESET_KEY, FRESH_START_KEY, CLEAR_DUMMY_KEY]);
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("neon-crm-") && !keep.has(key)) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
  if (users.length) localStorage.setItem(USERS_KEY, JSON.stringify(users));
  localStorage.setItem(USERS_RESET_KEY, "1");
  localStorage.setItem(FRESH_START_KEY, "1");
  localStorage.setItem(CLEAR_DUMMY_KEY, "1");
}

function clearDummyKeepUsers() {
  if (localStorage.getItem(CLEAR_DUMMY_KEEP_USERS_KEY) === "1") return;
  let users = [];
  try {
    const raw = JSON.parse(localStorage.getItem(USERS_KEY) || "null");
    users = Array.isArray(raw) ? raw : [];
  } catch {
    users = [];
  }
  const keep = new Set([
    USERS_KEY,
    USERS_RESET_KEY,
    FRESH_START_KEY,
    CLEAR_DUMMY_KEY,
    CEO_CREDENTIALS_KEY,
    CLEAR_DUMMY_KEEP_USERS_KEY,
    CEO_CREDENTIALS_ONLY_V2,
    CEO_USERS_ONLY_V3,
  ]);
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("neon-crm-") && !keep.has(key)) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
  if (users.length) localStorage.setItem(USERS_KEY, JSON.stringify(users));
  localStorage.setItem(CLEAR_DUMMY_KEEP_USERS_KEY, "1");
}

export function loadUsers() {
  const stored = getUsers();
  if (!Array.isArray(stored) || stored.length === 0) return [];
  return stored.map(normalizeUser).filter((user) => user.role);
}

async function saveLogin({ username, password, active = true }) {
  try {
    const data = await api("/api/users", {
      method: "POST",
      body: {
        username,
        active,
        ...(password ? { password } : {}),
      },
    });
    if (Array.isArray(data.users)) setUsers(data.users);
    return { ok: true, user: data.user };
  } catch (error) {
    return { ok: false, error: error.message || "Could not save this login." };
  }
}

function writeUsers(users) {
  const payload = users.map((user) => ({
    username: user.username,
    ...(user.password ? { password: user.password } : {}),
    passwordSource: user.passwordSource,
    passwordUpdatedAt: user.passwordUpdatedAt,
    active: user.active !== false,
  }));
  persistUsers(payload).catch((error) => {
    console.error(error);
  });
}

export function nextUsername(users, prefix) {
  const highest = users.reduce((max, user) => {
    if (!user.username.startsWith(prefix)) return max;
    const value = Number(user.username.slice(prefix.length));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}

export async function issueEmployeeLogin(username, password) {
  const code = username.trim().toUpperCase();
  if (roleFromUsername(code) !== "employee") return { ok: false, error: "Employee username must look like EMP001." };
  const trimmed = password.trim();
  if (trimmed.length < 8) return { ok: false, error: "Use at least 8 characters for the password." };
  return saveLogin({ username: code, password: trimmed, active: true });
}

export async function createUser(role, password, reservedUsername = "") {
  const department = USER_DEPARTMENTS.find((item) => item.role === role);
  if (!department) return { ok: false, error: "Choose a department." };
  const trimmed = password.trim();
  if (trimmed.length < 8) {
    return { ok: false, error: "Use at least 8 characters for the password." };
  }
  const reserved = String(reservedUsername || "").trim().toUpperCase();
  const username = reserved || nextUsername(loadUsers(), department.prefix);
  if (roleFromUsername(username) !== role) {
    return { ok: false, error: "That username does not match this department." };
  }
  return saveLogin({ username, password: trimmed, active: true });
}

export function changePassword(username, currentPassword, nextPassword) {
  const users = loadUsers();
  const value = username.trim().toUpperCase();
  const trimmed = nextPassword.trim();
  const match = users.find((user) => user.username === value);
  if (!match || match.password !== currentPassword) {
    return { ok: false, error: "Current password is incorrect." };
  }
  if (trimmed.length < 8) {
    return { ok: false, error: "Use at least 8 characters for the new password." };
  }
  if (trimmed === match.password) {
    return { ok: false, error: "Choose a password that is different from the current one." };
  }
  const updated = users.map((user) =>
    user.username === value
      ? {
          ...user,
          password: trimmed,
          passwordSource: "updated",
          passwordUpdatedAt: new Date().toISOString(),
        }
      : user
  );
  writeUsers(updated);
  return { ok: true, user: updated.find((user) => user.username === value) };
}

export async function viewStoredPassword(username, ceoPassword) {
  try {
    const data = await api("/api/users/password-view", {
      method: "POST",
      body: { username, password: ceoPassword },
    });
    return {
      ok: true,
      viewable: Boolean(data.viewable),
      password: data.viewable ? String(data.password || "") : "",
      message: data.message || "",
    };
  } catch (error) {
    return { ok: false, error: error.message || "Password is incorrect." };
  }
}

export async function verifyPassword(username, password) {
  try {
    await api("/api/auth/verify", { method: "POST", body: { username, password } });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || "Password is incorrect." };
  }
}

export async function updateUser(username, { password, active }) {
  const value = username.trim().toUpperCase();
  const match = loadUsers().find((user) => user.username === value);
  const trimmed = typeof password === "string" ? password.trim() : "";
  if (!match && !trimmed) {
    return { ok: false, error: "Set a password of at least 8 characters so this person can sign in." };
  }
  if (trimmed && trimmed.length < 8) {
    return { ok: false, error: "Use at least 8 characters for the password." };
  }
  if (match?.role === "ceo" && active === false) {
    return { ok: false, error: "The CEO account stays active." };
  }
  return saveLogin({
    username: value,
    password: trimmed || undefined,
    active: typeof active === "boolean" ? active : match?.active !== false,
  });
}

export function deleteUser(username) {
  const users = loadUsers();
  const value = username.trim().toUpperCase();
  const match = users.find((user) => user.username === value);
  if (!match) return { ok: false, error: "That account was not found." };
  if (match.role === "ceo") return { ok: false, error: "The CEO account cannot be deleted." };
  clearAccountStore(value);
  writeUsers(users.filter((user) => user.username !== value));
  return { ok: true };
}

export function findAccount(username) {
  const value = String(username || "").trim().toUpperCase();
  if (!value) return null;
  return loadUsers().find((user) => user.username === value) || null;
}

export function renameUser(from, to) {
  const source = String(from || "").trim().toUpperCase();
  const target = String(to || "").trim().toUpperCase();
  if (!source || !target || source === target) return { ok: true };
  const users = loadUsers();
  if (!users.some((user) => user.username === source)) return { ok: false, error: "That account was not found." };
  if (users.some((user) => user.username === target)) return { ok: false, error: "That username is already used." };
  writeUsers(users.map((user) => (user.username === source ? { ...user, username: target } : user)));
  return { ok: true };
}

export function findUser(username) {
  const value = username.trim().toUpperCase();
  return loadUsers().find((user) => user.username === value);
}

export function navForRole(role) {
  return NAV.filter((item) => item.roles.includes(role));
}

export function findNav(pageId) {
  for (const item of NAV) {
    if (item.id === pageId) return item;
    const child = item.children?.find((entry) => entry.id === pageId);
    if (child) return { ...child, roles: item.roles, access: item.access, parentId: item.id };
  }
  return null;
}

export function accessFor(role, pageId) {
  const page = findNav(pageId);
  if (!page || !page.roles.includes(role)) return null;
  return page.access[role];
}

export const RECORDS = {
  projects: [],
  marketing: [],
  sales: [],
};
