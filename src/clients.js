import { loadUsers } from "./crm.js";
import { readAccount, readScoped, writeScoped } from "./scope.js";

const STORAGE_KEY = "neon-crm-clients";

export const INDUSTRIES = [
  "SaaS / Technology",
  "Fintech",
  "Healthcare",
  "Retail / E-commerce",
  "Education",
  "Real Estate",
  "Manufacturing",
  "Other",
];

export const TIERS = ["Enterprise", "Growth", "Standard"];

export function loadClients() {
  try {
    const data = readScoped(STORAGE_KEY);
    if (!Array.isArray(data)) return [];
    return data.map(normalizeClient);
  } catch {
    return [];
  }
}

export function saveClients(clients) {
  writeScoped(STORAGE_KEY, clients);
}

export function clientDirectory() {
  return loadUsers()
    .filter((user) => user.active && user.role === "pm")
    .flatMap((user) => {
      const stored = readAccount(STORAGE_KEY, user.username);
      if (!Array.isArray(stored)) return [];
      return stored
        .map(normalizeClient)
        .filter((client) => client.status === "active" && client.name.trim())
        .map((client) => ({ ...client, owner: user.username }));
    })
    .sort((a, b) => a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name));
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clientCodeNumber(code) {
  const match = /^(?:CLI|CL-?)(\d+)$/i.exec(String(code || "").trim());
  return match ? Number(match[1]) : 0;
}

export function formatClientCode(number) {
  return `CLI${String(number).padStart(3, "0")}`;
}

export function nextClientCode(clients) {
  let max = 0;
  for (const client of clients) max = Math.max(max, clientCodeNumber(client.code));
  return formatClientCode(max + 1);
}

export function withClientCodes(clients) {
  const used = new Set();
  let max = 0;
  const assigned = new Map();
  let changed = false;
  for (const client of [...clients].reverse()) {
    const number = clientCodeNumber(client.code);
    if (number && !used.has(number)) {
      used.add(number);
      max = Math.max(max, number);
      const code = formatClientCode(number);
      if (client.code !== code) {
        assigned.set(client.id, code);
        changed = true;
      }
      continue;
    }
    if (number && client.code === formatClientCode(number)) continue;
    if (client.code && !number) continue;
    max += 1;
    while (used.has(max)) max += 1;
    used.add(max);
    assigned.set(client.id, formatClientCode(max));
    changed = true;
  }
  if (!changed) return { clients, changed: false };
  return {
    changed: true,
    clients: clients.map((client) => (assigned.has(client.id) ? { ...client, code: assigned.get(client.id) } : client)),
  };
}

export function blankClient() {
  return {
    id: uid(),
    code: "",
    name: "",
    industry: "",
    tier: "",
    logo: "",
    contactName: "",
    contactTitle: "",
    assignedPerson: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
    notes: "",
    status: "active",
    subContacts: [],
    marketingId: "",
    origin: "pm",
    source: "",
  };
}

export function blankSubContact() {
  return { id: uid(), name: "", title: "", email: "", phone: "" };
}

function normalizeClient(item) {
  return {
    id: item?.id || uid(),
    code: item?.code || "",
    name: item?.name || "",
    industry: item?.industry || "",
    tier: item?.tier || "",
    logo: item?.logo || "",
    contactName: item?.contactName || "",
    contactTitle: item?.contactTitle || "",
    assignedPerson: item?.assignedPerson || "",
    contactEmail: item?.contactEmail || "",
    contactPhone: item?.contactPhone || "",
    address: item?.address || "",
    notes: item?.notes || "",
    status: item?.status === "inactive" ? "inactive" : "active",
    subContacts: Array.isArray(item?.subContacts) ? item.subContacts.map(normalizeSubContact) : [],
    marketingId: item?.marketingId || "",
    origin: item?.origin === "marketing" ? "marketing" : item?.origin === "sales" ? "sales" : "pm",
    source: item?.source === "own" ? "own" : "",
  };
}

function normalizeSubContact(item) {
  return {
    id: item?.id || uid(),
    name: item?.name || "",
    title: item?.title || "",
    email: item?.email || "",
    phone: item?.phone || "",
  };
}

export function syncClientsFromProjects(clients, projects) {
  const nextClients = [...clients];
  let clientsChanged = false;
  let projectsChanged = false;
  const nextProjects = projects.map((project) => {
    const name = (project.client || "").trim();
    if (!name) {
      if (project.clientId) {
        projectsChanged = true;
        return { ...project, client: "", clientId: "" };
      }
      return project;
    }
    let match = nextClients.find((client) => client.id === project.clientId)
      || nextClients.find((client) => client.name.toLowerCase() === name.toLowerCase());
    if (!match) {
      match = { ...blankClient(), name, code: nextClientCode(nextClients) };
      nextClients.unshift(match);
      clientsChanged = true;
    }
    if (project.clientId !== match.id || project.client !== match.name) {
      projectsChanged = true;
      return { ...project, clientId: match.id, client: match.name };
    }
    return project;
  });
  return { clients: nextClients, projects: nextProjects, clientsChanged, projectsChanged };
}
