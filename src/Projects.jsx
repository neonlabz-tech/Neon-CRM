import { useState } from "react";
import { createPortal } from "react-dom";
import { verifyPassword } from "./crm.js";
import { notifyRole, notifyUser } from "./finance.js";
import { loadClients } from "./clients.js";
import { teamMembersFor } from "./hrms.js";
import { sessionAccount } from "./scope.js";
import { BackButton } from "./BackButton.jsx";
import { applyClientQuote, loadIncomingProjects, loadSales, projectTypeFromQuote, quoteForClientRecord, salesClientByName, salesClientDirectory } from "./sales.js";
import { ReportsWorkspace } from "./Reports.jsx";
import { ProjectPackagesBoard, PromisedPackagePanel } from "./Sales.jsx";
import { publishClients } from "./clientSync.js";
import {
  blankMeeting,
  blankMilestone,
  blankProject,
  applyMilestoneTeam,
  canEditProjectShell,
  canManageDepartment,
  formatDate,
  formatTime,
  loadProjects,
  meetingStatus,
  milestoneDepartment,
  nextCompanyProjectCode,
  normalizeAssignees,
  pastMeetings,
  projectCounts,
  saveProjects,
  upcomingDate,
  upcomingMeetings,
  firstMatch,
} from "./projects.js";

const REPEAT_LABEL = {
  none: "Don't repeat",
  daily: "Everyday",
  monday: "Every Monday",
  tuesday: "Every Tuesday",
  wednesday: "Every Wednesday",
  thursday: "Every Thursday",
  friday: "Every Friday",
};

const TYPE_LABEL = {
  software: "Software project",
  marketing: "Marketing project",
  both: "Both",
};

const STATUS_LABEL = {
  "in-progress": "In progress",
  completed: "Completed",
  "on-hold": "On hold",
  scheduled: "Scheduled",
  conducted: "Conducted",
  cancelled: "Cancelled",
};

const MILESTONE_STATUS = {
  pending: "Pending",
  "in-progress": "In progress",
  "at-risk": "At risk",
  done: "Done",
};

export function ProjectsWorkspace({ access, username, showListTab = true, showQuotations = true, showSalesFeed, own = false }) {
  const canEdit = access === "full";
  const salesFeed = own ? false : (showSalesFeed ?? showListTab);
  const showReports = own || !canEdit;
  const [tab, setTab] = useState("projects");
  const [data, setData] = useState(() => {
    publishClients();
    return loadProjects();
  });

  function commit(next) {
    saveProjects(next);
    setData(next);
  }

  return (
    <div className="stack">
      {canEdit ? null : <p className="banner">Project records are view only from this account.</p>}
      <div className="subnav">
        {showListTab ? <button type="button" className={tab === "projects" ? "active" : ""} onClick={() => setTab("projects")}>Projects</button> : null}
        {showQuotations ? <button type="button" className={tab === "quotations" ? "active" : ""} onClick={() => setTab("quotations")}>Quotations</button> : null}
        <button type="button" className={tab === "sprints" ? "active" : ""} onClick={() => setTab("sprints")}>Sprints</button>
        <button type="button" className={tab === "milestones" ? "active" : ""} onClick={() => setTab("milestones")}>Milestones</button>
        {showReports ? (
          <button type="button" className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}>Reports</button>
        ) : null}
      </div>
      {tab === "projects" ? <ProjectPage data={data} commit={commit} canEdit={canEdit} username={username} own={own} /> : null}
      {salesFeed && tab === "projects" ? <SalesProjects /> : null}
      {showQuotations && tab === "quotations" ? (
        <ProjectPackagesBoard
          projects={data.projects.filter((project) => !project.archived)}
          clients={loadClients()}
          hideAmounts
        />
      ) : null}
      {tab === "sprints" ? <SprintPage data={data} commit={commit} canEdit={canEdit} /> : null}
      {tab === "milestones" ? <MilestonePage data={data} commit={commit} canEdit={canEdit} /> : null}
      {tab === "reports" ? <ReportsWorkspace canEdit={own && canEdit} projects={data.projects} /> : null}
    </div>
  );
}

