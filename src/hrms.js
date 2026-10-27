import { USER_DEPARTMENTS, createUser, deleteUser, issueEmployeeLogin, loadUsers, renameUser, updateUser } from "./crm.js";
import { crmStorage } from "./storage.js";

const STORAGE_KEY = "neon-crm-hrms";

export const MEMBER_TYPES = [
  { id: "admin", label: "Admin" },
  { id: "team", label: "Team member" },
];

export const LEAVE_TYPES = ["Medical Leave", "Casual Leave", "Annual Leave", "Short Leave", "Non-approved Leave"];
export const HR_ROLES = ["Intern", "Trainee", "Junior", "Associate", "Senior", "Manager", "Custom Role"];
export const ACTIVITY_CATEGORIES = ["Sports Event", "Team Meeting", "Office Celebration", "Company Function"];
export const EMPLOYMENT_STATUSES = ["Active", "Resigned", "Terminated"];
export const ACTIVITY_STATUSES = ["Scheduled", "Completed"];

function emptyStore() {
  return { employees: [], leaves: [], activities: [], departments: [], sequence: 0 };
}

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loadHrms() {
  try {
    const raw = JSON.parse(crmStorage.getItem(STORAGE_KEY) || "null");
    const data = normalizeStore(raw);
    const hadPayroll = Boolean(raw && typeof raw === "object" && "payroll" in raw);
    if (!data.codesChanged && !hadPayroll) return data;
    const { codesChanged, ...stored } = data;
    saveHrms(stored);
    return stored;
  } catch {
    return emptyStore();
  }
}

