import { loadUsers } from "./crm.js";
import { loadIncomingProjects, projectTypeFromQuote, quoteForClientRecord, salesClientByName } from "./sales.js";
import { readAccount, readScoped, sessionAccount, writeScoped } from "./scope.js";
import { crmStorage } from "./storage.js";

const STORAGE_KEY = "neon-crm-projects";

export function loadProjects() {
  try {
    const data = readScoped(STORAGE_KEY);
    if (!data || !Array.isArray(data.projects)) return { projects: [], meetings: [] };
    return {
      projects: data.projects.map((project) => ({
        ...project,
        type: projectTypeOf(project),
        clientId: project.clientId || "",
        assignees: normalizeAssignees(project.assignees),
        marketingAssignees: normalizeAssignees(project.marketingAssignees),
        milestones: Array.isArray(project.milestones) ? project.milestones.map((item) => normalizeMilestone(item, project.type)) : [],
      })),
      meetings: Array.isArray(data.meetings) ? data.meetings : [],
    };
  } catch {
    return { projects: [], meetings: [] };
  }
}

export function saveProjects(data) {
  writeScoped(STORAGE_KEY, data);
}

export function companyProjects() {
  const rows = [];
  const seen = new Set();
  loadUsers()
    .filter((user) => user.active && (user.role === "pm" || user.role === "ceo"))
    .forEach((user) => {
      const stored = readAccount(STORAGE_KEY, user.username);
      const projects = Array.isArray(stored?.projects) ? stored.projects : [];
      projects.forEach((project) => {
        const name = String(project.name || "").trim();
        if (!name || !project.id) return;
        const id = `${user.username}:${project.id}`;
        if (seen.has(id)) return;
        seen.add(id);
        rows.push({
          id,
          code: [user.username, project.code].filter(Boolean).join(" · "),
          name: project.archived ? `${name} (archived)` : name,
          client: String(project.client || "").trim(),
          owner: user.username,
        });
      });
    });
  loadIncomingProjects().forEach((project) => {
    if (!project.id || seen.has(project.id)) return;
    seen.add(project.id);
    rows.push({
      id: project.id,
      code: project.salesOwner,
      name: project.name,
      client: String(project.client || project.name || "").trim(),
      owner: project.salesOwner,
    });
  });
  return rows.sort((a, b) => `${a.owner} ${a.name}`.localeCompare(`${b.owner} ${b.name}`));
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function projectCodeNumber(code) {
  const match = /^(?:NPRJ|PRJ-?)(\d+)$/i.exec(String(code || "").trim());
  return match ? Number(match[1]) : 0;
}

export function formatProjectCode(number) {
  return `NPRJ${String(number).padStart(3, "0")}`;
}

export function canonicalProjectCode(code) {
  const number = projectCodeNumber(code);
  return number ? formatProjectCode(number) : "";
}

export function nextProjectCode(projects, extraCodes = []) {
  let max = 0;
  for (const project of projects) max = Math.max(max, projectCodeNumber(project.code));
  for (const code of extraCodes) max = Math.max(max, projectCodeNumber(code));
  return formatProjectCode(max + 1);
}

function projectOwners() {
  return loadUsers().filter((user) => user.active && (user.role === "pm" || user.role === "ceo" || user.role === "marketing"));
}

function accountProjectStore(username) {
  const stored = readAccount(STORAGE_KEY, username);
  return {
    raw: stored && typeof stored === "object"
      ? { ...stored, projects: Array.isArray(stored.projects) ? stored.projects : [], meetings: Array.isArray(stored.meetings) ? stored.meetings : [] }
      : { projects: [], meetings: [] },
  };
}

export function allProjectRecords() {
  const rows = [];
  projectOwners().forEach((user) => {
    accountProjectStore(user.username).raw.projects.forEach((project) => {
      if (!project?.id) return;
      rows.push({
        ...project,
        type: projectTypeOf(project),
        owner: user.username,
        code: project.code || "",
        client: String(project.client || "").trim(),
      });
    });
  });
  return rows;
}

export function companyProjectCodes(exceptMarketingId = "") {
  const codes = allProjectRecords().map((project) => project.code);
  loadUsers()
    .filter((user) => user.active && (user.role === "pm" || user.role === "ceo" || user.role === "marketing"))
    .forEach((user) => {
      const stored = readAccount("neon-crm-marketing", user.username);
      (Array.isArray(stored?.clients) ? stored.clients : []).forEach((doc) => {
        if (exceptMarketingId && doc.id === exceptMarketingId) return;
        codes.push(doc.projectId);
      });
    });
  return codes.filter(Boolean);
}

export function nextCompanyProjectCode(extraCodes = []) {
  return nextProjectCode([], [...companyProjectCodes(), ...extraCodes]);
}

export function projectCodeTaken(code, { exceptMarketingId = "", clientName = "" } = {}) {
  const want = (canonicalProjectCode(code) || String(code || "").trim()).toLowerCase();
  if (!want) return false;
  for (const item of companyProjectCodes(exceptMarketingId)) {
    const value = (canonicalProjectCode(item) || String(item || "").trim()).toLowerCase();
    if (value === want) {
      const project = allProjectRecords().find((row) => (canonicalProjectCode(row.code) || "").toLowerCase() === want);
      if (!project) return true;
      const sameClient = clientName && project.client.toLowerCase() === String(clientName).trim().toLowerCase();
      const marketingType = project.type === "marketing" || project.type === "both";
      if (!(sameClient && marketingType)) return true;
    }
  }
  return false;
}

export function withProjectCodes(projects, extraCodes = []) {
  const reserved = new Set();
  for (const code of extraCodes) {
    const number = projectCodeNumber(code);
    if (number) reserved.add(number);
  }
  const used = new Set();
  let max = 0;
  const assigned = new Map();
  let changed = false;
  for (const project of [...projects].reverse()) {
    const number = projectCodeNumber(project.code);
    const canonical = number ? formatProjectCode(number) : "";
    if (canonical && !used.has(number)) {
      used.add(number);
      max = Math.max(max, number);
      if (project.code !== canonical) {
        assigned.set(project.id, canonical);
        changed = true;
      }
      continue;
    }
    if (canonical && project.code === canonical) continue;
    if (project.code && !number) continue;
    max = Math.max(max, ...used, ...reserved, 0);
    max += 1;
    while (used.has(max) || reserved.has(max)) max += 1;
    used.add(max);
    assigned.set(project.id, formatProjectCode(max));
    changed = true;
  }
  if (!changed) return { projects, changed: false };
  return {
    changed: true,
    projects: projects.map((project) => (assigned.has(project.id) ? { ...project, code: assigned.get(project.id) } : project)),
  };
}

export function blankProject() {
  return {
    id: uid(),
    name: "",
    client: "",
    clientId: "",
    type: "software",
    status: "in-progress",
    startDate: "",
    dueDate: "",
    description: "",
    archived: false,
    milestones: [],
    assignees: [],
    marketingAssignees: [],
    packageName: "",
    quoteNumber: "",
    quoteId: "",
    service: "",
  };
}

export function projectTypeOf(project) {
  return project?.type === "marketing" || project?.type === "both" ? project.type : "software";
}

export function defaultDepartment(type) {
  return type === "marketing" ? "marketing" : "software";
}

export function milestoneDepartment(milestone, project) {
  if (milestone?.department === "marketing" || milestone?.department === "software") return milestone.department;
  return defaultDepartment(projectTypeOf(project));
}

export function taskDepartment(task, project, milestones = project?.milestones) {
  if (task?.department === "marketing" || task?.department === "software") return task.department;
  const milestone = (milestones || []).find((item) => item.id === task?.milestoneId);
  return milestoneDepartment(milestone, project);
}

export function canManageDepartment(role, project, department) {
  const type = projectTypeOf(project);
  if (role === "pm") {
    if (type === "marketing") return false;
    return department === "software";
  }
  if (role === "marketing") {
    if (type === "software") return false;
    return department === "marketing";
  }
  return false;
}

export function canEditProjectShell(role, project) {
  const type = projectTypeOf(project);
  if (role === "pm") return type !== "marketing";
  if (role === "marketing") return type === "marketing";
  return false;
}

export function normalizeAssignees(list) {
  return [...new Set((Array.isArray(list) ? list : []).map((code) => String(code || "").trim().toUpperCase()).filter((code) => /^EMP\d{3}$/.test(code)))];
}

function assignedCodes(project) {
  return [...new Set([...normalizeAssignees(project?.assignees), ...normalizeAssignees(project?.marketingAssignees)])];
}

function asMarketingProject(project, owner) {
  const name = String(project?.name || "").trim();
  const sales = salesClientByName(project.client);
  return {
    ...project,
    name,
    type: projectTypeOf(project),
    owner,
    client: String(project.client || "").trim(),
    email: project.email || sales?.email || "",
    phone: project.phone || sales?.phone || "",
    address: project.address || sales?.address || "",
    assignees: normalizeAssignees(project.assignees),
    marketingAssignees: normalizeAssignees(project.marketingAssignees),
    milestones: Array.isArray(project.milestones) ? project.milestones.map((item) => normalizeMilestone(item, project.type)) : [],
  };
}

export function marketingProjects() {
  const rows = [];
  loadUsers()
    .filter((user) => user.active && (user.role === "pm" || user.role === "marketing"))
    .forEach((user) => {
      accountProjectStore(user.username).raw.projects.forEach((project) => {
        const name = String(project?.name || "").trim();
        if (!project?.id || !name || project.archived) return;
        if (project.type !== "marketing" && project.type !== "both") return;
        rows.push(asMarketingProject(project, user.username));
      });
    });
  return rows.sort((a, b) => `${a.owner} ${a.code || ""} ${a.name}`.localeCompare(`${b.owner} ${b.code || ""} ${b.name}`));
}

function findMarketingProjectForDoc(doc) {
  const code = (canonicalProjectCode(doc?.projectId) || String(doc?.projectId || "").trim()).toLowerCase();
  const name = String(doc?.brandName || "").trim().toLowerCase();
  const id = String(doc?.id || "");
  return marketingProjects().find((project) => {
    if (id && (project.marketingId === id || project.id === id)) return true;
    if (code && (canonicalProjectCode(project.code) || "").toLowerCase() === code) return true;
    return Boolean(name) && project.client.toLowerCase() === name;
  }) || null;
}

function fieldsFromMarketingDoc(doc) {
  const brand = String(doc?.brandName || "").trim();
  const quote = quoteForClientRecord({ name: brand, code: doc?.clientCode || "" });
  const quotedType = quote ? projectTypeFromQuote(quote) : "marketing";
  return {
    code: canonicalProjectCode(doc?.projectId) || String(doc?.projectId || "").trim(),
    name: brand,
    client: brand,
    clientId: doc?.pmClientId || "",
    type: quotedType === "both" ? "both" : "marketing",
    email: doc?.email || "",
    phone: doc?.phone || "",
    address: doc?.address || "",
    packageName: quote?.packageName || "",
    quoteNumber: quote?.number || "",
    quoteId: quote?.id || "",
    service: quote?.service || "",
  };
}

export function upsertMarketingProjectFromDoc(doc, owner = sessionAccount()?.username) {
  const session = sessionAccount();
  if (session?.role !== "marketing" || !owner || !doc?.id) return { ok: false };
  const fields = fieldsFromMarketingDoc(doc);
  if (!fields.code || !fields.name) return { ok: false };
  const existing = findMarketingProjectForDoc(doc);
  const targetOwner = existing?.owner || owner;
  const store = accountProjectStore(targetOwner);
  const current = existing
    ? store.raw.projects.find((item) => item.id === existing.id)
    : store.raw.projects.find((item) => item.marketingId === doc.id || item.id === doc.id);
  const next = {
    ...(current || blankProject()),
    id: current?.id || doc.id,
    code: fields.code,
    name: current?.name || fields.name,
    client: fields.client,
    clientId: fields.clientId || current?.clientId || "",
    type: current?.type === "both" || fields.type === "both" ? "both" : "marketing",
    status: current?.status || "in-progress",
    startDate: current?.startDate || todayIso(),
    dueDate: current?.dueDate || "",
    description: current?.description || "",
    archived: current?.archived === true,
    milestones: Array.isArray(current?.milestones) ? current.milestones : [],
    assignees: normalizeAssignees(current?.assignees),
    marketingAssignees: normalizeAssignees(current?.marketingAssignees),
    email: fields.email || current?.email || "",
    phone: fields.phone || current?.phone || "",
    address: fields.address || current?.address || "",
    packageName: fields.packageName || current?.packageName || "",
    quoteNumber: fields.quoteNumber || current?.quoteNumber || "",
    quoteId: fields.quoteId || current?.quoteId || "",
    service: fields.service || current?.service || "",
    marketingId: doc.id,
    origin: current?.origin || "marketing",
  };
  store.raw.projects = current
    ? store.raw.projects.map((item) => (item.id === current.id ? next : item))
    : [next, ...store.raw.projects];
  crmStorage.setItem(`${STORAGE_KEY}:${targetOwner}`, JSON.stringify(store.raw));
  return { ok: true, owner: targetOwner, id: next.id };
}

export function removeMarketingProjectFromDoc(docId, owner = sessionAccount()?.username) {
  if (!docId || !owner) return { ok: false };
  const store = accountProjectStore(owner);
  const next = store.raw.projects.filter((item) => {
    if (item.marketingId !== docId && item.id !== docId) return true;
    return item.origin !== "marketing";
  });
  if (next.length === store.raw.projects.length) return { ok: true };
  crmStorage.setItem(`${STORAGE_KEY}:${owner}`, JSON.stringify({ ...store.raw, projects: next }));
  return { ok: true };
}

export function syncMarketingProjectsFromDocs(docs, owner = sessionAccount()?.username) {
  (docs || []).forEach((doc) => upsertMarketingProjectFromDoc(doc, owner));
}

export function assignMarketingTeam(owner, projectId, codes) {
  const session = sessionAccount();
  if (session?.role !== "marketing") return { ok: false, error: "Only the marketing admin can assign this project." };
  const key = `${STORAGE_KEY}:${owner}`;
  let raw;
  try {
    raw = JSON.parse(crmStorage.getItem(key) || "null");
  } catch {
    return { ok: false, error: "That project was not found." };
  }
  if (!raw || !Array.isArray(raw.projects)) return { ok: false, error: "That project was not found." };
  const project = raw.projects.find((item) => item.id === projectId);
  if (!project || project.archived || (project.type !== "marketing" && project.type !== "both")) {
    return { ok: false, error: "That project was not found." };
  }
  const assignees = normalizeAssignees(codes);
  const previous = normalizeAssignees(project.marketingAssignees);
  raw.projects = raw.projects.map((item) => (item.id === projectId ? { ...item, marketingAssignees: assignees } : item));
  crmStorage.setItem(key, JSON.stringify(raw));
  return { ok: true, name: String(project.name || "").trim(), previous, assignees };
}

function marketingProjectRecord(owner, projectId) {
  const key = `${STORAGE_KEY}:${owner}`;
  let raw;
  try {
    raw = JSON.parse(crmStorage.getItem(key) || "null");
  } catch {
    return { ok: false, error: "That project was not found." };
  }
  if (!raw || !Array.isArray(raw.projects)) return { ok: false, error: "That project was not found." };
  const project = raw.projects.find((item) => item.id === projectId);
  if (!project || project.archived || (project.type !== "marketing" && project.type !== "both")) {
    return { ok: false, error: "That project was not found." };
  }
  const session = sessionAccount();
  if (session?.role === "marketing") return { ok: true, key, raw, project };
  return { ok: false, error: "Only the marketing admin can change marketing work on this project." };
}

export function saveMarketingProjectDates(owner, projectId, { startDate = "", dueDate = "" } = {}) {
  const found = marketingProjectRecord(owner, projectId);
  if (!found.ok) return found;
  if (!dueDate) return { ok: false, error: "Due date is required." };
  if (startDate && dueDate < startDate) return { ok: false, error: "Due date must be on or after the start date." };
  found.raw.projects = found.raw.projects.map((item) => (
    item.id === projectId ? { ...item, startDate: startDate || item.startDate || "", dueDate } : item
  ));
  crmStorage.setItem(found.key, JSON.stringify(found.raw));
  return { ok: true, startDate: startDate || found.project.startDate || "", dueDate };
}

export function saveMarketingMilestone(owner, projectId, draft) {
  const found = marketingProjectRecord(owner, projectId);
  if (!found.ok) return found;
  const title = String(draft?.title || "").trim();
  if (!title) return { ok: false, error: "Milestone name is required." };
  if (!draft?.dueDate) return { ok: false, error: "Due date is required." };
  if (draft.startDate && draft.dueDate && draft.dueDate < draft.startDate) {
    return { ok: false, error: "Due date must be on or after the start date." };
  }
  const assignees = normalizeAssignees(draft?.assignees);
  if (!assignees.length) return { ok: false, error: "Assign at least one employee to this milestone." };
  const list = Array.isArray(found.project.milestones) ? found.project.milestones : [];
  const previous = list.find((item) => item.id === draft.id);
  if (previous && milestoneDepartment(previous, found.project) === "software") {
    return { ok: false, error: "The project manager manages technical work on this project." };
  }
  const milestone = normalizeMilestone({ ...draft, id: draft.id || uid(), title, department: "marketing", assignees }, found.project.type);
  const exists = list.some((item) => item.id === milestone.id);
  const milestones = exists
    ? list.map((item) => (item.id === milestone.id ? milestone : item))
    : [...list, milestone];
  found.raw.projects = found.raw.projects.map((item) => {
    if (item.id !== projectId) return item;
    return applyMilestoneTeam({ ...item, milestones }, milestone);
  });
  crmStorage.setItem(found.key, JSON.stringify(found.raw));
  return { ok: true, milestones: milestones.map((item) => normalizeMilestone(item, found.project.type)), previous: normalizeAssignees(previous?.assignees), assignees };
}

export function deleteMarketingMilestone(owner, projectId, milestoneId) {
  const found = marketingProjectRecord(owner, projectId);
  if (!found.ok) return found;
  const current = (Array.isArray(found.project.milestones) ? found.project.milestones : []);
  const target = current.find((item) => item.id === milestoneId);
  if (target && milestoneDepartment(target, found.project) === "software") {
    return { ok: false, error: "The project manager manages technical work on this project." };
  }
  const milestones = current.filter((item) => item.id !== milestoneId);
  found.raw.projects = found.raw.projects.map((item) => (item.id === projectId ? { ...item, milestones } : item));
  crmStorage.setItem(found.key, JSON.stringify(found.raw));
  return { ok: true, milestones: milestones.map(normalizeMilestone) };
}

export function projectsForEmployee(code) {
  const employee = String(code || "").trim().toUpperCase();
  if (!/^EMP\d{3}$/.test(employee)) return [];
  return loadUsers()
    .filter((user) => user.active && (user.role === "pm" || user.role === "marketing"))
    .flatMap((user) => {
      const stored = readAccount(STORAGE_KEY, user.username);
      const projects = Array.isArray(stored?.projects) ? stored.projects : [];
      return projects
        .filter((project) => {
          if (project.archived) return false;
          if (assignedCodes(project).includes(employee)) return true;
          return (project.milestones || []).some((item) => normalizeAssignees(item.assignees).includes(employee));
        })
        .map((project) => ({
          ...project,
          assignees: normalizeAssignees(project.assignees),
          marketingAssignees: normalizeAssignees(project.marketingAssignees),
          milestones: Array.isArray(project.milestones) ? project.milestones.map(normalizeMilestone) : [],
          owner: user.username,
        }));
    });
}

export function employeeMilestones(project, code) {
  const employee = String(code || "").trim().toUpperCase();
  return (project?.milestones || []).filter((item) => {
    const assignees = normalizeAssignees(item.assignees);
    if (assignees.length) return assignees.includes(employee);
    const lane = milestoneDepartment(item, project);
    return lane === "marketing"
      ? normalizeAssignees(project.marketingAssignees).includes(employee)
      : normalizeAssignees(project.assignees).includes(employee);
  });
}

export function milestoneTasksComplete(milestone, tasks) {
  const rows = (tasks || []).filter((task) => task.milestoneId === milestone.id);
  return rows.length > 0 && rows.every((task) => task.status === "done");
}

export function milestoneAssigneesComplete(milestone, tasks) {
  return milestoneTasksComplete(milestone, tasks);
}

export function applyTaskProgress(project, tasks) {
  const scoped = (tasks || []).filter((task) => task.projectId === project.id);
  let changed = false;
  const milestones = (project.milestones || []).map((milestone) => {
    const complete = milestoneTasksComplete(milestone, scoped);
    if (complete && milestone.status !== "done") {
      changed = true;
      return { ...milestone, status: "done" };
    }
    if (!complete && milestone.status === "done") {
      const rows = scoped.filter((task) => task.milestoneId === milestone.id);
      const next = rows.some((task) => task.status === "in-progress" || task.status === "completed" || task.status === "done")
        ? "in-progress"
        : "pending";
      changed = true;
      return { ...milestone, status: next };
    }
    return milestone;
  });
  return changed ? { ...project, milestones } : project;
}

export function syncOwnerProjectProgress(owner, projectId, tasks) {
  if (!owner || !projectId) return;
  const key = `${STORAGE_KEY}:${owner}`;
  let raw;
  try {
    raw = JSON.parse(crmStorage.getItem(key) || "null");
  } catch {
    return;
  }
  if (!raw || !Array.isArray(raw.projects)) return;
  const current = raw.projects.find((item) => item.id === projectId);
  if (!current) return;
  const synced = applyTaskProgress(current, tasks);
  if (synced === current) return;
  crmStorage.setItem(key, JSON.stringify({
    ...raw,
    projects: raw.projects.map((item) => (item.id === projectId ? synced : item)),
  }));
}

export function blankMilestone(department = "software") {
  return { id: uid(), title: "", startDate: "", dueDate: "", status: "pending", department, assignees: [] };
}

export function normalizeMilestone(item, projectType = "software") {
  const legacy = { planned: "pending", done: "done" };
  const status = legacy[item?.status] || item?.status;
  const allowed = ["pending", "in-progress", "at-risk", "done"];
  const department = item?.department === "marketing" || item?.department === "software"
    ? item.department
    : defaultDepartment(projectType);
  return {
    id: item?.id || uid(),
    title: item?.title || "",
    startDate: item?.startDate || "",
    dueDate: item?.dueDate || "",
    status: allowed.includes(status) ? status : "pending",
    department,
    assignees: normalizeAssignees(item?.assignees),
  };
}

export function applyMilestoneTeam(project, milestone) {
  const codes = normalizeAssignees(milestone?.assignees);
  if (!codes.length) return project;
  const lane = milestoneDepartment(milestone, project);
  if (lane === "marketing") {
    return { ...project, marketingAssignees: [...new Set([...normalizeAssignees(project.marketingAssignees), ...codes])] };
  }
  return { ...project, assignees: [...new Set([...normalizeAssignees(project.assignees), ...codes])] };
}

export function blankMeeting() {
  return {
    id: uid(),
    projectId: "",
    startDate: "",
    time: "09:00",
    link: "",
    recurrence: "none",
    statusByDate: {},
  };
}

export function todayIso() {
  const date = new Date();
  return toIso(date);
}

export function toIso(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseIso(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(iso, days) {
  const date = parseIso(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

export function formatDate(iso) {
  if (!iso) return "—";
  return parseIso(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatTime(value) {
  if (!value) return "—";
  const [hour, minute] = value.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function weekday(iso) {
  return parseIso(iso).getDay();
}

function matches(series, iso) {
  if (iso < series.startDate) return false;
  const day = weekday(iso);
  if (series.recurrence === "daily") return day >= 1 && day <= 5;
  const weekdays = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5 };
  if (weekdays[series.recurrence] != null) return day === weekdays[series.recurrence];
  return iso === series.startDate;
}

export function firstMatch(series) {
  if (!series.startDate || series.recurrence === "none") return series.startDate;
  let cursor = series.startDate;
  for (let step = 0; step < 14; step += 1) {
    if (matches(series, cursor)) return cursor;
    cursor = addDays(cursor, 1);
  }
  return series.startDate;
}

export function meetingStatus(series, iso) {
  return series.statusByDate?.[iso] || "scheduled";
}

export function upcomingDate(series, today = todayIso()) {
  if (series.recurrence === "none") return series.startDate;
  let cursor = series.startDate > today ? series.startDate : today;
  for (let step = 0; step < 370; step += 1) {
    if (matches(series, cursor) && meetingStatus(series, cursor) === "scheduled") return cursor;
    cursor = addDays(cursor, 1);
  }
  return series.startDate;
}

export function pastMeetings(series, today = todayIso()) {
  if (series.recurrence === "none") {
    const status = meetingStatus(series, series.startDate);
    if (series.startDate < today || status !== "scheduled") return [{ date: series.startDate, status }];
    return [];
  }
  const next = upcomingDate(series, today);
  const items = [];
  let cursor = series.startDate;
  let guard = 0;
  while (cursor < next && guard < 180) {
    if (matches(series, cursor)) items.push({ date: cursor, status: meetingStatus(series, cursor) });
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return items.reverse();
}

export function upcomingMeetings(series, today = todayIso()) {
  if (series.recurrence === "none") {
    const status = meetingStatus(series, series.startDate);
    if (series.startDate < today || status !== "scheduled") return [];
    return [{ date: series.startDate, status }];
  }
  const first = upcomingDate(series, today);
  const items = [{ date: first, status: meetingStatus(series, first) }];
  let cursor = addDays(first, 1);
  let guard = 0;
  while (items.length < 6 && guard < 120) {
    if (matches(series, cursor)) items.push({ date: cursor, status: meetingStatus(series, cursor) });
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return items;
}

export function projectCounts(projects) {
  const active = projects.filter((project) => !project.archived);
  const inProgress = active.filter((project) => project.status === "in-progress").length;
  const completed = active.filter((project) => project.status === "completed").length;
  const onHold = active.filter((project) => project.status === "on-hold").length + projects.filter((project) => project.archived).length;
  return { total: inProgress + completed, inProgress, completed, onHold };
}
