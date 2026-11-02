import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import neonLogo from "./assets/neonlabz-logo.png";
import { loadClients } from "./clients.js";
import { dataOwner, sessionAccount } from "./scope.js";
import { loadUsers } from "./crm.js";
import { dismissNotice, loadFinance, loadNotices, projectInvoiceById, projectInvoiceFor } from "./finance.js";
import { InvoiceDialog } from "./InvoiceView.jsx";
import { LetterheadDialog } from "./Letterhead.jsx";
import { ScopeEditor, ScopeHtml } from "./ScopeEditor.jsx";
import { scopeHasText } from "./richText.js";
import { packageDocumentFromItem } from "./brandDocument.js";
import { downloadDocumentPdf } from "./downloadPdf.js";
import { formatPhone } from "./hrms.js";
import { companyProjects, loadProjects } from "./projects.js";
import {
  CALL_OUTCOMES,
  FOLLOW_UP_STATUSES,
  LEAD_SERVICES,
  LEAD_SOURCES,
  LEAD_STAGES,
  leadServiceOptions,
  packageCategory,
  packagesForCategory,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  PRICE_BASIS,
  addDays,
  allCeoQuotes,
  answeredCallsOn,
  approvedInstallments,
  assignConvertedClientCodes,
  collectionTarget,
  confirmedCollections,
  inReportingPeriod,
  convertedClients,
  convertedPaymentClients,
  dueLeads,
  createPayment,
  createQuote,
  defaultTerms,
  deleteLead,
  deletePackage,
  deleteQuote,
  formatDiscountPercent,
  formatMoney,
  formatQuoteAmount,
  formatQuoteDate,
  leadsLoggedToday,
  LEAD_PHONE_EXISTS_MESSAGE,
  loadIncomingProjects,
  loadCeoSales,
  loadSales,
  releaseSalesPaymentsForApproval,
  importLeadsFromCsv,
  nextLeadId,
  nextQuoteNumber,
  outstandingBalance,
  previewQuote,
  confirmedCeoQuotes,
  paymentReceiptDocument,
  quotationDocument,
  quotationFigures,
  quoteCollection,
  quoteForClient,
  quotesForProjects,
  quotesForDelivery,
  quoteMatchesClient,
  projectTypeFromQuote,
  salesStaffName,
  saveClientQuote,
  saveCeoSales,
  saveLead,
  sortLeadsById,
  savePackage,
  saveSales,
  COVER_HEIGHT,
  COVER_ZOOM_MAX,
  COVER_ZOOM_MIN,
  COVER_ZOOM_STEP,
  defaultCoverFit,
  normalizeCoverFit,
  salesClientByName,
  setPaymentStatus,
  startMissionClock,
  missionDay,
  todayISO,
  updateQuote,
} from "./sales.js";

function salesTabs(canEdit) {
  return [
    ["overview", "Overview"],
    ...(canEdit ? [["sample", "Quotation"]] : []),
    ["payments", "Payments"],
    ["follow", "Leads & Follow-ups"],
    ["packages", "Packages"],
  ];
}

