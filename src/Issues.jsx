import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  ISSUE_TYPES,
  blankIssue,
  loadIssues,
  nextIssueCode,
  saveIssues,
} from "./issues.js";
import { teamMembersFor } from "./hrms.js";
import { formatDate, loadProjects, marketingProjects } from "./projects.js";
import { loadTeam } from "./team.js";

const PAGE_SIZE = 8;
const STATUS_LABEL = Object.fromEntries(ISSUE_STATUSES);
const PRIORITY_LABEL = Object.fromEntries(ISSUE_PRIORITIES);
const TYPE_LABEL = Object.fromEntries(ISSUE_TYPES);
const PRIORITY_COLOR = {
  critical: "#e11d48",
  high: "#f59e0b",
  medium: "#873CFF",
  low: "#17803d",
};
const STATUS_COLOR = {
  open: "#873CFF",
  "in-progress": "#0ea5e9",
  resolved: "#17803d",
  closed: "#94a3b8",
};

function today() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function isOverdue(issue) {
  if (!issue.dueDate) return false;
  if (issue.status === "resolved" || issue.status === "closed") return false;
  return issue.dueDate < today();
}

export function MarketingIssuesWorkspace() {
  const projects = useMemo(
    () => marketingProjects().map((project) => ({
      id: `${project.owner}:${project.id}`,
      code: project.code,
      name: project.name,
    })),
    []
  );
  const members = useMemo(
    () => teamMembersFor("marketing").map((person) => ({
      id: person.code,
      name: person.name,
      role: person.role,
      status: person.status === "Active" ? "available" : "inactive",
    })),
    []
  );
  return (
    <IssuesWorkspace
      projects={projects}
      members={members}
      note="Track marketing issues against the projects already in the CRM."
    />
  );
}

