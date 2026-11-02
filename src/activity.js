import { sessionAccount, readScoped, writeScoped } from "./scope.js";
import { uid } from "./tasks.js";

const STORAGE_KEY = "neon-crm-activity";

export function loadActivity() {
  try {
    const data = readScoped(STORAGE_KEY);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function logActivity(entry) {
  const session = sessionAccount();
  if (!session?.username) return;
  const rows = loadActivity();
  rows.unshift({
    id: uid(),
    ts: new Date().toISOString(),
    user: session.username,
    action: entry.action || "Task Status Changed",
    note: entry.note || "",
    taskId: entry.taskId || "",
    taskTitle: entry.taskTitle || "",
    projectName: entry.projectName || "",
    milestoneTitle: entry.milestoneTitle || "",
    from: entry.from || "",
    to: entry.to || "",
  });
  writeScoped(STORAGE_KEY, rows.slice(0, 300));
}

export function formatStamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
