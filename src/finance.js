import { loadUsers } from "./crm.js";
import { crmStorage } from "./storage.js";

const STORAGE_KEY = "neon-crm-finance";
const NOTICES_KEY = "neon-crm-notices";
export const NOTICES_CHANGED = "neon-crm-notices";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const FINANCE_STATUSES = ["Paid", "Non-paid"];

export const DEFAULT_CATEGORIES = [
  "Office Rent",
  "Utility Bill",
  "Internet Connection",
  "Telephone Bill",
  "Software & Technology Expense",
  "Marketing & Sales Expense",
  "Legal & Administration Expense",
];

function emptyStore() {
  return { payments: [], expenses: [], revenue: [], categories: [...DEFAULT_CATEGORIES], projectInvoices: [] };
}

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function loadFinance() {
  try {
    const raw = JSON.parse(crmStorage.getItem(STORAGE_KEY) || "null");
    return normalizeStore(raw);
  } catch {
    return emptyStore();
  }
}

export function saveFinance(data) {
  crmStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function commit(data) {
  try {
    const next = normalizeStore(data);
    saveFinance(next);
    return { ok: true, data: next };
  } catch {
    return { ok: false, error: "Could not store this change." };
  }
}

function normalizeStore(raw) {
  const base = emptyStore();
  if (!raw || typeof raw !== "object") return base;
  const categories = Array.isArray(raw.categories)
    ? raw.categories.map((item) => String(item || "").trim()).filter((item) => item && item.toLowerCase() !== "salary")
    : [];
  return {
    payments: Array.isArray(raw.payments) ? raw.payments.map(normalizePayment).filter(Boolean) : [],
    expenses: Array.isArray(raw.expenses) ? raw.expenses.map(normalizeExpense).filter(Boolean) : [],
    revenue: Array.isArray(raw.revenue) ? raw.revenue.map(normalizeRevenue).filter(Boolean) : [],
    categories: categories.length ? [...new Set(categories)] : base.categories,
    projectInvoices: Array.isArray(raw.projectInvoices) ? raw.projectInvoices.map(normalizeProjectInvoice).filter(Boolean) : [],
  };
}

function normalizePayment(item) {
  if (!item?.id || !item.employeeId || !item.date) return null;
  return {
    id: String(item.id),
    employeeId: String(item.employeeId),
    base: money(item.base),
    commission: money(item.commission),
    date: String(item.date),
    status: item.status === "Paid" ? "Paid" : "Non-paid",
  };
}

function normalizeExpense(item) {
  if (!item?.id || !item.date) return null;
  return {
    id: String(item.id),
    date: String(item.date),
    category: String(item.category || ""),
    description: String(item.description || ""),
    amount: money(item.amount),
  };
}

function normalizeRevenue(item) {
  if (!item?.id || !item.date) return null;
  return {
    id: String(item.id),
    salesPerson: String(item.salesPerson || ""),
    date: String(item.date),
    description: String(item.description || ""),
    amount: money(item.amount),
  };
}

function monthKey(date) {
  return String(date || "").slice(0, 7);
}

export function salaryExpenses(payments) {
  const groups = new Map();
  for (const payment of payments) {
    if (payment.status !== "Paid") continue;
    const key = monthKey(payment.date);
    if (key.length < 7) continue;
    const current = groups.get(key) || { date: payment.date, amount: 0 };
    current.amount += payment.base + payment.commission;
    if (payment.date > current.date) current.date = payment.date;
    groups.set(key, current);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, value]) => ({
      date: value.date,
      category: "Salary",
      description: `Payroll total – ${MONTHS[Number(key.slice(5, 7)) - 1] || ""} ${key.slice(0, 4)}`.trim(),
      amount: value.amount,
      auto: true,
    }));
}

export function savePayment(data, draft) {
  if (!draft.employeeId) return { ok: false, error: "Choose an employee." };
  if (!draft.date) return { ok: false, error: "Pay date is required." };
  if (!FINANCE_STATUSES.includes(draft.status)) return { ok: false, error: "Choose a status." };
  const base = money(draft.base);
  const commission = money(draft.commission);
  const key = monthKey(draft.date);
  const duplicate = data.payments.some((payment) => payment.id !== draft.id && payment.employeeId === draft.employeeId && monthKey(payment.date) === key);
  if (duplicate) return { ok: false, error: "This employee already has a payroll record for that month. Edit that one instead." };
  const existing = data.payments.find((payment) => payment.id === draft.id);
  if (draft.id && !existing) return { ok: false, error: "That payment was not found." };
  const next = {
    id: existing?.id || uid(),
    employeeId: draft.employeeId,
    base,
    commission,
    date: draft.date,
    status: draft.status,
  };
  return commit({
    ...data,
    payments: existing ? data.payments.map((payment) => (payment.id === next.id ? next : payment)) : [next, ...data.payments],
  });
}

