import { readAccount, readScoped, writeScoped } from "./scope.js";
import { crmStorage } from "./storage.js";

const STORAGE_KEY = "neon-crm-tasks";

export const TASK_PRIORITIES = [
  ["critical", "Critical"],
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
];

export const TASK_STATUSES = [
  ["not-started", "Not yet started"],
  ["in-progress", "In progress"],
  ["completed", "Completed"],
  ["done", "Done"],
];

export const BOARD_COLUMNS = [
  { id: "todo", label: "To Do", status: "not-started" },
  { id: "doing", label: "In-Progress", status: "in-progress" },
  { id: "completed", label: "Completed", status: "completed" },
  { id: "done", label: "Done", status: "done" },
];

export function employeeBoardColumns() {
  return BOARD_COLUMNS.filter((column) => column.id !== "done");
}

export function managerBoardColumns() {
  return BOARD_COLUMNS;
}

export function boardColumnOf(task) {
  if (task?.status === "done") return "done";
  if (task?.status === "completed") return "completed";
  if (task?.status === "in-progress") return "doing";
  return "todo";
}

export function statusForColumn(columnId) {
  return BOARD_COLUMNS.find((column) => column.id === columnId)?.status || "not-started";
}

export function employeeLaneStatus(tasks) {
  const rows = Array.isArray(tasks) ? tasks : [];
  if (!rows.length) return "todo";
  if (rows.every((task) => task.status === "done")) return "done";
  if (rows.every((task) => task.status === "done" || task.status === "completed")) return "completed";
  if (rows.some((task) => task.status !== "not-started")) return "doing";
  return "todo";
}

export function canEmployeeMove(task, columnId) {
  if (!task || task.status === "done" || columnId === "done") return false;
  return columnId === "todo" || columnId === "doing" || columnId === "completed";
}

export function loadTasks() {
  try {
    const data = readScoped(STORAGE_KEY);
    if (!Array.isArray(data)) return [];
    return data.map(normalizeTask);
  } catch {
    return [];
  }
}

export function saveTasks(tasks) {
  writeScoped(STORAGE_KEY, tasks);
}

export function tasksForOwner(owner) {
  try {
    const data = readAccount(STORAGE_KEY, owner);
    if (!Array.isArray(data)) return [];
    return data.map(normalizeTask);
  } catch {
    return [];
  }
}

export function saveOwnerTasks(owner, tasks) {
  if (!owner) return;
  crmStorage.setItem(`${STORAGE_KEY}:${owner}`, JSON.stringify(tasks));
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function blankTask(projectId = "", milestoneId = "") {
  return {
    id: uid(),
    code: "",
    title: "",
    projectId,
    milestoneId,
    priority: "medium",
    assigneeId: "",
    assigneeCode: "",
    createdBy: "",
    startDate: "",
    dueDate: "",
    description: "",
    status: "not-started",
    department: "",
    completedAt: "",
    doneAt: "",
  };
}

export function nextTaskCode(tasks) {
  let max = 0;
  for (const task of tasks) {
    const match = /^TSK(\d+)$/i.exec(task.code || "");
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `TSK${String(max + 1).padStart(3, "0")}`;
}

export function cleanHtml(html) {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  const allowed = new Set(["B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "BR", "P", "DIV"]);
  function walk(node) {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType !== 1) return;
      walk(child);
      if (!allowed.has(child.tagName)) {
        const parent = child.parentNode;
        while (child.firstChild) parent.insertBefore(child.firstChild, child);
        parent.removeChild(child);
        return;
      }
      [...child.attributes].forEach((attr) => child.removeAttribute(attr.name));
    });
  }
  walk(doc.body);
  const text = doc.body.textContent.replace(/\u00a0/g, " ").trim();
  return text ? doc.body.innerHTML : "";
}

function taskStatus(value) {
  if (TASK_STATUSES.some(([id]) => id === value)) return value;
  if (value === "active") return "in-progress";
  if (value === "approved") return "done";
  return "not-started";
}

function normalizeTask(item) {
  const priority = TASK_PRIORITIES.some(([id]) => id === item?.priority) ? item.priority : "medium";
  return {
    id: item?.id || uid(),
    code: item?.code || "",
    title: item?.title || "",
    projectId: item?.projectId || "",
    milestoneId: item?.milestoneId || "",
    priority,
    assigneeId: item?.assigneeId || "",
    assigneeCode: String(item?.assigneeCode || "").toUpperCase(),
    createdBy: item?.createdBy || "",
    startDate: item?.startDate || "",
    dueDate: item?.dueDate || "",
    description: item?.description || "",
    status: taskStatus(item?.status),
    department: item?.department === "marketing" || item?.department === "software" ? item.department : "",
    completedAt: item?.completedAt || "",
    doneAt: item?.doneAt || "",
  };
}

export function stampTaskStatus(task, status) {
  const next = { ...task, status };
  if (status === "completed") {
    next.completedAt = task.completedAt || new Date().toISOString();
    next.doneAt = "";
  } else if (status === "done") {
    next.completedAt = task.completedAt || new Date().toISOString();
    next.doneAt = task.doneAt || new Date().toISOString();
  } else {
    next.completedAt = "";
    next.doneAt = "";
  }
  return next;
}

export function columnLabel(columnId) {
  return BOARD_COLUMNS.find((column) => column.id === columnId)?.label || "To Do";
}
