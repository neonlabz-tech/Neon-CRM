import { readScoped, writeScoped } from "./scope.js";

const STORAGE_KEY = "neon-crm-team";

export function loadTeam() {
  try {
    const data = readScoped(STORAGE_KEY);
    if (!data) return { departments: [], members: [] };
    return {
      departments: Array.isArray(data.departments) ? data.departments.map(normalizeDepartment) : [],
      members: Array.isArray(data.members) ? data.members.map(normalizeMember) : [],
    };
  } catch {
    return { departments: [], members: [] };
  }
}

export function saveTeam(data) {
  writeScoped(STORAGE_KEY, data);
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function blankDepartment() {
  return { id: uid(), name: "" };
}

export function blankMember(departmentId = "", projectIds = []) {
  return {
    id: uid(),
    name: "",
    email: "",
    phone: "",
    role: "",
    departmentId,
    status: "available",
    photo: "",
    projectIds,
  };
}

function normalizeDepartment(item) {
  return { id: item?.id || uid(), name: item?.name || "" };
}

function normalizeMember(item) {
  const status = item?.status === "inactive" ? "inactive" : "available";
  return {
    id: item?.id || uid(),
    name: item?.name || "",
    email: item?.email || "",
    phone: item?.phone || "",
    role: item?.role || "",
    departmentId: item?.departmentId || "",
    status,
    photo: item?.photo || "",
    projectIds: Array.isArray(item?.projectIds) ? item.projectIds : [],
  };
}
