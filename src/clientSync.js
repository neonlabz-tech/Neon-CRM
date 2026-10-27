import { blankClient, clientDirectory, loadClients, nextClientCode, saveClients, syncClientsFromProjects, withClientCodes } from "./clients.js";
import { blankClient as blankMarketingClient, loadMarketing, saveMarketing } from "./marketing.js";
import { canonicalProjectCode, loadProjects, marketingProjects, nextCompanyProjectCode, saveProjects, syncMarketingProjectsFromDocs, withProjectCodes } from "./projects.js";
import { loadIncomingProjects, quotesByServiceType, salesClientDirectory } from "./sales.js";

export function hasMarketingProject(client, projects) {
  const name = (client?.name || "").trim().toLowerCase();
  return projects.some((project) => {
    if (project.archived || (project.type !== "marketing" && project.type !== "both")) return false;
    if (client?.id && project.clientId === client.id) return true;
    return Boolean(name) && (project.client || "").trim().toLowerCase() === name;
  });
}

export function isVisibleToMarketing(doc) {
  if (!doc || doc.origin !== "pm") return true;
  const pm = linkedPmClient(loadClients(), doc);
  return pm ? hasMarketingProject(pm, loadProjects().projects) : false;
}

export function publishClients() {
  const stored = loadProjects();
  const marketing = loadMarketing();
  const ids = canonicalizeProjectIds(marketing);
  const coded = withProjectCodes(stored.projects, ids.clients.map((item) => item.projectId));
  const clientCodes = withClientCodes(loadClients());
  const named = syncClientsFromProjects(clientCodes.clients, coded.projects);
  const shared = linkDirectories(named.clients, ids.clients, named.projects);
  if (shared.clientsChanged || named.clientsChanged || clientCodes.changed) saveClients(shared.clients);
  if (shared.marketingChanged || ids.changed) {
    saveMarketing({ ...marketing, clients: shared.marketingClients, reports: ids.reports });
  }
  if (named.projectsChanged || coded.changed) saveProjects({ ...stored, projects: named.projects });
  syncMarketingProjectsFromDocs(shared.marketingClients);
  return { clients: shared.clients, projects: named.projects };
}

export function pushMarketingToPm(doc) {
  publishClients();
  const clients = loadClients();
  const pm = linkedPmClient(clients, doc) || clients.find((item) => item.name.toLowerCase() === doc.brandName.trim().toLowerCase());
  if (!pm) return;
  const next = {
    ...pm,
    name: doc.brandName.trim() || pm.name,
    industry: doc.industry || pm.industry,
    contactName: doc.mainContactName || pm.contactName,
    contactTitle: doc.mainContactTitle || pm.contactTitle,
    contactEmail: doc.email || pm.contactEmail,
    contactPhone: doc.phone || pm.contactPhone,
    address: doc.address || pm.address,
    marketingId: doc.id,
    origin: pm.origin === "pm" && pm.marketingId ? pm.origin : "marketing",
  };
  saveClients(clients.map((item) => (item.id === pm.id ? next : item)));
  const marketing = loadMarketing();
  saveMarketing({
    ...marketing,
    clients: marketing.clients.map((item) => (item.id === doc.id ? { ...item, pmClientId: pm.id, origin: item.origin || "marketing" } : item)),
  });
}

export function pushPmToMarketing(client) {
  const projects = loadProjects().projects;
  const marketing = loadMarketing();
  let docs = marketing.clients;
  let doc = docs.find((item) => item.pmClientId === client.id || item.id === client.marketingId);
  const visible = hasMarketingProject(client, projects);
  if (!doc && !visible) return;
  if (!doc) {
    doc = {
      ...blankMarketingClient(),
      projectId: unusedProjectId(client, projects, docs),
      brandName: client.name,
      mainContactName: client.contactName || "Pending",
      mainContactTitle: client.contactTitle || "",
      industry: client.industry || "",
      email: client.contactEmail || "",
      address: client.address || "",
      pmClientId: client.id,
      origin: "pm",
    };
    docs = [doc, ...docs];
  } else {
    docs = docs.map((item) => (item.id === doc.id ? applyPmFields(item, client) : item));
    doc = docs.find((item) => item.pmClientId === client.id || item.id === client.marketingId);
  }
  saveMarketing({ ...marketing, clients: docs });
  if (client.marketingId !== doc.id) {
    saveClients(loadClients().map((item) => (item.id === client.id ? { ...item, marketingId: doc.id } : item)));
  }
}

