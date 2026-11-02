import { useEffect, useRef, useState } from "react";
import { todayISO } from "./sales.js";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function useReportPeriod() {
  const [month, setMonthValue] = useState(() => todayISO().slice(0, 7));
  const [range, setRange] = useState({ from: "", to: "" });

  function setMonth(next) {
    setMonthValue(next || todayISO().slice(0, 7));
    setRange({ from: "", to: "" });
  }

  return { month, setMonth, range, setRange };
}

export function MonthField({ month, setMonth, range, setRange }) {
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

function monthGrid(month) {
  const [year, mon] = String(month || "").split("-").map(Number);
  if (!year || !mon) return { lead: 0, count: 0 };
  const count = new Date(year, mon, 0).getDate();
  const lead = (new Date(year, mon - 1, 1).getDay() + 6) % 7;
  return { lead, count };
}

export function monthLabel(month) {
  const [year, mon] = String(month || "").split("-");
  const date = new Date(Date.UTC(Number(year), Number(mon) - 1, 1));
  if (Number.isNaN(date.getTime())) return month;
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export function reportingLabel(month, range) {
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
