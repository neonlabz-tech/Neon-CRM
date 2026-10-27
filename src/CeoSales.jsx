import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatPhone } from "./hrms.js";
import { ScopeHtml } from "./ScopeEditor.jsx";
import {
  CALL_OUTCOMES,
  CEO_SALES_FOCUS_KEY,
  CEO_SALES_TAB_KEY,
  LEAD_SOURCES,
  LEAD_STAGES,
  leadServiceOptions,
  LEAD_PHONE_EXISTS_MESSAGE,
  OPEN_SALES_APPROVAL,
  SALE_STATUS_LABEL,
  SALE_STATUSES,
  ceoSetSaleStatus,
  companyConvertedQuotes,
  companyLeads,
  companySalesRows,
  dueLeads,
  escapeHtml,
  formatMoney,
  inDateRange,
  loadCeoSalesControl,
  monthBounds,
  nextCompanyLeadId,
  nextManualSaleId,
  proratedTarget,
  releaseSalesPaymentsForApproval,
  salesStaff,
  salesStaffName,
  saveCeoManualSale,
  saveCeoOrgSettings,
  saveCeoStaffMember,
  saveCompanyLead,
  UNASSIGNED_OWNER,
  staffCommissionRate,
  staffDailyGoals,
  staffMonthlyTarget,
  startMissionClock,
  missionDay,
  todayISO,
} from "./sales.js";

const CEO_SALES_TABS = [
  ["overview", "Overview", "CEO Sales Performance Dashboard", "Company-wide or individual performance for the selected date period"],
  ["leads", "Leads & Follow-ups", "All Leads & Follow-ups", "Lead search, assignments, activity and follow-up count"],
  ["quotations", "Quotations", "Converted client quotations", "Quotations the sales admin recorded for converted clients"],
  ["approvals", "Sales approvals", "Sales & Collection Approvals", "Review submitted sales, confirm payments and control approval status"],
  ["team", "Sales team", "Sales Team & Targets", "Manage per-person monthly targets, commission rates and staff assignments"],
  ["reports", "Reports", "Performance Reports", "Collection breakdown, lead pipeline and team activity"],
  ["settings", "Settings", "CRM Settings", "Organization targets and daily activity goals"],
];

function storedCeoSalesTab(initialTab) {
  try {
    const stored = sessionStorage.getItem(CEO_SALES_TAB_KEY);
    if (CEO_SALES_TABS.some(([id]) => id === stored)) return stored;
  } catch {
    // Fall through to the page default.
  }
  return CEO_SALES_TABS.some(([id]) => id === initialTab) ? initialTab : "overview";
}

function storedCeoSalesFocus() {
  try {
    return sessionStorage.getItem(CEO_SALES_FOCUS_KEY) || "";
  } catch {
    return "";
  }
}