export function IssuesWorkspace({ projects: projectSource, members: memberSource, note } = {}) {
  const [issues, setIssues] = useState(loadIssues);
  const [projects] = useState(() => projectSource ?? loadProjects().projects);
  const [members] = useState(() => memberSource ?? loadTeam().members);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [removing, setRemoving] = useState(null);

  const projectName = (id) => projects.find((project) => project.id === id);
  const memberName = (id) => members.find((member) => member.id === id);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return issues.filter((issue) => {
      if (status && issue.status !== status) return false;
      if (priority && issue.priority !== priority) return false;
      if (projectId && issue.projectId !== projectId) return false;
      if (assigneeId && issue.assigneeId !== assigneeId) return false;
      if (!needle) return true;
      const project = projectName(issue.projectId);
      const member = memberName(issue.assigneeId);
      const haystack = [issue.code, issue.title, issue.description, project?.name, project?.code, member?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [issues, query, status, priority, projectId, assigneeId, projects, members]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);
  const counts = {
    total: issues.length,
    open: issues.filter((issue) => issue.status === "open").length,
    progress: issues.filter((issue) => issue.status === "in-progress").length,
    resolved: issues.filter((issue) => issue.status === "resolved").length,
    closed: issues.filter((issue) => issue.status === "closed").length,
    overdue: issues.filter(isOverdue).length,
  };
  const pageIds = rows.map((issue) => issue.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  function commit(next) {
    saveIssues(next);
    setIssues(next);
  }

  function save(draft) {
    const title = draft.title.trim();
    if (!title) return "Issue title is required.";
    const exists = issues.some((issue) => issue.id === draft.id);
    const saved = {
      ...draft,
      title,
      description: draft.description.trim(),
      steps: draft.steps.trim(),
      expected: draft.expected.trim(),
      code: draft.code || nextIssueCode(issues),
      reportedAt: draft.reportedAt || today(),
    };
    commit(exists ? issues.map((issue) => (issue.id === saved.id ? saved : issue)) : [saved, ...issues]);
    setEditing(null);
    return "";
  }

  function remove(ids) {
    commit(issues.filter((issue) => !ids.includes(issue.id)));
    setSelected((current) => current.filter((id) => !ids.includes(id)));
    setRemoving(null);
    if (viewing && ids.includes(viewing.id)) setViewing(null);
  }

  function convert(issue) {
    const next = issues.map((item) => (item.id === issue.id ? { ...item, converted: true } : item));
    commit(next);
    setViewing({ ...issue, converted: true });
  }

  function toggleAll() {
    setSelected((current) => (
      allSelected ? current.filter((id) => !pageIds.includes(id)) : [...new Set([...current, ...pageIds])]
    ));
  }

  function toggleOne(id) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <p>{note || "Track bugs and follow-up items against the projects already in the CRM."}</p>
        <button className="primary" type="button" onClick={() => setEditing(blankIssue())}>New issue</button>
      </div>
      <div className="stats six">
        <Stat label="Total" value={counts.total} note="All issues" />
        <Stat label="Open" value={counts.open} note="Not started" />
        <Stat label="In progress" value={counts.progress} note="Being worked" />
        <Stat label="Resolved" value={counts.resolved} note="Ready to close" />
        <Stat label="Closed" value={counts.closed} note="Finished" />
        <Stat label="Overdue" value={counts.overdue} note="Past the due date" />
      </div>
      <div className="issue-filters">
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setPage(1); }}
          placeholder="Search issues"
          aria-label="Search issues"
        />
        <Filter label="Status" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={ISSUE_STATUSES} />
        <Filter label="Priority" value={priority} onChange={(value) => { setPriority(value); setPage(1); }} options={ISSUE_PRIORITIES} />
        <label>
          Project
          <select value={projectId} onChange={(event) => { setProjectId(event.target.value); setPage(1); }} aria-label="Filter by project">
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.code || "No ID"} · {project.name}</option>
            ))}
          </select>
        </label>
        <label>
          Assignee
          <select value={assigneeId} onChange={(event) => { setAssigneeId(event.target.value); setPage(1); }} aria-label="Filter by assignee">
            <option value="">All assignees</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        </label>
      </div>
      <article className="panel">
        {selected.length > 0 ? (
          <div className="toolbar">
            <p>{selected.length} selected</p>
            <button className="danger-button" type="button" onClick={() => setRemoving(selected)}>Delete selected</button>
          </div>
        ) : null}
        {filtered.length === 0 ? (
          <p className="empty-copy">{issues.length === 0 ? "No issues yet." : "No issues match these filters."}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all issues on this page" />
                </th>
                <th>Issue</th>
                <th>Project</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Assignee</th>
                <th>Reported</th>
                <th>Due</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((issue) => {
                const project = projectName(issue.projectId);
                const member = memberName(issue.assigneeId);
                return (
                  <tr key={issue.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(issue.id)}
                        onChange={() => toggleOne(issue.id)}
                        aria-label={`Select ${issue.code || issue.title}`}
                      />
                    </td>
                    <td>
                      <div className="issue-title">
                        <code>{issue.code}</code>
                        <span>{issue.title}</span>
                      </div>
                    </td>
                    <td>{project ? `${project.code || "No ID"} · ${project.name}` : "—"}</td>
                    <td><span className={`issue-badge status-${issue.status}`}>{STATUS_LABEL[issue.status]}</span></td>
                    <td><span className={`issue-badge priority-${issue.priority}`}>{PRIORITY_LABEL[issue.priority]}</span></td>
                    <td>{member?.name || "Unassigned"}</td>
                    <td>{formatDate(issue.reportedAt)}</td>
                    <td className={isOverdue(issue) ? "issue-overdue" : ""}>{formatDate(issue.dueDate)}</td>
                    <td>
                      <div className="icon-actions">
                        <IconButton label={`View ${issue.title}`} onClick={() => setViewing(issue)}><EyeIcon /></IconButton>
                        <IconButton label={`Edit ${issue.title}`} onClick={() => setEditing(issue)}><EditIcon /></IconButton>
                        <IconButton label={`Delete ${issue.title}`} tone="danger" onClick={() => setRemoving([issue.id])}><DeleteIcon /></IconButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {filtered.length > 0 ? (
          <div className="issue-pager">
            <span>Showing {start + 1}–{start + rows.length} of {filtered.length}</span>
            <div>
              <button className="ghost" type="button" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>Previous</button>
              <span>{safePage} / {pageCount}</span>
              <button className="ghost" type="button" disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)}>Next</button>
            </div>
          </div>
        ) : null}
      </article>
      <div className="issue-charts">
        <PriorityChart issues={issues} />
        <StatusChart issues={issues} />
      </div>
      {editing ? (
        <IssueDialog
          issue={editing}
          projects={projects.filter((project) => !project.archived || project.id === editing.projectId)}
          members={members}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
      {viewing ? (
        <IssueView
          issue={viewing}
          project={projectName(viewing.projectId)}
          member={memberName(viewing.assigneeId)}
          onClose={() => setViewing(null)}
          onEdit={() => { setEditing(viewing); setViewing(null); }}
          onConvert={() => convert(viewing)}
        />
      ) : null}
      {removing ? (
        <ConfirmDelete
          count={removing.length}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove(removing)}
        />
      ) : null}
    </div>
  );
}

function Stat({ label, value, note }) {
  return (
    <article className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function Filter({ label, value, onChange, options }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={`Filter by ${label.toLowerCase()}`}>
        <option value="">All</option>
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}

function PriorityChart({ issues }) {
  const counts = Object.fromEntries(ISSUE_PRIORITIES.map(([id]) => [id, issues.filter((issue) => issue.priority === id).length]));
  const total = issues.length;
  let cursor = 0;
  const stops = ISSUE_PRIORITIES.flatMap(([id]) => {
    if (!counts[id] || !total) return [];
    const next = cursor + (counts[id] / total) * 100;
    const stop = `${PRIORITY_COLOR[id]} ${cursor}% ${next}%`;
    cursor = next;
    return [stop];
  });
  const background = stops.length ? `conic-gradient(${stops.join(", ")})` : "conic-gradient(#F5F6FC 0% 100%)";
  return (
    <article className="panel issue-chart">
      <h2>Issues by priority</h2>
      <div className="donut-row">
        <div className="donut" style={{ background }}>
          <div><strong>{total}</strong><small>issues</small></div>
        </div>
        <ul className="chart-legend">
          {ISSUE_PRIORITIES.map(([id, label]) => (
            <li key={id}>
              <i style={{ background: PRIORITY_COLOR[id] }} />
              {label}
              <span>{counts[id]}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function StatusChart({ issues }) {
  const total = issues.length || 1;
  return (
    <article className="panel issue-chart">
      <h2>Issues by status</h2>
      <div className="issue-bars">
        {ISSUE_STATUSES.map(([id, label]) => {
          const count = issues.filter((issue) => issue.status === id).length;
          return (
            <div key={id}>
              <div>
                <span>{label}</span>
                <span>{count}</span>
              </div>
              <div className="issue-track">
                <span style={{ width: `${(count / total) * 100}%`, background: STATUS_COLOR[id] }} />
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function IssueDialog({ issue, projects, members, onClose, onSave }) {
  const [draft, setDraft] = useState(issue);
  const [error, setError] = useState("");
  const editing = Boolean(issue.code);

  function setField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event) {
    event.preventDefault();
    const message = onSave(draft);
    if (message) setError(message);
  }

  return (
    <Modal onClose={onClose}>
      <form className="modal sheet issue-dialog" onSubmit={submit}>
        <h2>{editing ? "Edit issue" : "Create new issue"}</h2>
        <label>
          Issue title
          <input value={draft.title} onChange={(event) => setField("title", event.target.value)} placeholder="Short summary of the issue" required />
        </label>
        <div className="field-grid">
          <label>
            Project
            <select value={draft.projectId} onChange={(event) => setField("projectId", event.target.value)}>
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.code || "No ID"} · {project.name}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={draft.status} onChange={(event) => setField("status", event.target.value)}>
              {ISSUE_STATUSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label>
            Priority
            <select value={draft.priority} onChange={(event) => setField("priority", event.target.value)}>
              {ISSUE_PRIORITIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label>
            Type
            <select value={draft.type} onChange={(event) => setField("type", event.target.value)}>
              {ISSUE_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label>
            Assignee
            <select value={draft.assigneeId} onChange={(event) => setField("assigneeId", event.target.value)}>
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>{member.name}{member.status === "inactive" ? " · Inactive" : ""}</option>
              ))}
            </select>
          </label>
          <label>
            Due date
            <input type="date" value={draft.dueDate} onChange={(event) => setField("dueDate", event.target.value)} />
          </label>
          <label className="span-2">
            Description
            <textarea value={draft.description} onChange={(event) => setField("description", event.target.value)} />
          </label>
          <label>
            Steps to reproduce
            <textarea value={draft.steps} onChange={(event) => setField("steps", event.target.value)} />
          </label>
          <label>
            Expected result
            <textarea value={draft.expected} onChange={(event) => setField("expected", event.target.value)} />
          </label>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="primary" type="submit">{editing ? "Save changes" : "Create issue"}</button>
          <button className="ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function IssueView({ issue, project, member, onClose, onEdit, onConvert }) {
  return (
    <Modal onClose={onClose}>
      <div className="modal sheet issue-dialog">
        <div className="issue-view-badges">
          <code>{issue.code}</code>
          <span className={`issue-badge priority-${issue.priority}`}>{PRIORITY_LABEL[issue.priority]}</span>
          <span className={`issue-badge status-${issue.status}`}>{STATUS_LABEL[issue.status]}</span>
          <span className="issue-badge">{TYPE_LABEL[issue.type]}</span>
        </div>
        <h2>{issue.title}</h2>
        <p className="lede">
          {project ? `${project.code || "No ID"} · ${project.name}` : "No project"}
          {" · Reported "}{formatDate(issue.reportedAt)}
          {" · Due "}{formatDate(issue.dueDate)}
        </p>
        <div className="issue-assignee">
          <strong>{member?.name || "Unassigned"}</strong>
          <small>{member?.role || "No assignee yet"}</small>
        </div>
        <section>
          <span className="kicker">Description</span>
          <p>{issue.description || "No description yet."}</p>
        </section>
        <div className="field-grid">
          <section className="issue-note">
            <span className="kicker">Steps to reproduce</span>
            <p>{issue.steps || "None recorded."}</p>
          </section>
          <section className="issue-note">
            <span className="kicker">Expected result</span>
            <p>{issue.expected || "None recorded."}</p>
          </section>
        </div>
        <div className="modal-actions">
          <button className="ghost" type="button" onClick={onConvert} disabled={issue.converted}>
            {issue.converted ? "Added to tasks" : "Convert to task"}
          </button>
          <button className="primary" type="button" onClick={onEdit}>Edit issue</button>
          <button className="ghost" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDelete({ count, onCancel, onConfirm }) {
  return (
    <Modal onClose={onCancel}>
      <form className="modal" onSubmit={(event) => { event.preventDefault(); onConfirm(); }}>
        <h2>{count === 1 ? "Delete this issue" : `Delete ${count} issues`}</h2>
        <p className="lede">This removes the issue from the list.</p>
        <div className="modal-actions">
          <button className="danger-button" type="submit">Delete</button>
          <button className="ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ children, onClose }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div onClick={(event) => event.stopPropagation()} role="presentation">{children}</div>
    </div>,
    document.body
  );
}

function IconButton({ label, onClick, tone, children }) {
  return (
    <button className={tone === "danger" ? "icon-button danger" : "icon-button"} type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 16.5V20h3.5L19 8.5 15.5 5 4 16.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