function linkDirectories(clients, marketingClients, projects) {
  let nextClients = [...clients];
  let nextMarketing = marketingClients.map((item) => ({ ...item }));
  let clientsChanged = false;
  let marketingChanged = false;

  nextMarketing.forEach((doc) => {
    const brand = (doc.brandName || "").trim();
    if (!brand || doc.origin === "pm") return;
    let pm = linkedPmClient(nextClients, doc) || nextClients.find((item) => item.name.toLowerCase() === brand.toLowerCase());
    if (!pm) {
      pm = {
        ...blankClient(),
        name: brand,
        industry: doc.industry || "",
        contactName: doc.mainContactName || "",
        contactTitle: doc.mainContactTitle || "",
        contactEmail: doc.email || "",
        address: doc.address || "",
        code: nextClientCode(nextClients),
        marketingId: doc.id,
        origin: "marketing",
      };
      nextClients = [pm, ...nextClients];
      clientsChanged = true;
    } else if (pm.marketingId !== doc.id) {
      nextClients = nextClients.map((item) => (item.id === pm.id ? { ...item, marketingId: doc.id } : item));
      clientsChanged = true;
    }
    if (doc.pmClientId !== pm.id) {
      nextMarketing = nextMarketing.map((item) => (item.id === doc.id ? { ...item, pmClientId: pm.id } : item));
      marketingChanged = true;
    }
  });

  nextClients.forEach((client) => {
    if (!hasMarketingProject(client, projects)) return;
    const existing = nextMarketing.find((item) => item.pmClientId === client.id || item.id === client.marketingId)
      || nextMarketing.find((item) => (item.brandName || "").trim().toLowerCase() === client.name.toLowerCase());
    if (existing) {
      if (client.marketingId !== existing.id) {
        nextClients = nextClients.map((item) => (item.id === client.id ? { ...item, marketingId: existing.id } : item));
        clientsChanged = true;
      }
      if (existing.pmClientId !== client.id) {
        nextMarketing = nextMarketing.map((item) => (item.id === existing.id ? { ...item, pmClientId: client.id } : item));
        marketingChanged = true;
      }
      return;
    }
    const doc = {
      ...blankMarketingClient(),
      projectId: unusedProjectId(client, projects, nextMarketing),
      brandName: client.name,
      mainContactName: client.contactName || "Pending",
      mainContactTitle: client.contactTitle || "",
      industry: client.industry || "",
      email: client.contactEmail || "",
      address: client.address || "",
      pmClientId: client.id,
      origin: "pm",
    };
    nextMarketing = [doc, ...nextMarketing];
    nextClients = nextClients.map((item) => (item.id === client.id ? { ...item, marketingId: doc.id } : item));
    marketingChanged = true;
    clientsChanged = true;
  });

  return { clients: nextClients, marketingClients: nextMarketing, clientsChanged, marketingChanged };
}

function linkedPmClient(clients, doc) {
  return clients.find((item) => item.marketingId === doc.id || item.id === doc.pmClientId);
}

function applyPmFields(doc, client) {
  return {
    ...doc,
    brandName: client.name || doc.brandName,
    mainContactName: client.contactName || doc.mainContactName,
    mainContactTitle: client.contactTitle || doc.mainContactTitle,
    industry: client.industry || doc.industry,
    email: client.contactEmail || doc.email,
    phone: client.contactPhone || doc.phone,
    address: client.address || doc.address,
    pmClientId: client.id,
  };
}