export function saveCategory(data, name) {
  const label = String(name || "").trim();
  if (!label) return { ok: false, error: "Enter a category name." };
  if (label.toLowerCase() === "salary" || data.categories.some((item) => item.toLowerCase() === label.toLowerCase())) {
    return { ok: false, error: "This category already exists." };
  }
  return commit({ ...data, categories: [...data.categories, label] });
}

export function saveExpense(data, draft) {
  if (!draft.date) return { ok: false, error: "Select a date." };
  const amount = Number(draft.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter an amount greater than zero." };
  if (!data.categories.includes(draft.category)) return { ok: false, error: "Choose a category." };
  const existing = data.expenses.find((expense) => expense.id === draft.id);
  if (draft.id && !existing) return { ok: false, error: "That expense was not found." };
  const next = {
    id: existing?.id || uid(),
    date: draft.date,
    category: draft.category,
    description: String(draft.description || "").trim(),
    amount,
  };
  return commit({
    ...data,
    expenses: existing ? data.expenses.map((expense) => (expense.id === next.id ? next : expense)) : [next, ...data.expenses],
  });
}

export function deleteExpense(data, id) {
  if (!data.expenses.some((expense) => expense.id === id)) return { ok: false, error: "That expense was not found." };
  return commit({ ...data, expenses: data.expenses.filter((expense) => expense.id !== id) });
}

export function saveRevenue(data, draft) {
  if (!draft.date) return { ok: false, error: "Collection date is required." };
  const description = String(draft.description || "").trim();
  if (!description) return { ok: false, error: "Describe this revenue." };
  const amount = Number(draft.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter an amount greater than zero." };
  const existing = data.revenue.find((item) => item.id === draft.id);
  if (draft.id && !existing) return { ok: false, error: "That revenue record was not found." };
  const next = {
    id: existing?.id || uid(),
    salesPerson: String(draft.salesPerson || "").trim(),
    date: draft.date,
    description,
    amount,
  };
  return commit({
    ...data,
    revenue: existing ? data.revenue.map((item) => (item.id === next.id ? next : item)) : [next, ...data.revenue],
  });
}

export function deleteRevenue(data, id) {
  if (!data.revenue.some((item) => item.id === id)) return { ok: false, error: "That revenue record was not found." };
  return commit({ ...data, revenue: data.revenue.filter((item) => item.id !== id) });
}

function normalizeProjectInvoice(item) {
  if (!item?.id || !item.paymentId || !item.quoteId) return null;
  return {
    id: String(item.id),
    receiptNo: String(item.receiptNo || ""),
    paymentId: String(item.paymentId),
    salesOwner: String(item.salesOwner || ""),
    pmOwners: Array.isArray(item.pmOwners) ? item.pmOwners.map(String) : [],
    sharedWithPms: item.sharedWithPms === true,
    quoteId: String(item.quoteId),
    quoteNumber: String(item.quoteNumber || ""),
    quoteTotal: money(item.quoteTotal),
    projectName: String(item.projectName || ""),
    projectDetail: String(item.projectDetail || ""),
    clientName: String(item.clientName || ""),
    company: String(item.company || ""),
    contact: String(item.contact || ""),
    amount: money(item.amount),
    type: String(item.type || ""),
    method: String(item.method || ""),
    transactionId: String(item.transactionId || ""),
    date: String(item.date || ""),
    approval: item.approval === "approved" ? "approved" : "pending",
  };
}

export function queueProjectInvoice(draft) {
  const data = loadFinance();
  const existing = data.projectInvoices.find((item) => item.paymentId === draft.paymentId && item.salesOwner === draft.salesOwner);
  if (existing) return existing;
  const sequence = data.projectInvoices.filter((item) => item.quoteId === draft.quoteId).length + 1;
  const stem = String(draft.clientName || draft.company || "CLT").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase() || "CLT";
  const invoice = normalizeProjectInvoice({
    ...draft,
    id: uid(),
    receiptNo: `RCP-${stem}-${String(sequence).padStart(3, "0")}`,
    approval: "pending",
  });
  if (!invoice) return null;
  saveFinance({ ...data, projectInvoices: [invoice, ...data.projectInvoices] });
  const amount = invoice.amount.toLocaleString("en-US");
  loadUsers().filter((user) => user.active && user.role === "ceo").forEach((user) => {
    addNotice(user.username, `${invoice.salesOwner} submitted a payment of LKR ${amount} for ${invoice.clientName || invoice.projectName}. Review it under Sales, Sales & Collection Approvals.`, invoice.id);
  });
  return invoice;
}

export function approveProjectInvoice(invoiceId) {
  const data = loadFinance();
  const invoice = data.projectInvoices.find((item) => item.id === invoiceId);
  if (!invoice) return { ok: false, error: "That invoice was not found." };
  if (invoice.approval === "approved") return { ok: true, data };
  const projectInvoices = data.projectInvoices.map((item) => (item.id === invoiceId ? { ...item, approval: "approved" } : item));
  const saved = commit({ ...data, projectInvoices });
  if (!saved.ok) return saved;
  markSalesPaymentApproved(invoice.salesOwner, invoice.paymentId);
  const client = invoice.clientName || invoice.projectName || "a client";
  if (invoice.salesOwner) {
    addNotice(invoice.salesOwner, `The CEO approved the payment for ${client}. Open Overview to view invoice ${invoice.receiptNo}.`, invoice.id);
  }
  notifyRole("pm", `The CEO confirmed ${client}. This client is now available under Clients.`);
  return saved;
}

export function projectInvoiceFor(salesOwner, paymentId) {
  return loadFinance().projectInvoices.find((item) => item.salesOwner === salesOwner && item.paymentId === paymentId) || null;
}

export function projectInvoiceById(id) {
  return loadFinance().projectInvoices.find((item) => item.id === id) || null;
}

export function invoicesForUser(username, role) {
  const invoices = loadFinance().projectInvoices.filter((item) => item.approval === "approved");
  if (role === "ceo") return invoices;
  if (role === "sales") return invoices.filter((item) => item.salesOwner === username);
  if (role === "pm") {
    return invoices.filter((item) => item.pmOwners.includes(username) || item.sharedWithPms);
  }
  return [];
}

function markSalesPaymentApproved(salesOwner, paymentId) {
  if (!salesOwner || !paymentId) return;
  const key = `neon-crm-sales:${salesOwner}`;
  try {
    const raw = JSON.parse(crmStorage.getItem(key) || "null");
    if (!raw || !Array.isArray(raw.payments)) return;
    raw.payments = raw.payments.map((payment) => (
      payment.id === paymentId ? { ...payment, status: "confirmed", approval: "approved" } : payment
    ));
    crmStorage.setItem(key, JSON.stringify(raw));
  } catch {
    // The finance approval is already stored. The sales row can be refreshed on the next payment edit.
  }
}

export function loadNotices(username) {
  try {
    const raw = JSON.parse(crmStorage.getItem(NOTICES_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((item) => item.to === username) : [];
  } catch {
    return [];
  }
}

export function dismissNotice(id) {
  try {
    const raw = JSON.parse(crmStorage.getItem(NOTICES_KEY) || "[]");
    const next = Array.isArray(raw) ? raw.filter((item) => item.id !== id) : [];
    crmStorage.setItem(NOTICES_KEY, JSON.stringify(next));
    pingNotices();
  } catch {
    // Ignore a full browser store. The notice can be dismissed on the next visit.
  }
}

export function notifyUser(username, text) {
  addNotice(username, text, "");
}

export function notifyRole(role, text) {
  loadUsers()
    .filter((user) => user.active && user.role === role)
    .forEach((user) => notifyUser(user.username, text));
}

function addNotice(username, text, invoiceId) {
  if (!username || !text) return;
  let current = [];
  try {
    const raw = JSON.parse(crmStorage.getItem(NOTICES_KEY) || "[]");
    if (Array.isArray(raw)) current = raw;
  } catch {
    current = [];
  }
  current.unshift({ id: uid(), to: username, text, invoiceId: invoiceId || "", created: new Date().toISOString() });
  crmStorage.setItem(NOTICES_KEY, JSON.stringify(current.slice(0, 80)));
  pingNotices();
}

function pingNotices() {
  try {
    window.dispatchEvent(new Event(NOTICES_CHANGED));
  } catch {
    // Notices still persist. The inbox refreshes on the next open.
  }
}