function SalesProjects() {
  const incoming = loadIncomingProjects();
  return (
    <article className="panel">
      <div className="toolbar">
        <div>
          <h2>From sales</h2>
          <p>Clients whose follow-up was marked Success. Sales sends these projects to the project manager.</p>
        </div>
      </div>
      {incoming.length === 0 ? (
        <p className="empty-copy">No successful follow-ups from sales yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Address</th>
              <th>Sales admin</th>
              <th>Follow-up</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {incoming.map((project) => (
              <tr key={project.id}>
                <td>{project.name}</td>
                <td>{project.email || "—"}</td>
                <td>{project.phone || "—"}</td>
                <td>{project.address || "—"}</td>
                <td>{project.salesOwner}</td>
                <td>{formatDate(project.date)}</td>
                <td>{project.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

function ProjectPage({ data, commit, canEdit, username, own = false }) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [milestones, setMilestones] = useState(null);
  const [archiving, setArchiving] = useState(null);
  const counts = projectCounts(data.projects);
  const rows = data.projects.filter((project) => project.archived === archiveOpen);
  const people = teamMembersFor("pm");
  const salesNames = own
    ? new Set(salesClientDirectory().map((item) => item.name.trim().toLowerCase()))
    : null;
  const clients = loadClients().filter((client) => {
    if (!own || client.source === "own") return true;
    return !salesNames.has(String(client.name || "").trim().toLowerCase());
  });
  const role = sessionAccount()?.role;
  function employeeNames(codes) {
    const list = normalizeAssignees(codes);
    if (!list.length) return "—";
    return list.map((code) => people.find((person) => person.code === code)?.name || code).join(", ");
  }

  function save(project) {
    if (!project.name.trim()) return "Project name is required.";
    const exists = data.projects.some((item) => item.id === project.id);
    const previous = data.projects.find((item) => item.id === project.id);
    if (exists && previous && !canEditProjectShell(role, previous) && previous.type === "marketing") {
      return "Marketing manages this project. You can monitor it without editing.";
    }
    const match = clients.find((item) => item.name.trim().toLowerCase() === (project.client || "").trim().toLowerCase());
    const quoteFields = own
      ? ownClientQuote(match || { name: project.client, code: project.clientCode })
      : applyClientQuote(match || { name: project.client, code: project.clientCode });
    const assignees = project.type === "marketing" ? [] : normalizeAssignees(project.assignees);
    const saved = {
      ...project,
      name: project.name.trim(),
      client: (project.client || "").trim(),
      clientId: match?.id || project.clientId || "",
      clientCode: match?.code || project.clientCode || "",
      email: match?.contactEmail || project.email || "",
      phone: match?.contactPhone || project.phone || "",
      address: match?.address || project.address || "",
      packageName: quoteFields.packageName || project.packageName || "",
      quoteNumber: quoteFields.quoteNumber || project.quoteNumber || "",
      quoteId: quoteFields.quoteId || project.quoteId || "",
      service: quoteFields.service || project.service || "",
      assignees,
      marketingAssignees: previous?.marketingAssignees || project.marketingAssignees || [],
      milestones: (project.milestones || []).map((item) => (
        project.type === "marketing" ? { ...item, department: "marketing" } : { ...item, department: item.department || "software" }
      )),
      code: project.code || nextCompanyProjectCode(),
    };
    const projects = exists ? data.projects.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...data.projects];
    const manager = sessionAccount()?.username || "Your project manager";
    const before = new Set(normalizeAssignees(previous?.assignees));
    assignees.filter((code) => !before.has(code)).forEach((code) => {
      notifyUser(code, `${manager} assigned you to ${saved.name}. Open My projects to see the milestones and add your tasks.`);
    });
    const becameMarketing = saved.type === "marketing" || saved.type === "both";
    const wasMarketing = previous?.type === "marketing" || previous?.type === "both";
    if (!own && becameMarketing && (!exists || !wasMarketing)) {
      notifyRole("marketing", `${manager} created ${TYPE_LABEL[saved.type] || "a project"} “${saved.name}” for ${saved.client || "a client"}. Open Project maintenance.`);
    }
    saveProjects({ ...data, projects });
    const published = publishClients();
    commit({ ...data, projects: published.projects });
    setEditing(null);
    return "";
  }

  function setArchived(project, archived) {
    const projects = data.projects.map((item) => (item.id === project.id ? { ...item, archived } : item));
    saveProjects({ ...data, projects });
    const published = publishClients();
    commit({ ...data, projects: published.projects });
  }

  return (
    <div className="stack">
      <div className="stats four">
        <Stat label="Total projects" value={counts.total} note="In progress + completed" />
        <Stat label="In progress" value={counts.inProgress} />
        <Stat label="Completed" value={counts.completed} />
        <Stat label="On hold" value={counts.onHold} note="Includes archived" />
      </div>
      <div className="toolbar">
        <div>
          {archiveOpen ? <BackButton onClick={() => setArchiveOpen(false)} label="Back" /> : null}
          <p>{archiveOpen ? "Archived projects. Unarchive returns a project to the active list." : "Active projects. Archived work is counted as on hold."}</p>
        </div>
        <div className="modal-actions">
          {canEdit && !archiveOpen ? <button className="ghost" type="button" onClick={() => setAsking(true)}>Archived projects</button> : null}
          {canEdit && !archiveOpen ? <button className="primary" type="button" onClick={() => setEditing(blankProject())}>New project</button> : null}
        </div>
      </div>
      <article className="panel">
        {rows.length === 0 ? (
          <p className="empty-copy">{archiveOpen ? "No archived projects." : "No active projects yet."}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Project ID</th>
                <th>Project</th>
                <th>Type</th>
                <th>Client</th>
                <th>Employees</th>
                <th>Status</th>
                <th>Start</th>
                <th>Due</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((project) => (
                <tr key={project.id}>
                  <td><code>{project.code || "—"}</code></td>
                  <td>{project.name}</td>
                  <td>{TYPE_LABEL[project.type] || "—"}</td>
                  <td>{project.client || "—"}</td>
                  <td>{employeeNames(project.type === "marketing" ? project.marketingAssignees : [...normalizeAssignees(project.assignees), ...normalizeAssignees(project.marketingAssignees)])}</td>
                  <td><span className={`project-status ${project.status}`}>{STATUS_LABEL[project.status]}</span></td>
                  <td>{formatDate(project.startDate)}</td>
                  <td>{formatDate(project.dueDate)}</td>
                  <td>
                    <div className="icon-actions">
                      <IconButton label={`View ${project.name}`} onClick={() => setViewing(project)}><EyeIcon /></IconButton>
                      {canEdit && !archiveOpen && canEditProjectShell(role, project) ? <IconButton label={`Edit ${project.name}`} onClick={() => setEditing(project)}><EditIcon /></IconButton> : null}
                      <IconButton label={`Milestones for ${project.name}`} onClick={() => setMilestones(project)}><FlagIcon /></IconButton>
                      {canEdit && !archiveOpen && canEditProjectShell(role, project) ? <IconButton label={`Archive ${project.name}`} onClick={() => setArchiving(project)}><ArchiveIcon /></IconButton> : null}
                      {canEdit && archiveOpen ? (
                        <button className="ghost" type="button" onClick={() => setArchived(project, false)}>Unarchive</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
      {asking ? (
        <PasswordDialog
          username={username}
          onClose={() => setAsking(false)}
          onVerified={() => {
            setAsking(false);
            setArchiveOpen(true);
          }}
        />
      ) : null}
      {editing ? <ProjectDialog project={editing} clients={clients} own={own} onClose={() => setEditing(null)} onSave={save} /> : null}
      {viewing ? <ProjectRead project={viewing} onClose={() => setViewing(null)} /> : null}
      {milestones ? <MilestoneRead project={milestones} onClose={() => setMilestones(null)} /> : null}
      {archiving ? (
        <Confirm
          title={`Archive ${archiving.name}`}
          text="It leaves the active list and is counted as on hold. You can unarchive it later."
          confirmLabel="Archive"
          onCancel={() => setArchiving(null)}
          onConfirm={() => {
            setArchived(archiving, true);
            setArchiving(null);
          }}
        />
      ) : null}
    </div>
  );
}

function milestoneProgress(project) {
  const milestones = project.milestones || [];
  const done = milestones.filter((item) => item.status === "done").length;
  const total = milestones.length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

function projectInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "PR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function MilestonePage({ data, commit, canEdit }) {
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const active = data.projects.filter((project) => !project.archived);
  const open = active.find((project) => project.id === openId) || null;
  const role = sessionAccount()?.role;
  const people = teamMembersFor("pm").filter((person) => person.status === "Active");
  const canAdd = canEdit && open && canManageDepartment(role, open, "software");

  function employeeNames(codes) {
    const list = normalizeAssignees(codes);
    if (!list.length) return "—";
    return list.map((code) => people.find((person) => person.code === code)?.name || code).join(", ");
  }

  function saveMilestone(milestone) {
    if (!open) return "Choose a project first.";
    if (!canManageDepartment(role, open, "software")) return "Marketing manages this work. You can monitor it.";
    if (milestoneDepartment(milestone, open) === "marketing") return "The marketing admin manages marketing milestones.";
    if (!milestone.title.trim()) return "Milestone name is required.";
    if (!milestone.dueDate) return "Due date is required.";
    if (milestone.startDate && milestone.dueDate && milestone.dueDate < milestone.startDate) return "Due date must be on or after the start date.";
    const assignees = normalizeAssignees(milestone.assignees);
    if (!assignees.length) return "Assign at least one employee to this milestone.";
    const previous = open.milestones.find((item) => item.id === milestone.id);
    const saved = { ...milestone, title: milestone.title.trim(), department: "software", assignees };
    const milestones = open.milestones.some((item) => item.id === saved.id)
      ? open.milestones.map((item) => (item.id === saved.id ? saved : item))
      : [...open.milestones, saved];
    const nextProject = applyMilestoneTeam({ ...open, milestones }, saved);
    commit({
      ...data,
      projects: data.projects.map((project) => (project.id === open.id ? nextProject : project)),
    });
    const before = new Set(normalizeAssignees(previous?.assignees));
    const manager = sessionAccount()?.username || "Project manager";
    assignees.filter((code) => !before.has(code)).forEach((code) => {
      notifyUser(code, `${manager} assigned you to ${saved.title} on ${open.name}. Open My projects to add tasks.`);
    });
    setEditing(null);
    return "";
  }

  function deleteMilestone(milestone) {
    if (!canManageDepartment(role, open, milestoneDepartment(milestone, open))) return;
    commit({
      ...data,
      projects: data.projects.map((project) => (
        project.id === open.id
          ? { ...project, milestones: project.milestones.filter((item) => item.id !== milestone.id) }
          : project
      )),
    });
    setRemoving(null);
  }

  if (open) {
    const monitorOnly = open.type === "marketing";
    return (
      <div className="stack">
        <div className="toolbar">
          <BackButton onClick={() => setOpenId(null)} label="Back" />
          {canAdd ? <button className="primary" type="button" onClick={() => setEditing(blankMilestone("software"))}>Add milestone</button> : null}
        </div>
        {monitorOnly ? <p className="banner">Marketing manages this project. You can monitor milestones without editing them.</p> : null}
        {open.type === "both" ? <p className="banner">You can edit technical milestones. Marketing work is listed for monitoring only.</p> : null}
        <article className="panel">
          <h2>{open.name}</h2>
          <p className="lede">{TYPE_LABEL[open.type] || "Project"} · {STATUS_LABEL[open.status] || "In progress"}</p>
          {open.milestones.length === 0 ? <p className="empty-copy">No milestones yet.</p> : (
            <table>
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>Work</th>
                  <th>Employees</th>
                  <th>Due</th>
                  <th>Status</th>
                  {canEdit ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {open.milestones.map((item) => {
                  const lane = milestoneDepartment(item, open);
                  const editable = canEdit && canManageDepartment(role, open, lane);
                  return (
                    <tr key={item.id}>
                      <td>{item.title}</td>
                      <td>{lane === "marketing" ? "Marketing" : "Technical"}</td>
                      <td>{employeeNames(item.assignees)}</td>
                      <td>{formatDate(item.dueDate)}</td>
                      <td><span className={`project-status milestone-${item.status}`}>{MILESTONE_STATUS[item.status] || "Pending"}</span></td>
                      {canEdit ? (
                        <td>
                          {editable ? (
                            <div className="icon-actions">
                              <IconButton label={`Edit ${item.title}`} onClick={() => setEditing(item)}><EditIcon /></IconButton>
                              <IconButton label={`Delete ${item.title}`} tone="danger" onClick={() => setRemoving(item)}><DeleteIcon /></IconButton>
                            </div>
                          ) : "Monitor only"}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </article>
        {editing ? <MilestoneDialog milestone={editing} projectName={open.name} employees={people} onClose={() => setEditing(null)} onSave={saveMilestone} /> : null}
        {removing ? (
          <Confirm
            title={`Delete ${removing.title}`}
            text="This removes the milestone from the project."
            confirmLabel="Delete"
            onCancel={() => setRemoving(null)}
            onConfirm={() => deleteMilestone(removing)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="stack">
      {active.length === 0 ? <p className="empty-copy">No active projects yet.</p> : active.map((project) => {
        const progress = milestoneProgress(project);
        return (
          <article className="project-board" key={project.id}>
            <div className="project-board-head">
              <span className="project-mark">{projectInitials(project.name)}</span>
              <div>
                <button className="project-open" type="button" onClick={() => setOpenId(project.id)}>{project.name}</button>
                <small>{STATUS_LABEL[project.status] || "In progress"} · {TYPE_LABEL[project.type] || "Project"}</small>
              </div>
              <div className="project-board-progress">
                <strong>Overall progress: {progress.percent}%</strong>
                <span>{progress.done} of {progress.total} milestones achieved</span>
              </div>
            </div>
            <div className="progress-track" aria-hidden="true">
              <span style={{ width: `${progress.percent}%` }} />
            </div>
            <p className="tracker-label">Project phase tracker</p>
            {project.milestones.length === 0 ? <p className="empty-copy">No milestones yet.</p> : (
              <ol className="phase-tracker">
                {project.milestones.map((item, index) => (
                  <li key={item.id} className={`phase-step ${item.status}`}>
                    {index > 0 ? <span className="phase-line" /> : null}
                    <span className="phase-dot">{item.status === "done" ? "✓" : index + 1}</span>
                    <strong>{item.title}</strong>
                    <small>{MILESTONE_STATUS[item.status] || "Pending"}</small>
                  </li>
                ))}
              </ol>
            )}
          </article>
        );
      })}
    </div>
  );
}

function MilestoneDialog({ milestone, projectName, employees = [], onClose, onSave }) {
  const [draft, setDraft] = useState({ ...milestone, assignees: normalizeAssignees(milestone.assignees) });
  const [error, setError] = useState("");

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
      <form className="modal sheet" onSubmit={submit}>
        <h2>{milestone.title ? "Edit milestone" : "Add milestone"}</h2>
        <Field label="Milestone name" value={draft.title} onChange={(value) => setField("title", value)} required />
        <label>
          Associated project
          <input value={projectName} readOnly />
        </label>
        <label>
          Status
          <select value={draft.status} onChange={(event) => setField("status", event.target.value)}>
            <option value="pending">Pending</option>
            <option value="in-progress">In progress</option>
            <option value="at-risk">At risk</option>
            <option value="done">Done</option>
          </select>
        </label>
        <div className="field-grid">
          <Field label="Start date" type="date" value={draft.startDate} onChange={(value) => setField("startDate", value)} />
          <Field label="Due date" type="date" value={draft.dueDate} onChange={(value) => setField("dueDate", value)} required />
        </div>
        <section className="block">
          <h2>Employees</h2>
          {employees.length === 0 ? <p className="empty-copy">No active technical team members yet. The CEO adds them in HRMS.</p> : (
            <div className="assign-list">
              {employees.map((person) => (
                <label key={person.code}>
                  <input
                    type="checkbox"
                    checked={normalizeAssignees(draft.assignees).includes(person.code)}
                    onChange={() => {
                      const current = normalizeAssignees(draft.assignees);
                      const next = current.includes(person.code) ? current.filter((code) => code !== person.code) : [...current, person.code];
                      setField("assignees", next);
                    }}
                  />
                  <span>{person.name} · {person.code}</span>
                </label>
              ))}
            </div>
          )}
        </section>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="primary" type="submit">{milestone.title ? "Save changes" : "Add milestone"}</button>
          <button className="ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function Stat({ label, value, note }) {
  return (
    <article className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : <small>&nbsp;</small>}
    </article>
  );
}

function ownClientQuote(client) {
  const name = String(client?.name || client?.client || "").trim().toLowerCase();
  const code = String(client?.code || client?.clientCode || "").trim().toLowerCase();
  const quote = (loadSales().quotes || []).find((item) => {
    const quoteName = String(item.client || "").trim().toLowerCase();
    const quoteCode = String(item.clientCode || "").trim().toLowerCase();
    return (name && quoteName === name) || (code && quoteCode === code);
  });
  if (!quote) return { quote: null, type: "software", packageName: "", quoteNumber: "", quoteId: "", service: "" };
  return {
    quote,
    type: projectTypeFromQuote(quote),
    packageName: quote.packageName || "",
    quoteNumber: quote.number || "",
    quoteId: quote.id || "",
    service: quote.service || "",
  };
}

function ProjectDialog({ project, clients = [], own = false, onClose, onSave }) {
  const [draft, setDraft] = useState({ ...project, assignees: normalizeAssignees(project.assignees) });
  const [error, setError] = useState("");
  const quoteRecord = { name: draft.client, code: draft.clientCode, client: draft.client, clientCode: draft.clientCode };
  const quote = own ? ownClientQuote(quoteRecord).quote : quoteForClientRecord(quoteRecord);

  function setField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function chooseClient(name) {
    if (!name) {
      setDraft((current) => ({
        ...current,
        client: "",
        clientId: "",
        clientCode: "",
        packageName: "",
        quoteNumber: "",
        quoteId: "",
        service: "",
      }));
      return;
    }
    const chosen = clients.find((item) => item.name === name);
    const details = own ? chosen : (chosen || salesClientByName(name));
    const subject = chosen || { name, code: details?.code || "" };
    const quoteFields = own ? ownClientQuote(subject) : applyClientQuote(subject);
    setDraft((current) => ({
      ...current,
      client: name,
      clientId: chosen?.id || "",
      clientCode: chosen?.code || details?.code || "",
      email: chosen?.contactEmail || details?.email || "",
      phone: chosen?.contactPhone || details?.phone || "",
      address: chosen?.address || details?.address || "",
      type: quoteFields.quote ? quoteFields.type : current.type,
      packageName: quoteFields.packageName,
      quoteNumber: quoteFields.quoteNumber,
      quoteId: quoteFields.quoteId,
      service: quoteFields.service,
    }));
  }

  function submit(event) {
    event.preventDefault();
    const message = onSave({ ...draft, name: draft.name.trim(), milestones: (draft.milestones || []).filter((item) => item.title.trim()) });
    if (message) setError(message);
  }

  return (
    <Modal onClose={onClose}>
      <form className="modal sheet" onSubmit={submit}>
        <h2>{project.name ? "Edit project" : "New project"}</h2>
        {draft.type === "marketing" ? <p className="page-note">After you save, the marketing admin adds milestones and employees. You can monitor the project without editing that work.</p> : null}
        {draft.type === "both" ? <p className="page-note">Add technical milestones on the Milestones tab. Marketing is notified and adds marketing milestones. Neither side can change the other department’s progress.</p> : null}
        <div className="field-grid">
          <label>
            Client
            <select
              value={draft.client || ""}
              onChange={(event) => chooseClient(event.target.value)}
            >
              <option value="">{clients.length ? "Select a client" : (own ? "Add a client under Clients first" : "No approved clients yet")}</option>
              {clients.map((item) => <option key={item.id} value={item.name}>{item.code ? `${item.code} · ` : ""}{item.name}</option>)}
              {draft.client && !clients.some((item) => item.name === draft.client) ? <option value={draft.client}>{draft.client}</option> : null}
            </select>
          </label>
          <label>
            Service type
            <select value={draft.type || "software"} onChange={(event) => setField("type", event.target.value)} required>
              <option value="software">Software project</option>
              <option value="marketing">Marketing project</option>
              <option value="both">Both</option>
            </select>
          </label>
          {draft.client ? <PromisedPackagePanel quote={quote} /> : null}
          <Field label="Project name" value={draft.name} onChange={(value) => setField("name", value)} required />
          <label>
            Status
            <select value={draft.status} onChange={(event) => setField("status", event.target.value)}>
              <option value="in-progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="on-hold">On hold</option>
            </select>
          </label>
          {draft.email || draft.phone || draft.address ? (
            <p className="page-note span-2">Email {draft.email || "—"} · Phone {draft.phone || "—"} · Address {draft.address || "—"}</p>
          ) : null}
          <Field label="Start date" type="date" value={draft.startDate} onChange={(value) => setField("startDate", value)} />
          <Field label="Due date" type="date" value={draft.dueDate} onChange={(value) => setField("dueDate", value)} />
          <Field className="span-2" label="Description" type="area" value={draft.description} onChange={(value) => setField("description", value)} />
        </div>
        {draft.type === "software" ? <p className="page-note">Add milestones and employees on the Milestones tab after you save.</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="primary" type="submit">Save project</button>
          <button className="ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function ProjectRead({ project, onClose }) {
  return (
    <Modal onClose={onClose}>
      <div className="modal">
        <p className="kicker">Project</p>
        <h2>{project.name}</h2>
        <ul>
          <li>Type: {TYPE_LABEL[project.type] || "—"}</li>
          <li>Client: {project.client || "—"}</li>
          <li>Package: {project.packageName || "—"}</li>
          <li>Quotation: {project.quoteNumber || "—"}</li>
          <li>Email: {project.email || "—"}</li>
          <li>Phone: {project.phone || "—"}</li>
          <li>Address: {project.address || "—"}</li>
          <li>Technical team: {normalizeAssignees(project.assignees).join(", ") || "—"}</li>
          <li>Marketing team: {normalizeAssignees(project.marketingAssignees).join(", ") || "—"}</li>
          <li>Status: {STATUS_LABEL[project.status]}</li>
          <li>Start: {formatDate(project.startDate)}</li>
          <li>Due: {formatDate(project.dueDate)}</li>
        </ul>
        <p>{project.description || "No description."}</p>
        <div className="modal-actions">
          <button className="ghost" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

function MilestoneRead({ project, onClose }) {
  return (
    <Modal onClose={onClose}>
      <div className="modal">
        <p className="kicker">Milestones</p>
        <h2>{project.name}</h2>
        {project.milestones.length === 0 ? <p>No milestones yet.</p> : (
          <ul>
            {project.milestones.map((item) => (
              <li key={item.id}>{item.title} · {milestoneDepartment(item, project) === "marketing" ? "Marketing" : "Technical"} · {formatDate(item.dueDate)} · {MILESTONE_STATUS[item.status] || "Pending"}</li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <button className="ghost" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

function SprintPage({ data, commit, canEdit }) {
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const activeProjects = data.projects.filter((project) => !project.archived);

  function projectOf(projectId) {
    return data.projects.find((project) => project.id === projectId);
  }

  function projectName(projectId) {
    return projectOf(projectId)?.name || "Project removed";
  }

  function save(meeting) {
    if (!meeting.projectId || !meeting.startDate || !meeting.link.trim()) return "Choose a project, date, and meeting link.";
    const saved = { ...meeting, startDate: firstMatch(meeting) };
    const exists = data.meetings.some((item) => item.id === saved.id);
    commit({
      ...data,
      meetings: exists ? data.meetings.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...data.meetings],
    });
    setEditing(null);
    return "";
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <p>Each row is a project meeting. Repeating meetings move to the next date after you mark one conducted or cancelled.</p>
        {canEdit ? (
          <button className="primary" type="button" onClick={() => setEditing(blankMeeting())} disabled={activeProjects.length === 0}>
            Schedule meeting
          </button>
        ) : null}
      </div>
      {activeProjects.length === 0 ? <p className="banner">Add an active project before scheduling a meeting.</p> : null}
      <article className="panel">
        {data.meetings.length === 0 ? <p className="empty-copy">No meetings scheduled yet.</p> : (
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Type</th>
                <th>Repeats</th>
                <th>Date</th>
                <th>Time</th>
                <th>Meeting link</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.meetings.map((meeting) => {
                const upcoming = upcomingMeetings(meeting);
                const shown = upcoming.length ? upcoming : [{ date: meeting.startDate, status: meetingStatus(meeting, meeting.startDate) }];
                const status = shown[0].status;
                return (
                  <tr key={meeting.id}>
                    <td>{projectName(meeting.projectId)}</td>
                    <td>{TYPE_LABEL[projectOf(meeting.projectId)?.type] || "—"}</td>
                    <td>{REPEAT_LABEL[meeting.recurrence] || "Don't repeat"}</td>
                    <td>
                      {formatDate(shown[0].date)}
                      {shown.length > 1 ? <small className="next-dates">{shown.slice(1, 4).map((item) => formatDate(item.date)).join(", ")}</small> : null}
                    </td>
                    <td>{formatTime(meeting.time)}</td>
                    <td><a href={withProtocol(meeting.link)} target="_blank" rel="noreferrer">{meeting.link}</a></td>
                    <td><span className={`project-status ${status}`}>{STATUS_LABEL[status]}</span></td>
                    <td>
                      <div className="icon-actions">
                        <IconButton label={`View meetings for ${projectName(meeting.projectId)}`} onClick={() => setViewing(meeting)}><EyeIcon /></IconButton>
                        {canEdit ? <IconButton label={`Edit meeting for ${projectName(meeting.projectId)}`} onClick={() => setEditing(meeting)}><EditIcon /></IconButton> : null}
                        {canEdit ? <IconButton label={`Delete meeting for ${projectName(meeting.projectId)}`} tone="danger" onClick={() => setRemoving(meeting)}><DeleteIcon /></IconButton> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </article>
      {editing ? (
        <MeetingDialog meeting={editing} projects={activeProjects} onClose={() => setEditing(null)} onSave={save} />
      ) : null}
      {viewing ? (
        <MeetingHistory
          meeting={viewing}
          projectName={projectName(viewing.projectId)}
          projectType={TYPE_LABEL[projectOf(viewing.projectId)?.type] || ""}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {removing ? (
        <Confirm
          title="Delete meeting"
          text={`Remove the meeting schedule for ${projectName(removing.projectId)}.`}
          confirmLabel="Delete"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            commit({ ...data, meetings: data.meetings.filter((item) => item.id !== removing.id) });
            setRemoving(null);
          }}
        />
      ) : null}
    </div>
  );
}

function previewDates(draft) {
  const series = { ...draft, startDate: firstMatch(draft), statusByDate: draft.statusByDate || {} };
  const upcoming = upcomingMeetings(series);
  if (upcoming.length) return upcoming.map((item) => item.date);
  return series.startDate ? [series.startDate] : [];
}

function MeetingDialog({ meeting, projects, onClose, onSave }) {
  const [draft, setDraft] = useState(meeting);
  const [error, setError] = useState("");
  const targetDate = meeting.startDate ? upcomingDate(meeting) : "";
  const nextStatus = targetDate ? draft.statusByDate?.[targetDate] || "scheduled" : "scheduled";

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
      <form className="modal sheet" onSubmit={submit}>
        <h2>{meeting.projectId ? "Edit meeting" : "Schedule meeting"}</h2>
        <label>
          Project
          <select value={draft.projectId} onChange={(event) => setField("projectId", event.target.value)} required>
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} · {TYPE_LABEL[project.type] || "Project"}
              </option>
            ))}
          </select>
        </label>
        <Field label="Date" type="date" value={draft.startDate} onChange={(value) => setField("startDate", value)} required />
        <Field label="Time" type="time" value={draft.time} onChange={(value) => setField("time", value)} required />
        <Field label="Meeting link" value={draft.link} onChange={(value) => setField("link", value)} required />
        <label>
          Repeats
          <select value={draft.recurrence} onChange={(event) => setField("recurrence", event.target.value)}>
            <option value="none">Don't repeat</option>
            <option value="daily">Everyday</option>
            <option value="monday">Every Monday</option>
            <option value="tuesday">Every Tuesday</option>
            <option value="wednesday">Every Wednesday</option>
            <option value="thursday">Every Thursday</option>
            <option value="friday">Every Friday</option>
          </select>
        </label>
        {draft.startDate ? <p className="hint">Next meetings: {previewDates(draft).map((date) => formatDate(date)).join(", ")}</p> : null}
        {meeting.projectId && targetDate ? (
          <label>
            Status for {formatDate(targetDate)}
            <select
              value={nextStatus}
              onChange={(event) => setField("statusByDate", { ...draft.statusByDate, [targetDate]: event.target.value })}
            >
              <option value="scheduled">Scheduled</option>
              <option value="conducted">Conducted</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="primary" type="submit">Save meeting</button>
          <button className="ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function MeetingHistory({ meeting, projectName, projectType, onClose }) {
  const upcoming = upcomingMeetings(meeting);
  const past = pastMeetings(meeting);
  return (
    <Modal onClose={onClose}>
      <div className="modal sheet">
        <p className="kicker">Meeting history</p>
        <h2>{projectName}</h2>
        {projectType ? <p>{projectType}</p> : null}
        <p>{formatTime(meeting.time)} · {REPEAT_LABEL[meeting.recurrence] || "Don't repeat"}</p>
        <h3>Upcoming</h3>
        <MeetingLines items={upcoming} time={meeting.time} link={meeting.link} />
        <h3>Past</h3>
        {past.length === 0 ? <p>No past meetings yet.</p> : <MeetingLines items={past} time={meeting.time} link={meeting.link} />}
        <div className="modal-actions">
          <button className="ghost" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

function MeetingLines({ items, time, link }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.date}>
          {formatDate(item.date)} · {formatTime(time)} · {STATUS_LABEL[item.status]} · <a href={withProtocol(link)} target="_blank" rel="noreferrer">{link}</a>
        </li>
      ))}
    </ul>
  );
}

function PasswordDialog({ username, onClose, onVerified }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    const result = await verifyPassword(username, password);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onVerified();
  }

  return (
    <Modal onClose={onClose}>
      <form className="modal" onSubmit={submit}>
        <h2>Archived projects</h2>
        <p className="lede">Enter your password to view archived projects.</p>
        <label>
          Your password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="primary" type="submit">View archive</button>
          <button className="ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function Confirm({ title, text, confirmLabel, onCancel, onConfirm }) {
  return (
    <Modal onClose={onCancel}>
      <form className="modal" onSubmit={(event) => { event.preventDefault(); onConfirm(); }}>
        <h2>{title}</h2>
        <p className="lede">{text}</p>
        <div className="modal-actions">
          <button className={confirmLabel === "Delete" ? "danger-button" : "primary"} type="submit">{confirmLabel}</button>
          <button className="ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, value, onChange, type = "text", className, required = false }) {
  if (type === "area") {
    return (
      <label className={className}>
        {label}
        <textarea value={value} onChange={(event) => onChange(event.target.value)} required={required} />
      </label>
    );
  }
  return (
    <label className={className}>
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </label>
  );
}

function withProtocol(link) {
  if (!link) return "#";
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

function IconButton({ label, onClick, tone, children }) {
  return (
    <button className={tone ? `icon-button ${tone}` : "icon-button"} type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
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

function EyeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>;
}
function EditIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5V20h3.5L19 8.5 15.5 5 4 16.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
}
function DeleteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
}
function FlagIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v16M6 5h11l-2.5 3.5L17 12H6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
}
function ArchiveIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16v11H4zM3 4h18v4H3zM10 12h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
}
