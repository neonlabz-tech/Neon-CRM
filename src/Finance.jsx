import { useState } from "react";
import { loadUsers } from "./crm.js";
import {
  DEFAULT_CATEGORIES,
  FINANCE_STATUSES,
  MONTHS,
  approveProjectInvoice,
  deleteExpense,
  deleteRevenue,
  dismissNotice,
  loadFinance,
  loadNotices,
  salaryExpenses,
  saveCategory,
  saveExpense,
  savePayment,
  saveRevenue,
} from "./finance.js";
import { loadHrms } from "./hrms.js";
import { downloadDocumentPdf } from "./downloadPdf.js";
import { formatMoney, paymentReceiptDocument, releaseSalesPaymentsForApproval, salesPaymentRevenue, todayISO } from "./sales.js";
import { sessionAccount } from "./scope.js";

const TABS = [
  ["payroll", "Payroll"],
  ["expense", "Expense"],
  ["revenue", "Revenue"],
];

export function FinanceWorkspace() {
  const [tab, setTab] = useState("payroll");
  const [data, setData] = useState(() => {
    releaseSalesPaymentsForApproval();
    return loadFinance();
  });
  const [notice, setNotice] = useState("");

  function apply(result, message) {
    if (!result.ok) return result.error;
    setData(result.data);
    setNotice(message);
    return "";
  }

  return (
    <div className="stack">
      <div className="subnav" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => { setTab(id); setNotice(""); }}>
            {label}
          </button>
        ))}
      </div>
      {notice ? <p className="page-note">{notice}</p> : null}
      {tab === "payroll" ? <PayrollPanel data={data} apply={apply} /> : null}
      {tab === "expense" ? <ExpensePanel data={data} apply={apply} /> : null}
      {tab === "revenue" ? <RevenuePanel data={data} apply={apply} refresh={() => setData(loadFinance())} /> : null}
    </div>
  );
}

