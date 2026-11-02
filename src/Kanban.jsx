import { BOARD_COLUMNS, boardColumnOf, statusForColumn } from "./tasks.js";

const PRIORITY_LABEL = {
  critical: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function dueChip(iso) {
  if (!iso) return null;
  const due = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(due.getTime())) return { text: iso, overdue: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const text = due.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return { text, overdue: due < today };
}

function initials(name) {
  const parts = String(name || "").split(" ").filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return String(name || "EM").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "EM";
}

function ownerLabel(owner) {
  const name = owner?.name || "";
  const code = owner?.code || "";
  if (name && code) return `${name} - ${code}`;
  return name || code || "";
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4.6v3.6l2.3 1.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2.6 14.7 8.4l6.3.9-4.6 4.5 1.1 6.3L12 17.1 6.5 20.1l1.1-6.3L3 9.3l6.3-.9L12 2.6z" />
    </svg>
  );
}

export function KanbanBoard({
  columns,
  tasks,
  canMove,
  onMove,
  personName,
  milestoneName,
  owner,
}) {
  return (
    <div className="kb-stage">
      {owner ? (
        <div className="kb-owner">
          <span className="kb-av" aria-hidden="true">{initials(owner.name || owner.code)}</span>
          <div>
            <small>Board</small>
            <strong>{ownerLabel(owner)}</strong>
          </div>
        </div>
      ) : null}
      <div className="kb" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(min(240px, 78vw), 1fr))` }}>
        {columns.map((column) => {
          const rows = tasks.filter((task) => boardColumnOf(task) === column.id);
          const finished = column.id === "done" || column.id === "completed";
          return (
            <section
              key={column.id}
              className={`col k-${column.id}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/task-id");
                const task = tasks.find((item) => item.id === id);
                if (!task || !canMove(task, column.id)) return;
                onMove(task, statusForColumn(column.id));
              }}
            >
              <header className="kb-head">
                <span className="kb-mark" aria-hidden="true" />
                <b>{column.label}</b>
                <span className="kb-tools">
                  <span className="kb-count">{rows.length}</span>
                  <span className="kb-ico" aria-hidden="true">···</span>
                </span>
              </header>
              <div className="kb-cards">
                {rows.map((task) => {
                  const locked = task.status === "done" && !canMove(task, "todo");
                  const due = dueChip(task.dueDate);
                  const who = personName?.(task) || owner?.name || owner?.code || "";
                  const tone = PRIORITY_LABEL[task.priority] || "Medium";
                  const movable = columns.some((item) => item.id !== "done" && canMove(task, item.id));
                  return (
                    <article
                      key={task.id}
                      className={`kc pri-${tone.toLowerCase()}${finished ? " finished" : ""}${locked ? " lock" : ""}`}
                      draggable={movable}
                      onDragStart={(event) => event.dataTransfer.setData("text/task-id", task.id)}
                    >
                      {finished ? <span className="kb-star" aria-hidden="true"><StarIcon /></span> : null}
                      <div className="kc-title">
                        {finished ? <span className="kc-check" aria-hidden="true">✓</span> : null}
                        <b>{task.title}</b>
                      </div>
                      {milestoneName ? <small>{milestoneName(task)}</small> : null}
                      <div className="kc-meta">
                        {due ? (
                          <span className={`kb-due${due.overdue && !finished ? " over" : ""}`}>
                            <ClockIcon />
                            {due.text}
                          </span>
                        ) : <span />}
                        {who ? <span className="kb-who" title={who}>{initials(who)}</span> : null}
                      </div>
                      {locked ? null : (
                        <select
                          className="kc-move"
                          aria-label={`Move ${task.title}`}
                          value={column.id}
                          onChange={(event) => {
                            const next = event.target.value;
                            if (!canMove(task, next)) return;
                            onMove(task, statusForColumn(next));
                          }}
                        >
                          {columns.filter((item) => canMove(task, item.id) || item.id === column.id).map((item) => (
                            <option key={item.id} value={item.id}>{item.label}</option>
                          ))}
                        </select>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function BoardLegend({ columns = BOARD_COLUMNS }) {
  return (
    <p className="kb-legend">
      {columns.map((column) => <span key={column.id}><i className={`k-${column.id}`} />{column.label}</span>)}
    </p>
  );
}
