import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LEAD_SOURCES, LEAD_STAGES, leadPhoneConflictMessage, salesStaffName, todayISO } from "./sales.js";
import { monthLabel } from "./ReportPeriod.jsx";
import { formatPhone } from "./hrms.js";

const PAGE_SIZE = 10;

function pageList(pages, current) {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const numbers = [1, pages, current - 1, current, current + 1].filter((item, index, list) => item >= 1 && item <= pages && list.indexOf(item) === index);
  numbers.sort((a, b) => a - b);
  const items = [];
  numbers.forEach((item, index) => {
    if (index && item - numbers[index - 1] > 1) items.push("…");
    items.push(item);
  });
  return items;
}

function leadNumber(id) {
  const match = /^LEAD-(\d+)$/i.exec(String(id || ""));
  return match ? Number(match[1]) : 0;
}

function formatAddedDate(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatAddedTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Colombo",
  }).format(date).toLowerCase();
}

function statusTone(status) {
  if (status === "Converted") return "completed";
  if (status === "Lost") return "cancelled";
  if (status === "Follow-up" || status === "Quotation Sent" || status === "Payment Promised") return "scheduled";
  return "in-progress";
}

function lastOutcome(lead) {
  const calls = lead.calls || [];
  return calls.length ? calls[calls.length - 1].outcome || "—" : "—";
}

function latestActivity(lead) {
  let best = String(lead.latestFollowUpAt || "");
  (lead.calls || []).forEach((call) => {
    const stamp = call.updatedAt || call.createdAt || "";
    if (stamp > best) best = stamp;
  });
  return best;
}

function addedDay(lead) {
  return String(latestActivity(lead) || lead.createdAt || lead.date || "").slice(0, 10);
}

