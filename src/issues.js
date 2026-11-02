import { readScoped, writeScoped } from "./scope.js";

const STORAGE_KEY = "neon-crm-issues";

export const ISSUE_STATUSES = [
  ["open", "Open"],
  ["in-progress", "In progress"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
];

export const ISSUE_PRIORITIES = [
  ["critical", "Critical"],
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
];

export const ISSUE_TYPES = [
  ["bug", "Bug"],
  ["improvement", "Improvement"],
  ["task", "Task"],
];

export function loadIssues() {
  try {
    const data = readScoped(STORAGE_KEY);
    if (!Array.isArray(data)) return [];
    return data.map(normalizeIssue);
  } catch {
    return [];
  }
}

export function saveIssues(issues) {
  writeScoped(STORAGE_KEY, issues);
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function blankIssue() {
  return {
    id: uid(),
    code: "",
    title: "",
    projectId: "",
    status: "open",
    priority: "medium",
    type: "bug",
    assigneeId: "",
    dueDate: "",
    reportedAt: "",
    description: "",
    steps: "",
    expected: "",
    converted: false,
  };
}

export function nextIssueCode(issues) {
  let max = 0;
  for (const issue of issues) {
    const match = /^ISS(\d+)$/i.exec(issue.code || "");
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `ISS${String(max + 1).padStart(3, "0")}`;
}

function normalizeIssue(item) {
  const status = ISSUE_STATUSES.some(([id]) => id === item?.status) ? item.status : "open";
  const priority = ISSUE_PRIORITIES.some(([id]) => id === item?.priority) ? item.priority : "medium";
  const type = ISSUE_TYPES.some(([id]) => id === item?.type) ? item.type : "bug";
  return {
    id: item?.id || uid(),
    code: item?.code || "",
    title: item?.title || "",
    projectId: item?.projectId || "",
    status,
    priority,
    type,
    assigneeId: item?.assigneeId || "",
    dueDate: item?.dueDate || "",
    reportedAt: item?.reportedAt || "",
    description: item?.description || "",
    steps: item?.steps || "",
    expected: item?.expected || "",
    converted: Boolean(item?.converted),
  };
}