function PayrollPanel({ data, apply }) {
  const today = todayISO();
  const hrms = loadHrms();
  const employees = hrms.employees;
  const departments = hrms.departments;
  const [filters, setFilters] = useState(() => currentPeriod(today));
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const rows = data.payments.filter((payment) => matchesPeriod(payment.date, filters) && matchesStatus(payment, filters.status) && matchesDepartment(payment, employees, filters.department) && matchesEmployee(payment, employees, filters.query));

  function save(event) {
    event.preventDefault();
    const message = apply(savePayment(data, draft), "Payment saved.");
    setError(message);
    if (!message) setDraft(null);
  }

  return (
    <div className="stack">
      <div className="toolbar hr-filters">
        <label className="hr-search">
          Search
          <input value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Employee name or ID" />
        </label>
        <PeriodFilters filters={filters} setFilters={setFilters} />
        <label>
          Department
          <select value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}>
            <option value="">All departments</option>
            {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">All</option>
            {FINANCE_STATUSES.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <button className="ghost" type="button" onClick={() => setFilters(blankFilters())}>Clear filter</button>
        <button className="primary" type="button" onClick={() => { setDraft(blankPayment(employees, departments, today)); setError(""); }}>
          + Add payment
        </button>
      </div>
      {draft ? (
        <article className="panel">
          <h2>{draft.id ? "Edit payment" : "Add payment"}</h2>
          {employees.length === 0 ? <p className="empty-copy">Add an employee in HRMS before recording payroll.</p> : (
            <form className="sales-form" onSubmit={save}>
              <div className="sales-grid">
                <label>
                  Department
                  <select
                    value={draft.department}
                    onChange={(event) => {
                      const nextDepartment = event.target.value;
                      const nextPerson = employees.find((employee) => employee.department === nextDepartment);
                      setDraft({ ...draft, department: nextDepartment, employeeId: nextPerson?.id || "" });
                    }}
                  >
                    {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label>
                  Employee
                  <select value={draft.employeeId} onChange={(event) => setDraft({ ...draft, employeeId: event.target.value })} required>
                    {paymentPeople(employees, draft.department).length === 0 ? <option value="">No employees in this department</option> : null}
                    {paymentPeople(employees, draft.department).map((employee) => <option key={employee.id} value={employee.id}>{employeeTitle(employee)}</option>)}
                  </select>
                </label>
                <label>Base amount (LKR)<input type="number" min="0" step="0.01" value={draft.base} onChange={(event) => setDraft({ ...draft, base: event.target.value })} required /></label>
                <label>Commission (LKR)<input type="number" min="0" step="0.01" value={draft.commission} onChange={(event) => setDraft({ ...draft, commission: event.target.value })} required /></label>
                <label>Total amount<input value={formatMoney((Number(draft.base) || 0) + (Number(draft.commission) || 0))} readOnly /></label>
                <label>Pay date<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required /></label>
                <label>
                  Status
                  <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
                    {FINANCE_STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
              </div>
              {error ? <p className="form-error">{error}</p> : null}
              <div className="modal-actions">
                <button className="primary" type="submit">Save payment</button>
                <button className="ghost" type="button" onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
              </div>
            </form>
          )}
        </article>
      ) : null}
      <article className="panel">
        <table>
          <thead>
            <tr>
              <th>Employee</th><th>Base amount</th><th>Commission</th><th>Total amount</th><th>Pay date</th><th>Status</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={7}>No payments match these filters.</td></tr> : rows.map((payment) => {
              const employee = employees.find((item) => item.id === payment.employeeId);
              return (
                <tr key={payment.id}>
                  <td><strong>{employee?.name || "Unknown"}</strong><br /><small>{staffId(employee) || payment.employeeId}</small></td>
                  <td>{formatMoney(payment.base)}</td>
                  <td>{formatMoney(payment.commission)}</td>
                  <td>{formatMoney(payment.base + payment.commission)}</td>
                  <td>{payment.date}</td>
                  <td><span className={payment.status === "Paid" ? "account-status active" : "account-status inactive"}>{payment.status}</span></td>
                  <td><button className="ghost" type="button" onClick={() => { setDraft(paymentDraft(payment, employees)); setError(""); }}>Edit</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </article>
    </div>
  );
}

function ExpensePanel({ data, apply }) {
  const today = todayISO();
  const [filters, setFilters] = useState(() => currentPeriod(today));
  const [rows, setRows] = useState([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState("");
  const automatic = salaryExpenses(data.payments).filter((item) => matchesPeriod(item.date, filters) && matchesText(item, filters));
  const manual = data.expenses.filter((item) => matchesPeriod(item.date, filters) && (!filters.category || item.category === filters.category) && matchesText(item, filters));
  const visibleAuto = !filters.category || filters.category === "Salary" ? automatic : [];
  const total = [...visibleAuto, ...manual].reduce((sum, item) => sum + item.amount, 0);

  function addBlank() {
    setRows((current) => [...current, { key: uid(), id: "", date: today, category: data.categories[0] || DEFAULT_CATEGORIES[0], description: "", amount: "" }]);
    setError("");
  }

  function commitRow(row) {
    const message = apply(saveExpense(data, row), row.id ? "Expense updated." : "Expense saved.");
    setError(message);
    if (!message) setRows((current) => current.filter((item) => item.key !== row.key));
  }

  function addCategory(event) {
    event.preventDefault();
    const message = apply(saveCategory(data, category), "Category added.");
    setError(message);
    if (!message) {
      setCategory("");
      setCategoryOpen(false);
    }
  }

  return (
    <div className="stack">
      <div className="toolbar hr-filters">
        <label className="hr-search">
          Search
          <input value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Description or category" />
        </label>
        <PeriodFilters filters={filters} setFilters={setFilters} />
        <label>
          Category
          <select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>
            <option value="">All categories</option>
            <option>Salary</option>
            {data.categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <button className="ghost" type="button" onClick={() => setFilters({ ...blankFilters(), category: "" })}>Clear filter</button>
        <button className="ghost" type="button" onClick={() => { setCategoryOpen(true); setError(""); }}>+ Add category</button>
        <button className="primary" type="button" onClick={addBlank}>+ Add expense</button>
      </div>
      {categoryOpen ? (
        <article className="panel">
          <h2>Add category</h2>
          <form className="sales-form" onSubmit={addCategory}>
            <label>Category name<input value={category} onChange={(event) => setCategory(event.target.value)} required placeholder="e.g. Travel" /></label>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="modal-actions">
              <button className="primary" type="submit">Add category</button>
              <button className="ghost" type="button" onClick={() => { setCategoryOpen(false); setError(""); }}>Cancel</button>
            </div>
          </form>
        </article>
      ) : null}
      {rows.length ? (
        <article className="panel">
          <h2>Add expense</h2>
          {rows.map((row) => (
            <form key={row.key} className="sales-form" onSubmit={(event) => { event.preventDefault(); commitRow(row); }}>
              <div className="sales-grid">
                <label>Date<input type="date" value={row.date} onChange={(event) => updateRow(setRows, row.key, { date: event.target.value })} required /></label>
                <label>
                  Category
                  <select value={row.category} onChange={(event) => updateRow(setRows, row.key, { category: event.target.value })}>
                    {data.categories.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>Description<input value={row.description} onChange={(event) => updateRow(setRows, row.key, { description: event.target.value })} /></label>
                <label>Amount (LKR)<input type="number" min="0.01" step="0.01" value={row.amount} onChange={(event) => updateRow(setRows, row.key, { amount: event.target.value })} required /></label>
              </div>
              <div className="modal-actions">
                <button className="primary" type="submit">{row.id ? "Update" : "Add"}</button>
                <button className="ghost" type="button" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>Remove</button>
              </div>
            </form>
          ))}
          <button className="ghost" type="button" onClick={addBlank}>+ Expense</button>
          {error && !categoryOpen ? <p className="form-error">{error}</p> : null}
        </article>
      ) : null}
      {removing ? (
        <article className="panel">
          <h2>Delete this expense?</h2>
          <p className="lede">This removes the {removing.category} expense. The salary rows that come from payroll stay.</p>
          <div className="modal-actions">
            <button className="danger-button" type="button" onClick={() => {
              const message = apply(deleteExpense(data, removing.id), "Expense deleted.");
              setError(message);
              if (!message) setRemoving(null);
            }}>Delete</button>
            <button className="ghost" type="button" onClick={() => setRemoving(null)}>Cancel</button>
          </div>
        </article>
      ) : null}
      <article className="panel">
        <table>
          <thead>
            <tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Action</th></tr>
          </thead>
          <tbody>
            {visibleAuto.length + manual.length === 0 ? <tr><td colSpan={5}>No expenses match these filters.</td></tr> : (
              <>
                {visibleAuto.map((item) => (
                  <tr key={`auto-${item.date}`}>
                    <td>{item.date}</td>
                    <td>Salary</td>
                    <td>{item.description} <span className="account-status active">Auto</span></td>
                    <td>{formatMoney(item.amount)}</td>
                    <td>From payroll</td>
                  </tr>
                ))}
                {manual.map((item) => (
                  <tr key={item.id}>
                    <td>{item.date}</td>
                    <td>{item.category}</td>
                    <td>{item.description || "—"}</td>
                    <td>{formatMoney(item.amount)}</td>
                    <td>
                      <div className="icon-actions">
                        <button className="ghost" type="button" onClick={() => setRows((current) => current.some((row) => row.id === item.id) ? current : [...current, { ...item, key: item.id, amount: String(item.amount) }])}>Edit</button>
                        <button className="ghost" type="button" onClick={() => setRemoving(item)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
        <p className="page-note">Total: {formatMoney(total)}</p>
      </article>
    </div>
  );
}

function RevenuePanel({ data, apply, refresh }) {
  const waiting = data.projectInvoices.filter((item) => item.approval !== "approved").length;
  const [section, setSection] = useState("collections");
  return (
    <div className="stack">
      <FinanceNotices />
      <div className="subnav">
        <button type="button" className={section === "collections" ? "active" : ""} onClick={() => setSection("collections")}>Collections</button>
        <button type="button" className={section === "projects" ? "active" : ""} onClick={() => setSection("projects")}>Projects{waiting ? ` (${waiting})` : ""}</button>
      </div>
      {section === "projects" ? <ProjectRevenue data={data} refresh={refresh} /> : <CollectionRevenue data={data} apply={apply} />}
    </div>
  );
}

function FinanceNotices() {
  const username = sessionAccount()?.username || "";
  const [items, setItems] = useState(() => loadNotices(username));
  if (!items.length) return null;
  return (
    <article className="panel">
      <h2>Notifications</h2>
      {items.map((item) => (
        <div className="toolbar" key={item.id}>
          <p>{item.text}</p>
          <button className="ghost" type="button" onClick={() => { dismissNotice(item.id); setItems(loadNotices(username)); }}>Dismiss</button>
        </div>
      ))}
    </article>
  );
}

function ProjectRevenue({ data, refresh }) {
  const [viewing, setViewing] = useState(null);
  const [error, setError] = useState("");
  const rows = data.projectInvoices || [];

  function approve(invoice) {
    const result = approveProjectInvoice(invoice.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    refresh();
  }

  function download(invoice) {
    downloadDocumentPdf(invoice.receiptNo || "invoice", paymentReceiptDocument(invoice));
  }

  return (
    <div className="stack">
      {error ? <p className="form-error">{error}</p> : null}
      <article className="panel">
        {rows.length === 0 ? <p className="empty-copy">No project payments yet.</p> : (
          <table>
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Client</th>
                <th>Project</th>
                <th>Installment</th>
                <th>Amount</th>
                <th>Sales</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => (
                <tr key={invoice.id}>
                  <td><code>{invoice.receiptNo}</code></td>
                  <td>{invoice.clientName}</td>
                  <td>{invoice.projectName}</td>
                  <td>{invoice.type}</td>
                  <td>{formatMoney(invoice.amount)}</td>
                  <td>{invoice.salesOwner}</td>
                  <td>{invoice.approval === "approved" ? "Approved" : "Awaiting approval"}</td>
                  <td>
                    <div className="icon-actions">
                      <button className="ghost" type="button" onClick={() => setViewing(invoice)}>{invoice.approval === "approved" ? "View invoice" : "View"}</button>
                      <button className="ghost" type="button" onClick={() => download(invoice)}>Download</button>
                      {invoice.approval === "approved" ? null : <button className="primary" type="button" onClick={() => approve(invoice)}>Approve</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
      {viewing ? (
        <article className="panel">
          <div className="toolbar">
            <h2>{viewing.receiptNo}</h2>
            <div className="icon-actions">
              <button className="primary" type="button" onClick={() => download(viewing)}>Download PDF</button>
              <button className="ghost" type="button" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
          <iframe className="receipt-frame" title={viewing.receiptNo} srcDoc={paymentReceiptDocument(viewing)} />
        </article>
      ) : null}
    </div>
  );
}

function CollectionRevenue({ data, apply }) {
  const today = todayISO();
  const people = salesPeople();
  const [filters, setFilters] = useState(() => ({ ...currentPeriod(today), person: "" }));
  const [draft, setDraft] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState("");
  const salesRows = salesPaymentRevenue()
    .filter((item) => matchesPeriod(item.date, filters) && (!filters.person || item.salesPerson === filters.person))
    .map((item) => ({ ...item, manual: false }));
  const manualRows = data.revenue
    .filter((item) => matchesPeriod(item.date, filters) && (!filters.person || item.salesPerson === filters.person))
    .map((item) => ({ ...item, source: "manual", manual: true, approval: "" }));
  const rows = [...salesRows, ...manualRows].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const total = rows.reduce((sum, item) => sum + item.amount, 0);
  const periodLabel = `${filters.month === "" ? "All months" : MONTHS[Number(filters.month)]} ${filters.year || "all years"}`;

  function save(event) {
    event.preventDefault();
    const message = apply(saveRevenue(data, draft), "Revenue saved.");
    setError(message);
    if (!message) setDraft(null);
  }

  return (
    <div className="stack">
      <div className="stats">
        <article className="stat"><strong>{people.length}</strong><span>Sales persons</span></article>
        <article className="stat"><strong>{formatMoney(total)}</strong><span>Revenue · {periodLabel}</span></article>
      </div>
      <div className="toolbar hr-filters">
        <PeriodFilters filters={filters} setFilters={setFilters} />
        <label>
          Sales person
          <select value={filters.person} onChange={(event) => setFilters({ ...filters, person: event.target.value })}>
            <option value="">All sales persons</option>
            {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        <button className="ghost" type="button" onClick={() => setFilters({ ...blankFilters(), person: "" })}>Clear filter</button>
        <button className="primary" type="button" onClick={() => { setDraft(blankRevenue(people, today)); setError(""); }}>+ Add other revenue</button>
      </div>
      {draft ? (
        <article className="panel">
          <h2>{draft.id ? "Edit other revenue" : "Add other revenue"}</h2>
          <form className="sales-form" onSubmit={save}>
            <div className="sales-grid">
              <label>
                Sales person
                <select value={draft.salesPerson} onChange={(event) => setDraft({ ...draft, salesPerson: event.target.value })}>
                  <option value="">Other revenue</option>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.id} · {person.name}</option>)}
                </select>
              </label>
              <label>Collection date<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required /></label>
              <label className="span-all">Description<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={2} required /></label>
              <label>Amount (LKR)<input type="number" min="0.01" step="0.01" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} required /></label>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="modal-actions">
              <button className="primary" type="submit">Save other revenue</button>
              <button className="ghost" type="button" onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
            </div>
          </form>
        </article>
      ) : null}
      {removing ? (
        <article className="panel">
          <h2>Delete this revenue record?</h2>
          <div className="modal-actions">
            <button className="danger-button" type="button" onClick={() => {
              const message = apply(deleteRevenue(data, removing.id), "Revenue deleted.");
              setError(message);
              if (!message) setRemoving(null);
            }}>Delete</button>
            <button className="ghost" type="button" onClick={() => setRemoving(null)}>Cancel</button>
          </div>
        </article>
      ) : null}
      <article className="panel">
        {rows.length === 0 ? <p className="empty-copy">No revenue for this period.</p> : (
          <table>
            <thead>
              <tr><th>Source</th><th>Sales person</th><th>Date</th><th>Description</th><th>Amount</th><th>Action</th></tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const person = people.find((entry) => entry.id === item.salesPerson);
                return (
                  <tr key={item.id}>
                    <td>{item.manual ? "Other" : "Sales payment"}</td>
                    <td>{person ? <><strong>{person.name}</strong><br /><small>{person.id}</small></> : "—"}</td>
                    <td>{item.date || "—"}</td>
                    <td>{item.description || "—"}{item.approval === "pending" ? " · Awaiting approval" : ""}</td>
                    <td>{formatMoney(item.amount)}</td>
                    <td>
                      {item.manual ? (
                        <div className="icon-actions">
                          <button className="ghost" type="button" onClick={() => setDraft({ ...item, amount: String(item.amount) })}>Edit</button>
                          <button className="ghost" type="button" onClick={() => setRemoving(item)}>Delete</button>
                        </div>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </article>
    </div>
  );
}

function PeriodFilters({ filters, setFilters }) {
  const years = yearChoices(filters.year);
  return (
    <>
      <label>
        Month
        <select value={filters.month} onChange={(event) => setFilters({ ...filters, month: event.target.value })}>
          <option value="">All</option>
          {MONTHS.map((month, index) => <option key={month} value={String(index)}>{month}</option>)}
        </select>
      </label>
      <label>
        Year
        <select value={filters.year} onChange={(event) => setFilters({ ...filters, year: event.target.value })}>
          <option value="">All</option>
          {years.map((year) => <option key={year}>{year}</option>)}
        </select>
      </label>
    </>
  );
}

function currentPeriod(today) {
  return { query: "", month: String(Number(today.slice(5, 7)) - 1), year: today.slice(0, 4), status: "", category: "", department: "" };
}

function blankFilters() {
  return { query: "", month: "", year: "", status: "", category: "", department: "" };
}

function yearChoices(selected) {
  const todayYear = Number(todayISO().slice(0, 4));
  const years = new Set([String(todayYear - 1), String(todayYear), String(todayYear + 1)]);
  if (selected) years.add(selected);
  return [...years].sort();
}

function matchesPeriod(date, filters) {
  const month = Number(String(date).slice(5, 7)) - 1;
  const year = String(date).slice(0, 4);
  return (filters.month === "" || month === Number(filters.month)) && (!filters.year || year === filters.year);
}

function matchesStatus(payment, status) {
  return !status || payment.status === status;
}

function matchesDepartment(payment, employees, department) {
  if (!department) return true;
  const employee = employees.find((item) => item.id === payment.employeeId);
  return employee?.department === department;
}

function matchesEmployee(payment, employees, query) {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  const employee = employees.find((item) => item.id === payment.employeeId);
  return [employee?.name, staffId(employee), payment.employeeId].join(" ").toLowerCase().includes(text);
}

function matchesText(item, filters) {
  const text = filters.query.trim().toLowerCase();
  if (!text) return true;
  return `${item.category} ${item.description}`.toLowerCase().includes(text);
}

function blankPayment(employees, departments, today) {
  const department = departments.find((item) => employees.some((employee) => employee.department === item.id))?.id || departments[0]?.id || "";
  const person = employees.find((employee) => employee.department === department);
  return { id: "", employeeId: person?.id || "", department, base: "0", commission: "0", date: today, status: "Paid" };
}

function paymentDraft(payment, employees) {
  const employee = employees.find((item) => item.id === payment.employeeId);
  return { ...payment, base: String(payment.base), commission: String(payment.commission), department: employee?.department || "" };
}

function paymentPeople(employees, department) {
  return employees.filter((employee) => employee.department === department);
}

function blankRevenue(_people, today) {
  return { id: "", salesPerson: "", date: today, description: "", amount: "" };
}

function staffId(employee) {
  if (!employee) return "";
  return employee.memberType === "admin" ? (employee.username || "") : (employee.code || "");
}

function employeeTitle(employee) {
  const id = staffId(employee);
  return id ? `${id} – ${employee.name}` : employee.name;
}

function salesPeople() {
  const employees = loadHrms().employees;
  return loadUsers()
    .filter((user) => user.role === "sales" && user.active)
    .map((user) => {
      const employee = employees.find((item) => item.username === user.username);
      return { id: user.username, name: employee?.name || user.username };
    });
}

function updateRow(setRows, key, patch) {
  setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
}

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
