import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { dismissNotice, loadNotices, NOTICES_CHANGED, projectInvoiceById } from "./finance.js";
import { InvoiceDialog } from "./InvoiceView.jsx";
import { openCeoSalesApprovals } from "./sales.js";
import { sessionAccount } from "./scope.js";

export function NotificationBell() {
  const username = sessionAccount()?.username || "";
  const wrap = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(() => loadNotices(username));
  const [requests, setRequests] = useState([]);
  const [viewing, setViewing] = useState(null);
  const ceo = sessionAccount()?.role === "ceo";

  function refresh() {
    setItems(loadNotices(username));
  }

  useEffect(() => {
    refresh();
    function onChange() {
      setItems(loadNotices(username));
    }
    window.addEventListener(NOTICES_CHANGED, onChange);
    window.addEventListener("storage", onChange);
    const timer = setInterval(onChange, 4000);
    return () => {
      window.removeEventListener(NOTICES_CHANGED, onChange);
      window.removeEventListener("storage", onChange);
      clearInterval(timer);
    };
  }, [username]);

  useEffect(() => {
    if (!ceo) {
      setRequests([]);
      return undefined;
    }
    let stop = false;
    async function load() {
      try {
        const data = await api("/api/auth/reset-requests");
        if (!stop) setRequests(Array.isArray(data.requests) ? data.requests : []);
      } catch {
        if (!stop) setRequests([]);
      }
    }
    load();
    const timer = setInterval(load, 5000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [ceo]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointer(event) {
      if (!wrap.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const notices = [
    ...requests.map((request) => ({ ...request, kind: "reset", created: request.createdAt })),
    ...items,
  ];
  const count = notices.length;

  return (
    <div className="bell-wrap notice-bell" ref={wrap}>
      <button
        className="bell-btn"
        type="button"
        aria-label={count ? `${count} notifications` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <BellIcon />
        {count ? <span className="bell-count">{count > 99 ? "99+" : count}</span> : null}
      </button>
      {open ? (
        <div className="bell-panel">
          <div className="bell-title">
            Notifications
            <button className="ghost" type="button" onClick={() => setOpen(false)}>Close</button>
          </div>
          <p className="bell-summary">{count ? `${count} waiting` : "Inbox is empty"}</p>
          {count === 0 ? (
            <p className="empty-copy">No notifications yet.</p>
          ) : notices.map((item) => {
            const invoice = item.invoiceId ? projectInvoiceById(item.invoiceId) : null;
            return (
              <div className="bell-notice" key={item.id}>
                <p>{item.text}</p>
                <small>{formatNoticeTime(item.created)}</small>
                <div className="icon-actions">
                {sessionAccount()?.role === "ceo" && ((invoice && invoice.approval !== "approved") || item.invoiceId) ? (
                  <button
                    className="primary"
                    type="button"
                    onClick={() => {
                      openCeoSalesApprovals({ paymentId: invoice?.paymentId || "", owner: invoice?.salesOwner || "" });
                      setOpen(false);
                    }}
                  >
                    Review in Sales
                  </button>
                ) : null}
                  {invoice?.approval === "approved" ? (
                    <button
                      className="primary"
                      type="button"
                      onClick={() => {
                        setViewing(invoice);
                        setOpen(false);
                      }}
                    >
                      View invoice
                    </button>
                  ) : null}
                  {item.kind === "reset" ? null : (
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => {
                        dismissNotice(item.id);
                        refresh();
                      }}
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      <InvoiceDialog invoice={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function formatNoticeTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 21h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