function unusedProjectId(client, projects, docs) {
  const project = projects.find((item) => hasMarketingProject(client, [item]));
  const preferred = canonicalProjectCode(project?.code || "");
  const used = new Set(docs.map((item) => (item.projectId || "").trim().toLowerCase()));
  if (preferred && !used.has(preferred.toLowerCase())) return preferred;
  return nextCompanyProjectCode(docs.map((item) => item.projectId));
}

function takeFilled(current, next) {
  const out = { ...current };
  Object.entries(next).forEach(([key, value]) => {
    if (value) out[key] = value;
  });
  return out;
}

function personName(value) {
  const text = String(value || "").trim();
  if (!text || /[@\d]/.test(text) || text.includes("·")) return "";
  return text;
}

export function marketingServiceClients() {
  const byName = new Map();

  function merge(name, row) {
    const key = String(name || "").trim().toLowerCase();
    if (!key) return;
    byName.set(key, takeFilled(byName.get(key) || { name: String(name).trim() }, row));
  }

  quotesByServiceType(["marketing", "both"]).forEach((quote) => {
    merge(quote.client, {
      name: String(quote.client || "").trim(),
      clientCode: quote.clientCode || "",
      email: quote.email || "",
      phone: quote.phone || "",
      address: quote.address || "",
      contactName: personName(quote.contact),
      serviceType: quote.serviceType || "",
    });
  });

  marketingProjects().forEach((project) => {
    merge(project.client, {
      name: project.client,
      projectId: canonicalProjectCode(project.code),
      email: project.email || "",
      phone: project.phone || "",
      address: project.address || "",
      serviceType: project.type,
    });
  });

  clientDirectory().forEach((client) => {
    const key = client.name.trim().toLowerCase();
    if (!byName.has(key)) return;
    merge(client.name, {
      name: client.name,
      clientCode: client.code || "",
      email: client.contactEmail || "",
      phone: client.contactPhone || "",
      address: client.address || "",
      industry: client.industry || "",
      contactName: personName(client.contactName) || client.contactName || "",
      contactTitle: client.contactTitle || "",
      assignedPerson: client.assignedPerson || "",
      pmClientId: client.id,
    });
  });

  salesClientDirectory().forEach((client) => {
    if (!byName.has(client.name.trim().toLowerCase())) return;
    merge(client.name, {
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
    });
  });

  loadIncomingProjects().forEach((item) => {
    const name = String(item.client || item.name || "").trim();
    if (!byName.has(name.toLowerCase())) return;
    merge(name, {
      email: item.email || "",
      phone: item.phone || "",
      address: item.address || "",
      contactName: personName(item.contact),
    });
  });

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function marketingFieldsFromPm(choice) {
  if (!choice) return {};
  return {
    brandName: choice.name || "",
    industry: choice.industry || "",
    email: choice.email || "",
    phone: choice.phone || "",
    address: choice.address || "",
    mainContactName: choice.contactName || "",
    mainContactTitle: choice.contactTitle || "",
    assignedContactName: choice.assignedPerson || "",
    pmClientId: choice.pmClientId || "",
    projectId: choice.projectId || "",
  };
}

function canonicalizeProjectIds(marketing) {
  const previous = new Map();
  let changed = false;
  const clients = marketing.clients.map((doc) => {
    const code = canonicalProjectCode(doc.projectId);
    if (!code || code === doc.projectId) return doc;
    previous.set(doc.projectId, code);
    changed = true;
    return { ...doc, projectId: code };
  });
  const reports = (marketing.reports || []).map((report) => {
    const code = previous.get(report.projectId) || canonicalProjectCode(report.projectId);
    if (!code || code === report.projectId) return report;
    changed = true;
    return { ...report, projectId: code };
  });
  return { clients, reports, changed };
}