export function saveHrms(data) {
  crmStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function commit(data) {
  try {
    saveHrms(data);
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Could not store this change. Download a backup before closing the page." };
  }
}

function normalizeStore(raw) {
  const base = emptyStore();
  if (!raw || typeof raw !== "object") return base;
  const departments = Array.isArray(raw.departments) ? raw.departments.map(normalizeDepartment).filter(Boolean) : [];
  const store = {
    employees: Array.isArray(raw.employees) ? raw.employees.map(normalizeEmployee).filter(Boolean) : [],
    leaves: Array.isArray(raw.leaves) ? raw.leaves.map(normalizeLeave).filter(Boolean) : [],
    activities: Array.isArray(raw.activities) ? raw.activities.map(normalizeActivity).filter(Boolean) : [],
    departments,
    sequence: Number.isInteger(raw.sequence) && raw.sequence >= 0 ? raw.sequence : 0,
  };
  const coded = withEmployeeCodes(store.employees);
  let linked = false;
  const employees = coded.employees.map((employee) => {
    if (departments.some((item) => item.id === employee.department)) return employee;
    const match = departments.find((item) => item.role === employee.department);
    if (!match) return employee;
    linked = true;
    return { ...employee, department: match.id };
  });
  return {
    ...store,
    employees,
    sequence: Math.max(store.sequence, coded.max),
    codesChanged: coded.changed || linked,
  };
}

function normalizeDepartment(item) {
  if (!item?.id || !String(item.name || "").trim()) return null;
  const kind = USER_DEPARTMENTS.find((entry) => entry.role === item.role);
  if (!kind) return null;
  return {
    id: String(item.id),
    name: String(item.name).trim(),
    role: kind.role,
    prefix: kind.prefix,
  };
}

function normalizeEmployee(item) {
  if (!item?.id || !item.name) return null;
  return {
    id: String(item.id),
    code: String(item.code || ""),
    name: String(item.name),
    email: String(item.email || ""),
    phone: String(item.phone || ""),
    join: String(item.join || ""),
    role: String(item.role || "Intern"),
    status: EMPLOYMENT_STATUSES.includes(item.status) ? item.status : "Active",
    department: String(item.department || ""),
    memberType: item.memberType === "admin" ? "admin" : "team",
    username: String(item.username || ""),
  };
}

function normalizeLeave(item) {
  if (!item?.id || !item.employeeId) return null;
  return {
    id: String(item.id),
    employeeId: String(item.employeeId),
    date: String(item.date || ""),
    type: LEAVE_TYPES.includes(item.type) ? item.type : LEAVE_TYPES[0],
    description: String(item.description || ""),
  };
}

function normalizeActivity(item) {
  if (!item?.id || !item.name) return null;
  return {
    id: String(item.id),
    name: String(item.name),
    category: ACTIVITY_CATEGORIES.includes(item.category) ? item.category : ACTIVITY_CATEGORIES[1],
    date: String(item.date || ""),
    description: String(item.description || ""),
    status: ACTIVITY_STATUSES.includes(item.status) ? item.status : "Scheduled",
  };
}

export function employeeById(data, id) {
  return data.employees.find((employee) => employee.id === id) || null;
}

function employeeNumber(code) {
  const match = /^EMP(\d+)$/i.exec(String(code || "").trim());
  return match ? Number(match[1]) : 0;
}

function formatEmployeeCode(number) {
  return `EMP${String(number).padStart(3, "0")}`;
}

function withEmployeeCodes(employees) {
  const used = new Set();
  let max = 0;
  for (const employee of employees) {
    if (employee.memberType === "admin") continue;
    const number = employeeNumber(employee.code);
    if (!number || used.has(number)) continue;
    used.add(number);
    max = Math.max(max, number);
  }
  let changed = false;
  const next = employees.map((employee) => {
    if (employee.memberType === "admin") {
      if (!employee.code) return employee;
      changed = true;
      return { ...employee, code: "" };
    }
    const number = employeeNumber(employee.code);
    if (number && used.has(number) && employee.code === formatEmployeeCode(number)) return employee;
    max += 1;
    while (used.has(max)) max += 1;
    used.add(max);
    changed = true;
    return { ...employee, code: formatEmployeeCode(max) };
  });
  return { employees: next, changed, max };
}

function nextEmployeeCode(employees) {
  let max = 0;
  for (const employee of employees) max = Math.max(max, employeeNumber(employee.code));
  return formatEmployeeCode(max + 1);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function saveDepartment(data, draft) {
  const name = String(draft.name || "").trim();
  const kind = USER_DEPARTMENTS.find((entry) => entry.role === draft.role);
  if (!name) return { ok: false, error: "Enter the department name." };
  if (!kind) return { ok: false, error: "Choose how the admin of this department signs in." };
  const departments = data.departments || [];
  if (departments.some((item) => item.id !== draft.id && item.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: "A department with this name already exists." };
  }
  const existing = departments.find((item) => item.id === draft.id);
  if (draft.id && !existing) return { ok: false, error: "That department was not found." };
  if (existing && existing.role !== kind.role && data.employees.some((employee) => employee.department === existing.id)) {
    return { ok: false, error: "This department already has people, so its admin sign-in cannot change." };
  }
  const next = { id: existing?.id || uid(), name, role: kind.role, prefix: kind.prefix };
  return commit({
    ...data,
    departments: existing ? departments.map((item) => (item.id === next.id ? next : item)) : [...departments, next],
  });
}

export function deleteDepartment(data, id) {
  const departments = data.departments || [];
  if (!departments.some((item) => item.id === id)) return { ok: false, error: "That department was not found." };
  if (data.employees.some((employee) => employee.department === id)) {
    return { ok: false, error: "Remove the people in this department before deleting it." };
  }
  return commit({ ...data, departments: departments.filter((item) => item.id !== id) });
}

export function nextTeamCode(data) {
  return nextEmployeeCode(data.employees || []);
}

export async function saveEmployee(data, draft) {
  const name = draft.name.trim();
  const email = draft.email.trim();
  const phone = formatPhone(draft.phone);
  const role = draft.role === "Custom Role" ? draft.customRole.trim() : draft.role;
  const department = (data.departments || []).find((entry) => entry.id === draft.department);
  if (!name || !email || !phone || !draft.join || !role) return { ok: false, error: "Complete the employee details." };
  if (!validEmail(email)) return { ok: false, error: "Enter a valid email address." };
  if (phone.replace(/\D/g, "").length !== 10) return { ok: false, error: "Enter a 10-digit phone number as 000-000-0000." };
  if (!EMPLOYMENT_STATUSES.includes(draft.status)) return { ok: false, error: "Choose an employment status." };
  if (!department) return { ok: false, error: "Choose a department. Add the department before adding people." };
  if (!MEMBER_TYPES.some((entry) => entry.id === draft.memberType)) return { ok: false, error: "Choose Admin or Team member." };
  if (data.employees.some((employee) => employee.id !== draft.id && employee.email.toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: "This email is already assigned to an employee." };
  }
  const existing = data.employees.find((employee) => employee.id === draft.id);
  if (draft.id && !existing) return { ok: false, error: "That employee was not found." };
  const keptCode = draft.memberType === "team" && existing?.memberType === "team" ? employeeNumber(existing.code) : 0;
  const code = draft.memberType === "admin" ? "" : (keptCode ? formatEmployeeCode(keptCode) : nextEmployeeCode(data.employees));
  const access = await syncMemberAccess(existing, draft, department, code);
  if (!access.ok) return access;
  const sequence = Math.max(data.sequence, employeeNumber(code));
  const next = {
    id: existing?.id || uid(),
    code,
    name,
    email,
    phone,
    join: draft.join,
    role,
    status: draft.status,
    department: department.id,
    memberType: draft.memberType,
    username: draft.memberType === "team" ? code : access.username,
  };
  const listed = existing
    ? data.employees.map((employee) => (employee.id === next.id ? next : employee))
    : [...data.employees, next];
  const coded = withEmployeeCodes(listed);
  let employees = coded.employees.map((employee) => (
    employee.memberType === "team" ? { ...employee, username: employee.code } : employee
  ));
  const savedEmployee = employees.find((employee) => employee.id === next.id);
  if (savedEmployee?.memberType === "team" && access.username && savedEmployee.code && savedEmployee.code !== access.username) {
    const renamed = renameUser(access.username, savedEmployee.code);
    if (!renamed.ok) {
      employees = employees.map((employee) => (
        employee.id === next.id ? { ...employee, code: access.username, username: access.username } : employee
      ));
    }
  }
  const stored = commit({
    ...data,
    sequence: Math.max(sequence, coded.max),
    employees,
  });
  const login = employees.find((employee) => employee.id === next.id);
  const loginName = login?.memberType === "team" ? login.username : access.username;
  if (!stored.ok) {
    if (access.created) deleteUser(access.created);
    if (loginName && loginName !== access.created) deleteUser(loginName);
    return stored;
  }
  if (access.retire) await deleteUser(access.retire);
  if (loginName) {
    const status = await updateUser(loginName, { active: draft.status === "Active" });
    if (!status.ok) return status;
  }
  return stored;
}

async function syncMemberAccess(existing, draft, department, code) {
  if (draft.memberType === "admin") {
    const access = await syncAdminAccess(existing, draft, department);
    if (!access.ok) return access;
    const previousTeam = existing?.memberType === "team" ? String(existing.code || "").toUpperCase() : "";
    return { ...access, retire: access.retire || previousTeam };
  }
  const password = String(draft.password || "").trim();
  const confirm = String(draft.confirm || "").trim();
  const loginName = String(code || "").toUpperCase();
  const previousAdmin = existing?.memberType === "admin" ? existing.username : "";
  const known = loadUsers().find((user) => user.username === loginName);
  if (password && password !== confirm) return { ok: false, error: "Passwords do not match." };
  if (!known) {
    if (password.length < 8) return { ok: false, error: "Use at least 8 characters for the password." };
    const issued = await issueEmployeeLogin(loginName, password);
    if (!issued.ok) return issued;
    return { ok: true, username: loginName, retire: previousAdmin, created: loginName };
  }
  if (password) {
    const updated = await updateUser(loginName, { password });
    if (!updated.ok) return updated;
  }
  return { ok: true, username: loginName, retire: previousAdmin && previousAdmin !== loginName ? previousAdmin : "", created: "" };
}

async function syncAdminAccess(existing, draft, department) {
  const currentName = existing?.memberType === "admin" ? existing.username : "";
  const password = String(draft.password || "").trim();
  const confirm = String(draft.confirm || "").trim();
  if (draft.memberType !== "admin") return { ok: true, username: "", retire: currentName, created: "" };
  if (currentName && existing.department === department.id) {
    const known = loadUsers().find((user) => user.username === currentName);
    if (!known) {
      if (!password || password.length < 8) {
        return { ok: false, error: "Set a password of at least 8 characters so this person can sign in." };
      }
      if (password !== confirm) return { ok: false, error: "Passwords do not match." };
      const issued = await createUser(department.role, password, currentName);
      if (!issued.ok) return issued;
      return { ok: true, username: currentName, retire: "", created: currentName };
    }
    if (password || confirm) {
      if (password.length < 8) return { ok: false, error: "Use at least 8 characters for the password." };
      if (password !== confirm) return { ok: false, error: "Passwords do not match." };
      const updated = await updateUser(currentName, { password });
      if (!updated.ok) return updated;
    }
    return { ok: true, username: currentName, retire: "", created: "" };
  }
  const kept = currentName ? loadUsers().find((user) => user.username === currentName) : null;
  if (kept && !password) {
    return { ok: true, username: currentName, retire: "", created: "" };
  }
  const issuedPassword = password;
  if (!issuedPassword || issuedPassword.length < 8) return { ok: false, error: "Use at least 8 characters for the password." };
  if (password && password !== confirm) return { ok: false, error: "Passwords do not match." };
  const issued = await createUser(department.role, issuedPassword, currentName);
  if (!issued.ok) return issued;
  return { ok: true, username: issued.user.username, retire: currentName, created: issued.user.username };
}

export function saveLeave(data, draft) {
  const description = draft.description.trim();
  if (!employeeById(data, draft.employeeId)) return { ok: false, error: "Select a valid employee." };
  if (!draft.date || !LEAVE_TYPES.includes(draft.type) || !description) return { ok: false, error: "Complete the required fields." };
  const existing = data.leaves.find((leave) => leave.id === draft.id);
  if (draft.id && !existing) return { ok: false, error: "That leave record was not found." };
  const next = {
    id: existing?.id || uid(),
    employeeId: draft.employeeId,
    date: draft.date,
    type: draft.type,
    description,
  };
  return commit({
    ...data,
    leaves: existing ? data.leaves.map((leave) => (leave.id === next.id ? next : leave)) : [...data.leaves, next],
  });
}

export function saveActivity(data, draft) {
  const name = draft.name.trim();
  const description = draft.description.trim();
  if (!name || !draft.date || !description) return { ok: false, error: "Complete the required fields." };
  if (!ACTIVITY_CATEGORIES.includes(draft.category) || !ACTIVITY_STATUSES.includes(draft.status)) {
    return { ok: false, error: "Choose a category and a status." };
  }
  const existing = data.activities.find((activity) => activity.id === draft.id);
  if (draft.id && !existing) return { ok: false, error: "That activity was not found." };
  const next = {
    id: existing?.id || uid(),
    name,
    category: draft.category,
    date: draft.date,
    description,
    status: draft.status,
  };
  return commit({
    ...data,
    activities: existing
      ? data.activities.map((activity) => (activity.id === next.id ? next : activity))
      : [...data.activities, next],
  });
}

export function teamMembersFor(role) {
  const data = loadHrms();
  const departments = data.departments || [];
  const matched = new Set(departments.filter((item) => item.role === role).map((item) => item.id));
  const people = (data.employees || []).filter((person) => person.memberType === "team" && person.code);
  const inRole = people.filter((person) => matched.has(person.department));
  if (inRole.length || role === "marketing") return inRole;
  const marketing = new Set(departments.filter((item) => item.role === "marketing").map((item) => item.id));
  return people.filter((person) => !marketing.has(person.department));
}

export function deleteHrmsRecord(data, tab, id) {
  if (tab === "employees" && data.leaves.some((leave) => leave.employeeId === id)) {
    return { ok: false, error: "This employee has linked leave records. Change their employment status to retain history." };
  }
  const key = tab === "employees" ? "employees" : tab === "leaves" ? "leaves" : "activities";
  const record = data[key].find((item) => item.id === id);
  if (!record) return { ok: false, error: "That record was not found." };
  const stored = commit({ ...data, [key]: data[key].filter((item) => item.id !== id) });
  if (stored.ok && key === "employees" && record.username) deleteUser(record.username);
  return stored;
}