export function CeoSalesWorkspace({ initialTab }) {
  const bounds = monthBounds();
  const [tab, setTab] = useState(() => storedCeoSalesTab(initialTab));
  const [revision, setRevision] = useState(0);
  const [mission, setMission] = useState(() => missionDay());
  const [from, setFrom] = useState(bounds.from);
  const [to, setTo] = useState(bounds.to);
  const [owner, setOwner] = useState("");
  const [toast, setToast] = useState("");
  const [focusSale, setFocusSale] = useState(storedCeoSalesFocus);
  const staff = useMemo(() => salesStaff(), [revision]);
  const settings = useMemo(() => loadCeoSalesControl(), [revision]);
  const leads = useMemo(() => companyLeads(), [revision]);
  const sales = useMemo(() => companySalesRows(), [revision]);
  const clientQuotes = useMemo(() => companyConvertedQuotes(), [revision]);

  useEffect(() => {
    releaseSalesPaymentsForApproval();
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => startMissionClock(setMission), []);

  useEffect(() => {
    try {
      sessionStorage.setItem(CEO_SALES_TAB_KEY, tab);
    } catch {
      // The current tab still works for this visit.
    }
  }, [tab]);

  useEffect(() => {
    function onOpen(event) {
      setTab("approvals");
      setFocusSale(event.detail?.paymentId || storedCeoSalesFocus());
      setRevision((value) => value + 1);
    }
    window.addEventListener(OPEN_SALES_APPROVAL, onOpen);
    return () => window.removeEventListener(OPEN_SALES_APPROVAL, onOpen);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  function refresh() {
    setRevision((value) => value + 1);
  }

  function setScope(key, value) {
    if (key === "from") {
      if (to && value > to) {
        setToast("From date must be before To date");
        return;
      }
      setFrom(value);
      return;
    }
    if (key === "to") {
      if (from && value < from) {
        setToast("From date must be before To date");
        return;
      }
      setTo(value);
      return;
    }
    setOwner(value);
  }

  function resetScope() {
    const next = monthBounds();
    setFrom(next.from);
    setTo(next.to);
    setOwner("");
  }

  const scopedLeads = leads.filter((lead) => inDateRange(lead.date, from, to) && (!owner || lead.owner === owner));
  const scopedQuotes = clientQuotes.filter((row) => (!owner || row.owner === owner) && (!row.date || inDateRange(row.date, from, to)));
  const pendingApprovals = sales.filter((sale) => sale.status === "pending" && (!owner || sale.owner === owner));
  const scopedSales = sales.filter((sale) => inDateRange(sale.date, from, to) && (!owner || sale.owner === owner));
  const scopedStaff = staff.filter((user) => !owner || user.username === owner);
  const confirmed = scopedSales.filter((sale) => sale.status === "confirmed");
  const collections = confirmed.reduce((sum, sale) => sum + Number(sale.collected || 0), 0);
  const due = dueLeads(
    leads.filter((lead) => !owner || lead.owner === owner),
    todayISO()
  );

  const context = {
    from,
    to,
    owner,
    staff,
    settings,
    leads,
    sales,
    clientQuotes,
    scopedLeads,
    scopedQuotes,
    scopedSales,
    scopedStaff,
    pendingApprovals,
    confirmed,
    collections,
    due,
    mission,
    focusSale,
    setFocusSale,
    setTab,
    setScope,
    resetScope,
    refresh,
    notify: setToast,
  };

  const current = CEO_SALES_TABS.find(([id]) => id === tab) || CEO_SALES_TABS[0];

  return (
    <div className="stack ceo-sales">
      <div className="ceo-head">
        <div>
          <h2>{current[2]}</h2>
          <p>{current[3]}</p>
        </div>
        <div className="subnav ceo-tabs" role="tablist">
          {CEO_SALES_TABS.map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              {id === "approvals" && pendingApprovals.length ? `${label} (${pendingApprovals.length})` : label}
            </button>
          ))}
        </div>
      </div>
      {tab === "leads" ? <LeadsPage {...context} /> : null}
      {tab === "quotations" ? <QuotationsPage {...context} /> : null}
      {tab === "approvals" ? <ApprovalsPage {...context} /> : null}
      {tab === "team" ? <TeamPage {...context} /> : null}
      {tab === "reports" ? <ReportsPage {...context} /> : null}
      {tab === "settings" ? <SettingsPage {...context} /> : null}
      {tab === "overview" ? <DashboardPage {...context} /> : null}
      {toast ? <div className="ceo-toast">{toast}</div> : null}
    </div>
  );
}

function ScopeBar({ from, to, owner, staff, setScope, resetScope }) {
  return (
    <div className="ceo-scope">
      <label>
        From
        <input type="date" value={from} onChange={(event) => setScope("from", event.target.value)} />
      </label>
      <label>
        To
        <input type="date" value={to} onChange={(event) => setScope("to", event.target.value)} />
      </label>
      <label>
        Salesperson
        <select value={owner} onChange={(event) => setScope("owner", event.target.value)}>
          <option value="">All sales executives</option>
          <option value={UNASSIGNED_OWNER}>Not assigned</option>
          {staff.map((user) => (
            <option key={user.username} value={user.username}>{salesStaffName(user.username)}</option>
          ))}
        </select>
      </label>
      <button className="ghost" type="button" onClick={resetScope}>Reset</button>
    </div>
  );
}

function DashboardPage(props) {
  const day = props.mission || missionDay();
  const { settings, scopedLeads, scopedSales, scopedStaff, confirmed, collections, due, owner } = props;
  const monthly = owner ? staffMonthlyTarget(owner) : settings.monthlyTarget;
  const daily = owner ? staffDailyGoals(owner) : { leads: settings.dailyLeads, calls: settings.dailyCalls };
  const target = proratedTarget(monthly, props.from, props.to);
  const remaining = Math.max(0, target - collections);
  const percent = target ? Math.round((100 * collections) / target) : 0;
  const todayLeads = scopedLeads.filter((lead) => lead.date === day).length;
  const todayCalls = scopedLeads.reduce(
    (sum, lead) => sum + (lead.calls || []).filter((call) => call.date === day && call.outcome === "Answered").length,
    0
  );
  const ranks = scopedStaff
    .map((user) => ({
      ...user,
      collection: confirmed.filter((sale) => sale.owner === user.username).reduce((sum, sale) => sum + Number(sale.collected || 0), 0),
      target: proratedTarget(staffMonthlyTarget(user.username), props.from, props.to),
      leads: scopedLeads.filter((lead) => lead.owner === user.username).length,
    }))
    .sort((a, b) => b.collection - a.collection);
  const pending = props.pendingApprovals || [];
  const outstanding = confirmed.reduce((sum, sale) => sum + Math.max(0, Number(sale.amount || 0) - Number(sale.collected || 0)), 0);
  const commission = confirmed.reduce((sum, sale) => sum + (Number(sale.collected || 0) * staffCommissionRate(sale.owner)) / 100, 0);
  const quotations = scopedLeads.filter((lead) => (
    lead.status === "Quotation Sent" && (lead.calls || []).some((call) => call.date === day && call.status === "Quotation Sent")
  )).length;

  return (
    <div className="stack">
      <ScopeBar {...props} />
      <div className="ceo-hero">
        <div>
          <div className="ceo-hero-title">{owner ? salesStaffName(owner) : "Company"} · Sales Goal</div>
          <div className="ceo-hero-cols">
            <HeroItem label="Period target" value={formatMoney(target)} />
            <HeroItem label="Confirmed collections" value={formatMoney(collections)} />
            <HeroItem label="Remaining" value={formatMoney(remaining)} />
            <HeroItem label="Achievement" value={`${percent}%`} />
          </div>
          <div className="ceo-track"><i style={{ width: `${Math.min(100, percent)}%` }} /></div>
        </div>
        <div>
          <div className="ceo-hero-title">Team Ranking</div>
          {ranks.length === 0 ? <p className="empty-copy">No sales team yet.</p> : ranks.map((user, index) => (
            <div className="ceo-rank" key={user.username}>
              <span>{index + 1}. {salesStaffName(user.username)}</span>
              <b>{formatMoney(user.collection)}</b>
              <div className="ceo-rank-bar"><i style={{ width: `${Math.min(100, user.target ? Math.round((100 * user.collection) / user.target) : 0)}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
      <article className="panel">
        <div className="toolbar">
          <h2>Today's Mission</h2>
          <span className="sales-mission-date">{day}</span>
        </div>
        <div className="sales-mission-grid">
          <MissionItem label="New leads" value={`${todayLeads} / ${daily.leads}`} />
          <MissionItem label="Answered calls" value={`${todayCalls} / ${daily.calls}`} />
          <MissionItem label="Quotations sent today" value={quotations} />
          <MissionItem label="Demos scheduled" value={scopedLeads.filter((lead) => lead.status === "Demo Scheduled").length} />
          <MissionItem label="Payment promised" value={scopedLeads.filter((lead) => lead.status === "Payment Promised").length} />
          <MissionItem label="Follow-ups due" value={due.length} accent />
        </div>
      </article>
      <div className="stats four">
        <Kpi label="Total leads in period" value={String(scopedLeads.length)} />
        <Kpi label="Pending sales approvals" value={String(pending.length)} onClick={() => props.setTab("approvals")} />
        <Kpi label="Outstanding confirmed sales" value={formatMoney(outstanding)} />
        <Kpi label="Earned commission" value={formatMoney(commission)} />
      </div>
      <div className="chart-grid">
        <article className="panel">
          <h2>Sales Team Performance</h2>
          {ranks.length === 0 ? <p className="empty-copy">No sales executives to rank.</p> : (
            <table>
              <thead>
                <tr>
                  <th>Sales Executive</th>
                  <th>Leads</th>
                  <th>Collections</th>
                  <th>Target</th>
                  <th>Achievement</th>
                </tr>
              </thead>
              <tbody>
                {ranks.map((user) => (
                  <tr key={user.username}>
                    <td>{salesStaffName(user.username)}</td>
                    <td>{user.leads}</td>
                    <td>{formatMoney(user.collection)}</td>
                    <td>{formatMoney(user.target)}</td>
                    <td>{user.target ? Math.round((100 * user.collection) / user.target) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
        <article className="panel">
          <h2>Due & Overdue Follow-ups · {due.length}</h2>
          {due.length === 0 ? <p className="empty-copy">No follow-ups currently due</p> : due.slice(0, 7).map((lead) => (
            <div className="minirow" key={`${lead.owner}:${lead.id}`}>
              <div>
                <strong>{lead.business}</strong>
                <div className="muted">{salesStaffName(lead.owner)} · {lead.next || "—"}</div>
              </div>
              <b>{lead.id}</b>
            </div>
          ))}
        </article>
      </div>
    </div>
  );
}

function QuotationsPage(props) {
  const { scopedQuotes } = props;
  const [viewing, setViewing] = useState(null);

  return (
    <div className="stack">
      <ScopeBar {...props} />
      <article className="panel">
        <div className="toolbar">
          <h2>Quotation</h2>
        </div>
        {scopedQuotes.length === 0 ? (
          <p className="empty-copy">Converted clients from sales admins appear here with the quotation assigned to them.</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Client ID</th>
                  <th>Client</th>
                  <th>Package</th>
                  <th>Quoted</th>
                  <th>Collected</th>
                  <th>Remaining</th>
                  <th>Status</th>
                  <th>Assigned to</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {scopedQuotes.map((row) => {
                  const { client, quote, summary } = row;
                  return (
                    <tr key={row.key}>
                      <td><code>{client.clientCode || "—"}</code></td>
                      <td>
                        <strong>{client.business}</strong>
                        <div className="muted">{client.id}</div>
                      </td>
                      <td>{quote?.packageName || "—"}</td>
                      <td>{quote ? formatMoney(summary.total) : "—"}</td>
                      <td>{quote ? formatMoney(summary.collected) : "—"}</td>
                      <td>{quote ? formatMoney(summary.remaining) : "—"}</td>
                      <td>
                        {quote ? (
                          <span className={`project-status ${summary.status === "fully-paid" ? "completed" : "scheduled"}`}>
                            {summary.status === "fully-paid" ? "Fully paid" : "Pending"}
                          </span>
                        ) : (
                          <span className="project-status in-progress">No quotation</span>
                        )}
                      </td>
                      <td>{salesStaffName(row.owner)}</td>
                      <td>
                        <button className="link-btn" type="button" onClick={() => setViewing(row)}>
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>
      {viewing ? <QuoteDetails row={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}

function QuoteDetails({ row, onClose }) {
  const { client, quote, summary, owner } = row;
  const lines = quote?.items?.length ? quote.items : [];
  return (
    <Modal onClose={onClose}>
      <article className="modal sheet">
        <h2>Quotation details</h2>
        <p className="muted">
          {client.clientCode ? `${client.clientCode} · ` : ""}{client.business}
        </p>
        <div className="sales-grid">
          <p><span className="muted">Lead ID</span><br /><strong>{client.id}</strong></p>
          <p><span className="muted">Assigned to</span><br /><strong>{salesStaffName(owner)}</strong></p>
          <p><span className="muted">Quote no.</span><br /><strong>{quote?.number || "—"}</strong></p>
          <p><span className="muted">Quotation date</span><br /><strong>{quote?.date || "—"}</strong></p>
        </div>
        {quote ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Service type</th>
                  <th>Price basis</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={`${line.packageName}-${index}`}>
                    <td>
                      <strong>{line.packageName}</strong>
                      {line.scope && line.scope !== line.packageName ? <ScopeHtml className="muted scope-html" value={line.scope} /> : null}
                    </td>
                    <td>{line.category || line.service || "—"}</td>
                    <td>{line.period || "—"}</td>
                    <td>{formatMoney(line.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-copy">The sales admin has not recorded a quotation for this client yet.</p>
        )}
        {summary ? (
          <div className="budget-total">
            <span>Quoted {formatMoney(summary.total)} · Collected {formatMoney(summary.collected)} · Remaining {formatMoney(summary.remaining)}</span>
            <strong>
              <span className={`project-status ${summary.status === "fully-paid" ? "completed" : "scheduled"}`}>
                {summary.status === "fully-paid" ? "Fully paid" : "Pending"}
              </span>
            </strong>
          </div>
        ) : null}
        <div className="modal-actions">
          <button className="ghost" type="button" onClick={onClose}>Close</button>
        </div>
      </article>
    </Modal>
  );
}

function LeadsPage(props) {
  const { scopedLeads, staff, notify, refresh } = props;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [person, setPerson] = useState("");
  const [open, setOpen] = useState(null);
  const today = todayISO();
  const rows = scopedLeads.filter((lead) => {
    const hay = `${lead.id} ${lead.business} ${lead.phone} ${lead.source} ${lead.service}`.toLowerCase();
    if (query && !hay.includes(query.toLowerCase())) return false;
    if (status && lead.status !== status) return false;
    if (person && lead.owner !== person) return false;
    return true;
  });

  function save(draft) {
    const result = saveCompanyLead(draft);
    if (!result.ok) {
      if (result.error === LEAD_PHONE_EXISTS_MESSAGE) window.alert(result.error);
      return result.error;
    }
    refresh();
    notify(open?.business ? "Lead updated" : "Lead created");
    setOpen(null);
    return "";
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="icon-actions">
          <button className="ghost" type="button" onClick={() => exportLeads(rows, props)}>Export PDF</button>
          <button
            className="primary"
            type="button"
            onClick={() => setOpen(blankLead("", nextCompanyLeadId()))}
          >
            + Add Lead
          </button>
        </div>
      </div>
      <ScopeBar {...props} />
      <article className="panel">
        <div className="toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Lead ID, business, phone, source, service..." />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {LEAD_STAGES.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={person} onChange={(event) => setPerson(event.target.value)}>
            <option value="">All salespersons</option>
            <option value={UNASSIGNED_OWNER}>Not assigned</option>
            {staff.map((user) => <option key={user.username} value={user.username}>{salesStaffName(user.username)}</option>)}
          </select>
        </div>
        <div className="ceo-lead-summary">
          <b>{rows.length} shown / {scopedLeads.length} total leads</b>
        </div>
        {rows.length === 0 ? <p className="empty-copy">No leads match the selected filters.</p> : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Lead ID</th>
                  <th>Business / Customer</th>
                  <th className="phone-cell">Phone</th>
                  <th>Source</th>
                  <th>Interested Service</th>
                  <th>Assigned To</th>
                  <th>Status</th>
                  <th>Follow-ups</th>
                  <th>Next Follow-up</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((lead, index) => {
                  const overdue = lead.next && lead.next < today && lead.status !== "Converted" && lead.status !== "Lost";
                  return (
                    <tr key={`${lead.owner}:${lead.id}`}>
                      <td>{index + 1}</td>
                      <td>
                        <button className="link-btn" type="button" onClick={() => setOpen(lead)}>{lead.id}</button>
                      </td>
                      <td><strong>{lead.business}</strong></td>
                      <td className="phone-cell">{lead.phone || "—"}</td>
                      <td>{lead.source}</td>
                      <td>{lead.service || "—"}</td>
                      <td>{salesStaffName(lead.owner)}</td>
                      <td><StatusPill value={lead.status} /></td>
                      <td><b>{(lead.calls || []).length}</b></td>
                      <td className={overdue ? "issue-overdue" : ""}>{lead.next || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>
      {open ? (
        <LeadEditor
          lead={open}
          staff={staff}
          nextId={open.business ? open.id : nextCompanyLeadId()}
          onClose={() => setOpen(null)}
          onSave={save}
        />
      ) : null}
    </div>
  );
}

function approvalRows(sales, scopedSales, owner, filter) {
  const pending = sales.filter((sale) => sale.status === "pending" && (!owner || sale.owner === owner));
  if (filter === "pending") return pending;
  const dated = scopedSales.filter((sale) => !filter || sale.status === filter);
  if (filter) return dated;
  const seen = new Set(pending.map((sale) => `${sale.owner}:${sale.id}`));
  return [...pending, ...dated.filter((sale) => !seen.has(`${sale.owner}:${sale.id}`))];
}

function ApprovalsPage(props) {
  const { sales, scopedSales, pendingApprovals, confirmed, collections, staff, owner, refresh, notify, focusSale, setFocusSale } = props;
  const [filter, setFilter] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [open, setOpen] = useState(null);
  const employeeIds = [...new Set([
    ...staff.map((user) => user.username),
    ...sales.map((sale) => sale.owner),
  ])].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const byEmployee = (sale) => !employeeId || sale.owner === employeeId;
  const rows = approvalRows(sales, scopedSales, owner, filter).filter(byEmployee);
  const waiting = pendingApprovals.filter(byEmployee);
  const outstanding = confirmed.reduce((sum, sale) => sum + Math.max(0, Number(sale.amount || 0) - Number(sale.collected || 0)), 0);

  useEffect(() => {
    if (!focusSale) return;
    const match = sales.find((sale) => sale.kind === "payment" && sale.id === focusSale && (!owner || sale.owner === owner));
    if (match) setOpen(match);
    try {
      sessionStorage.removeItem(CEO_SALES_FOCUS_KEY);
    } catch {
      // Focus is already consumed for this visit.
    }
    setFocusSale("");
  }, [focusSale, sales, owner, setFocusSale]);

  function decide(sale, status) {
    const result = ceoSetSaleStatus(sale, status);
    if (!result.ok) {
      notify(result.error);
      return false;
    }
    refresh();
    notify(status === "confirmed"
      ? "Payment approved. Confirmed sales, revenue and that salesperson’s collections are updated."
      : "Payment rejected.");
    return true;
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <button
          className="primary"
          type="button"
          onClick={() => setOpen(blankSale(staff[0]?.username || ""))}
        >
          + Record Sale
        </button>
      </div>
      <ScopeBar {...props} />
      <div className="stats four">
        <Kpi label="Confirmed sales" value={String(confirmed.length)} />
        <Kpi label="Pending approval" value={String(pendingApprovals.length)} />
        <Kpi label="Confirmed collections" value={formatMoney(collections)} />
        <Kpi label="Outstanding balances" value={formatMoney(outstanding)} />
      </div>
      {waiting.length ? (
        <article className="panel">
          <div className="toolbar">
            <h2>Waiting for CEO approval</h2>
            <span className="muted">{waiting.length} payment{waiting.length === 1 ? "" : "s"}</span>
          </div>
          <div className="ceo-pending-list">
            {waiting.map((sale) => (
              <div className={`ceo-pending-row${focusSale === sale.id ? " is-focus" : ""}`} key={`${sale.kind}:${sale.owner}:${sale.id}`}>
                <div>
                  <p><strong>{sale.business || "Client"}</strong> · {formatMoney(sale.collected || sale.amount)}</p>
                  <small>{sale.saleId || sale.id} · {sale.owner} · {sale.service || "Sale"} · {sale.date || "No date"}</small>
                </div>
                <div className="ceo-pending-actions">
                  <button className="ghost" type="button" onClick={() => setOpen(sale)}>Review</button>
                  <button className="ghost" type="button" onClick={() => decide(sale, "rejected")}>Reject</button>
                  <button className="primary" type="button" onClick={() => decide(sale, "confirmed")}>Approve</button>
                </div>
              </div>
            ))}
          </div>
        </article>
      ) : null}
      <article className="panel">
        <div className="toolbar">
          <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} aria-label="Filter by employee ID">
            <option value="">All employee IDs</option>
            {employeeIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="">All sale statuses</option>
            {SALE_STATUSES.map((item) => <option key={item} value={item}>{SALE_STATUS_LABEL[item]}</option>)}
          </select>
        </div>
        {rows.length === 0 ? <p className="empty-copy">No sales in selected period</p> : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Sale ID</th>
                  <th>Client</th>
                  <th>Service</th>
                  <th>Salesperson</th>
                  <th>Sale Value</th>
                  <th>Collected</th>
                  <th>Balance</th>
                  <th>Commission</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((sale) => (
                  <tr className={focusSale === sale.id ? "ceo-row-focus" : undefined} key={`${sale.kind}:${sale.owner}:${sale.id}`}>
                    <td><code>{sale.saleId || sale.id}</code></td>
                    <td><strong>{sale.business}</strong></td>
                    <td>{sale.service || "—"}</td>
                    <td>{sale.owner}</td>
                    <td>{formatMoney(sale.amount)}</td>
                    <td>{formatMoney(sale.collected)}</td>
                    <td>{formatMoney(Math.max(0, Number(sale.amount || 0) - Number(sale.collected || 0)))}</td>
                    <td>{sale.status === "confirmed" ? formatMoney((Number(sale.collected || 0) * staffCommissionRate(sale.owner)) / 100) : "—"}</td>
                    <td><StatusPill value={SALE_STATUS_LABEL[sale.status] || sale.status} /></td>
                    <td>
                      {sale.kind === "payment" && sale.status === "pending" ? (
                        <div className="icon-actions">
                          <button className="ghost" type="button" onClick={() => setOpen(sale)}>Review</button>
                          <button className="primary" type="button" onClick={() => decide(sale, "confirmed")}>Approve</button>
                        </div>
                      ) : (
                        <button className="link-btn" type="button" onClick={() => setOpen(sale)}>Review / Edit</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ceo-alert">Only Confirmed sales contribute to the collection totals, rankings, commissions and revenue.</p>
      </article>
      {open ? (
        <SaleEditor
          sale={open}
          staff={staff}
          onClose={() => setOpen(null)}
          onSave={(draft) => {
            const result = open.kind === "payment"
              ? ceoSetSaleStatus(open, draft.status)
              : saveCeoManualSale(draft, open.id && open.kind === "manual" ? open.id : "");
            if (!result.ok) return result.error;
            refresh();
            notify(open.kind === "payment" && draft.status === "confirmed"
              ? "Payment approved. Confirmed sales, revenue and that salesperson’s collections are updated."
              : "Sales record saved");
            setOpen(null);
            return "";
          }}
        />
      ) : null}
    </div>
  );
}

function TeamPage(props) {
  const { scopedStaff, scopedLeads, confirmed, refresh, notify } = props;
  const [open, setOpen] = useState(null);

  return (
    <div className="stack">
      <ScopeBar {...props} />
      {scopedStaff.length === 0 ? <p className="empty-copy">Add a sales admin in User Management to assign targets.</p> : (
        <div className="ceo-team-grid">
          {scopedStaff.map((user) => {
            const collected = confirmed.filter((sale) => sale.owner === user.username).reduce((sum, sale) => sum + Number(sale.collected || 0), 0);
            const target = proratedTarget(staffMonthlyTarget(user.username), props.from, props.to);
            const rate = staffCommissionRate(user.username);
            const percent = target ? Math.round((100 * collected) / target) : 0;
            const leads = scopedLeads.filter((lead) => lead.owner === user.username).length;
            const name = salesStaffName(user.username);
            return (
              <article className="ceo-team-card" key={user.username}>
                <div className="ceo-team-top">
                  <span className="ceo-team-avatar" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{name}</strong>
                    <small>{user.username}</small>
                  </div>
                  <span className={`ceo-team-pct${percent >= 100 ? " met" : ""}`}>{percent}%</span>
                </div>
                <p className="ceo-team-label">Confirmed collections</p>
                <div className="ceo-team-amount">{formatMoney(collected)}</div>
                <div className="ceo-inline-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, percent)}%` }} /></div>
                <dl className="ceo-team-stats">
                  <div><dt>Period target</dt><dd>{formatMoney(target)}</dd></div>
                  <div><dt>Commission rate</dt><dd>{rate}%</dd></div>
                  <div><dt>Assigned leads</dt><dd>{leads}</dd></div>
                </dl>
                <button className="ghost" type="button" onClick={() => setOpen(user)}>
                  Manage targets & rate
                </button>
              </article>
            );
          })}
        </div>
      )}
      {open ? (
        <StaffEditor
          user={open}
          onClose={() => setOpen(null)}
          onSave={(draft) => {
            const result = saveCeoStaffMember(open.username, draft);
            if (!result.ok) return result.error;
            refresh();
            notify("Team target saved");
            setOpen(null);
            return "";
          }}
        />
      ) : null}
    </div>
  );
}