function shiftDate(iso, days) {
  const [year, month, day] = String(iso || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${nextMonth}-${nextDay}`;
}

function followUpTone(lead, today) {
  if (!lead.next || lead.status === "Converted") return "";
  if (lead.next < today) return "follow-overdue";
  if (lead.next <= shiftDate(today, 3)) return "follow-soon";
  return "";
}

function monthGrid(month) {
  const [year, mon] = String(month || "").split("-").map(Number);
  if (!year || !mon) return { lead: 0, count: 0 };
  const count = new Date(year, mon, 0).getDate();
  const lead = (new Date(year, mon - 1, 1).getDay() + 6) % 7;
  return { lead, count };
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function filterMonth(filter) {
  if (filter.kind === "month") return filter.month;
  if (filter.kind === "day") return filter.day.slice(0, 7);
  if (filter.kind === "range") return filter.from.slice(0, 7);
  return "";
}

function dateFilterLabel(filter) {
  if (filter.kind === "month") return monthLabel(filter.month);
  if (filter.kind === "day") return formatAddedDate(filter.day);
  if (filter.kind === "range") return `${formatAddedDate(filter.from)} – ${formatAddedDate(filter.to)}`;
  return "All dates";
}

function leadMatchesDate(lead, filter) {
  if (!filter || filter.kind === "all") return true;
  const day = addedDay(lead);
  if (!day) return false;
  if (filter.kind === "month") return day.startsWith(filter.month);
  if (filter.kind === "day") return day === filter.day;
  if (filter.kind === "range") return day >= filter.from && day <= filter.to;
  return true;
}

function LeadDateFilter({ value, onChange }) {
  const root = useRef(null);
  const today = todayISO();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("months");
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => today.slice(0, 7));
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const chosenMonth = filterMonth(value);

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
    const month = chosenMonth || today.slice(0, 7);
    setYear(Number(month.slice(0, 4)));
    setViewMonth(month);
    setView("months");
    setDraftFrom(value.kind === "day" ? value.day : value.kind === "range" ? value.from : "");
    setDraftTo(value.kind === "range" ? value.to : "");
    setOpen(true);
  }

  function pickMonth(month) {
    if (chosenMonth === month) {
      setViewMonth(month);
      if (value.kind === "day" && value.day.startsWith(month)) {
        setDraftFrom(value.day);
        setDraftTo("");
      } else if (value.kind === "range" && value.from.startsWith(month)) {
        setDraftFrom(value.from);
        setDraftTo(value.to);
      } else {
        setDraftFrom("");
        setDraftTo("");
      }
      setView("days");
      return;
    }
    onChange({ kind: "month", month });
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
    if (iso === draftFrom) {
      setDraftTo("");
      return;
    }
    setDraftTo(iso);
  }

  function applyDates() {
    if (!draftFrom) return;
    onChange(!draftTo || draftTo === draftFrom ? { kind: "day", day: draftFrom } : { kind: "range", from: draftFrom, to: draftTo });
    setOpen(false);
  }

  function useWholeMonth() {
    onChange({ kind: "month", month: viewMonth });
    setOpen(false);
  }

  function clearDates() {
    onChange({ kind: "all" });
    setDraftFrom("");
    setDraftTo("");
    setOpen(false);
  }

  const days = monthGrid(viewMonth);

  return (
    <div className="report-period register-date" ref={root}>
      <button type="button" className="report-period-trigger" aria-haspopup="dialog" aria-expanded={open} aria-label="Date" onClick={toggle}>
        <span>{dateFilterLabel(value)}</span>
        <CalendarIcon />
      </button>
      {open ? (
        <div className="report-calendar" role="dialog" aria-label="Lead dates">
          {view === "months" ? (
            <>
              <div className="report-calendar-head">
                <button type="button" className="report-calendar-nav" onClick={() => setYear((item) => item - 1)} aria-label="Previous year">‹</button>
                <strong>{year}</strong>
                <button type="button" className="report-calendar-nav" onClick={() => setYear((item) => item + 1)} aria-label="Next year">›</button>
              </div>
              <div className="report-months">
                {MONTH_NAMES.map((name, index) => {
                  const month = `${year}-${String(index + 1).padStart(2, "0")}`;
                  return (
                    <button key={month} type="button" className={month === chosenMonth ? "selected" : ""} aria-pressed={month === chosenMonth} onClick={() => pickMonth(month)}>
                      {name}
                    </button>
                  );
                })}
              </div>
              <p className="report-calendar-note">Select a month. Select that month again to choose one date or a period.</p>
              <div className="report-calendar-actions">
                <button type="button" className="ghost" onClick={clearDates}>All dates</button>
              </div>
            </>
          ) : (
            <>
              <div className="report-calendar-head">
                <button type="button" className="report-calendar-nav" onClick={() => setView("months")} aria-label="Back to months">‹</button>
                <strong>{monthLabel(viewMonth)}</strong>
                <span />
              </div>
              <div className="report-days">
                {WEEKDAYS.map((name) => <span key={name}>{name}</span>)}
                {Array.from({ length: days.lead }, (_, index) => <span key={`pad-${index}`} />)}
                {Array.from({ length: days.count }, (_, index) => {
                  const iso = `${viewMonth}-${String(index + 1).padStart(2, "0")}`;
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
                {draftFrom && !draftTo ? "Select an end date for a period, or apply this date." : "Select one date, or a start and end date."}
              </p>
              <div className="report-calendar-actions">
                <button type="button" className="ghost" onClick={clearDates}>All dates</button>
                <button type="button" className="ghost" onClick={useWholeMonth}>Whole month</button>
                <button type="button" className="primary" onClick={applyDates} disabled={!draftFrom}>Apply</button>
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
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function LeadPhoneField({ value, exceptId = "", onChange, required = true }) {
  const message = leadPhoneConflictMessage(value, exceptId);
  return (
    <label className={message ? "field-invalid" : ""}>
      Phone
      <input
        type="tel"
        inputMode="numeric"
        className={message ? "input-invalid" : ""}
        value={value}
        onChange={(event) => onChange(formatPhone(event.target.value))}
        placeholder="077-123-4567"
        maxLength={12}
        required={required}
        aria-invalid={message ? "true" : undefined}
      />
      {message ? <span className="field-error">{message}</span> : null}
    </label>
  );
}

export function LeadRegister({
  leads,
  canEdit = false,
  canRevise = false,
  canDelete = false,
  showPerson = true,
  staff = [],
  onOpen,
  onDelete,
  onAdd,
  extraActions = null,
}) {
  const today = todayISO();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [dateFilter, setDateFilter] = useState({ kind: "all" });
  const [person, setPerson] = useState("");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [picked, setPicked] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const tableWrap = useRef(null);
  const pageHeight = useRef(0);

  const rows = useMemo(() => {
    return [...(leads || [])]
      .filter((lead) => {
        const hay = `${lead.id} ${lead.business} ${lead.phone} ${lead.source} ${lead.owner || ""}`.toLowerCase();
        if (query && !hay.includes(query.toLowerCase())) return false;
        if (status && lead.status !== status) return false;
        if (source && lead.source !== source) return false;
        if (person && (lead.owner || lead.executive) !== person) return false;
        if (!leadMatchesDate(lead, dateFilter)) return false;
        return true;
      })
      .sort((a, b) => leadNumber(a.id) - leadNumber(b.id) || String(a.id || "").localeCompare(String(b.id || "")));
  }, [leads, query, status, source, person, dateFilter]);

  const pageSize = showAll ? Math.max(rows.length, 1) : PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const start = rows.length === 0 ? 0 : (current - 1) * pageSize;
  const visible = rows.slice(start, start + pageSize);

  useLayoutEffect(() => {
    if (showAll || !tableWrap.current) return;
    const node = tableWrap.current;
    if (visible.length === PAGE_SIZE || rows.length <= PAGE_SIZE) {
      pageHeight.current = node.offsetHeight;
      return;
    }
    if (!pageHeight.current && visible.length > 0) {
      const head = node.querySelector("thead")?.offsetHeight || 0;
      const row = node.querySelector("tbody tr")?.offsetHeight || 0;
      if (row) pageHeight.current = head + row * PAGE_SIZE;
    }
  }, [showAll, visible, rows.length]);
  const selected = rows.filter((lead) => picked[`${lead.owner || ""}:${lead.id}`]);
  const visibleKeys = visible.map((lead) => `${lead.owner || ""}:${lead.id}`);
  const allVisiblePicked = visibleKeys.length > 0 && visibleKeys.every((key) => picked[key]);

  function resetPage(setter) {
    return (event) => {
      setter(event.target.value);
      setPage(1);
    };
  }

  function toggle(lead) {
    const key = `${lead.owner || ""}:${lead.id}`;
    setPicked((currentPick) => {
      const next = { ...currentPick };
      if (next[key]) delete next[key];
      else next[key] = lead;
      return next;
    });
  }

  function toggleVisible() {
    setPicked((currentPick) => {
      const next = { ...currentPick };
      if (allVisiblePicked) visible.forEach((lead) => delete next[`${lead.owner || ""}:${lead.id}`]);
      else visible.forEach((lead) => { next[`${lead.owner || ""}:${lead.id}`] = lead; });
      return next;
    });
  }

  function removeSelected() {
    const message = onDelete?.(selected) || "";
    setNotice(message);
    setPicked({});
    setConfirming(false);
  }

  return (
    <div className="stack">
      <div className="toolbar register-toolbar">
        <input value={query} onChange={resetPage(setQuery)} placeholder="Search by lead ID, name or phone" />
        <select value={status} onChange={resetPage(setStatus)} aria-label="Status">
          <option value="">All Status</option>
          {LEAD_STAGES.map((item) => <option key={item}>{item}</option>)}
        </select>
        <select value={source} onChange={resetPage(setSource)} aria-label="Source">
          <option value="">All Sources</option>
          {LEAD_SOURCES.map((item) => <option key={item}>{item}</option>)}
        </select>
        <LeadDateFilter value={dateFilter} onChange={(next) => { setDateFilter(next); setPage(1); }} />
        {showPerson ? (
          <select value={person} onChange={resetPage(setPerson)} aria-label="User">
            <option value="">All Users</option>
            <option value="unassigned">Not assigned</option>
            {staff.map((user) => <option key={user.username} value={user.username}>{salesStaffName(user.username)}</option>)}
          </select>
        ) : null}
        <div className="lead-header-actions">
          {extraActions}
          {canEdit && onAdd ? <button className="primary" type="button" onClick={onAdd}>+ Add Lead</button> : null}
        </div>
      </div>
      {notice ? <p className="form-error">{notice}</p> : null}
      {canDelete && selected.length ? (
        <div className="register-selection">
          <span>{selected.length} selected</span>
          {confirming ? (
            <>
              <span>Delete the selected leads?</span>
              <button className="danger-button" type="button" onClick={removeSelected}>Delete</button>
              <button className="ghost" type="button" onClick={() => setConfirming(false)}>Cancel</button>
            </>
          ) : (
            <button className="danger-button" type="button" onClick={() => setConfirming(true)}>Delete selected</button>
          )}
        </div>
      ) : null}
      {rows.length === 0 ? <p className="empty-copy">No leads match the selected filters.</p> : (
        <div
          ref={tableWrap}
          className={showAll ? "tablewrap register-scroll" : "tablewrap"}
          style={showAll && pageHeight.current ? { height: pageHeight.current, maxHeight: pageHeight.current } : undefined}
        >
          <table className="lead-register">
            <thead>
              <tr>
                {canDelete ? (
                  <th className="check-cell">
                    <input type="checkbox" checked={allVisiblePicked} onChange={toggleVisible} aria-label="Select all leads on this page" />
                  </th>
                ) : null}
                <th>#</th>
                <th>Lead ID</th>
                <th>Phone / Customer</th>
                <th>Latest follow-up</th>
                <th>Source</th>
                <th>Status</th>
                <th>Call status</th>
                <th>Next follow-up</th>
                <th>Follow-ups</th>
                {showPerson ? <th>Person</th> : null}
                {canRevise || canDelete || onOpen ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((lead, index) => {
                const followTone = followUpTone(lead, today);
                const activityAt = latestActivity(lead);
                const shownAt = activityAt || lead.createdAt || lead.date;
                const key = `${lead.owner || ""}:${lead.id}`;
                return (
                  <tr key={key}>
                    {canDelete ? (
                      <td className="check-cell">
                        <input type="checkbox" checked={Boolean(picked[key])} onChange={() => toggle(lead)} aria-label={`Select ${lead.id}`} />
                      </td>
                    ) : null}
                    <td>{start + index + 1}</td>
                    <td>
                      <button className="link-btn" type="button" onClick={() => onOpen?.(lead)}>{lead.id}</button>
                      {lead.clientCode ? <div className="muted">{lead.clientCode}</div> : null}
                    </td>
                    <td>
                      <strong className="register-phone">{lead.phone || "—"}</strong>
                      <div className="muted">{lead.business || "—"}</div>
                    </td>
                    <td>
                      <div>{formatAddedDate(shownAt) || "—"}</div>
                      {activityAt || lead.createdAt ? <div className="muted">{formatAddedTime(activityAt || lead.createdAt)}</div> : null}
                    </td>
                    <td>{lead.source || "—"}</td>
                    <td><span className={`project-status ${statusTone(lead.status)}`}>{lead.status || "—"}</span></td>
                    <td>{lastOutcome(lead)}</td>
                    <td className={followTone}>{lead.next ? formatAddedDate(lead.next) : "—"}</td>
                    <td><b>{(lead.calls || []).length}</b></td>
                    {showPerson ? <td>{salesStaffName(lead.owner || lead.executive)}</td> : null}
                    {canRevise || canDelete || onOpen ? (
                      <td>
                        <div className="icon-actions">
                          {canRevise ? (
                            <button className="icon-button" type="button" aria-label={`Edit ${lead.business || lead.id}`} title="Edit" onClick={() => onOpen?.(lead)}>
                              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5V20h3.5L19 8.5 15.5 5 4 16.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M13.5 7 17 10.5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
                            </button>
                          ) : onOpen ? (
                            <button className="icon-button" type="button" aria-label={`View ${lead.business || lead.id}`} title="View" onClick={() => onOpen(lead)}>
                              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button className="icon-button danger" type="button" aria-label={`Delete ${lead.business || lead.id}`} title="Delete" onClick={() => { setPicked({ [key]: lead }); setConfirming(true); }}>
                              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="register-footer">
        <span>Showing {rows.length === 0 ? 0 : start + 1} to {start + visible.length} of {rows.length} leads</span>
        <div className="register-pages">
          {pageList(pages, current).map((item, index) => (
            item === "…" ? <span key={`gap-${index}`}>…</span> : (
              <button key={item} type="button" className={!showAll && current === item ? "active" : ""} onClick={() => { setShowAll(false); setPage(item); }}>{item}</button>
            )
          ))}
          <button type="button" className={showAll ? "active" : ""} onClick={() => { setShowAll(true); setPage(1); }}>All</button>
        </div>
      </div>
    </div>
  );
}
