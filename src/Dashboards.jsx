import { useMemo, useState } from "react";
import { loadUsers } from "./crm.js";
import {
  approveProjectInvoice,
  invoicesForUser,
  loadFinance,
  MONTHS,
  salaryExpenses,
} from "./finance.js";
import { loadHrms } from "./hrms.js";
import { loadMarketing } from "./marketing.js";
import { loadIssues } from "./issues.js";
import { loadClients } from "./clients.js";
import { companyProjects, loadProjects, marketingProjects, projectCounts, taskDepartment } from "./projects.js";
import { loadReports } from "./reports.js";
import {
  companyConvertedQuotes,
  formatMoney,
  loadCeoSales,
  loadPackages,
  loadSales,
  releaseSalesPaymentsForApproval,
  salesPaymentRevenue,
  todayISO,
} from "./sales.js";
import { dataOwner, readAccount, sessionAccount } from "./scope.js";
import { loadTasks, tasksForOwner } from "./tasks.js";
import { InvoiceDialog } from "./InvoiceView.jsx";

const PALETTE = ["#873CFF", "#1A2042", "#C412FC", "#68A8FF", "#F103FA", "#131937", "#070C2B", "#68A8FF"];

export function CeoDashboard() {
  releaseSalesPaymentsForApproval();
  const [board, setBoard] = useState("company");
  const [revision, setRevision] = useState(0);
  const [viewing, setViewing] = useState(null);
  const [error, setError] = useState("");
  const picture = useMemo(() => ceoPicture(), [revision]);
  const finance = picture.finance;
  const waiting = finance.projectInvoices.filter((item) => item.approval !== "approved");
  const approved = finance.projectInvoices.filter((item) => item.approval === "approved");

  function approve(invoice) {
    const result = approveProjectInvoice(invoice.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    setRevision((value) => value + 1);
  }

  return (
    <div className="stack">
      <div className="dash-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={board === "company"} className={board === "company" ? "active" : ""} onClick={() => setBoard("company")}>Company</button>
        <button type="button" role="tab" aria-selected={board === "own"} className={board === "own" ? "active" : ""} onClick={() => setBoard("own")}>Own projects</button>
      </div>
      {board === "own" ? <OwnProjectsBoard /> : (
      <>
      <Hero
        kicker="Neon Labz"
        title="Company dashboard"
        note={todayLabel()}
        badge={waiting.length ? `${waiting.length} awaiting approval` : "All payments reviewed"}
        alert={waiting.length > 0}
      />
      <section className="dash-metrics">
        <Metric tone={3} label={picture.revenueLabel} value={formatMoney(picture.monthRevenue)} />
        <Metric tone={0} label="Projects" value={String(picture.convertedProjects)} />
        <Metric tone={1} label="Own projects" value={String(picture.ownProjects.length)} />
        <Metric tone={2} label="People" value={String(picture.employees.length)} />
        <Metric tone={4} label="Packages" value={String(picture.packages.length)} />
      </section>
      <article className="panel dash-panel">
        <div className="toolbar">
          <div>
            <h2>Payment approval</h2>
          </div>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        {waiting.length === 0 ? <p className="empty-copy">No payment is waiting for approval.</p> : (
          <div className="approval-list">
            {waiting.map((invoice) => (
              <article className="approval-card" key={invoice.id}>
                <div>
                  <strong>{invoice.clientName || invoice.projectName}</strong>
                  <p>{invoice.projectName} · {invoice.type}</p>
                  <small>{invoice.salesOwner} · {invoice.receiptNo} · {invoice.date}</small>
                </div>
                <b>{formatMoney(invoice.amount)}</b>
                <div className="icon-actions">
                  <button className="ghost" type="button" onClick={() => setViewing(invoice)}>View</button>
                  <button className="primary" type="button" onClick={() => approve(invoice)}>Approve</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </article>
      <div className="chart-grid three">
        <RingCard title="Project status" slices={picture.projectSlices} />
        <RingCard title="Sales follow-ups" slices={picture.followSlices} />
        <RingCard title="People by department" slices={picture.departmentSlices} />
      </div>
      <div className="chart-grid">
        <BarCard title="Finance records" tone="slate" slices={picture.financeSlices} />
        <BarCard title="Expenses" tone="slate" slices={picture.expenseSlices} format={formatMoney} />
        <BarCard title="Marketing" tone="slate" slices={picture.marketingSlices} />
        <BarCard title="Packages" tone="slate" slices={picture.packageSlices} />
        <BarCard title="User accounts" tone="slate" slices={picture.userSlices} />
      </div>
      <InvoiceBoard title="Approved payment invoices" invoices={approved} onView={setViewing} empty="Approved invoices appear here after you stamp them." />
      <InvoiceDialog invoice={viewing} onClose={() => setViewing(null)} />
      </>
      )}
    </div>
  );
}

function OwnProjectsBoard() {
  const username = sessionAccount()?.username || "";
  const picture = useMemo(() => ownPicture(username), [username]);
  return (
    <>
      <Hero
        kicker={username}
        title="Own projects"
        note=""
        badge={`${picture.counts.inProgress} in progress`}
      />
      <section className="dash-metrics">
        <Metric tone={0} label="Projects" value={String(picture.projects.length)} />
        <Metric tone={1} label="In progress" value={String(picture.counts.inProgress)} />
        <Metric tone={2} label="Clients" value={String(picture.clients.length)} />
        <Metric tone={3} label="Quotations" value={String(picture.quotes.length)} />
        <Metric tone={4} label="Payments" value={String(picture.payments.length)} />
      </section>
      <div className="chart-grid">
        <RingCard title="Project status" slices={picture.projectSlices} />
        <BarCard title="Project type" tone="slate" slices={picture.typeSlices} />
      </div>
      <div className="chart-grid">
        <BarCard title="Clients" tone="slate" slices={picture.clientSlices} />
        <BarCard title="Marketing" tone="slate" slices={picture.marketingSlices} />
        <BarCard title="Payments" tone="slate" slices={picture.paymentSlices} />
        <BarCard title="Quotations" tone="slate" slices={picture.quoteSlices} format={formatMoney} />
      </div>
      <article className="panel dash-panel">
        <h2>Projects</h2>
        {picture.projects.length === 0 ? <p className="empty-copy">No own projects yet.</p> : (
          <table>
            <thead>
              <tr><th>Code</th><th>Project</th><th>Client</th><th>Type</th><th>Status</th></tr>
            </thead>
            <tbody>
              {picture.projects.map((project) => (
                <tr key={project.id}>
                  <td><code>{project.code || "—"}</code></td>
                  <td>{project.name || "Untitled"}</td>
                  <td>{project.client || "—"}</td>
                  <td>{projectTypeLabel(project.type)}</td>
                  <td>{project.archived ? "Archived" : labelize(project.status || "in-progress")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </>
  );
}

export function PmDashboard() {
  const username = sessionAccount()?.username || "";
  const picture = useMemo(() => pmPicture(username), [username]);

  return (
    <div className="stack">
      <Hero kicker={username} title="Project dashboard" note="" badge={`${picture.counts.inProgress} in progress`} tone="pm" />
      <section className="dash-metrics">
        <Metric tone={0} label="Projects" value={String(picture.counts.total)} />
        <Metric tone={1} label="In progress" value={String(picture.counts.inProgress)} />
        <Metric tone={2} label="Tasks" value={String(picture.tasks.length)} />
        <Metric tone={3} label="Issues" value={String(picture.issues.length)} />
        <Metric tone={4} label="Clients" value={String(picture.clients.length)} />
      </section>
      <div className="chart-grid three">
        <RingCard title="Projects" slices={picture.projectSlices} showDetail={false} />
        <RingCard title="Tasks" slices={picture.taskSlices} showDetail={false} />
        <RingCard title="Issues" slices={picture.issueSlices} showDetail={false} />
      </div>
      <div className="chart-grid">
        <BarCard title="Clients" tone="slate" slices={picture.clientSlices} showDetail={false} />
        <BarCard title="Reports" tone="slate" slices={picture.reportSlices} showDetail={false} />
        <BarCard title="Packages" tone="slate" slices={picture.packageSlices} showDetail={false} />
        <BarCard title="Team" tone="slate" slices={picture.teamSlices} showDetail={false} />
      </div>
    </div>
  );
}

export function MdDashboard() {
  const username = sessionAccount()?.username || "";
  const data = loadMarketing();
  const side = marketingSideCounts();
  const industry = counted(
    uniqueLabels(data.clients.map((item) => item.industry || "Unspecified")),
    data.clients,
    (item) => item.industry || "Unspecified",
    (item) => item.brandName || item.legalName || "Info document"
  );
  const work = [
    namedSlice("docs", "Info documents", data.clients.length, "#873CFF", []),
    namedSlice("plans", "Content plans", data.plans.length, "#68A8FF", []),
    namedSlice("reports", "Reports", data.reports.length, "#C412FC", []),
  ];
  return (
    <div className="stack">
      <Hero kicker={username} title="Marketing dashboard" note="" badge={`${data.reports.length} reports`} tone="md" />
      <section className="dash-metrics md-dash-metrics">
        <Metric tone={0} label="Info documents" value={String(data.clients.length)} />
        <Metric tone={1} label="Content plans" value={String(data.plans.length)} />
        <Metric tone={2} label="Reports" value={String(data.reports.length)} />
        <Metric tone={3} label="Total tasks" value={String(side.tasks)} />
        <Metric tone={4} label="In progress" value={String(side.inProgress)} />
        <Metric tone={5} label="Issues" value={String(side.issues)} />
      </section>
      <div className="chart-grid md-dash-charts">
        <RingCard title="Industries" showDetail={false} slices={industry.length ? industry : [namedSlice("none", "No documents", 0, "#8e99a4", [])]} />
        <BarCard title="Marketing work" tone="slate" slices={work} showDetail={false} />
      </div>
    </div>
  );
}

export function SalesDashboardExtras({ target = 0, achieved = 0, leadTarget = 0, clientTarget = 0, collected = 0 }) {
  const session = sessionAccount();
  const username = session?.role === "sales" ? session.username : dataOwner();
  const [viewing, setViewing] = useState(null);
  const sales = loadSales();
  const invoices = invoicesForUser(username, "sales");
  const payments = paymentSlices(sales.payments || []);
  const follows = followSlices(sales.followUps || []);
  const packages = packageSlices(loadPackages());
  const goals = [
    namedSlice("leads", "Target leads", leadTarget, "#873CFF", []),
    namedSlice("clients", "Target clients", clientTarget, "#68A8FF", []),
    namedSlice("achieved", "Achieved clients", achieved, "#F103FA", []),
  ];
  return (
    <>
      <div className="chart-grid">
        <RingCard title="Payments" slices={payments} />
        <RingCard title="Follow-ups" slices={follows} />
      </div>
      <div className="chart-grid">
        <BarCard title="Packages" tone="slate" slices={packages} />
        <BarCard title="This month" tone="slate" slices={goals} />
      </div>
      <Compare title="Collections against the monthly target" done={collected} goal={target} doneLabel="Confirmed collections" goalLabel="Monthly target" />
      <InvoiceBoard title="Approved payment invoices" invoices={invoices} onView={setViewing} empty="After the CEO approves a payment you recorded, the stamped invoice appears here." />
      <InvoiceDialog invoice={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function Hero({ kicker, title, note, badge, alert = false, tone = "" }) {
  return (
    <header className={`dash-hero ${tone}`.trim()}>
      <div className="dash-hero-copy">
        <p>{kicker}</p>
        <h2>{title}</h2>
        {note ? <span>{note}</span> : null}
      </div>
      <strong className={alert ? "dash-badge alert" : "dash-badge"}>{badge}</strong>
    </header>
  );
}

function RingCard({ title, slices, showDetail = true }) {
  const usable = slices.length ? slices : [namedSlice("empty", "Nothing yet", 0, "#d5dbe3", [])];
  const [active, setActive] = useState(usable.find((item) => item.value > 0)?.id || usable[0].id);
  const chosen = usable.find((item) => item.id === active) || usable[0];
  return (
    <article className="panel dash-panel chart-card">
      <h2 className="chart-band">{title}</h2>
      <div className="chart-body">
        <RingChart slices={usable} active={chosen.id} onPick={setActive} />
        {showDetail ? <Detail names={chosen.names} label={chosen.label} /> : null}
      </div>
    </article>
  );
}

function BarCard({ title, slices, format = (value) => String(value), tone = "slate", showDetail = true }) {
  const usable = slices.length ? slices : [namedSlice("empty", "Nothing yet", 0, "#d5dbe3", [])];
  const [active, setActive] = useState(usable[0].id);
  const chosen = usable.find((item) => item.id === active) || usable[0];
  const max = Math.max(1, ...usable.map((item) => item.value));
  return (
    <article className="panel dash-panel chart-card">
      <h2 className={`chart-band ${tone}`}>{title}</h2>
      <div className="chart-body">
        <div className="bars" role="list">
          {usable.map((slice) => (
            <button key={slice.id} type="button" className={slice.id === chosen.id ? "hbar active" : "hbar"} onClick={() => setActive(slice.id)}>
              <span>{slice.label}</span>
              <i><b style={{ width: `${slice.value ? Math.max(6, (slice.value / max) * 100) : 0}%`, background: slice.color }} /></i>
              <strong>{format(slice.value)}</strong>
            </button>
          ))}
        </div>
        {showDetail ? <Detail names={chosen.names} label={chosen.label} /> : null}
      </div>
    </article>
  );
}

function RingChart({ slices, active, onPick }) {
  const drawn = slices.filter((slice) => slice.value > 0);
  const total = drawn.reduce((sum, slice) => sum + slice.value, 0) || 1;
  const cx = 80;
  const cy = 80;
  const radius = 52;
  let cursor = -Math.PI / 2;
  const gap = drawn.length > 1 ? 0.045 : 0;
  const arcs = drawn.map((slice) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    const start = cursor + gap / 2;
    const end = cursor + Math.max(sweep - gap / 2, gap);
    cursor += sweep;
    return { ...slice, start, end, pct: Math.round((slice.value / total) * 100) };
  });

  function point(angle, distance) {
    return [cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance];
  }

  function arc(start, end) {
    const [x1, y1] = point(start, radius);
    const [x2, y2] = point(end, radius);
    const large = end - start > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  }

  return (
    <div className="ring-layout">
      <svg className="ring-chart" viewBox="0 0 160 160" role="img" aria-label="Breakdown">
        {arcs.length === 0 ? (
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e6e8ec" strokeWidth="18" />
        ) : null}
        {arcs.map((slice) => {
          const full = arcs.length === 1;
          const selected = slice.id === active;
          return (
            <g key={slice.id} className={selected ? "is-active" : ""} onClick={() => onPick(slice.id)}>
              {full ? (
                <circle cx={cx} cy={cy} r={radius} fill="none" stroke={slice.color} strokeWidth={selected ? 22 : 18} />
              ) : (
                <path d={arc(slice.start, slice.end)} fill="none" stroke={slice.color} strokeWidth={selected ? 22 : 18} strokeLinecap="butt" />
              )}
            </g>
          );
        })}
      </svg>
      <ul className="ring-legend">
        {(drawn.length ? arcs : slices).map((slice) => (
          <li key={slice.id}>
            <button type="button" className={slice.id === active ? "active" : ""} onClick={() => onPick(slice.id)}>
              <i style={{ background: slice.color }} />
              <span>{slice.label}</span>
              <strong>{slice.value}{slice.pct != null ? ` (${slice.pct}%)` : ""}</strong>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detail({ names = [], label }) {
  if (!names.length) return <p className="empty-copy">Nothing recorded under {label}.</p>;
  return (
    <ul className="chart-detail">
      {names.slice(0, 4).map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}
      {names.length > 4 ? <li>+{names.length - 4} more</li> : null}
    </ul>
  );
}

function Compare({ title, done, goal, doneLabel, goalLabel }) {
  const width = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;
  return (
    <article className="panel dash-panel">
      <h2>{title}</h2>
      <div className="compare">
        <div>
          <span>{doneLabel}</span>
          <strong>{formatMoney(done)}</strong>
        </div>
        <div>
          <span>{goalLabel}</span>
          <strong>{formatMoney(goal)}</strong>
        </div>
      </div>
      <div className="compare-track" aria-hidden="true">
        <b style={{ width: `${width}%` }} />
      </div>
      <p className="lede">{goal > 0 ? `${width}% of the monthly target is confirmed.` : "Set a monthly target to see the progress bar."}</p>
    </article>
  );
}

function InvoiceBoard({ title, invoices, onView, empty }) {
  return (
    <article className="panel dash-panel">
      <h2>{title}</h2>
      {invoices.length === 0 ? <p className="empty-copy">{empty}</p> : (
        <table>
          <thead>
            <tr><th>Receipt</th><th>Client</th><th>Project</th><th>Amount</th><th></th></tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td><code>{invoice.receiptNo}</code></td>
                <td>{invoice.clientName}</td>
                <td>{invoice.projectName}</td>
                <td>{formatMoney(invoice.amount)}</td>
                <td><button className="ghost" type="button" onClick={() => onView(invoice)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

function Metric({ label, value, tone = 0 }) {
  return (
    <article className={`dash-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ceoPicture() {
  const username = sessionAccount()?.username || "";
  const finance = loadFinance();
  const packages = loadPackages();
  const employees = loadHrms().employees;
  const pmProjects = readAll("pm", "neon-crm-projects", "projects");
  const ownProjects = readOwn(username, "neon-crm-projects", "projects");
  const convertedProjects = companyConvertedQuotes().length;
  const follows = readAll("sales", "neon-crm-sales", "followUps");
  const marketingDocs = accounts("marketing").map((user) => ({
    id: user.username,
    label: user.username,
    value: readOwn(user.username, "neon-crm-marketing", "clients").length,
    names: readOwn(user.username, "neon-crm-marketing", "clients").map((item) => item.brandName || item.legalName || "Info document"),
    color: "",
  }));
  const monthRevenue = currentMonthRevenue(finance);
  const expenseRows = [
    ...finance.expenses.map((item) => ({ category: item.category || "Expense", amount: item.amount, name: item.description || item.category })),
    ...salaryExpenses(finance.payments).map((item) => ({ category: "Salary", amount: item.amount, name: item.description })),
  ];
  return {
    finance,
    monthRevenue: monthRevenue.total,
    revenueLabel: monthRevenue.label,
    packages,
    employees,
    pmProjects,
    ownProjects,
    convertedProjects,
    projectSlices: statusSlices(pmProjects),
    ownSlices: statusSlices(ownProjects),
    departmentSlices: peopleByDepartment(employees),
    financeSlices: [
      namedSlice("payroll", "Payroll", finance.payments.length, "#873CFF", finance.payments.map(() => "Payroll record")),
      namedSlice("expense", "Expenses", finance.expenses.length, "#68A8FF", finance.expenses.map((item) => item.description || item.category)),
      namedSlice("revenue", "Revenue", finance.revenue.length, "#F103FA", finance.revenue.map((item) => item.description || item.salesPerson)),
      namedSlice("projects", "Project payments", finance.projectInvoices.length, "#C412FC", finance.projectInvoices.map((item) => item.projectName || item.clientName)),
    ],
    followSlices: followSlices(follows),
    marketingSlices: marketingDocs.length ? marketingDocs.map((item, index) => ({ ...item, color: PALETTE[index % PALETTE.length] })) : [namedSlice("none", "No marketing accounts", 0, "#64748b", [])],
    packageSlices: packageSlices(packages),
    userSlices: counted(["Project Manager", "Marketing", "Sales"], loadUsers().filter((user) => user.active && user.role !== "ceo"), (user) => roleLabel(user.role), (user) => user.username),
    expenseSlices: moneySlices(expenseRows),
  };
}

function ownPicture(username) {
  const projects = readOwn(username, "neon-crm-projects", "projects");
  const clients = readOwn(username, "neon-crm-clients", "clients");
  const marketing = readAccount("neon-crm-marketing", username) || {};
  const docs = Array.isArray(marketing.clients) ? marketing.clients : [];
  const plans = Array.isArray(marketing.plans) ? marketing.plans : [];
  const reports = Array.isArray(marketing.reports) ? marketing.reports : [];
  const sales = loadCeoSales(username);
  const projectIds = new Set(projects.map((item) => item.id));
  const prefixedIds = new Set(projects.map((item) => `${username}:${item.id}`));
  const quotes = (Array.isArray(sales.quotes) ? sales.quotes : []).filter((quote) => projectIds.has(quote.projectId) || prefixedIds.has(quote.projectId));
  const quoteIds = new Set(quotes.map((quote) => quote.id));
  const clientIds = new Set(clients.map((client) => client.id));
  const payments = (Array.isArray(sales.payments) ? sales.payments : []).filter((payment) => quoteIds.has(payment.quoteId) || clientIds.has(payment.clientId));
  const types = [
    ["software", "Software"],
    ["marketing", "Marketing"],
    ["both", "Both"],
  ];
  return {
    projects,
    clients,
    quotes,
    payments,
    counts: projectCounts(projects),
    projectSlices: statusSlices(projects),
    typeSlices: types.map(([id, label], index) => namedSlice(
      id,
      label,
      projects.filter((item) => (item.type || "software") === id).length,
      PALETTE[index % PALETTE.length],
      projects.filter((item) => (item.type || "software") === id).map((item) => item.name || "Project")
    )),
    clientSlices: counted(["active", "inactive"], clients, (item) => item.status || "active", (item) => item.name || "Client"),
    marketingSlices: [
      namedSlice("docs", "Info documents", docs.length, "#873CFF", docs.map((item) => item.brandName || item.legalName || "Info document")),
      namedSlice("plans", "Content plans", plans.length, "#68A8FF", plans.map((item) => item.name || item.title || "Content plan")),
      namedSlice("reports", "Reports", reports.length, "#F103FA", reports.map((item) => item.title || item.brandName || "Report")),
    ],
    paymentSlices: paymentSlices(payments),
    quoteSlices: quotes.length
      ? quotes.map((quote, index) => namedSlice(quote.id, quote.number || quote.client || "Quotation", Number(quote.total || 0), PALETTE[index % PALETTE.length], [quote.client || quote.address || "Quotation"]))
      : [namedSlice("none", "No quotations", 0, "#8e99a4", [])],
  };
}

function projectTypeLabel(type) {
  if (type === "marketing") return "Marketing";
  if (type === "both") return "Both";
  return "Software";
}

function pmPicture() {
  const projects = loadProjects().projects;
  const tasks = loadTasks();
  const issues = loadIssues();
  const clients = loadClients();
  const reports = loadReports();
  return {
    counts: projectCounts(projects),
    tasks,
    issues,
    clients,
    projectSlices: statusSlices(projects),
    taskSlices: counted(["critical", "high", "medium", "low"], tasks, (item) => item.priority || "medium", (item) => item.title || "Task"),
    issueSlices: counted(["open", "in-progress", "resolved", "closed"], issues, (item) => item.status || "open", (item) => item.title || "Issue"),
    clientSlices: counted(["active", "inactive"], clients, (item) => item.status || "active", (item) => item.name || "Client"),
    reportSlices: [
      namedSlice("srs", "SRS documents", reports.srs.length, "#873CFF", reports.srs.map((item) => item.title || "SRS")),
      namedSlice("proposals", "Proposals", reports.proposals.length, "#68A8FF", reports.proposals.map((item) => item.title || "Proposal")),
      namedSlice("videos", "Demo videos", reports.videos.length, "#F103FA", reports.videos.map((item) => item.title || "Demo video")),
    ],
    packageSlices: packageSlices(loadPackages()),
    teamSlices: peopleByDepartment(loadHrms().employees),
  };
}

function statusSlices(projects) {
  return counted(["in-progress", "completed", "on-hold", "archived"], projects, (item) => (item.archived ? "archived" : item.status || "in-progress"), (item) => item.name || item.client || "Project");
}

function followSlices(items) {
  return counted(["success", "in-progress", "failed"], items, (item) => item.status || "in-progress", (item) => item.name || "Follow-up");
}

function paymentSlices(items) {
  return counted(["pending", "awaiting", "approved", "cancelled"], items, paymentKey, (item) => item.clientName || item.type || "Payment");
}

function packageSlices(items) {
  const services = [...new Set(items.map((item) => item.service || "Package"))];
  return counted(services.length ? services : ["Package"], items, (item) => item.service || "Package", (item) => item.name || "Package");
}

function paymentKey(item) {
  if (item.status === "cancelled") return "cancelled";
  if (item.approval === "pending") return "awaiting";
  if (item.status === "confirmed") return "approved";
  return "pending";
}

function moneySlices(rows) {
  const categories = [...new Set(rows.map((item) => item.category || "Expense"))];
  return categories.map((category, index) => ({
    id: category,
    label: category,
    value: rows.filter((item) => item.category === category).reduce((sum, item) => sum + Number(item.amount || 0), 0),
    names: rows.filter((item) => item.category === category).map((item) => item.name || category),
    color: PALETTE[index % PALETTE.length],
  }));
}

function counted(catalog, items, idOf, nameOf) {
  return catalog.map((id, index) => {
    const label = labelize(id);
    const matched = items.filter((item) => idOf(item) === id || idOf(item) === label);
    return {
      id,
      label,
      value: matched.length,
      names: matched.map(nameOf).filter(Boolean),
      color: PALETTE[index % PALETTE.length],
    };
  });
}

function namedSlice(id, label, value, color, names) {
  return { id, label, value, color, names: names.filter(Boolean) };
}

function uniqueLabels(values) {
  return [...new Set(values.filter(Boolean))];
}

function marketingSideCounts() {
  const projects = marketingProjects();
  const cache = new Map();
  const tasks = [];
  for (const project of projects) {
    if (!cache.has(project.owner)) cache.set(project.owner, tasksForOwner(project.owner));
    for (const task of cache.get(project.owner) || []) {
      if (task.projectId !== project.id) continue;
      if (taskDepartment(task, project) !== "marketing") continue;
      tasks.push(task);
    }
  }
  return {
    tasks: tasks.length,
    inProgress: tasks.filter((task) => task.status === "in-progress").length,
    issues: loadIssues().length,
  };
}

function accounts(role) {
  return loadUsers().filter((user) => user.active && (!role || user.role === role));
}

function readAll(role, base, key) {
  return accounts(role).flatMap((user) => readOwn(user.username, base, key));
}

function readOwn(username, base, key) {
  const raw = readAccount(base, username);
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return Array.isArray(raw[key]) ? raw[key] : [];
}

function peopleByDepartment(employees) {
  const departments = loadHrms().departments;
  if (!departments.length) return [namedSlice("none", "No departments", 0, "#8e99a4", [])];
  return departments.map((department, index) => ({
    id: department.id,
    label: department.name,
    value: employees.filter((item) => item.department === department.id).length,
    names: employees.filter((item) => item.department === department.id).map((item) => item.name).filter(Boolean),
    color: PALETTE[index % PALETTE.length],
  }));
}

function roleLabel(role) {
  if (role === "pm") return "Project Manager";
  if (role === "marketing") return "Marketing";
  if (role === "sales") return "Sales";
  return "Other";
}

function labelize(id) {
  const words = { "in-progress": "In progress", "on-hold": "On hold", success: "Success", failed: "Failed", awaiting: "Awaiting CEO", approved: "Approved", pending: "Pending", cancelled: "Cancelled", active: "Active", inactive: "Inactive", critical: "Critical", high: "High", medium: "Medium", low: "Low", open: "Open", resolved: "Resolved", closed: "Closed", archived: "Archived", completed: "Completed" };
  return words[id] || id;
}

function currentMonthRevenue(finance) {
  const today = todayISO();
  const month = today.slice(0, 7);
  const inMonth = (date) => String(date || "").slice(0, 7) === month;
  const sales = salesPaymentRevenue().filter((item) => inMonth(item.date)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const manual = (finance.revenue || []).filter((item) => inMonth(item.date)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const monthIndex = Number(today.slice(5, 7)) - 1;
  return { total: sales + manual, label: `${MONTHS[monthIndex] || "Monthly"} revenue` };
}

function todayLabel() {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Colombo" }).format(new Date());
}