export function SalesWorkspace({ access, username, section, paymentsSource, personal = false }) {
  const canEdit = access === "full";
  const tabs = salesTabs(canEdit);
  const [tab, setTab] = useState("overview");
  const [month, setMonthValue] = useState(() => todayISO().slice(0, 7));
  const [range, setRange] = useState({ from: "", to: "" });

  function setMonth(next) {
    setMonthValue(next || todayISO().slice(0, 7));
    setRange({ from: "", to: "" });
  }
  const [data, setData] = useState(() => {
    releaseSalesPaymentsForApproval();
    const loaded = loadSales();
    const next = assignConvertedClientCodes(loaded);
    if (next !== loaded) {
      try {
        saveSales(next);
      } catch {
        // Client IDs still show for this visit.
      }
    }
    return next;
  });
  useEffect(() => {
    releaseSalesPaymentsForApproval();
  }, [data.payments]);
  const executives = useMemo(() => {
    if (personal && username) {
      const self = loadUsers().find((user) => user.username === username);
      return [self || { username, role: "ceo", active: true }];
    }
    return loadUsers().filter((user) => user.role === "sales" && user.active);
  }, [personal, username]);
  const active = section || (tabs.some(([id]) => id === tab) ? tab : "overview");
  const showMonth = active === "overview" || active === "payments";

  function commit(next) {
    try {
      saveSales(next);
    } catch {
      return "Could not store this change. If you uploaded a receipt, use a smaller file.";
    }
    setData(next);
    return "";
  }

  return (
    <div className="stack">
      {canEdit || section ? null : (
        <p className="banner">This sales workspace is view only. The project manager records quotations. The sales admin manages payments and follow-ups.</p>
      )}
      {section ? null : (
        <div className="toolbar">
          <div className="subnav" role="tablist">
            {tabs.map(([id, label]) => (
              <button key={id} type="button" className={active === id ? "active" : ""} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          {showMonth ? <MonthField month={month} setMonth={setMonth} range={range} setRange={setRange} /> : null}
        </div>
      )}
      {section && showMonth && active !== "overview" ? (
        <div className="toolbar month-toolbar">
          <MonthField month={month} setMonth={setMonth} range={range} setRange={setRange} />
        </div>
      ) : null}
      {active === "overview" ? (
        <OverviewPanel
          data={data}
          month={month}
          range={range}
          setMonth={section ? setMonth : undefined}
          setRange={section ? setRange : undefined}
          executives={executives}
          canEdit={canEdit}
          commit={commit}
        />
      ) : null}
      {active === "sample" ? <SalesQuotationsPanel data={data} commit={commit} canEdit={canEdit} /> : null}
      {active === "payments" ? <PaymentsPanel data={data} commit={commit} canEdit={canEdit} month={month} range={range} source={paymentsSource} /> : null}
      {active === "follow" ? <FollowUpPanel data={data} commit={commit} canEdit={canEdit} executives={executives} username={username} month={month} allowDelete={personal} /> : null}
      {active === "packages" ? <PackagesPanel data={data} commit={commit} canEdit={canEdit} /> : null}
    </div>
  );
}

function MonthField({ month, setMonth, range, setRange }) {
  const root = useRef(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("months");
  const [year, setYear] = useState(() => Number(String(month).slice(0, 4)) || new Date().getFullYear());
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    function onPointer(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setYear(Number(String(month).slice(0, 4)) || new Date().getFullYear());
    setView("months");
    setOpen(true);
  }

  function pickMonth(value) {
    if (value === month) {
      const same = range?.from?.startsWith(value) && range?.to?.startsWith(value);
      setDraftFrom(same ? range.from : "");
      setDraftTo(same ? range.to : "");
      setView("days");
      return;
    }
    setMonth(value);
  }

  function pickDay(iso) {
    if (!draftFrom || draftTo) {
      setDraftFrom(iso);
      setDraftTo("");
      return;
    }
    if (iso < draftFrom) {
      setDraftTo(draftFrom);
      setDraftFrom(iso);
      return;
    }
    setDraftTo(iso);
  }

  function applyDates() {
    if (!draftFrom) return;
    setRange({ from: draftFrom, to: draftTo || draftFrom });
    setOpen(false);
  }

  function useWholeMonth() {
    setRange({ from: "", to: "" });
    setDraftFrom("");
    setDraftTo("");
    setOpen(false);
  }

  const days = monthGrid(month);
  const shown = reportingLabel(month, range);

  return (
    <div className="report-period" ref={root}>
      <span>Reporting month</span>
      <button type="button" className="report-period-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
        <span>{shown}</span>
        <CalendarIcon />
      </button>
      {open ? (
        <div className="report-calendar" role="dialog" aria-label="Reporting month">
          {view === "months" ? (
            <>
              <div className="report-calendar-head">
                <button type="button" className="report-calendar-nav" onClick={() => setYear((value) => value - 1)} aria-label="Previous year">‹</button>
                <strong>{year}</strong>
                <button type="button" className="report-calendar-nav" onClick={() => setYear((value) => value + 1)} aria-label="Next year">›</button>
              </div>
              <div className="report-months">
                {MONTH_NAMES.map((name, index) => {
                  const value = `${year}-${String(index + 1).padStart(2, "0")}`;
                  return (
                    <button key={value} type="button" className={value === month ? "selected" : ""} aria-pressed={value === month} onClick={() => pickMonth(value)}>
                      {name}
                    </button>
                  );
                })}
              </div>
              <p className="report-calendar-note">Select a month. Click the selected month again to choose dates.</p>
            </>
          ) : (
            <>
              <div className="report-calendar-head">
                <button type="button" className="report-calendar-nav" onClick={() => setView("months")} aria-label="Back to months">‹</button>
                <strong>{monthLabel(month)}</strong>
                <span />
              </div>
              <div className="report-days">
                {WEEKDAYS.map((name) => <span key={name}>{name}</span>)}
                {Array.from({ length: days.lead }, (_, index) => <span key={`pad-${index}`} />)}
                {Array.from({ length: days.count }, (_, index) => {
                  const iso = `${month}-${String(index + 1).padStart(2, "0")}`;
                  const selected = iso === draftFrom || (draftTo && iso === draftTo);
                  const inside = draftFrom && draftTo && iso > draftFrom && iso < draftTo;
                  return (
                    <button key={iso} type="button" className={selected ? "selected" : inside ? "in-range" : ""} aria-pressed={selected} onClick={() => pickDay(iso)}>
                      {index + 1}
                    </button>
                  );
                })}
              </div>
              <p className="report-calendar-note">
                {draftFrom ? "Select an end date, then apply. One date filters that day." : "Select dates to filter, or keep the whole month."}
              </p>
              <div className="report-calendar-actions">
                <button type="button" className="ghost" onClick={useWholeMonth}>Whole month</button>
                <button type="button" className="primary" onClick={applyDates} disabled={!draftFrom}>Apply dates</button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function OverviewPanel({ data, month, range, setMonth, setRange, executives, canEdit, commit }) {
  const target = collectionTarget(data, month, executives.map((user) => user.username));
  const collected = confirmedCollections(data, month, range);
  const remaining = Math.max(0, target - collected);
  const percent = target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0;
  const commission = collected * (Number(data.rates?.rate) || 0) / 100;
  const label = reportingLabel(month, range);
  const ranged = Boolean(range?.from && range?.to);
  const today = todayISO();
  const [day, setDay] = useState(() => missionDay());
  const leads = data.leads || [];
  const due = dueLeads(leads, today);
  const answered = answeredCallsOn(leads, day);
  const callTarget = Number(data.goals?.daily) || 0;
  const leadGoal = Number(data.goals?.leadTarget) || 0;
  const newToday = leads.filter((item) => item.date === day).length;
  const newMonth = leads.filter((item) => inReportingPeriod(item.date, month, range)).length;
  const owner = dataOwner();
  const pending = outstandingBalance(owner);
  const recent = (data.payments || [])
    .filter((payment) => payment.status !== "cancelled" && inReportingPeriod(payment.date, month, range))
    .slice(-5)
    .reverse();
  const [leadForm, setLeadForm] = useState(null);

  useEffect(() => startMissionClock(setDay), []);

  return (
    <div className="stack">
      {setMonth ? (
        <div className="toolbar sales-head">
          <MonthField month={month} setMonth={setMonth} range={range} setRange={setRange} />
        </div>
      ) : null}
      <h2>Sales performance</h2>
      <article className="panel sales-mission">
        <div className="toolbar">
          <h2>Today's mission</h2>
          <span className="sales-mission-date">{formatQuoteDate(day)}</span>
        </div>
        <div className="sales-mission-grid">
          <MissionItem label="New leads" value={newToday} goal={leadGoal} />
          <MissionItem label="Answered calls" value={answered} goal={callTarget} />
          <MissionItem label="Quotations sent" value={leadsLoggedToday(leads, "Quotation Sent", day)} />
          <MissionItem label="Demos scheduled" value={leadsLoggedToday(leads, "Demo Scheduled", day)} />
          <MissionItem label="Payment promised" value={leadsLoggedToday(leads, "Payment Promised", day)} />
          <MissionItem label="Follow-ups due" value={due.length} />
        </div>
      </article>
      <div className="stats four">
        <Stat label="Monthly sales target" value={formatMoney(target)} note={monthLabel(month)} />
        <Stat label="Confirmed collections" value={formatMoney(collected)} note={ranged ? `Payments received ${label}` : "Payments received in this month"} />
        <Stat label="Remaining target" value={formatMoney(remaining)} note="To achieve the monthly target" />
        <Stat label="Earned commission" value={formatMoney(commission)} note={`${data.rates?.rate || 0}% on confirmed collections`} />
      </div>
      <div className="chart-grid">
        <article className="panel">
          <h2>Monthly sales progress</h2>
          <div className="sales-statrow">
            <div><span>Achievement</span><b>{percent}%</b></div>
            <div><span>Collected</span><b>{formatMoney(collected)}</b></div>
            <div><span>Target</span><b>{formatMoney(target)}</b></div>
          </div>
          <div className="sales-progress" aria-hidden="true"><b style={{ width: `${percent}%` }} /></div>
        </article>
        <article className="panel">
          <h2>Today's call performance</h2>
          <div className="sales-statrow">
            <div><span>Answered calls</span><b>{answered}</b></div>
            <div><span>Call target</span><b>{callTarget}</b></div>
            <div><span>Remaining</span><b>{Math.max(0, callTarget - answered)}</b></div>
          </div>
          <div className="sales-progress" aria-hidden="true"><b style={{ width: `${callTarget ? Math.min(100, (answered / callTarget) * 100) : 0}%` }} /></div>
        </article>
      </div>
      <div className="stats">
        <Stat label={ranged ? "New leads" : "New leads this month"} value={String(newMonth)} note={label} />
        <Stat label="Follow-ups due" value={String(due.length)} note="Due today or overdue" />
        <Stat label="Pending collections" value={formatMoney(pending)} note="Remaining on promised quotations" />
      </div>
      <div className="chart-grid">
        <article className="panel">
          <h2>Priority follow-ups</h2>
          {due.length === 0 ? <p className="empty-copy">No overdue follow-ups.</p> : (
            <table>
              <thead>
                <tr><th>Lead ID</th><th>Business</th><th>Next follow-up</th></tr>
              </thead>
              <tbody>
                {due.slice(0, 6).map((lead) => (
                  <tr key={lead.id}>
                    <td><code>{lead.id}</code></td>
                    <td>{lead.business}</td>
                    <td className={lead.next < today ? "issue-overdue" : ""}>{lead.next}{lead.next < today ? " · Overdue" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
        <article className="panel">
          <h2>Recent sales</h2>
          {recent.length === 0 ? <p className="empty-copy">{ranged ? `No sales in ${label}.` : "No sales this month."}</p> : (
            <table>
              <thead>
                <tr><th>Client</th><th>Type</th><th>Collected</th><th>Date</th></tr>
              </thead>
              <tbody>
                {recent.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.clientName || "—"}</td>
                    <td>{payment.type}</td>
                    <td>{formatMoney(payment.amount)}</td>
                    <td>{payment.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      </div>
      {leadForm ? (
        <LeadDialog
          lead={leadForm}
          executives={executives}
          canEdit={canEdit}
          onClose={() => setLeadForm(null)}
          onSave={(draftLead) => {
            const result = saveLead(data, draftLead);
            if (!result.ok) {
              if (result.error === LEAD_PHONE_EXISTS_MESSAGE) window.alert(result.error);
              return result.error;
            }
            const stored = commit(result.data);
            if (stored) return stored;
            setLeadForm(null);
            return "";
          }}
        />
      ) : null}
    </div>
  );
}

function MissionItem({ label, value, goal }) {
  return (
    <div className="sales-mission-item">
      <span>{label}</span>
      <strong>{value}{goal != null ? <small> / {goal}</small> : null}</strong>
    </div>
  );
}

function Stat({ label, value, note }) {
  return (
    <article className="stat money">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 16.5V20h3.5L19 8.5 15.5 5 4 16.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M13.5 7 17 10.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconButton({ label, onClick, tone, children }) {
  return (
    <button className={tone === "danger" ? "icon-button danger" : "icon-button"} type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function QuotationsBoard({ canEdit, includeIncoming = false }) {
  const viewOnly = !canEdit || sessionAccount()?.role === "pm";
  const [data, setData] = useState(() => loadSales());
  const projects = useMemo(
    () => {
      const own = loadProjects().projects.filter((project) => String(project.name || "").trim());
      const incoming = includeIncoming
        ? loadIncomingProjects().map((item) => ({
          id: item.id,
          code: item.salesOwner,
          name: item.name,
          client: item.client,
        }))
        : [];
      const seen = new Set(own.map((project) => project.id));
      return [...own, ...incoming.filter((project) => !seen.has(project.id))]
        .sort((a, b) => projectOption(a).localeCompare(projectOption(b)));
    },
    [includeIncoming]
  );

  function commit(next) {
    try {
      saveSales(next);
    } catch {
      return "Could not store this change. If you uploaded a receipt, use a smaller file.";
    }
    setData(next);
    return "";
  }

  if (viewOnly) {
    return (
      <div className="stack">
        <NoticeList />
        <ConfirmedCeoQuotes username={dataOwner()} />
        <ProjectInstallments username={dataOwner()} />
      </div>
    );
  }

  return (
    <div className="stack">
      <QuotesPanel data={data} commit={commit} canEdit={canEdit} projects={projects} />
      <ConfirmedCeoQuotes username={dataOwner()} />
    </div>
  );
}

const SERVICE_TYPE_LABEL = {
  software: "Software development",
  marketing: "Marketing",
  both: "Both",
};

export function ProjectPackagesBoard({ projects = [], clients = [], types, hideAmounts = false, allowView = true } = {}) {
  const [viewing, setViewing] = useState(null);
  const quotes = useMemo(() => quotesForDelivery({ projects, clients, types }), [projects, clients, types]);

  return (
    <article className="panel">
      <div className="toolbar">
        <div>
          <h2>Quotations</h2>
          <p>Quotations issued by sales admins for these clients, including the promised package.</p>
        </div>
      </div>
      {quotes.length === 0 ? (
        <p className="empty-copy">No sales quotations for these clients yet.</p>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Client ID</th>
                <th>Client</th>
                <th>Package</th>
                <th>Service type</th>
                <th>Quotation</th>
                <th>Date</th>
                {hideAmounts ? null : (
                  <>
                    <th>Quoted</th>
                    <th>Collected</th>
                    <th>Remaining</th>
                    <th>Status</th>
                  </>
                )}
                <th>Sales admin</th>
                {allowView ? <th></th> : null}
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => {
                const summary = quote.summary || {};
                return (
                  <tr key={`${quote.salesOwner}:${quote.id}`}>
                    <td><code>{quote.clientCode || "—"}</code></td>
                    <td>{quote.client || "—"}</td>
                    <td>{quote.packageName || "—"}</td>
                    <td>{SERVICE_TYPE_LABEL[quote.serviceType] || quote.service || "—"}</td>
                    <td><code>{quote.number || "—"}</code></td>
                    <td>{formatQuoteDate(quote.date) || "—"}</td>
                    {hideAmounts ? null : (
                      <>
                        <td>{formatMoney(summary.total || quote.total)}</td>
                        <td>{formatMoney(summary.collected || 0)}</td>
                        <td>{formatMoney(summary.remaining ?? Math.max(0, Number(quote.total || 0) - Number(summary.collected || 0)))}</td>
                        <td>
                          <span className={`project-status ${summary.status === "fully-paid" ? "completed" : "scheduled"}`}>
                            {summary.status === "fully-paid" ? "Fully paid" : "Pending"}
                          </span>
                        </td>
                      </>
                    )}
                    <td>{salesStaffName(quote.salesOwner) || quote.executive || quote.salesOwner || "—"}</td>
                    {allowView ? (
                      <td>
                        <button className="ghost" type="button" onClick={() => setViewing(quote)}>View</button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {viewing ? (
        <SalesModal onClose={() => setViewing(null)}>
          <div className="modal sheet quote-modal">
            <QuotePaper quote={viewing} heading="QUOTATION" />
            <div className="modal-actions">
              <button className="ghost" type="button" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </SalesModal>
      ) : null}
    </article>
  );
}

export function PromisedPackagePanel({ quote, className = "span-2" }) {
  if (!quote) {
    return <p className={`page-note ${className}`}>No promised package on a sales quotation for this client yet.</p>;
  }
  const items = quote.items || [];
  return (
    <section className={`block ${className}`}>
      <h2>Promised package</h2>
      <p className="lede">{quote.packageName || "—"}</p>
      <ul>
        <li>Service type: {SERVICE_TYPE_LABEL[projectTypeFromQuote(quote)]}</li>
        <li>Quotation: {quote.number || "—"}</li>
        {quote.total ? <li>Amount: {formatMoney(quote.total)}</li> : null}
      </ul>
      {items.length ? (
        <ul>
          {items.map((line, index) => (
            <li key={`${line.packageName}-${index}`}>
              {line.packageName}
              {line.period ? ` · ${line.period}` : ""}
              {line.price ? ` · ${formatMoney(line.price)}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function clientQuoteDraft(client, packages, quote) {
  const date = todayISO();
  return {
    id: quote?.id || "",
    number: quote?.number || "",
    clientId: client.id,
    clientCode: client.clientCode || "",
    client: client.business,
    executive: client.executive || "",
    lines: quote?.items?.length
      ? quote.items.map((item) => {
        const pkg = packages.find((entry) => entry.name === item.packageName && entry.service === item.service)
          || packages.find((entry) => entry.name === item.packageName);
        return {
          key: `${item.packageName}-${Math.random().toString(36).slice(2, 7)}`,
          category: packageCategory(pkg?.category || client.service, item.service || pkg?.service),
          service: item.service || pkg?.service || pkg?.category || LEAD_SERVICES[0],
          packageId: pkg?.id || "custom",
          customName: pkg ? "" : item.packageName,
          price: String(item.price),
          scope: item.scope || item.packageName,
          period: item.period,
        };
      })
      : [blankSalesQuoteLine(packages, packageCategory(client.service))],
    discount: String(quote?.discount || 0),
    date: quote?.date || date,
    valid: quote?.valid || addDays(quote?.date || date, 14),
    terms: quote?.terms || "As agreed with the client.",
  };
}

function SalesQuotationsPanel({ data, commit, canEdit }) {
  const clients = convertedClients(data);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const packages = data.packages || [];

  function openForm(client, quote) {
    setError("");
    setDraft(clientQuoteDraft(client, packages, quote));
  }

  function chooseCategory(key, category) {
    const pkg = packagesForCategory(packages, category)[0] || null;
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (
        line.key === key
          ? { ...line, ...lineFromPackage(pkg, pkg?.service || line.service), key, category }
          : line
      )),
    }));
  }

  function choosePackage(key, packageId) {
    const pkg = packages.find((item) => item.id === packageId);
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => {
        if (line.key !== key) return line;
        return {
          ...line,
          packageId,
          category: pkg?.category || line.category,
          service: pkg?.service || line.service,
          customName: "",
          price: pkg ? String(pkg.price) : "",
          period: pkg?.period || "Custom quotation",
          scope: pkg?.scope || line.scope,
        };
      }),
    }));
  }

  function submit(event) {
    event.preventDefault();
    const result = saveClientQuote(data, draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const stored = commit(result.data);
    if (stored) {
      setError(stored);
      return;
    }
    setDraft(null);
    setError("");
  }

  const subtotal = (draft?.lines || []).reduce((sum, line) => sum + (Number(line.price) || 0), 0);
  const offer = Number(draft?.discount);
  const total = Math.max(0, subtotal - (Number.isFinite(offer) && offer > 0 ? offer : 0));

  return (
    <div className="stack">
      <article className="panel">
        <div className="toolbar">
          <h2>Quotation</h2>
        </div>
        {clients.length === 0 ? (
          <p className="empty-copy">Converted leads appear here as clients with a client ID.</p>
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => {
                  const quote = quoteForClient(data, client.id, client.business);
                  const summary = quote ? quoteCollection(data, quote) : null;
                  return (
                    <tr key={client.id}>
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
                      <td>
                        {canEdit ? (
                          <button className="link-btn" type="button" onClick={() => openForm(client, quote)}>
                            {quote ? "Edit quotation" : "Record quotation"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>
      {draft ? (
        <article className="panel">
          <div className="toolbar">
            <div>
              <h2>{draft.id ? `Edit ${draft.number}` : "Record quotation"}</h2>
              <p className="muted">{draft.clientCode ? `${draft.clientCode} · ` : ""}{draft.client}</p>
            </div>
            <button className="ghost" type="button" onClick={() => setDraft(null)}>Close</button>
          </div>
          <form className="sales-form" onSubmit={submit}>
            <div className="sales-grid">
              <label>
                Client
                <select
                  value={draft.clientId}
                  onChange={(event) => {
                    const client = clients.find((item) => item.id === event.target.value);
                    if (client) openForm(client, quoteForClient(data, client.id, client.business));
                  }}
                  required
                >
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.clientCode ? `${client.clientCode} · ` : ""}{client.business}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quotation date
                <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required />
              </label>
              <div className="span-all quote-lines">
                {draft.lines.map((line, index) => {
                  const choices = packagesForCategory(packages, line.category);
                  return (
                    <div className="quote-line" key={line.key}>
                      <div className="quote-line-head">
                        <strong>Package {index + 1}</strong>
                        {draft.lines.length > 1 ? (
                          <button
                            className="ghost"
                            type="button"
                            onClick={() => setDraft((current) => ({ ...current, lines: current.lines.filter((item) => item.key !== line.key) }))}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <div className="sales-grid">
                        <label>
                          Service type
                          <select value={line.category || ""} onChange={(event) => chooseCategory(line.key, event.target.value)}>
                            {LEAD_SERVICES.map((item) => <option key={item}>{item}</option>)}
                          </select>
                        </label>
                        <label>
                          Package
                          <select value={line.packageId} onChange={(event) => choosePackage(line.key, event.target.value)}>
                            {choices.map((item) => (
                              <option key={item.id} value={item.id}>{item.name} · {item.period}</option>
                            ))}
                            <option value="custom">Custom amount</option>
                          </select>
                        </label>
                        <label>
                          Price (LKR)
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={line.price}
                            onChange={(event) => setDraft((current) => ({
                              ...current,
                              lines: current.lines.map((item) => (item.key === line.key ? { ...item, price: event.target.value } : item)),
                            }))}
                            required
                          />
                        </label>
                        {line.packageId === "custom" ? (
                          <label className="span-all">
                            Custom title
                            <input
                              value={line.customName}
                              onChange={(event) => setDraft((current) => ({
                                ...current,
                                lines: current.lines.map((item) => (item.key === line.key ? { ...item, customName: event.target.value } : item)),
                              }))}
                              required
                              maxLength={150}
                            />
                          </label>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                <button className="ghost" type="button" onClick={() => setDraft((current) => ({ ...current, lines: [...current.lines, blankSalesQuoteLine(packages, current.lines[0]?.category)] }))}>
                  Add another package
                </button>
              </div>
              <label>
                Offer / discount (LKR)
                <input type="number" min="0" step="0.01" value={draft.discount} onChange={(event) => setDraft({ ...draft, discount: event.target.value })} />
              </label>
              <div className="budget-total span-all">
                <span>Promised amount</span>
                <strong>{formatMoney(total)}</strong>
              </div>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="modal-actions">
              <button className="ghost" type="button" onClick={() => setDraft(null)}>Cancel</button>
              <button className="primary" type="submit">{draft.id ? "Save quotation" : "Save quotation"}</button>
            </div>
          </form>
        </article>
      ) : null}
    </div>
  );
}

function QuotesPanel({ data, commit, canEdit, projects, documentHeading = "QUOTATION", billClient = false }) {
  const formRef = useRef(null);
  const [draft, setDraft] = useState(() => blankQuote(data.packages));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState(null);
  const [reviewError, setReviewError] = useState("");
  const [viewing, setViewing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [removeError, setRemoveError] = useState("");
  const subtotal = draft.lines.reduce((sum, line) => sum + (Number(line.price) || 0), 0);
  const figures = quotationFigures(subtotal, draft.discount);

  function setField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function chooseProject(projectId) {
    const project = projects.find((item) => item.id === projectId);
    const clientName = project?.client || project?.name || "";
    const details = salesClientByName(clientName);
    setDraft((current) => ({
      ...current,
      projectId,
      client: billClient ? clientName : (project?.name || ""),
      projectName: project?.name || "",
      email: details?.email || "",
      phone: details?.phone || "",
      address: details?.address || "",
      contactFromSales: Boolean(details),
    }));
  }

  function chooseService(key, category) {
    const pkg = packagesForCategory(data.packages, category)[0] || null;
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (
        line.key === key
          ? { ...line, ...lineFromPackage(pkg, pkg?.service || line.service), key, category }
          : line
      )),
      terms: current.lines.length === 1 ? defaultTerms(pkg) : current.terms,
    }));
  }

  function choosePackage(key, packageId) {
    const pkg = data.packages.find((item) => item.id === packageId);
    setDraft((current) => {
      const lines = current.lines.map((line) => {
        if (line.key !== key) return line;
        return {
          ...line,
          packageId,
          customName: "",
          price: pkg ? String(pkg.price) : "",
          scope: pkg?.scope || "",
          period: pkg?.period || "Custom quotation",
        };
      });
      return {
        ...current,
        lines,
        terms: lines.length === 1 ? defaultTerms(pkg) : current.terms,
      };
    });
  }

  function submit(event) {
    event.preventDefault();
    const result = previewQuote(data, draft);
    if (!result.ok) {
      setError(result.error);
      setNotice("");
      return;
    }
    setError("");
    setReviewError("");
    setReview({ ...result.quote, number: result.quote.number || nextQuoteNumber(data, draft.date).number });
  }

  function confirmReview() {
    const result = draft.id ? updateQuote(data, draft) : createQuote(data, draft);
    if (!result.ok) {
      setReviewError(result.error);
      return;
    }
    const stored = commit(result.data);
    if (stored) {
      setReviewError(stored);
      return;
    }
    const saved = result.data.quotes.find((item) => item.id === (draft.id || result.data.quotes.at(-1)?.id));
    setReview(null);
    setDraft(blankQuote(data.packages));
    setError("");
    setNotice(`${saved?.number || "Quotation"} is in saved quotations.`);
  }

  function beginEdit(quote) {
    setViewing(null);
    setReview(null);
    setDraft(draftFromQuote(quote, data.packages, projects));
    setError("");
    setNotice("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function removeQuote(event) {
    event.preventDefault();
    const result = deleteQuote(data, removing.id);
    if (!result.ok) {
      setRemoveError(result.error);
      return;
    }
    const stored = commit(result.data);
    if (stored) {
      setRemoveError(stored);
      return;
    }
    if (draft.id === removing.id) setDraft(blankQuote(data.packages));
    setRemoving(null);
    setRemoveError("");
    setNotice("Quotation deleted.");
  }

  return (
    <div className="stack">
      {canEdit ? (
        <article className="panel" ref={formRef}>
          <div className="toolbar">
            <div>
              <h2>{draft.id ? `Edit ${draft.number}` : (billClient ? "Quotation" : "Create quotation")}</h2>
              <p className="lede">{billClient
                ? "Select the project, add packages, and review the cost. Download the invoice to give to the client."
                : "Choose a registered project and the packages on it, including software and marketing. Review the project budget before it is saved."}</p>
            </div>
          </div>
          <form className="sales-form" onSubmit={submit}>
            <div className="sales-grid">
              <label>
                Project
                <select value={draft.projectId} onChange={(event) => chooseProject(event.target.value)} required>
                  <option value="">{projects.length ? "Select a project" : "No projects registered yet"}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{projectOption(project)}</option>
                  ))}
                  {draft.projectId && !projects.some((project) => project.id === draft.projectId) ? (
                    <option value={draft.projectId}>{draft.client}</option>
                  ) : null}
                </select>
                {billClient ? <span className="hint">Every project registered in the company is listed here.</span> : null}
              </label>
              <label>
                Email
                <input type="email" value={draft.email || ""} onChange={(event) => setField("email", event.target.value)} maxLength={200} readOnly={draft.contactFromSales} />
              </label>
              <label>
                Phone number
                <input value={draft.phone || ""} onChange={(event) => setField("phone", formatPhone(event.target.value))} maxLength={12} readOnly={draft.contactFromSales} />
              </label>
              <label>
                Client address
                <input value={draft.address} onChange={(event) => setField("address", event.target.value)} maxLength={250} readOnly={draft.contactFromSales} />
              </label>
              {draft.contactFromSales ? <p className="page-note span-all">Email, phone, and address are filled from the sales follow-up for this client.</p> : null}
              <label>
                Quotation date
                <input type="date" value={draft.date} onChange={(event) => setField("date", event.target.value)} required />
              </label>
              <label>
                Valid until
                <input type="date" value={draft.valid} onChange={(event) => setField("valid", event.target.value)} required />
              </label>
              <div className="span-all quote-lines">
                {draft.lines.map((line, index) => {
                  const category = packageCategory(line.category, line.service);
                  const choices = packagesForCategory(data.packages, category);
                  return (
                    <div className="quote-line" key={line.key}>
                      <div className="quote-line-head">
                        <strong>Package {index + 1}</strong>
                        {draft.lines.length > 1 ? (
                          <button
                            className="ghost"
                            type="button"
                            onClick={() => setDraft((current) => ({ ...current, lines: current.lines.filter((item) => item.key !== line.key) }))}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <div className="sales-grid">
                        <label>
                          Service type
                          <select value={category} onChange={(event) => chooseService(line.key, event.target.value)}>
                            {LEAD_SERVICES.map((item) => <option key={item}>{item}</option>)}
                          </select>
                        </label>
                        <label>
                          Package
                          <select value={line.packageId} onChange={(event) => choosePackage(line.key, event.target.value)}>
                            {choices.map((item) => (
                              <option key={item.id} value={item.id}>{item.name} · {item.period}</option>
                            ))}
                            <option value="custom">Custom package</option>
                          </select>
                        </label>
                        <label>
                          Price (LKR)
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            value={line.price}
                            onChange={(event) => setDraft((current) => ({
                              ...current,
                              lines: current.lines.map((item) => (item.key === line.key ? { ...item, price: event.target.value } : item)),
                            }))}
                            required
                          />
                        </label>
                        {line.packageId === "custom" ? (
                          <label className="span-all">
                            Custom package title
                            <input
                              value={line.customName}
                              onChange={(event) => setDraft((current) => ({
                                ...current,
                                lines: current.lines.map((item) => (item.key === line.key ? { ...item, customName: event.target.value } : item)),
                              }))}
                              required
                              maxLength={150}
                            />
                          </label>
                        ) : null}
                        <label className="span-all">
                          Scope / deliverables
                          <ScopeEditor
                            value={line.scope}
                            onChange={(scope) => setDraft((current) => ({
                              ...current,
                              lines: current.lines.map((item) => (item.key === line.key ? { ...item, scope } : item)),
                            }))}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
                <button className="ghost" type="button" onClick={() => setDraft((current) => ({ ...current, lines: [...current.lines, blankLine(data.packages)] }))}>
                  Add another package
                </button>
              </div>
              <p className="hint span-all">Subtotal {formatMoney(figures.subtotal)} · Discount {formatMoney(figures.discount)} · VAT (8%) {formatMoney(figures.vat)} · Estimated grand total {formatMoney(figures.grand)}</p>
              <label>
                Offer / discount (LKR)
                <input type="number" min="0" step="0.01" value={draft.discount} onChange={(event) => setField("discount", event.target.value)} required />
              </label>
              <label className="span-all">
                Payment terms
                <input value={draft.terms} onChange={(event) => setField("terms", event.target.value)} required maxLength={300} />
              </label>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            {notice ? <p className="form-note">{notice}</p> : null}
            <div className="modal-actions">
              <button className="primary" type="submit">Review quotation</button>
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  setDraft(blankQuote(data.packages));
                  setError("");
                  setNotice("");
                }}
              >
                Clear
              </button>
            </div>
          </form>
        </article>
      ) : null}
      <article className="panel">
        <div className="toolbar">
          <h2>Saved quotations</h2>
        </div>
        {data.quotes.length === 0 ? (
          <p className="empty-copy">No quotations yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Number</th>
                <th>Project</th>
                <th>Package</th>
                <th>Total</th>
                <th>Valid until</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...data.quotes].reverse().map((quote) => (
                <tr key={quote.id}>
                  <td><code>{quote.number}</code></td>
                  <td>{quote.client}</td>
                  <td>{quote.packageName}</td>
                  <td>{formatMoney(quote.total)}</td>
                  <td>{quote.valid}</td>
                  <td>
                    <div className="icon-actions">
                      <button className="ghost" type="button" onClick={() => setViewing(quote)}>View</button>
                      <button className="ghost" type="button" onClick={() => downloadDocumentPdf(quote.number, quotationDocument(quote, documentHeading))}>{documentHeading === "INVOICE" ? "Download invoice" : "Download"}</button>
                      {canEdit ? <button className="ghost" type="button" onClick={() => beginEdit(quote)}>Edit</button> : null}
                      {canEdit ? <button className="ghost danger" type="button" onClick={() => { setRemoving(quote); setRemoveError(""); }}>Delete</button> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
      {review ? (
        <SalesModal onClose={() => setReview(null)}>
          <div className="modal sheet quote-modal">
            <QuotePaper quote={review} heading={documentHeading} />
            {reviewError ? <p className="form-error">{reviewError}</p> : null}
            <div className="modal-actions">
              <button className="primary" type="button" onClick={() => downloadDocumentPdf(review.number || "quotation", quotationDocument(review, documentHeading))}>{documentHeading === "INVOICE" ? "Download invoice" : "Download"}</button>
              <button className="primary" type="button" onClick={confirmReview}>Confirm quotation</button>
              <button className="ghost" type="button" onClick={() => setReview(null)}>Edit</button>
            </div>
          </div>
        </SalesModal>
      ) : null}
      {viewing ? (
        <SalesModal onClose={() => setViewing(null)}>
          <div className="modal sheet quote-modal">
            <QuotePaper quote={viewing} heading={documentHeading} />
            <div className="modal-actions">
              <button className="primary" type="button" onClick={() => downloadDocumentPdf(viewing.number, quotationDocument(viewing, documentHeading))}>{documentHeading === "INVOICE" ? "Download invoice" : "Download"}</button>
              {canEdit ? <button className="ghost" type="button" onClick={() => beginEdit(viewing)}>Edit</button> : null}
              <button className="ghost" type="button" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </SalesModal>
      ) : null}
      {removing ? (
        <SalesModal onClose={() => setRemoving(null)}>
          <form className="modal" onSubmit={removeQuote}>
            <h2>Delete {removing.number}</h2>
            <p className="lede">This removes the quotation for {removing.client}. Payments already recorded on it must be cancelled first.</p>
            {removeError ? <p className="form-error">{removeError}</p> : null}
            <div className="modal-actions">
              <button className="danger-button" type="submit">Delete</button>
              <button className="ghost" type="button" onClick={() => setRemoving(null)}>Cancel</button>
            </div>
          </form>
        </SalesModal>
      ) : null}
    </div>
  );
}

function QuotePaper({ quote, heading = "QUOTATION" }) {
  if (String(heading || "").toUpperCase() === "INVOICE") {
    return <iframe className="receipt-frame invoice-frame" title={quote.number || "Invoice"} srcDoc={quotationDocument(quote, "INVOICE")} />;
  }
  const figures = quotationFigures(quote.price, quote.discount);
  const lines = quote.items?.length ? quote.items : [];
  return (
    <article className="quote-paper">
      <header className="quote-paper-head">
        <div>
          <div className="quote-brand">
            <img src={neonLogo} alt="NeonLabz" />
          </div>
          <p className="quote-party">
            <strong>{quote.client}</strong>
            {quote.address || ""}
          </p>
        </div>
        <div className="quote-paper-id">
          <strong>{heading}</strong>
          <span>#{quote.number}</span>
          <span>{formatQuoteDate(quote.date)}</span>
        </div>
      </header>
      <table className="quote-paper-table">
        <thead>
          <tr><th>Description</th><th>Total (LKR)</th></tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.packageName}-${index}`}>
              <td>
                <strong>{index + 1}. {line.packageName}</strong>
                <ScopeHtml value={line.scope} />
              </td>
              <td>{formatQuoteAmount(line.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="quote-paper-totals">
        <p><span>Subtotal</span><strong>LKR {formatQuoteAmount(figures.subtotal)}</strong></p>
        <p className="discount"><span>Special Discount ({formatDiscountPercent(figures.percent)}%)</span><strong>-LKR {formatQuoteAmount(figures.discount)}</strong></p>
        <p><span>VAT (8%)</span><strong>LKR {formatQuoteAmount(figures.vat)}</strong></p>
        <p className="grand"><span>Estimated Grand Total</span><strong>LKR {formatQuoteAmount(figures.grand)}</strong></p>
      </div>
      <section className="quote-paper-terms">
        <h3>Terms & Conditions</h3>
        <p>{quote.terms}</p>
      </section>
      <footer>Neonlabz (Pvt) Ltd.</footer>
    </article>
  );
}

function PaymentsPanel({ data, commit, canEdit, month, range, source }) {
  const ownPayments = source === "own";
  const [draft, setDraft] = useState(() => blankPayment());
  const [error, setError] = useState("");
  const [invoiceView, setInvoiceView] = useState(null);
  const [clientQuery, setClientQuery] = useState("");
  const visible = data.payments.filter((payment) => inReportingPeriod(payment.date, month, range));
  const owner = dataOwner();
  const clients = ownPayments
    ? loadClients()
      .filter((client) => client.status === "active" && client.name.trim())
      .map((client) => ({ ...client, owner }))
    : convertedPaymentClients(data);
  const selectedClient = clients.find((client) => client.owner === draft.clientOwner && client.id === draft.clientId);
  const quotes = [...data.quotes];
  if (ownPayments) {
    allCeoQuotes().forEach((quote) => {
      if (!quotes.some((item) => item.id === quote.id)) quotes.push(quote);
    });
  }
  const quoteChoices = selectedClient
    ? (ownPayments
      ? quotes.filter((quote) => quoteMatchesClient(quote, selectedClient.name))
      : [quoteForClient(data, selectedClient.id, selectedClient.name)].filter(Boolean))
    : [];
  const selectedQuote = quoteChoices.find((quote) => quote.id === draft.quoteId) || quoteChoices[0] || null;
  const quoteSummary = selectedQuote ? quoteCollection(data, selectedQuote) : null;
  const choiceKey = quoteChoices.map((quote) => quote.id).join("|");
  const needle = clientQuery.trim().toLowerCase();
  const listed = visible.filter((payment) => {
    if (!needle) return true;
    const quote = quotes.find((item) => item.id === payment.quoteId);
    const hay = [
      payment.clientName,
      payment.clientCode,
      payment.clientId,
      quote?.client,
      quote?.clientCode,
      quote?.clientId,
      paymentClientLabel(payment, quote),
    ].join(" ").toLowerCase();
    return hay.includes(needle);
  });

  useEffect(() => {
    if (ownPayments || !choiceKey) return;
    const ids = choiceKey.split("|");
    setDraft((current) => (ids.includes(current.quoteId) ? current : { ...current, quoteId: ids[0] }));
  }, [ownPayments, choiceKey]);

  async function attachReceipt(file, apply) {
    try {
      const next = await readReceipt(file);
      apply(next);
      setError("");
    } catch (err) {
      apply(null);
      setError(err.message);
    }
  }

  function submit(event) {
    event.preventDefault();
    const result = createPayment(data, draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const stored = commit(result.data);
    if (stored) {
      setError(stored);
      return;
    }
    setDraft(blankPayment());
    setError("");
  }

  function updateStatus(paymentId, status) {
    const result = setPaymentStatus(data, paymentId, status);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const stored = commit(result.data);
    if (stored) {
      setError(stored);
      return;
    }
    setError("");
  }

  return (
    <div className="stack">
      {ownPayments ? null : <NoticeList />}
      {canEdit ? (
        <article className="panel">
          <div className="toolbar">
            <div>
              <h2>Record a payment</h2>
              <p className="lede">{ownPayments
                ? "Choose one of your clients. Quotations are the ones saved on your projects. These payments stay on this account."
                : "Choose a converted client. The promised quotation is selected automatically. Enter the amount received. The CEO must approve it before it is counted as a collection."}</p>
            </div>
          </div>
          <form className="sales-form" onSubmit={submit}>
            <div className="sales-grid">
              <label>
                Client
                <select
                  value={draft.clientId ? `${draft.clientOwner}|${draft.clientId}` : ""}
                  onChange={(event) => {
                    const client = clients.find((item) => `${item.owner}|${item.id}` === event.target.value);
                    const quote = !ownPayments && client ? quoteForClient(data, client.id, client.name) : null;
                    setDraft({
                      ...draft,
                      clientId: client?.id || "",
                      clientOwner: client?.owner || "",
                      quoteId: quote?.id || "",
                    });
                  }}
                  required
                >
                  <option value="">{clients.length ? "Choose a client" : (ownPayments ? "No clients registered yet" : "No converted clients with a quotation yet")}</option>
                  {clients.map((client) => (
                    <option key={`${client.owner}|${client.id}`} value={`${client.owner}|${client.id}`}>
                      {client.code ? `${client.code} · ` : ""}{client.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Saved quotation
                <select
                  value={draft.quoteId}
                  onChange={(event) => setDraft({ ...draft, quoteId: event.target.value })}
                  required
                  disabled={!selectedClient}
                >
                  <option value="">{selectedClient ? "Choose a quotation" : "Choose a client first"}</option>
                  {quoteChoices.map((quote) => (
                    <option key={quote.id} value={quote.id}>{quote.number} · {quote.packageName || quote.client}</option>
                  ))}
                </select>
                {selectedClient && quoteChoices.length === 0 ? (
                  <span className="hint">{ownPayments ? "Save a quotation for this client on the Projects tab first." : "Record a quotation for this client first."}</span>
                ) : null}
                {quoteSummary ? (
                  <span className="hint">
                    Quoted {formatMoney(quoteSummary.total)} · Collected {formatMoney(quoteSummary.collected)} · Remaining {formatMoney(quoteSummary.remaining)}
                    {quoteSummary.awaiting ? ` · ${formatMoney(quoteSummary.awaiting)} awaiting CEO approval` : ""}
                  </span>
                ) : null}
              </label>
              <label>
                Received amount (LKR)
                <input type="number" min="0.01" step="0.01" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} required />
              </label>
              <label>
                Payment date
                <input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required />
              </label>
              {ownPayments ? (
                <label>
                  Status
                  <select
                    value={draft.status}
                    onChange={(event) => setDraft({
                      ...draft,
                      status: event.target.value,
                      receiptName: event.target.value === "confirmed" ? draft.receiptName : "",
                      receiptData: event.target.value === "confirmed" ? draft.receiptData : "",
                    })}
                  >
                    {PAYMENT_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
                  </select>
                </label>
              ) : null}
              <label>
                Payment type
                <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
                  {PAYMENT_TYPES.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              {!ownPayments ? (
                <>
                  <label>
                    Payment method
                    <input value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value })} maxLength={80} placeholder="Bank Transfer" />
                  </label>
                  <label>
                    Transaction ID
                    <input value={draft.transactionId} onChange={(event) => setDraft({ ...draft, transactionId: event.target.value })} maxLength={80} />
                  </label>
                </>
              ) : null}
              {!ownPayments || draft.status === "confirmed" ? (
                <label className="span-all">
                  Receipt
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(event) => attachReceipt(event.target.files?.[0], (file) => setDraft((current) => ({
                      ...current,
                      receiptName: file?.name || "",
                      receiptData: file?.data || "",
                    })))}
                  />
                  <span className="hint">{draft.receiptName || (ownPayments ? "PDF or image, up to 1.5 MB." : "Optional. PDF or image, up to 1.5 MB.")}</span>
                </label>
              ) : null}
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="modal-actions">
              <button className="primary" type="submit">Record payment</button>
            </div>
          </form>
        </article>
      ) : (
        <div className="toolbar">
          <button className="ghost" type="button" onClick={() => downloadPayments(visible, quotes, month)}>Export month CSV</button>
        </div>
      )}
      <article className="panel">
        <div className="toolbar payment-client-filter">
          <h2>{ownPayments ? "Payments" : "Sales and payments"}</h2>
          <div className="payment-table-tools">
            <input
              value={clientQuery}
              onChange={(event) => setClientQuery(event.target.value)}
              placeholder="Filter by client name or ID"
              aria-label="Filter by client name or ID"
            />
            <button className="ghost" type="button" onClick={() => downloadPayments(visible, quotes, month)}>Export CSV</button>
          </div>
        </div>
        {visible.length === 0 ? (
          <p className="empty-copy">No payments in {reportingLabel(month, range)}.</p>
        ) : listed.length === 0 ? (
          <p className="empty-copy">No payments match that client.</p>
        ) : (
          <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Quotation</th>
                <th>Executive</th>
                <th>Amount</th>
                <th>Type</th>
                <th>Receipt</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {[...listed].reverse().map((payment) => {
                const quote = quotes.find((item) => item.id === payment.quoteId);
                const invoice = approvedInvoiceForPayment(payment, quote, owner);
                return (
                  <tr key={payment.id}>
                    <td>{payment.date}</td>
                    <td>{paymentClientLabel(payment, quote)}</td>
                    <td>{quote ? quote.number : "Removed quotation"}</td>
                    <td>{payment.executive}</td>
                    <td>{formatMoney(payment.amount)}</td>
                    <td>{payment.type}</td>
                    <td>
                      {payment.receiptData ? (
                        <a href={payment.receiptData} download={payment.receiptName || "receipt"}>{payment.receiptName || "Receipt"}</a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{payment.approval === "pending" ? <span className="project-status scheduled">Awaiting CEO approval</span> : <PaymentBadge status={payment.status} />}</td>
                    <td>
                      <div className="icon-actions">
                        {ownPayments && canEdit && payment.status !== "cancelled" && payment.approval !== "pending" ? (
                          <button className="ghost" type="button" onClick={() => updateStatus(payment.id, "cancelled")}>Cancel</button>
                        ) : null}
                        {invoice ? (
                          <>
                            <button className="primary" type="button" onClick={() => setInvoiceView(invoice)}>View invoice</button>
                            <button className="ghost" type="button" onClick={() => downloadDocumentPdf(invoice.receiptNo || "invoice", paymentReceiptDocument(invoice))}>Download</button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </article>
      <InvoiceDialog invoice={invoiceView} onClose={() => setInvoiceView(null)} />
    </div>
  );
}

function NoticeList() {
  const username = sessionAccount()?.username || "";
  const [items, setItems] = useState(() => loadNotices(username));
  const [viewing, setViewing] = useState(null);
  if (!items.length) return null;
  return (
    <article className="panel">
      <h2>Notifications</h2>
      {items.map((item) => {
        const invoice = item.invoiceId ? projectInvoiceById(item.invoiceId) : null;
        return (
          <div className="toolbar" key={item.id}>
            <p>{item.text}</p>
            <div className="icon-actions">
              {invoice?.approval === "approved" ? (
                <button className="primary" type="button" onClick={() => setViewing(invoice)}>View invoice</button>
              ) : null}
              <button className="ghost" type="button" onClick={() => { dismissNotice(item.id); setItems(loadNotices(username)); }}>Dismiss</button>
            </div>
          </div>
        );
      })}
      <InvoiceDialog invoice={viewing} onClose={() => setViewing(null)} />
    </article>
  );
}

function ProjectInstallments({ username }) {
  const quotes = useMemo(() => confirmedCeoQuotes(username), [username]);
  const [viewing, setViewing] = useState(null);
  if (!quotes.length) return null;
  return (
    <article className="panel">
      <div className="toolbar">
        <div>
          <h2>Confirmed payments</h2>
        </div>
      </div>
      {quotes.map((quote) => {
        const payments = approvedInstallments(quote.id);
        const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
        const remaining = Math.max(0, Math.round((quote.total - paid) * 100) / 100);
        return (
          <div key={quote.id}>
            <p><strong>{quote.number}</strong> · {quote.address || quote.client} · {formatMoney(paid)} of {formatMoney(quote.total)}</p>
            {payments.length === 0 ? <p className="empty-copy">No approved payment yet. Remaining {formatMoney(quote.total)}.</p> : (
              <table>
                <thead>
                  <tr><th>Date</th><th>Installment</th><th>Amount</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {payments.map((payment) => {
                    const invoice = projectInvoiceFor(payment.salesOwner, payment.id);
                    return (
                      <tr key={payment.id}>
                        <td>{payment.date}</td>
                        <td>{payment.type}</td>
                        <td>{formatMoney(payment.amount)}</td>
                        <td>Paid</td>
                        <td>{invoice ? <button className="primary" type="button" onClick={() => setViewing(invoice)}>View invoice</button> : null}</td>
                      </tr>
                    );
                  })}
                  {remaining > 0 ? (
                    <tr>
                      <td></td>
                      <td>Balance</td>
                      <td>{formatMoney(remaining)}</td>
                      <td>Pending</td>
                      <td></td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
      <InvoiceDialog invoice={viewing} onClose={() => setViewing(null)} />
    </article>
  );
}

function ConfirmedCeoQuotes({ username }) {
  const person = loadUsers().find((user) => user.username === username);
  const quotes = useMemo(() => confirmedCeoQuotes(username), [username]);
  const [viewing, setViewing] = useState(null);
  if (!person || (person.role !== "pm" && person.role !== "sales")) return null;

  return (
    <article className="panel">
      <div className="toolbar">
        <div>
          <h2>Confirmed by CEO</h2>
        </div>
      </div>
      {quotes.length === 0 ? (
        <p className="empty-copy">No confirmed quotations for your projects yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Project</th>
              <th>Client</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote) => (
              <tr key={quote.id}>
                <td><code>{quote.number}</code></td>
                <td>{quote.address || quote.client}</td>
                <td>{quote.client}</td>
                <td>{formatMoney(quote.total)}</td>
                <td>
                  <div className="icon-actions">
                    <button className="ghost" type="button" onClick={() => setViewing(quote)}>View</button>
                    <button className="ghost" type="button" onClick={() => downloadDocumentPdf(quote.number, quotationDocument(quote, "INVOICE"))}>Download invoice</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {viewing ? (
        <SalesModal onClose={() => setViewing(null)}>
          <div className="modal sheet quote-modal">
            <QuotePaper quote={viewing} heading="INVOICE" />
            <div className="modal-actions">
              <button className="primary" type="button" onClick={() => downloadDocumentPdf(viewing.number, quotationDocument(viewing, "INVOICE"))}>Download invoice</button>
              <button className="ghost" type="button" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </SalesModal>
      ) : null}
    </article>
  );
}

function FollowUpPanel({ data, commit, canEdit, executives, username, month, allowDelete = false }) {
  const today = todayISO();
  const csvInput = useRef(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [open, setOpen] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState("");
  const leads = data.leads || [];
  const canRemove = canEdit && allowDelete;
  const rows = sortLeadsById(leads.filter((lead) => {
    const hay = `${lead.id} ${lead.business} ${lead.phone}`.toLowerCase();
    if (query && !hay.includes(query.toLowerCase())) return false;
    if (status && lead.status !== status) return false;
    if (source && lead.source !== source) return false;
    return true;
  }));

  function save(draft) {
    const result = saveLead(data, {
      ...draft,
      executive: draft.executive || defaultExecutive(executives, username),
    });
    if (!result.ok) {
      if (result.error === LEAD_PHONE_EXISTS_MESSAGE) window.alert(result.error);
      setError(result.error);
      return result.error;
    }
    const stored = commit(result.data);
    if (stored) {
      setError(stored);
      return stored;
    }
    setError("");
    setOpen(null);
    return "";
  }

  function removeLead(event) {
    event.preventDefault();
    if (!removing) return;
    const result = deleteLead(data, removing.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const stored = commit(result.data);
    if (stored) {
      setError(stored);
      return;
    }
    setError("");
    setRemoving(null);
    if (open?.id === removing.id) setOpen(null);
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <div>
          <h2>Leads</h2>
        </div>
        <div className="lead-header-actions">
          {canEdit ? (
            <>
              <input
                ref={csvInput}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const result = importLeadsFromCsv(data, String(reader.result || ""), {
                      executive: defaultExecutive(executives, username),
                    });
                    if (!result.ok) {
                      setNotice("");
                      setError(result.error);
                      return;
                    }
                    const stored = commit(result.data);
                    if (stored) {
                      setNotice("");
                      setError(stored);
                      return;
                    }
                    setError("");
                    setNotice(result.message);
                  };
                  reader.readAsText(file);
                }}
              />
              <button className="ghost" type="button" onClick={() => csvInput.current?.click()}>Import CSV</button>
              <button className="primary" type="button" onClick={() => { setOpen(blankLead(defaultExecutive(executives, username), month, nextLeadId())); setError(""); setNotice(""); }}>
                + Add lead
              </button>
            </>
          ) : null}
        </div>
      </div>
      <article className="panel sales-leads">
        <div className="toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ID, business or phone..." />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {LEAD_STAGES.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="">All sources</option>
            {LEAD_SOURCES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        {notice ? <p className="form-note">{notice}</p> : null}
        {rows.length === 0 ? (
          <p className="empty-copy">No matching leads.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Lead ID</th>
                <th>Date</th>
                <th>Business / Customer</th>
                <th className="phone-cell">Phone</th>
                <th>Source</th>
                <th>Interested service</th>
                <th>Lead status</th>
                <th>Follow-ups</th>
                <th>Next follow-up</th>
                {canRemove ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => {
                const overdue = lead.next && lead.next < today && lead.status !== "Converted" && lead.status !== "Lost";
                return (
                  <tr key={lead.id} className={overdue ? "due-row" : ""} onClick={() => { setOpen(lead); setError(""); }}>
                    <td>
                      <code>{lead.id}</code>
                      {lead.clientCode ? <div className="muted">{lead.clientCode}</div> : null}
                    </td>
                    <td>{lead.date || "—"}</td>
                    <td><strong>{lead.business}</strong></td>
                    <td className="phone-cell">{lead.phone || "—"}</td>
                    <td>{lead.source || "—"}</td>
                    <td>{lead.service || "—"}</td>
                    <td><LeadStatus status={lead.status} /></td>
                    <td><span className="history-count">{(lead.calls || []).length}</span></td>
                    <td className={overdue ? "issue-overdue" : ""}>{lead.next || "—"}{overdue ? " · Overdue" : ""}</td>
                    {canRemove ? (
                      <td onClick={(event) => event.stopPropagation()}>
                        <div className="icon-actions">
                          <IconButton label={`Delete ${lead.business || lead.id}`} tone="danger" onClick={() => { setRemoving(lead); setError(""); }}>
                            <DeleteIcon />
                          </IconButton>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </article>
      {open ? (
        <LeadDialog
          lead={open}
          executives={executives}
          canEdit={canEdit}
          error={error}
          onClose={() => setOpen(null)}
          onSave={save}
          onDelete={canRemove ? () => { setRemoving(open); setOpen(null); setError(""); } : null}
        />
      ) : null}
      {removing ? (
        <SalesModal onClose={() => setRemoving(null)}>
          <form className="modal" onSubmit={removeLead}>
            <h2>Delete {removing.id}</h2>
            <p className="lede">This removes {removing.business || "this lead"} and its follow-up history. The lead ID will not be reused.</p>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="modal-actions">
              <button className="danger-button" type="submit">Delete lead</button>
              <button className="ghost" type="button" onClick={() => setRemoving(null)}>Cancel</button>
            </div>
          </form>
        </SalesModal>
      ) : null}
    </div>
  );
}

function LeadDialog({ lead, executives, canEdit, error, onClose, onSave, onDelete }) {
  const existing = Boolean(lead.business);
  const [draft, setDraft] = useState({ ...lead, phone: formatPhone(lead.phone) });
  const [call, setCall] = useState(null);
  const [callIndex, setCallIndex] = useState(null);
  const [message, setMessage] = useState(error || "");

  function setField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event) {
    event.preventDefault();
    const payload = { ...draft, call: call || undefined, callIndex: call ? callIndex : undefined };
    const result = onSave(payload);
    if (result) setMessage(result);
  }

  return (
    <SalesModal onClose={onClose}>
      <form className="modal sheet" onSubmit={submit}>
        <h2>{existing ? "Lead profile & follow-ups" : "Add lead"}</h2>
        <div className="sales-grid">
          <label>
            Lead ID
            <input value={draft.id} readOnly required maxLength={40} />
          </label>
          {draft.clientCode ? (
            <label>
              Client ID
              <input value={draft.clientCode} readOnly />
            </label>
          ) : null}
          <label>
            Date
            <input type="date" value={draft.date} onChange={(event) => setField("date", event.target.value)} required />
          </label>
          <label>
            Business / Customer
            <input value={draft.business} onChange={(event) => setField("business", event.target.value)} required maxLength={150} />
          </label>
          <label>
            Phone
            <input type="tel" inputMode="numeric" value={draft.phone} onChange={(event) => setField("phone", formatPhone(event.target.value))} placeholder="000-000-0000" maxLength={12} required />
          </label>
          <label>
            Source
            <select value={draft.source} onChange={(event) => setField("source", event.target.value)}>
              {LEAD_SOURCES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Interested service
            <select value={draft.service} onChange={(event) => setField("service", event.target.value)}>
              <option value="">Choose a service</option>
              {leadServiceOptions(draft.service).map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Email
            <input type="email" value={draft.email} onChange={(event) => setField("email", event.target.value)} maxLength={200} />
          </label>
          <label>
            Address
            <input value={draft.address} onChange={(event) => setField("address", event.target.value)} maxLength={250} />
          </label>
          <label>
            Business type
            <input value={draft.businessType || ""} onChange={(event) => setField("businessType", event.target.value)} maxLength={120} />
          </label>
          {existing ? (
            <>
              <label>
                Lead status
                <select value={draft.status} onChange={(event) => setField("status", event.target.value)}>
                  {LEAD_STAGES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              {executives.length > 1 ? (
                <label>
                  Sales executive
                  <select value={draft.executive} onChange={(event) => setField("executive", event.target.value)}>
                    {executives.map((user) => <option key={user.username} value={user.username}>{user.username}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="span-all">
                Notes
                <textarea value={draft.notes} onChange={(event) => setField("notes", event.target.value)} rows={2} maxLength={600} />
              </label>
            </>
          ) : null}
        </div>
        {existing ? (
          <section className="call-history">
            <div className="toolbar">
              <h3>Call & follow-up history</h3>
              <span className="history-count">{(draft.calls || []).length} recorded</span>
            </div>
            {(draft.calls || []).length === 0 ? <p className="page-note">No calls recorded yet.</p> : (
              <div className="inline-history">
                {(draft.calls || []).map((item, index) => (
                  <button
                    key={`${item.date}-${index}`}
                    className="history-entry"
                    type="button"
                    onClick={() => {
                      setCallIndex(index);
                      setCall({ ...item });
                    }}
                  >
                    <strong>{item.date || "—"} · {item.outcome || "—"}</strong>
                    <span>{item.note || "No notes"}</span>
                    <small>Edit record #{index + 1}</small>
                  </button>
                ))}
              </div>
            )}
            {canEdit && !call ? (
              <button className="ghost" type="button" onClick={() => { setCallIndex(null); setCall(blankCall(draft)); }}>+ Record new call / follow-up</button>
            ) : null}
            {call ? (
              <div className="call-editor">
                <div className="toolbar">
                  <h3>{callIndex == null ? "New call / follow-up" : "Update previous call"}</h3>
                  <button className="ghost" type="button" onClick={() => { setCall(null); setCallIndex(null); }}>Cancel call entry</button>
                </div>
                <div className="sales-grid">
                  <label>
                    Call date
                    <input type="date" value={call.date} onChange={(event) => setCall({ ...call, date: event.target.value })} required />
                  </label>
                  <label>
                    Call result
                    <select value={call.outcome} onChange={(event) => setCall({ ...call, outcome: event.target.value })}>
                      {CALL_OUTCOMES.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label>
                    Lead status after call
                    <select value={call.status} onChange={(event) => setCall({ ...call, status: event.target.value })}>
                      {LEAD_STAGES.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </label>
                  <label>
                    Next follow-up date
                    <input type="date" value={call.next} onChange={(event) => setCall({ ...call, next: event.target.value })} />
                  </label>
                  <label className="span-all">
                    Conversation / notes
                    <textarea value={call.note} onChange={(event) => setCall({ ...call, note: event.target.value })} rows={3} />
                  </label>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
        {message ? <p className="form-error" role="alert">{message}</p> : null}
        <div className="modal-actions">
          {canEdit ? <button className="primary" type="submit">Save</button> : null}
          {canEdit && existing && onDelete ? (
            <button className="ghost danger" type="button" onClick={onDelete}>Delete lead</button>
          ) : null}
          <button className="ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </SalesModal>
  );
}

function blankLead(executive, month, id = "") {
  return {
    id,
    date: dateInMonth(month),
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
    calls: [],
  };
}

function blankCall(lead) {
  return {
    date: todayISO(),
    outcome: "Answered",
    status: lead.status || "New",
    next: lead.next || "",
    note: "",
  };
}

function LeadStatus({ status }) {
  const tone = ["Converted", "Connected", "Interested"].includes(status)
    ? "completed"
    : ["Lost"].includes(status)
      ? "cancelled"
      : ["Follow-up", "Quotation Sent", "Payment Promised"].includes(status)
        ? "scheduled"
        : "in-progress";
  return <span className={`project-status ${tone}`}>{status}</span>;
}

export function CeoPackages({ username }) {
  const [data, setData] = useState(() => loadCeoSales(username));
  const projects = useMemo(() => companyProjects(), []);

  function commit(next) {
    try {
      saveCeoSales(username, next);
    } catch {
      return "Could not store this change.";
    }
    setData(next);
    return "";
  }

  return (
    <div className="stack">
      <PackagesPanel data={data} commit={commit} canEdit />
      <QuotesPanel data={data} commit={commit} canEdit projects={projects} documentHeading="INVOICE" billClient />
    </div>
  );
}

function packageFileName(item) {
  const slug = String(item?.name || "package")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "package"}.pdf`;
}

function packageLetterhead(item) {
  return packageDocumentFromItem(item);
}

function PackagesPanel({ data, commit, canEdit }) {
  const [draft, setDraft] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  function openEditor(item) {
    setError("");
    setDraft(item ? {
      ...item,
      price: String(item.price),
      cover: item.cover || "",
      coverFit: normalizeCoverFit(item.coverFit),
    } : blankPackage());
  }

  function chooseCover(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use a JPG, PNG, or WEBP cover image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Cover image must be 2 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setError("");
      setDraft((current) => ({
        ...current,
        cover: String(reader.result || ""),
        coverFit: defaultCoverFit(),
      }));
    };
    reader.onerror = () => setError("Could not read that image.");
    reader.readAsDataURL(file);
  }

  function submit(event) {
    event.preventDefault();
    if (!draft.name.trim() || !scopeHasText(draft.scope)) {
      setError("Package name and scope are required.");
      return;
    }
    const result = savePackage(data, draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    commit(result.data);
    setDraft(null);
    setError("");
  }

  function remove(item) {
    commit(deletePackage(data, item.id));
    setRemoving(null);
    if (draft?.id === item.id) setDraft(null);
  }

  return (
    <div className="stack">
      {canEdit ? (
        <div className="toolbar">
          <button className="primary" type="button" onClick={() => openEditor(null)}>Add package</button>
        </div>
      ) : null}
      {data.packages.length === 0 ? (
        <p className="empty-copy">No packages yet.</p>
      ) : (
        <div className="package-grid">
          {data.packages.map((item) => (
            <article key={item.id} className={`package-card${item.cover ? " has-cover" : ""}`}>
              {item.cover ? <CoverMedia className="package-cover" src={item.cover} fit={item.coverFit} /> : null}
              <div className="package-card-body">
                <div className="package-card-head">
                  <strong>{item.name}</strong>
                  <div className="package-card-tools">
                    <button className="icon-button" type="button" aria-label={`View full package ${item.name}`} title="View full package" onClick={() => setPreview(item)}>
                      <ViewIcon />
                    </button>
                    <button className="icon-button" type="button" aria-label={`Download ${item.name}`} title={`Download ${item.name}`} onClick={() => setViewing(item)}>
                      <DownloadIcon />
                    </button>
                  </div>
                </div>
                <span className="package-price">{formatMoney(item.price)}</span>
                <span className="project-status">{item.category} · {item.period}</span>
                <div className="package-card-scope">
                  <ScopeHtml value={item.scope} />
                </div>
                {canEdit ? (
                  <div className="package-actions">
                    <button className="ghost" type="button" onClick={() => openEditor(item)}>Edit</button>
                    <button className="ghost danger" type="button" onClick={() => setRemoving(item)}>Delete</button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
      {draft ? (
        <SalesModal onClose={() => setDraft(null)}>
          <form className="modal sheet" onSubmit={submit}>
            <h2>{draft.id ? "Edit package" : "Add a package"}</h2>
            <div className="sales-grid">
              <label>
                Service type
                <select value={draft.category || LEAD_SERVICES[0]} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                  {LEAD_SERVICES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                Package name
                <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required maxLength={150} />
              </label>
              <label>
                Price (LKR)
                <input type="number" min="1" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} required />
              </label>
              <label>
                Price basis
                <select value={draft.period} onChange={(event) => setDraft({ ...draft, period: event.target.value })}>
                  {PRICE_BASIS.map((period) => <option key={period}>{period}</option>)}
                </select>
              </label>
              <label className="span-all">
                Cover image
                <input className="file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseCover} />
                <span className="hint">{draft.id && draft.cover ? "Upload a new image to replace the current cover." : "JPG, PNG, or WEBP, up to 2 MB."}</span>
              </label>
              {draft.cover ? (
                <CoverEditor
                  src={draft.cover}
                  fit={normalizeCoverFit(draft.coverFit)}
                  onFitChange={(coverFit) => setDraft((current) => ({ ...current, coverFit }))}
                  onRemove={() => setDraft((current) => ({ ...current, cover: "", coverFit: defaultCoverFit() }))}
                />
              ) : null}
              <label className="span-all">
                Approved scope
                <ScopeEditor value={draft.scope} onChange={(scope) => setDraft({ ...draft, scope })} />
              </label>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="modal-actions">
              <button className="primary" type="submit">Save package</button>
              <button className="ghost" type="button" onClick={() => setDraft(null)}>Cancel</button>
            </div>
          </form>
        </SalesModal>
      ) : null}
      {preview ? (
        <SalesModal onClose={() => setPreview(null)}>
          <div className="modal sheet package-full">
            {preview.cover ? <CoverMedia className="package-full-cover" src={preview.cover} fit={preview.coverFit} /> : null}
            <h2>{preview.name}</h2>
            <span className="package-price">{formatMoney(preview.price)}</span>
            <span className="project-status">{preview.category} · {preview.period}</span>
            <div className="package-full-scope">
              <ScopeHtml value={preview.scope} />
            </div>
            <div className="modal-actions">
              <button className="primary" type="button" onClick={() => setViewing(preview)}>Download PDF</button>
              {canEdit ? <button className="ghost" type="button" onClick={() => { setPreview(null); openEditor(preview); }}>Edit</button> : null}
              <button className="ghost" type="button" onClick={() => setPreview(null)}>Close</button>
            </div>
          </div>
        </SalesModal>
      ) : null}
      {viewing ? (
        <LetterheadDialog
          title={viewing.name}
          html={packageLetterhead(viewing)}
          fileName={packageFileName(viewing)}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {removing ? (
        <SalesModal onClose={() => setRemoving(null)}>
          <form
            className="modal"
            onSubmit={(event) => {
              event.preventDefault();
              remove(removing);
            }}
          >
            <h2>Delete {removing.name}</h2>
            <p className="lede">This removes the package from the catalogue. Quotations already saved keep their original price and scope.</p>
            <div className="modal-actions">
              <button className="danger-button" type="submit">Delete</button>
              <button className="ghost" type="button" onClick={() => setRemoving(null)}>Cancel</button>
            </div>
          </form>
        </SalesModal>
      ) : null}
    </div>
  );
}

function SalesModal({ children, onClose }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div onClick={(event) => event.stopPropagation()} role="presentation">{children}</div>
    </div>,
    document.body
  );
}

function coverLayout(natural, box, fit) {
  const zoom = Math.max(COVER_ZOOM_MIN, Number(fit?.zoom) || 1);
  const x = Number.isFinite(Number(fit?.x)) ? Number(fit.x) : 50;
  const y = Number.isFinite(Number(fit?.y)) ? Number(fit.y) : 50;
  if (!natural?.w || !natural?.h || !box?.w || !box?.h) {
    return { width: 0, height: 0, offsetX: 0, offsetY: 0, extraX: 0, extraY: 0 };
  }
  const scale = Math.max(box.w / natural.w, box.h / natural.h) * zoom;
  const width = natural.w * scale;
  const height = natural.h * scale;
  const extraX = Math.max(0, width - box.w);
  const extraY = Math.max(0, height - box.h);
  return {
    width,
    height,
    extraX,
    extraY,
    offsetX: extraX <= 0 ? (box.w - width) / 2 : -(Math.min(100, Math.max(0, x)) / 100) * extraX,
    offsetY: extraY <= 0 ? (box.h - height) / 2 : -(Math.min(100, Math.max(0, y)) / 100) * extraY,
  };
}

function measurePackageCoverBox() {
  const cover = document.querySelector(".package-grid .package-cover");
  if (cover?.clientWidth) {
    return { w: Math.round(cover.clientWidth), h: Math.round(cover.clientHeight) || COVER_HEIGHT };
  }
  const card = document.querySelector(".package-grid .package-card");
  if (card?.clientWidth) {
    return { w: Math.round(card.clientWidth), h: COVER_HEIGHT };
  }
  const grid = document.querySelector(".package-grid");
  if (grid?.clientWidth) {
    const styles = getComputedStyle(grid);
    const gap = Number.parseFloat(styles.columnGap) || 12;
    const columns = styles.gridTemplateColumns.split(" ").filter(Boolean).length || 3;
    return {
      w: Math.round(Math.max(180, (grid.clientWidth - gap * Math.max(0, columns - 1)) / columns)),
      h: COVER_HEIGHT,
    };
  }
  return { w: 360, h: COVER_HEIGHT };
}

function CoverMedia({ src, fit, className, interactive = false, onFitChange, style }) {
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const layout = coverLayout(natural, box, fit);

  useEffect(() => {
    setNatural({ w: 0, h: 0 });
    const image = new Image();
    image.onload = () => setNatural({ w: image.naturalWidth, h: image.naturalHeight });
    image.src = src;
  }, [src]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [src]);

  function pointerDown(event) {
    if (!interactive || !onFitChange) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events may not support pointer capture.
    }
    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: fit.x,
      y: fit.y,
      extraX: layout.extraX,
      extraY: layout.extraY,
    };
    setDragging(true);
  }

  function pointerMove(event) {
    const drag = dragRef.current;
    if (!drag || !onFitChange) return;
    const nextX = drag.extraX <= 0 ? 50 : Math.min(100, Math.max(0, drag.x - ((event.clientX - drag.pointerX) / drag.extraX) * 100));
    const nextY = drag.extraY <= 0 ? 50 : Math.min(100, Math.max(0, drag.y - ((event.clientY - drag.pointerY) / drag.extraY) * 100));
    onFitChange({ zoom: fit.zoom, x: nextX, y: nextY });
  }

  function pointerUp(event) {
    if (dragRef.current && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  }

  return (
    <div
      ref={frameRef}
      className={`${className}${interactive ? " is-interactive" : ""}${dragging ? " is-dragging" : ""}`}
      style={style}
      role={interactive ? "img" : undefined}
      aria-label={interactive ? "Adjust cover image" : undefined}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
    >
      {layout.width ? (
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            width: `${layout.width}px`,
            height: `${layout.height}px`,
            transform: `translate(${layout.offsetX}px, ${layout.offsetY}px)`,
          }}
        />
      ) : null}
    </div>
  );
}

function CoverEditor({ src, fit, onFitChange, onRemove }) {
  const stageRef = useRef(null);
  const [coverBox, setCoverBox] = useState(() => measurePackageCoverBox());
  const [preview, setPreview] = useState(() => measurePackageCoverBox());

  useEffect(() => {
    function measure() {
      const actual = measurePackageCoverBox();
      const maxW = stageRef.current?.clientWidth || actual.w;
      const scale = Math.min(1, maxW / actual.w);
      setCoverBox(actual);
      setPreview({
        w: Math.round(actual.w * scale),
        h: Math.round(actual.h * scale),
      });
    }
    measure();
    const observer = new ResizeObserver(measure);
    if (stageRef.current) observer.observe(stageRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [src]);

  function setZoom(zoom) {
    onFitChange({
      ...fit,
      zoom: Math.min(COVER_ZOOM_MAX, Math.max(COVER_ZOOM_MIN, Math.round(zoom * 10) / 10)),
    });
  }

  return (
    <div className="package-cover-editor span-all">
      <div className="package-cover-stage" ref={stageRef}>
        <div className="package-cover-card-mock" style={{ width: preview.w }}>
          <CoverMedia
            className="package-cover-live"
            src={src}
            fit={fit}
            interactive
            onFitChange={onFitChange}
            style={{ width: preview.w, height: preview.h }}
          />
          <div className="package-cover-card-mock-foot">
            <span>Package card cover</span>
            <strong>{coverBox.w} × {coverBox.h}</strong>
          </div>
        </div>
      </div>
      <div className="package-cover-tools">
        <button className="icon-button" type="button" aria-label="Zoom out" disabled={fit.zoom <= COVER_ZOOM_MIN} onClick={() => setZoom(fit.zoom - COVER_ZOOM_STEP)}>
          <MinusIcon />
        </button>
        <input
          type="range"
          min={COVER_ZOOM_MIN}
          max={COVER_ZOOM_MAX}
          step={COVER_ZOOM_STEP}
          value={fit.zoom}
          aria-label="Cover zoom"
          onChange={(event) => setZoom(Number(event.target.value))}
        />
        <button className="icon-button" type="button" aria-label="Zoom in" disabled={fit.zoom >= COVER_ZOOM_MAX} onClick={() => setZoom(fit.zoom + COVER_ZOOM_STEP)}>
          <PlusIcon />
        </button>
        <span className="package-cover-zoom">{Math.round(fit.zoom * 100)}%</span>
        <button className="ghost" type="button" onClick={() => onFitChange(defaultCoverFit())}>Reset view</button>
        <button className="ghost" type="button" onClick={onRemove}>Remove image</button>
      </div>
      <p className="hint">This frame is the same size as the cover on the package card. Drag to reposition.</p>
    </div>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 12h12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 6v12M6 12h12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v10M8 10l4 4 4-4M5 19h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ViewIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function PaymentBadge({ status }) {
  const label = PAYMENT_STATUSES.find((item) => item.id === status)?.label || status;
  const tone = status === "confirmed" ? "completed" : status === "cancelled" ? "cancelled" : "scheduled";
  return <span className={`project-status ${tone}`}>{label}</span>;
}

function draftFromQuote(quote, packages, projects) {
  const matched = projects.find((project) => project.id === quote.projectId) || projects.find((project) => project.name === quote.client);
  return {
    id: quote.id,
    number: quote.number,
    projectId: matched?.id || quote.projectId || "",
    client: quote.client,
    contact: quote.contact,
    email: quote.email || "",
    phone: quote.phone || "",
    address: quote.address,
    projectName: quote.projectName || "",
    contactFromSales: Boolean(quote.email || quote.phone || quote.address),
    executive: quote.executive,
    lines: quote.items.map((item) => {
      const pkg = packages.find((entry) => entry.name === item.packageName && entry.service === item.service)
        || packages.find((entry) => entry.name === item.packageName);
      return {
        key: `${item.packageName}-${Math.random().toString(36).slice(2, 7)}`,
        category: packageCategory(item.category || pkg?.category, item.service || pkg?.service),
        service: item.service || pkg?.service || pkg?.category || LEAD_SERVICES[0],
        packageId: pkg?.id || "custom",
        customName: pkg ? "" : item.packageName,
        price: String(item.price),
        scope: item.scope,
        period: item.period,
      };
    }),
    discount: String(quote.discount),
    terms: quote.terms,
    date: quote.date,
    valid: quote.valid,
  };
}

function blankQuote(packages) {
  const line = blankLine(packages);
  const pkg = packages.find((item) => item.id === line.packageId);
  const date = todayISO();
  return {
    projectId: "",
    client: "",
    contact: "",
    email: "",
    phone: "",
    address: "",
    projectName: "",
    contactFromSales: false,
    executive: "",
    lines: [line],
    discount: "0",
    terms: defaultTerms(pkg),
    date,
    valid: addDays(date, 14),
  };
}

function blankLine(packages, category) {
  const chosen = packageCategory(category);
  const pkg = packagesForCategory(packages, chosen)[0] || null;
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category: chosen,
    ...lineFromPackage(pkg, pkg?.service || chosen),
  };
}

function blankSalesQuoteLine(packages, category) {
  const chosen = packageCategory(category);
  const pkg = packagesForCategory(packages, chosen)[0] || null;
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category: chosen,
    ...lineFromPackage(pkg, pkg?.service || chosen),
  };
}

function lineFromPackage(pkg, service) {
  return {
    service: pkg?.service || service,
    category: pkg?.category || packageCategory(service),
    packageId: pkg?.id || "custom",
    customName: "",
    price: pkg ? String(pkg.price) : "",
    scope: pkg?.scope || "",
    period: pkg?.period || "Custom quotation",
  };
}

function blankPayment() {
  return {
    clientId: "",
    clientOwner: "",
    quoteId: "",
    amount: "",
    date: todayISO(),
    status: "pending",
    type: PAYMENT_TYPES[0],
    method: "",
    transactionId: "",
    receiptName: "",
    receiptData: "",
  };
}

function paymentClientLabel(payment, quote) {
  const name = payment.clientName || quote?.client || "—";
  const code = payment.clientCode || quote?.clientCode || "";
  return code ? `${code} · ${name}` : name;
}

function approvedInvoiceForPayment(payment, quote, owner) {
  const approvedPayment = payment.status === "confirmed" && payment.approval !== "pending";
  const stored = projectInvoiceFor(owner, payment.id)
    || loadFinance().projectInvoices.find((item) => item.paymentId === payment.id)
    || null;
  if (stored?.approval === "approved") return stored;
  if (!approvedPayment) return null;
  if (stored) return { ...stored, approval: "approved" };
  return {
    id: payment.id,
    receiptNo: quote?.number || payment.saleCode || "invoice",
    paymentId: payment.id,
    salesOwner: owner,
    quoteId: payment.quoteId || "",
    quoteNumber: quote?.number || "",
    quoteTotal: quote?.total || payment.amount,
    projectName: quote?.projectName || quote?.address || quote?.client || payment.clientName || "",
    projectDetail: quote?.service || quote?.packageName || payment.type || "",
    clientName: payment.clientName || quote?.client || "",
    company: quote?.client || payment.clientName || "",
    contact: [quote?.email, quote?.phone].filter(Boolean).join(" · ") || quote?.address || quote?.contact || "",
    amount: payment.amount,
    type: payment.type || "",
    method: payment.method || "",
    transactionId: payment.transactionId || "",
    date: payment.date || "",
    approval: "approved",
  };
}

function readReceipt(file) {
  const limit = 1.5 * 1024 * 1024;
  if (!file) return Promise.reject(new Error("Choose a receipt file."));
  const allowed = file.type === "application/pdf" || file.type.startsWith("image/");
  if (!allowed) return Promise.reject(new Error("Upload a PDF or an image."));
  if (file.size > limit) return Promise.reject(new Error("Receipt must be 1.5 MB or smaller."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data: String(reader.result || "") });
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function blankFollowUp(executive, month) {
  return { name: "", email: "", phone: "", address: "", contact: "", executive, date: dateInMonth(month), notes: "", status: "in-progress" };
}

function FollowStatus({ status }) {
  const label = FOLLOW_UP_STATUSES.find((item) => item.id === status)?.label || status;
  const tone = status === "success" ? "completed" : status === "failed" ? "cancelled" : "scheduled";
  return <span className={`project-status ${tone}`}>{label}</span>;
}

function dateInMonth(month) {
  const today = todayISO();
  return today.slice(0, 7) === month ? today : `${month}-01`;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function monthGrid(month) {
  const [year, mon] = String(month || "").split("-").map(Number);
  if (!year || !mon) return { lead: 0, count: 0 };
  const count = new Date(year, mon, 0).getDate();
  const lead = (new Date(year, mon - 1, 1).getDay() + 6) % 7;
  return { lead, count };
}

function monthLabel(month) {
  const [year, mon] = String(month || "").split("-");
  const date = new Date(Date.UTC(Number(year), Number(mon) - 1, 1));
  if (Number.isNaN(date.getTime())) return month;
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function reportingLabel(month, range) {
  if (!(range?.from && range?.to) || !String(range.from).startsWith(month)) return monthLabel(month);
  if (range.from === range.to) return shortDay(range.from);
  return `${Number(range.from.slice(8))}–${shortDay(range.to)}`;
}

function shortDay(iso) {
  const [year, mon, day] = String(iso || "").split("-").map(Number);
  const date = new Date(Date.UTC(year, mon - 1, day));
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function blankPackage() {
  return { category: LEAD_SERVICES[0], name: "", price: "", period: PRICE_BASIS[0], scope: "", cover: "", coverFit: defaultCoverFit() };
}

function projectOption(project) {
  const code = project.code ? `${project.code} · ` : "";
  return project.client ? `${code}${project.name} · ${project.client}` : `${code}${project.name}`;
}

function defaultExecutive(executives, username) {
  if (executives.some((user) => user.username === username)) return username;
  return executives[0]?.username || "";
}

function downloadText(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadPayments(payments, quotes, month) {
  const rows = [
    ["Date", "Client", "Project manager", "Quotation", "Executive", "Amount", "Type", "Receipt", "Status"],
    ...payments.map((payment) => {
      const quote = quotes.find((item) => item.id === payment.quoteId);
      return [payment.date, payment.clientName || quote?.client || "", payment.clientOwner || quote?.owner || "", quote?.number || "", payment.executive, payment.amount, payment.type, payment.receiptName || "", payment.status];
    }),
  ];
  const csv = rows
    .map((row) => row.map((value) => `"${String(value).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  downloadText(`NeonLabz_Sales_${month}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
}