function ReportsPage(props) {
  const { scopedLeads, scopedStaff, confirmed, collections } = props;
  const byService = {};
  confirmed.forEach((sale) => {
    const key = sale.service || "Unspecified";
    byService[key] = (byService[key] || 0) + Number(sale.collected || 0);
  });
  const rows = Object.entries(byService).sort((a, b) => b[1] - a[1]);

  return (
    <div className="stack">
      <ScopeBar {...props} />
      <div className="chart-grid">
        <article className="panel">
          <h2>Confirmed Collections by Service</h2>
          {rows.length === 0 ? <p className="empty-copy">No confirmed collections in selected period</p> : rows.map(([service, amount]) => (
            <div className="minirow" key={service}>
              <div style={{ width: "38%" }}>{service}</div>
              <div style={{ flex: 1 }}>
                <div className="ceo-inline-bar"><i style={{ width: `${collections ? Math.round((100 * amount) / collections) : 0}%` }} /></div>
              </div>
              <b>{formatMoney(amount)}</b>
            </div>
          ))}
        </article>
        <article className="panel">
          <h2>Lead Pipeline · {scopedLeads.length} leads</h2>
          {LEAD_STAGES.map((status) => (
            <div className="minirow" key={status}>
              <span>{status}</span>
              <b>{scopedLeads.filter((lead) => lead.status === status).length}</b>
            </div>
          ))}
        </article>
      </div>
      <article className="panel">
        <h2>Team Activity Summary</h2>
        {scopedStaff.length === 0 ? <p className="empty-copy">No sales team yet.</p> : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Salesperson</th>
                  <th>Leads</th>
                  <th>Recorded Follow-ups</th>
                  <th>Answered Calls</th>
                  <th>Confirmed Collections</th>
                  <th>Commission</th>
                </tr>
              </thead>
              <tbody>
                {scopedStaff.map((user) => {
                  const owned = scopedLeads.filter((lead) => lead.owner === user.username);
                  const history = owned.flatMap((lead) => (lead.calls || []).filter((call) => inDateRange(call.date, props.from, props.to)));
                  const collected = confirmed.filter((sale) => sale.owner === user.username).reduce((sum, sale) => sum + Number(sale.collected || 0), 0);
                  return (
                    <tr key={user.username}>
                      <td>{salesStaffName(user.username)}</td>
                      <td>{owned.length}</td>
                      <td>{history.length}</td>
                      <td>{history.filter((call) => call.outcome === "Answered").length}</td>
                      <td>{formatMoney(collected)}</td>
                      <td>{formatMoney((collected * staffCommissionRate(user.username)) / 100)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </div>
  );
}

function SettingsPage({ settings, refresh, notify }) {
  const [draft, setDraft] = useState({
    monthlyTarget: String(settings.monthlyTarget || 0),
    dailyLeads: String(settings.dailyLeads || 0),
    dailyCalls: String(settings.dailyCalls || 0),
    defaultRate: String(settings.defaultRate || 0),
  });
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    const result = saveCeoOrgSettings(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    refresh();
    notify("Settings saved");
  }

  return (
    <div className="stack">
      <article className="panel" style={{ maxWidth: 650 }}>
        <form className="sales-form" onSubmit={submit}>
          <div className="sales-grid">
            <label>
              Company monthly sales target (LKR)
              <input type="number" min="0" value={draft.monthlyTarget} onChange={(event) => setDraft({ ...draft, monthlyTarget: event.target.value })} required />
            </label>
            <label>
              Daily new leads target
              <input type="number" min="0" step="1" value={draft.dailyLeads} onChange={(event) => setDraft({ ...draft, dailyLeads: event.target.value })} required />
            </label>
            <label>
              Daily answered calls target
              <input type="number" min="0" step="1" value={draft.dailyCalls} onChange={(event) => setDraft({ ...draft, dailyCalls: event.target.value })} required />
            </label>
            <label>
              Default commission rate (%)
              <input type="number" min="0" max="100" step="0.1" value={draft.defaultRate} onChange={(event) => setDraft({ ...draft, defaultRate: event.target.value })} required />
            </label>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="modal-actions">
            <button className="primary" type="submit">Save Settings</button>
          </div>
        </form>
      </article>
    </div>
  );
}

function LeadEditor({ lead, staff, nextId, onClose, onSave }) {
  const existing = Boolean(lead.business);
  const [draft, setDraft] = useState({
    ...lead,
    id: lead.id || nextId,
    phone: formatPhone(lead.phone),
    executive: !lead.executive || lead.executive === UNASSIGNED_OWNER || lead.owner === UNASSIGNED_OWNER
      ? ""
      : (lead.executive || lead.owner || ""),
  });
  const [call, setCall] = useState(null);
  const [callIndex, setCallIndex] = useState(-1);
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    const message = onSave({
      ...draft,
      call: call || undefined,
      callIndex: call && callIndex >= 0 ? callIndex : undefined,
    });
    if (message) setError(message);
  }

  function startCall(index) {
    const current = (draft.calls || [])[index];
    setCallIndex(index);
    setCall(current ? { ...current } : {
      date: todayISO(),
      outcome: "Answered",
      status: draft.status || "New",
      next: draft.next || "",
      note: "",
    });
  }

  return (
    <Modal onClose={onClose}>
      <form className="modal sheet" onSubmit={submit}>
        <div className="toolbar">
          <div>
            <h2>{existing ? draft.business : "Add Lead"}</h2>
            {existing ? <p className="muted">{draft.id} · {draft.phone || "No phone"}</p> : null}
          </div>
          <button className="ghost" type="button" onClick={onClose}>×</button>
        </div>
        <div className="sales-grid">
          <label>
            Lead ID
            <input value={draft.id} required readOnly />
          </label>
          <label>
            Date
            <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required />
          </label>
          <label>
            Business / Customer
            <input value={draft.business} onChange={(event) => setDraft({ ...draft, business: event.target.value })} required />
          </label>
          <label>
            Phone
            <input type="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: formatPhone(event.target.value) })} required />
          </label>
          <label>
            Source
            <select value={draft.source || "Other"} onChange={(event) => setDraft({ ...draft, source: event.target.value })}>
              {LEAD_SOURCES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Interested Service
            <select value={draft.service} onChange={(event) => setDraft({ ...draft, service: event.target.value })} required>
              <option value="">Choose a service</option>
              {leadServiceOptions(draft.service).map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Email
            <input type="email" value={draft.email || ""} onChange={(event) => setDraft({ ...draft, email: event.target.value })} maxLength={200} />
          </label>
          <label>
            Address
            <input value={draft.address || ""} onChange={(event) => setDraft({ ...draft, address: event.target.value })} maxLength={250} />
          </label>
          <label>
            Business type
            <input value={draft.businessType || ""} onChange={(event) => setDraft({ ...draft, businessType: event.target.value })} maxLength={120} />
          </label>
          <label>
            Assigned To
            <select value={draft.executive} onChange={(event) => setDraft({ ...draft, executive: event.target.value })}>
              <option value="">Not assigned</option>
              {staff.map((user) => <option key={user.username} value={user.username}>{salesStaffName(user.username)}</option>)}
            </select>
          </label>
          {existing ? (
            <>
              <label>
                Lead Status
                <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
                  {LEAD_STAGES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="span-all">
                Notes
                <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={2} />
              </label>
            </>
          ) : null}
        </div>
        {existing ? (
          <>
            <div className="divider" />
            <h3>Follow-up History ({(draft.calls || []).length})</h3>
            {(draft.calls || []).length === 0 ? <p className="muted">No follow-up calls recorded.</p> : (draft.calls || []).map((item, index) => (
              <div className="minirow" key={`${item.date}-${index}`}>
                <div>
                  <b>{item.date} · {item.outcome}</b>
                  <div className="muted">{item.note || "No notes"} · {item.status}</div>
                  <div className="muted">Next: {item.next || "—"}</div>
                </div>
                <button className="link-btn" type="button" onClick={() => startCall(index)}>Edit</button>
              </div>
            ))}
            {call ? (
              <div className="call-editor">
                <div className="sales-grid">
                  <label>
                    Call Date
                    <input type="date" value={call.date} onChange={(event) => setCall({ ...call, date: event.target.value })} required />
                  </label>
                  <label>
                    Call Outcome
                    <select value={call.outcome} onChange={(event) => setCall({ ...call, outcome: event.target.value })}>
                      {CALL_OUTCOMES.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label>
                    Updated Lead Status
                    <select value={call.status} onChange={(event) => setCall({ ...call, status: event.target.value })}>
                      {LEAD_STAGES.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label>
                    Next Follow-up Date
                    <input type="date" value={call.next} onChange={(event) => setCall({ ...call, next: event.target.value })} />
                  </label>
                  <label className="span-all">
                    Call Notes
                    <textarea value={call.note} onChange={(event) => setCall({ ...call, note: event.target.value })} rows={3} />
                  </label>
                </div>
                <div className="modal-actions">
                  <button className="ghost" type="button" onClick={() => setCall(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="modal-actions">
                <button className="primary" type="button" onClick={() => startCall(-1)}>+ Record Follow-up</button>
              </div>
            )}
          </>
        ) : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="modal-actions">
          <button className="ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="primary" type="submit">{existing ? "Save Lead Details" : "Add Lead"}</button>
        </div>
      </form>
    </Modal>
  );
}

function SaleEditor({ sale, staff, onClose, onSave }) {
  const creating = !sale.business;
  const locked = sale.kind === "payment";
  const [draft, setDraft] = useState({
    ...sale,
    id: sale.saleId || sale.id || nextManualSaleId(),
    date: sale.date || todayISO(),
    owner: sale.owner || staff[0]?.username || "",
    amount: String(sale.amount ?? 0),
    collected: String(sale.collected ?? 0),
    status: sale.status || "pending",
  });
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    const message = onSave({
      ...draft,
      amount: Number(draft.amount),
      collected: Number(draft.collected),
    });
    if (message) setError(message);
  }

  return (
    <Modal onClose={onClose}>
      <form className="modal sheet" onSubmit={submit}>
        <div className="toolbar">
          <h2>{creating ? "Record New Sale" : "Review / Edit Sale"}</h2>
          <button className="ghost" type="button" onClick={onClose}>×</button>
        </div>
        <div className="sales-grid">
          <label>
            Sale ID
            <input value={draft.id} onChange={(event) => setDraft({ ...draft, id: event.target.value })} required readOnly={locked} />
          </label>
          <label>
            Date
            <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required readOnly={locked} />
          </label>
          <label>
            Client
            <input value={draft.business} onChange={(event) => setDraft({ ...draft, business: event.target.value })} required readOnly={locked} />
          </label>
          <label>
            Lead ID (optional)
            <input value={draft.leadId || ""} onChange={(event) => setDraft({ ...draft, leadId: event.target.value })} readOnly={locked} />
          </label>
          <label>
            Service / Package
            <input value={draft.service} onChange={(event) => setDraft({ ...draft, service: event.target.value })} required readOnly={locked} />
          </label>
          <label>
            Salesperson
            <select value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} disabled={locked} required>
              {staff.map((user) => <option key={user.username} value={user.username}>{salesStaffName(user.username)}</option>)}
            </select>
          </label>
          <label>
            Sale Value (LKR)
            <input type="number" min="0" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} required readOnly={locked} />
          </label>
          <label>
            Confirmed Amount Collected (LKR)
            <input type="number" min="0" value={draft.collected} onChange={(event) => setDraft({ ...draft, collected: event.target.value })} required readOnly={locked} />
          </label>
          <label>
            CEO Approval Status
            <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
              {SALE_STATUSES.map((item) => <option key={item} value={item}>{SALE_STATUS_LABEL[item]}</option>)}
            </select>
          </label>
        </div>
        <p className="ceo-alert">
          {locked && sale.status === "pending"
            ? "Approving this payment confirms the collection for this salesperson and adds it to revenue."
            : "Set status to Confirmed only after validating the sale and received payments."}
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="ghost" type="button" onClick={onClose}>Cancel</button>
          {locked && sale.status === "pending" ? (
            <>
              <button className="ghost" type="button" onClick={() => {
                const message = onSave({ ...draft, status: "rejected", amount: Number(draft.amount), collected: Number(draft.collected) });
                if (message) setError(message);
              }}>Reject</button>
              <button className="primary" type="button" onClick={() => {
                const message = onSave({ ...draft, status: "confirmed", amount: Number(draft.amount), collected: Number(draft.collected) });
                if (message) setError(message);
              }}>Approve payment</button>
            </>
          ) : (
            <button className="primary" type="submit">Save Sale</button>
          )}
        </div>
      </form>
    </Modal>
  );
}

function StaffEditor({ user, onClose, onSave }) {
  const daily = staffDailyGoals(user.username);
  const [draft, setDraft] = useState({
    name: salesStaffName(user.username),
    target: String(staffMonthlyTarget(user.username) || 0),
    rate: String(staffCommissionRate(user.username) || 0),
    dailyLeads: String(daily.leads || 0),
    dailyCalls: String(daily.calls || 0),
  });
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    const message = onSave(draft);
    if (message) setError(message);
  }

  return (
    <Modal onClose={onClose}>
      <form className="modal staff-modal" onSubmit={submit}>
        <div className="staff-modal-head">
          <span className="ceo-team-avatar" aria-hidden="true">{salesStaffName(user.username).slice(0, 2).toUpperCase()}</span>
          <div>
            <h2>Manage targets</h2>
            <p>{user.username}</p>
          </div>
          <button className="ghost staff-close" type="button" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="staff-fields">
          <label>
            Display name
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required maxLength={80} />
          </label>
          <div className="staff-fields-row">
            <label>
              Monthly target (LKR)
              <input type="number" min="0" value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value })} required />
            </label>
            <label>
              Commission rate (%)
              <input type="number" min="0" max="100" step="0.1" value={draft.rate} onChange={(event) => setDraft({ ...draft, rate: event.target.value })} required />
            </label>
            <label>
              Daily new leads
              <input type="number" min="0" step="1" value={draft.dailyLeads} onChange={(event) => setDraft({ ...draft, dailyLeads: event.target.value })} required />
            </label>
            <label>
              Daily answered calls
              <input type="number" min="0" step="1" value={draft.dailyCalls} onChange={(event) => setDraft({ ...draft, dailyCalls: event.target.value })} required />
            </label>
          </div>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="primary" type="submit">Save</button>
        </div>
      </form>
    </Modal>
  );
}

function HeroItem({ label, value }) {
  return (
    <div className="ceo-hero-item">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function MissionItem({ label, value, accent }) {
  return (
    <div className="sales-mission-item">
      <span>{label}</span>
      <strong className={accent ? "due-accent" : undefined}>{value}</strong>
    </div>
  );
}

function Kpi({ label, value, onClick }) {
  const body = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
    </>
  );
  if (onClick) {
    return <button className="stat money kpi-btn" type="button" onClick={onClick}>{body}</button>;
  }
  return <article className="stat money">{body}</article>;
}

function StatusPill({ value }) {
  const tone = ["Converted", "Confirmed"].includes(value)
    ? "completed"
    : ["Lost", "Rejected"].includes(value)
      ? "cancelled"
      : ["Follow-up", "Pending Approval", "Payment Promised", "Quotation Sent"].includes(value)
        ? "scheduled"
        : "in-progress";
  return <span className={`project-status ${tone}`}>{value}</span>;
}

function Modal({ children, onClose }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div onClick={(event) => event.stopPropagation()} role="presentation">{children}</div>
    </div>,
    document.body
  );
}

function blankLead(executive, id) {
  return {
    id,
    date: todayISO(),
    business: "",
    phone: "",
    email: "",
    address: "",
    businessType: "",
    source: "Other",
    service: "",
    status: "New",
    next: "",
    notes: "",
    executive,
    owner: executive,
    calls: [],
  };
}

function blankSale(owner) {
  return {
    kind: "manual",
    id: "",
    date: todayISO(),
    business: "",
    leadId: "",
    service: "",
    owner,
    amount: 0,
    collected: 0,
    status: "pending",
  };
}

function exportLeads(rows, scope) {
  const heads = ["No.", "Lead ID", "Business / Customer", "Phone", "Source", "Interested Service", "Assigned To", "Status", "Follow-ups", "Next Follow-up"];
  const vals = rows.map((lead, index) => [
    index + 1,
    lead.id,
    lead.business,
    lead.phone || "—",
    lead.source,
    lead.service || "—",
    salesStaffName(lead.owner),
    lead.status,
    (lead.calls || []).length,
    lead.next || "—",
  ]);
  const ownerLabel = scope.owner ? salesStaffName(scope.owner) : "All Sales Executives";
  const popup = window.open("", "_blank");
  if (!popup) return;
  popup.document.write(`<!doctype html><html><head><title>NeonLabz Lead Register</title><style>
    @page{size:A4 landscape;margin:12mm}
    body{font:11px Arial;color:#1A2042;margin:20px}
    h1{background:#131937;color:white;padding:18px;font-size:21px;margin:0}
    p{color:#5C6380}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th{background:#F5F6FC;text-align:left;color:#1A2042}
    th,td{border:1px solid #dce2ee;padding:7px 5px;overflow-wrap:anywhere}
    tr:nth-child(even){background:#f7f8fd}
  </style></head><body>
    <h1>NEONLABZ | CEO LEAD REGISTER</h1>
    <p>${escapeHtml(scope.from)} to ${escapeHtml(scope.to)} · ${escapeHtml(ownerLabel)} · ${rows.length} leads · Generated ${escapeHtml(todayISO())}</p>
    <table><thead><tr>${heads.map((head) => `<th>${escapeHtml(head)}</th>`).join("")}</tr></thead>
    <tbody>${vals.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <script>window.onload=()=>setTimeout(()=>window.print(),250)<\\/script>
  </body></html>`);
  popup.document.close();
}
