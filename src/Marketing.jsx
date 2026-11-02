import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BackButton } from "./BackButton.jsx";
import { LetterheadDialog } from "./Letterhead.jsx";
import {
  blankClient,
  blankMonth,
  blankPlan,
  blankPost,
  blankReport,
  downloadInfoDoc,
  downloadPlan,
  downloadReport,
  formatDate,
  formatTime,
  infoDocFileName,
  infoDocHtml,
  loadCompanyMarketing,
  loadMarketing,
  normalizeReport,
  periodLabel,
  planFileName,
  planHtml,
  platformHasData,
  REPORT_PLATFORMS,
  reportFileName,
  reportHtml,
  reportPlatformsLabel,
  saveMarketing,
  weekday,
} from "./marketing.js";
import { isVisibleToMarketing, marketingFieldsFromPm, marketingServiceClients, publishClients, pushMarketingToPm } from "./clientSync.js";
import { notifyUser } from "./finance.js";
import { teamMembersFor } from "./hrms.js";
import { KanbanBoard } from "./Kanban.jsx";
import { claimProjectCode } from "./registry.js";
import { assignMarketingTeam, blankMilestone, canonicalProjectCode, canManageDepartment, companyProjectCodes, deleteMarketingMilestone, marketingProjects, milestoneDepartment, milestoneTasksComplete, normalizeAssignees, projectCodeTaken, removeMarketingProjectFromDoc, saveMarketingMilestone, saveMarketingProjectDates, suggestCompanyProjectCode, syncOwnerProjectProgress, todayIso, upsertMarketingProjectFromDoc } from "./projects.js";
import { ProjectPackagesBoard } from "./Sales.jsx";
import { BOARD_COLUMNS, TASK_PRIORITIES, TASK_STATUSES, blankTask, cleanHtml, employeeLaneStatus, managerBoardColumns, nextTaskCode, saveOwnerTasks, stampTaskStatus, tasksForOwner } from "./tasks.js";
import { sessionAccount } from "./scope.js";

const TABS = [
  ["projects", "Projects"],
  ["info", "Info Doc"],
  ["plan", "Content Plan"],
  ["reports", "Reports"],
];

const TASK_STATUS = {
  "not-started": "Not yet started",
  "in-progress": "In progress",
  completed: "Completed",
  done: "Done",
};

export function MarketingWorkspace({ access }) {
  const canEdit = access === "full";
  const companyView = sessionAccount()?.role === "pm" && !canEdit;
  const tabs = canEdit ? TABS.filter(([id]) => id !== "projects") : TABS;
  const [tab, setTab] = useState(canEdit || companyView ? "info" : "projects");
  const [data, setData] = useState(() => {
    publishClients();
    return companyView ? loadCompanyMarketing() : loadMarketing();
  });

  function commit(next) {
    saveMarketing(next);
    setData(next);
  }

  return (
    <div className="stack">
      {canEdit ? null : (
        <p className="banner">
          {companyView
            ? "View only. Info documents, content plans, and reports recorded by marketing admins."
            : "This marketing workspace is view only. Monitor marketing projects, milestones, and task progress here."}
        </p>
      )}
      <div className="subnav" role="tablist">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "projects" && !canEdit ? <MarketingProjectMonitor /> : null}
      {tab === "info" ? <InfoDocs data={data} commit={commit} canEdit={canEdit} /> : null}
      {tab === "plan" ? <ContentPlans data={data} commit={commit} canEdit={canEdit} /> : null}
      {tab === "reports" ? <Reports data={data} commit={commit} canEdit={canEdit} /> : null}
    </div>
  );
}

const PROJECT_TYPE = {
  marketing: "Marketing",
  both: "Both",
  software: "Software",
};

const PROJECT_STATUS = {
  "in-progress": "In progress",
  completed: "Completed",
  "on-hold": "On hold",
};

const MILESTONE_STATUS = {
  pending: "Pending",
  "in-progress": "In progress",
  "at-risk": "At risk",
  done: "Done",
};

function marketingPeople() {
  return teamMembersFor("marketing");
}

function monitorPeople() {
  const seen = new Set();
  return [...teamMembersFor("marketing"), ...teamMembersFor("pm")].filter((person) => {
    if (!person.code || seen.has(person.code)) return false;
    seen.add(person.code);
    return true;
  });
}

function personName(people, code) {
  return people.find((person) => person.code === code)?.name || code;
}

function tasksForProjects(projects) {
  const cache = new Map();
  const rows = [];
  for (const project of projects) {
    if (!cache.has(project.owner)) cache.set(project.owner, tasksForOwner(project.owner));
    for (const task of cache.get(project.owner) || []) {
      if (task.projectId === project.id) rows.push(task);
    }
  }
  return rows;
}

function taskStatusLabel(status) {
  return TASK_STATUS[status] || "Not yet started";
}

function MarketingProjectMonitor() {
  const projects = useMemo(() => {
    publishClients();
    return marketingProjects();
  }, []);
  const people = useMemo(() => monitorPeople(), []);
  const tasks = useMemo(() => tasksForProjects(projects), [projects]);
  const [openKey, setOpenKey] = useState("");
  const [openMilestoneId, setOpenMilestoneId] = useState("");
  const project = projects.find((item) => `${item.owner}:${item.id}` === openKey) || null;
  const milestone = (project?.milestones || []).find((item) => item.id === openMilestoneId) || null;
  const projectTasks = project ? tasks.filter((task) => task.projectId === project.id) : [];
  const milestoneTasks = milestone ? projectTasks.filter((task) => task.milestoneId === milestone.id) : [];

  if (project && milestone) {
    const codes = normalizeAssignees(milestone.assignees);
    const done = milestoneTasks.filter((task) => task.status === "done").length;
    const complete = milestoneTasksComplete(milestone, milestoneTasks);
    const lane = milestoneDepartment(milestone, project);
    return (
      <div className="stack">
        <div className="section-head">
          <BackButton onClick={() => setOpenMilestoneId("")} label="Milestones" />
          <div>
            <p className="kicker">{project.code || "Project"} · {project.name} · {lane === "software" ? "Technical" : "Marketing"}</p>
            <h2>{milestone.title}</h2>
          </div>
        </div>
        <article className="panel">
          <ul className="client-facts">
            <li><span>Due</span><strong className={milestone.dueDate && milestone.dueDate < todayIso() && !complete ? "issue-overdue" : undefined}>{formatDate(milestone.dueDate)}</strong></li>
            <li><span>Status</span><strong>{complete || milestone.status === "done" ? "Completed" : (MILESTONE_STATUS[milestone.status] || "Pending")}</strong></li>
            <li><span>Assigned</span><strong>{codes.length ? codes.map((code) => personName(people, code)).join(", ") : "—"}</strong></li>
            <li><span>Tasks</span><strong>{milestoneTasks.length === 0 ? "No tasks" : `${done} of ${milestoneTasks.length} done`}</strong></li>
          </ul>
        </article>
        <article className="panel">
          <div className="toolbar">
            <div>
              <h2>Tasks</h2>
              <p>Assignment and progress on this milestone. Marketing updates the board.</p>
            </div>
          </div>
          {milestoneTasks.length === 0 ? <p className="empty-copy">No tasks on this milestone yet.</p> : (
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Assigned to</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {milestoneTasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.title}</td>
                    <td>{task.assigneeCode ? personName(people, task.assigneeCode) : "Unassigned"}</td>
                    <td>{task.priority || "—"}</td>
                    <td>{taskStatusLabel(task.status)}</td>
                    <td className={task.dueDate && task.dueDate < todayIso() && task.status !== "done" && task.status !== "completed" ? "issue-overdue" : undefined}>{formatDate(task.dueDate) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      </div>
    );
  }

  if (project) {
    const team = [...normalizeAssignees(project.marketingAssignees), ...normalizeAssignees(project.assignees)];
    const done = projectTasks.filter((task) => task.status === "done").length;
    return (
      <div className="stack">
        <div className="section-head">
          <BackButton onClick={() => setOpenKey("")} label="All projects" />
          <div>
            <p className="kicker">{project.code || "Project"} · {PROJECT_TYPE[project.type] || "Project"}</p>
            <h2>{project.name}</h2>
          </div>
        </div>
        <article className="panel">
          <ul className="client-facts">
            <li><span>Client</span><strong>{project.client || "—"}</strong></li>
            <li><span>Status</span><strong>{PROJECT_STATUS[project.status] || "In progress"}</strong></li>
            <li><span>Start</span><strong>{formatDate(project.startDate)}</strong></li>
            <li><span>Due</span><strong className={isProjectOverdue(project) ? "issue-overdue" : undefined}>{formatDate(project.dueDate)}</strong></li>
            <li><span>Team</span><strong>{team.length ? team.map((code) => personName(people, code)).join(", ") : "—"}</strong></li>
            <li><span>Tasks</span><strong>{projectTasks.length === 0 ? "No tasks" : `${done} of ${projectTasks.length} done`}</strong></li>
          </ul>
        </article>
        <article className="panel">
          <div className="toolbar">
            <div>
              <h2>Milestones</h2>
              <p>Open a milestone to see assigned employees and task progress.</p>
            </div>
          </div>
          {project.milestones.length === 0 ? <p className="empty-copy">No milestones yet.</p> : (
            <table>
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>Work</th>
                  <th>Assigned to</th>
                  <th>Due</th>
                  <th>Tasks</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {project.milestones.map((item) => {
                  const codes = normalizeAssignees(item.assignees);
                  const rows = projectTasks.filter((task) => task.milestoneId === item.id);
                  const finished = rows.filter((task) => task.status === "done").length;
                  const complete = milestoneTasksComplete(item, rows);
                  const lane = milestoneDepartment(item, project);
                  return (
                    <tr key={item.id}>
                      <td>
                        <button className="text-button" type="button" onClick={() => setOpenMilestoneId(item.id)}>{item.title}</button>
                      </td>
                      <td>{lane === "software" ? "Technical" : "Marketing"}</td>
                      <td>{codes.length ? codes.map((code) => personName(people, code)).join(", ") : "—"}</td>
                      <td className={item.dueDate && item.dueDate < todayIso() && !complete ? "issue-overdue" : undefined}>{formatDate(item.dueDate) || "—"}</td>
                      <td>{rows.length === 0 ? "No tasks" : `${finished} of ${rows.length} done`}</td>
                      <td>
                        <span className={`project-status milestone-${complete ? "done" : item.status}`}>
                          {complete || item.status === "done" ? "Completed" : (MILESTONE_STATUS[item.status] || "Pending")}
                        </span>
                      </td>
                      <td><button className="ghost" type="button" onClick={() => setOpenMilestoneId(item.id)}>Open</button></td>
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

  return (
    <article className="panel">
      <div className="toolbar">
        <div>
          <h2>Marketing projects</h2>
          <p>Projects created by the marketing admin, including milestones, assignments, due dates, and task progress.</p>
        </div>
      </div>
      {projects.length === 0 ? (
        <p className="empty-copy">No marketing projects yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Project ID</th>
              <th>Project</th>
              <th>Client</th>
              <th>Status</th>
              <th>Due</th>
              <th>Team</th>
              <th>Milestones</th>
              <th>Tasks</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((item) => {
              const rows = tasks.filter((task) => task.projectId === item.id);
              const done = rows.filter((task) => task.status === "done").length;
              const team = [...normalizeAssignees(item.marketingAssignees), ...normalizeAssignees(item.assignees)];
              return (
                <tr key={`${item.owner}:${item.id}`}>
                  <td><code>{item.code || "—"}</code></td>
                  <td>
                    <button className="text-button" type="button" onClick={() => { setOpenKey(`${item.owner}:${item.id}`); setOpenMilestoneId(""); }}>{item.name}</button>
                  </td>
                  <td>{item.client || "—"}</td>
                  <td>{PROJECT_STATUS[item.status] || item.status || "—"}</td>
                  <td className={isProjectOverdue(item) ? "issue-overdue" : undefined}>{formatDate(item.dueDate) || "—"}</td>
                  <td>{team.length ? team.map((code) => personName(people, code)).join(", ") : "—"}</td>
                  <td>{(item.milestones || []).length}</td>
                  <td>{rows.length === 0 ? "No tasks" : `${done} of ${rows.length} done`}</td>
                  <td>
                    <button className="ghost" type="button" onClick={() => { setOpenKey(`${item.owner}:${item.id}`); setOpenMilestoneId(""); }}>Open</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </article>
  );
}

export function MarketingTasksWorkspace({ canEdit = true }) {
  const [revision, setRevision] = useState(0);
  const projects = useMemo(() => {
    publishClients();
    return marketingProjects();
  }, [revision]);
  const people = useMemo(() => marketingPeople(), [revision]);
  const tasks = useMemo(() => tasksForProjects(projects), [projects, revision]);
  const [openKey, setOpenKey] = useState("");
  const [openMilestoneId, setOpenMilestoneId] = useState("");
  const project = projects.find((item) => `${item.owner}:${item.id}` === openKey) || null;
  const milestone = (project?.milestones || []).find((item) => item.id === openMilestoneId) || null;

  function refresh() {
    setRevision((value) => value + 1);
  }

  if (project && milestone) {
    return (
      <MarketingMilestoneKanban
        project={project}
        milestone={milestone}
        tasks={tasks.filter((task) => task.projectId === project.id)}
        people={people}
        canEdit={canEdit}
        onBack={() => setOpenMilestoneId("")}
        onChange={refresh}
      />
    );
  }

  if (project) {
    return (
      <div className="stack">
        <div className="section-head">
          <BackButton onClick={() => setOpenKey("")} label="All projects" />
          <div>
            <p className="kicker">{project.code || "Project"} · {PROJECT_TYPE[project.type] || "Project"}</p>
            <h2>{project.name}</h2>
          </div>
        </div>
        {project.milestones.length === 0 ? (
          <p className="empty-copy">No milestones yet. Add them on Project maintenance, then return here to track tasks.</p>
        ) : (
          <article className="panel">
            <table>
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>Work</th>
                  <th>Employees</th>
                  <th>Due</th>
                  <th>Tasks</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {project.milestones.map((item) => {
                  const codes = normalizeAssignees(item.assignees);
                  const rows = tasks.filter((task) => task.milestoneId === item.id);
                  const done = rows.filter((task) => task.status === "done").length;
                  const complete = milestoneTasksComplete(item, rows);
                  const lane = milestoneDepartment(item, project);
                  return (
                    <tr key={item.id}>
                      <td>
                        <button className="text-button" type="button" onClick={() => setOpenMilestoneId(item.id)}>{item.title}</button>
                      </td>
                      <td>{lane === "software" ? "Technical" : "Marketing"}</td>
                      <td>{codes.length ? codes.map((code) => personName(people, code)).join(", ") : "—"}</td>
                      <td>{formatDate(item.dueDate) || "—"}</td>
                      <td>{rows.length === 0 ? "No tasks" : `${done} of ${rows.length} done`}</td>
                      <td>
                        <span className={`project-status milestone-${complete ? "done" : item.status}`}>
                          {complete || item.status === "done" ? "Completed" : (MILESTONE_STATUS[item.status] || "Pending")}
                        </span>
                      </td>
                      <td><button className="ghost" type="button" onClick={() => setOpenMilestoneId(item.id)}>Open</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </article>
        )}
      </div>
    );
  }

  return (
    <article className="panel">
      <div className="toolbar">
        <div>
          <h2>Projects</h2>
          <p>Open a project to see its milestones, then open a milestone to track task progress.</p>
        </div>
      </div>
      {projects.length === 0 ? (
        <p className="empty-copy">No marketing projects yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Project ID</th>
              <th>Project</th>
              <th>Client</th>
              <th>Milestones</th>
              <th>Tasks</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((item) => {
              const rows = tasks.filter((task) => task.projectId === item.id);
              const done = rows.filter((task) => task.status === "done").length;
              return (
                <tr key={`${item.owner}:${item.id}`}>
                  <td><code>{item.code || "—"}</code></td>
                  <td>
                    <button className="text-button" type="button" onClick={() => { setOpenKey(`${item.owner}:${item.id}`); setOpenMilestoneId(""); }}>{item.name}</button>
                  </td>
                  <td>{item.client || "—"}</td>
                  <td>{(item.milestones || []).length}</td>
                  <td>{rows.length === 0 ? "No tasks" : `${done} of ${rows.length} done`}</td>
                  <td>
                    <button className="ghost" type="button" onClick={() => { setOpenKey(`${item.owner}:${item.id}`); setOpenMilestoneId(""); }}>Open</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </article>
  );
}

export function ProjectMaintenance({ canEdit }) {
  const [section, setSection] = useState("projects");
  const [revision, setRevision] = useState(0);
  const [viewing, setViewing] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [dating, setDating] = useState(null);
  const [error, setError] = useState("");
  const projects = useMemo(() => {
    publishClients();
    return marketingProjects();
  }, [revision]);
  const people = useMemo(() => marketingPeople(), [revision]);
  const [focus, setFocus] = useState("");

  function assign(codes) {
    if (!assigning) return;
    const result = assignMarketingTeam(assigning.owner, assigning.id, codes);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const manager = sessionAccount()?.username || "Marketing";
    result.assignees.filter((code) => !result.previous.includes(code)).forEach((code) => {
      notifyUser(code, `${manager} assigned you to ${result.name}. Open My projects to see the project.`);
    });
    setError("");
    setAssigning(null);
    setRevision((value) => value + 1);
  }

  function saveDates({ startDate, dueDate }) {
    if (!dating) return;
    const result = saveMarketingProjectDates(dating.owner, dating.id, { startDate, dueDate });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    setDating(null);
    setViewing((current) => (current && current.id === dating.id ? { ...current, startDate: result.startDate, dueDate: result.dueDate } : current));
    setRevision((value) => value + 1);
  }

  return (
    <div className="stack">
      <div className="subnav" role="tablist">
        <button type="button" className={section === "projects" ? "active" : ""} onClick={() => setSection("projects")}>Projects</button>
        <button type="button" className={section === "milestones" ? "active" : ""} onClick={() => setSection("milestones")}>Milestones</button>
        <button type="button" className={section === "quotations" ? "active" : ""} onClick={() => setSection("quotations")}>Quotations</button>
      </div>
      {section === "quotations" ? (
        <ProjectPackagesBoard projects={projects} types={["marketing", "both"]} hideAmounts allowView={false} />
      ) : section === "milestones" ? (
        <MilestoneBoard
          projects={projects}
          people={people}
          canEdit={canEdit}
          focus={focus}
          onRevision={() => setRevision((value) => value + 1)}
        />
      ) : (
      <article className="panel">
        {projects.length === 0 ? <p className="empty-copy">No marketing projects yet.</p> : (
          <table>
            <thead>
              <tr>
                <th>Project ID</th>
                <th>Project</th>
                <th>Client</th>
                <th>Type</th>
                <th>Status</th>
                <th>Start</th>
                <th>Due</th>
                <th>Team</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={`${project.owner}:${project.id}`}>
                  <td><code>{project.code || "—"}</code></td>
                  <td>{project.name}</td>
                  <td>{project.client || "—"}</td>
                  <td>{PROJECT_TYPE[project.type] || "—"}</td>
                  <td>{PROJECT_STATUS[project.status] || project.status || "—"}</td>
                  <td>{formatDate(project.startDate) || "—"}</td>
                  <td>
                    <span className={isProjectOverdue(project) ? "issue-overdue" : undefined}>
                      {formatDate(project.dueDate) || "—"}
                    </span>
                  </td>
                  <td>{project.marketingAssignees.length ? project.marketingAssignees.map((code) => personName(people, code)).join(", ") : "—"}</td>
                  <td>
                    <div className="icon-actions">
                      {canEdit ? (
                        <button className="ghost" type="button" onClick={() => { setDating(project); setError(""); }}>
                          {project.dueDate ? "Edit due" : "Set due"}
                        </button>
                      ) : null}
                      <button className="icon-button" type="button" aria-label={`Open ${project.name}`} title={`Open ${project.name}`} onClick={() => setViewing(project)}>
                        <ArrowIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
      )}
      {viewing ? (
        <Modal onClose={() => setViewing(null)}>
          <div className="modal sheet">
            <h2>{viewing.name}</h2>
            <p className="lede">{viewing.code || "No ID"} · {PROJECT_TYPE[viewing.type] || "Project"} · {viewing.owner}</p>
            <ul className="client-facts">
              <li><span>Client</span><strong>{viewing.client || "—"}</strong></li>
              <li><span>Email</span><strong>{viewing.email || "—"}</strong></li>
              <li><span>Phone</span><strong>{viewing.phone || "—"}</strong></li>
              <li><span>Address</span><strong>{viewing.address || "—"}</strong></li>
              <li><span>Status</span><strong>{PROJECT_STATUS[viewing.status] || "—"}</strong></li>
              <li><span>Start</span><strong>{formatDate(viewing.startDate)}</strong></li>
              <li><span>Due</span><strong className={isProjectOverdue(viewing) ? "issue-overdue" : undefined}>{formatDate(viewing.dueDate)}</strong></li>
              <li><span>Description</span><strong>{viewing.description || "—"}</strong></li>
              <li><span>Marketing team</span><strong>{viewing.marketingAssignees.length ? viewing.marketingAssignees.map((code) => personName(people, code)).join(", ") : "—"}</strong></li>
            </ul>
            <div className="modal-actions">
              {canEdit ? <button className="primary" type="button" onClick={() => { setDating(viewing); setError(""); }}>Set due date</button> : null}
              {canEdit ? <button className="ghost" type="button" onClick={() => { setAssigning(viewing); setError(""); }}>Assign team</button> : null}
              <button className="ghost" type="button" onClick={() => { setFocus(`${viewing.owner}:${viewing.id}`); setSection("milestones"); setViewing(null); }}>Milestones</button>
              <button className="ghost" type="button" onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </Modal>
      ) : null}
      {dating ? (
        <DueDateDialog
          project={dating}
          error={error}
          onClose={() => { setDating(null); setError(""); }}
          onSave={saveDates}
        />
      ) : null}
      {assigning ? (
        <AssignTeam
          project={assigning}
          people={people.filter((person) => person.status === "Active")}
          error={error}
          onClose={() => setAssigning(null)}
          onSave={assign}
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
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "PR";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function MilestoneBoard({ projects, people, canEdit, focus, onRevision }) {
  const [openKey, setOpenKey] = useState(focus || "");
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState("");
  const open = projects.find((item) => `${item.owner}:${item.id}` === openKey) || null;
  const role = sessionAccount()?.role;
  const activePeople = people.filter((person) => person.status === "Active");

  useEffect(() => {
    if (focus) setOpenKey(focus);
  }, [focus]);

  function save(draft) {
    if (!open) return;
    const result = saveMarketingMilestone(open.owner, open.id, { ...draft, department: "marketing" });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const admin = sessionAccount()?.username || "Marketing";
    (result.assignees || []).filter((code) => !(result.previous || []).includes(code)).forEach((code) => {
      notifyUser(code, `${admin} assigned you to ${draft.title} on ${open.name}. Open My projects to add tasks.`);
    });
    setError("");
    setEditing(null);
    onRevision(result.milestones);
  }

  function remove(milestone) {
    const result = deleteMarketingMilestone(open.owner, open.id, milestone.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    setRemoving(null);
    onRevision(result.milestones);
  }

  if (open) {
    const canAdd = canEdit && canManageDepartment(role, open, "marketing");
    return (
      <div className="stack">
        <div className="toolbar">
          <BackButton onClick={() => setOpenKey("")} label="Back" />
          {canAdd ? <button className="primary" type="button" onClick={() => { setEditing(blankMilestone("marketing")); setError(""); }}>Add milestone</button> : null}
        </div>
        {open.type === "both" ? <p className="banner">You can edit marketing milestones. Technical work is listed for monitoring only.</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <article className="panel">
          <h2>{open.name}</h2>
          <p className="lede">{open.code || "No ID"} · {PROJECT_TYPE[open.type] || "Project"} · {PROJECT_STATUS[open.status] || "In progress"}</p>
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
                      <td>{lane === "software" ? "Technical" : "Marketing"}</td>
                      <td>{normalizeAssignees(item.assignees).length ? normalizeAssignees(item.assignees).map((code) => personName(people, code)).join(", ") : "—"}</td>
                      <td>{formatDate(item.dueDate)}</td>
                      <td><span className={`project-status milestone-${item.status}`}>{MILESTONE_STATUS[item.status] || "Pending"}</span></td>
                      {canEdit ? (
                        <td>
                          {editable ? (
                            <div className="icon-actions">
                              <IconButton label={`Edit ${item.title}`} onClick={() => { setEditing(item); setError(""); }}><EditIcon /></IconButton>
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
        {editing ? (
          <Modal onClose={() => setEditing(null)}>
            <form className="modal sheet" onSubmit={(event) => { event.preventDefault(); save(editing); }}>
              <h2>{editing.title ? "Edit milestone" : "Add milestone"}</h2>
              <label>
                Milestone name
                <input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} required />
              </label>
              <label>
                Associated project
                <input value={open.name} readOnly />
              </label>
              <label>
                Status
                <select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value })}>
                  <option value="pending">Pending</option>
                  <option value="in-progress">In progress</option>
                  <option value="at-risk">At risk</option>
                  <option value="done">Done</option>
                </select>
              </label>
              <div className="field-grid">
                <label>
                  Start date
                  <input type="date" value={editing.startDate} onChange={(event) => setEditing({ ...editing, startDate: event.target.value })} />
                </label>
                <label>
                  Due date
                  <input type="date" value={editing.dueDate} onChange={(event) => setEditing({ ...editing, dueDate: event.target.value })} required />
                </label>
              </div>
              <section className="block">
                <h2>Employees</h2>
                {activePeople.length === 0 ? (
                  <p className="empty-copy">No active marketing team members yet. The CEO adds them in HRMS.</p>
                ) : (
                  <div className="assign-list">
                    {activePeople.map((person) => (
                      <label key={person.code}>
                        <input
                          type="checkbox"
                          checked={normalizeAssignees(editing.assignees).includes(person.code)}
                          onChange={() => {
                            const current = normalizeAssignees(editing.assignees);
                            const next = current.includes(person.code) ? current.filter((code) => code !== person.code) : [...current, person.code];
                            setEditing({ ...editing, assignees: next });
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
                <button className="primary" type="submit">{editing.title ? "Save changes" : "Add milestone"}</button>
                <button className="ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </form>
          </Modal>
        ) : null}
        {removing ? (
          <Modal onClose={() => setRemoving(null)}>
            <form className="modal" onSubmit={(event) => { event.preventDefault(); remove(removing); }}>
              <h2>Delete {removing.title}</h2>
              <p className="lede">This removes the milestone from {open.name}.</p>
              <div className="modal-actions">
                <button className="danger-button" type="submit">Delete</button>
                <button className="ghost" type="button" onClick={() => setRemoving(null)}>Cancel</button>
              </div>
            </form>
          </Modal>
        ) : null}
      </div>
    );
  }

  return (
    <div className="stack">
      {projects.length === 0 ? <p className="empty-copy">No marketing projects yet.</p> : projects.map((project) => {
        const progress = milestoneProgress(project);
        return (
          <article className="project-board" key={`${project.owner}:${project.id}`}>
            <div className="project-board-head">
              <span className="project-mark">{projectInitials(project.name)}</span>
              <div>
                <button className="project-open" type="button" onClick={() => setOpenKey(`${project.owner}:${project.id}`)}>{project.name}</button>
                <small>{PROJECT_STATUS[project.status] || "In progress"} · {PROJECT_TYPE[project.type] || "Project"}{project.code ? ` · ${project.code}` : ""}</small>
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

function MarketingMilestoneKanban({ project, milestone, tasks, people, canEdit, onBack, onChange }) {
  const role = sessionAccount()?.role;
  const lane = milestoneDepartment(milestone, project);
  const editable = canEdit && canManageDepartment(role, project, lane);
  const rows = tasks.filter((task) => task.milestoneId === milestone.id);
  const codes = normalizeAssignees(milestone.assignees);
  const loose = rows.some((task) => !task.assigneeCode);
  const boardPeople = [
    ...codes.map((code) => ({ code, name: personName(people, code) })),
    ...(loose ? [{ code: "", name: "Unassigned" }] : []),
  ];
  const [boardCode, setBoardCode] = useState(codes[0] || "");
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const columns = managerBoardColumns();
  const complete = milestoneTasksComplete(milestone, rows);
  const selected = boardPeople.some((person) => person.code === boardCode) ? boardCode : (boardPeople[0]?.code ?? "");
  const owner = boardPeople.find((person) => person.code === selected) || boardPeople[0];
  const boardTasks = rows.filter((task) => (task.assigneeCode || "") === (selected || ""));

  function startTask() {
    const draft = blankTask(project.id, milestone.id);
    draft.assigneeCode = selected;
    draft.status = "not-started";
    setEditing(draft);
    setError("");
  }

  function commitTasks(next) {
    saveOwnerTasks(project.owner, next);
    syncOwnerProjectProgress(project.owner, project.id, next);
    onChange();
  }

  function saveTask(draft) {
    const title = String(draft.title || "").trim();
    if (!title) return "Task title is required.";
    if (!canManageDepartment(role, project, lane)) return "You can monitor this work only.";
    const allowed = normalizeAssignees(milestone.assignees);
    const assigneeCode = String(draft.assigneeCode || "").toUpperCase();
    if (assigneeCode && allowed.length && !allowed.includes(assigneeCode)) return "Assign that employee to this milestone first.";
    const current = tasksForOwner(project.owner);
    const previous = current.find((item) => item.id === draft.id);
    const saved = stampTaskStatus({
      ...blankTask(project.id, milestone.id),
      ...draft,
      title,
      description: cleanHtml(draft.description),
      projectId: project.id,
      milestoneId: milestone.id,
      assigneeCode,
      department: "marketing",
      createdBy: draft.createdBy || sessionAccount()?.username || "",
      code: draft.code || nextTaskCode(current),
    }, TASK_STATUSES.some(([id]) => id === draft.status) ? draft.status : "not-started");
    const exists = current.some((item) => item.id === saved.id);
    commitTasks(exists ? current.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...current]);
    if (assigneeCode && assigneeCode !== previous?.assigneeCode) {
      notifyUser(assigneeCode, `${sessionAccount()?.username || "Marketing"} assigned you the task “${title}” on ${project.name}. Open My projects to update it.`);
    }
    setEditing(null);
    return "";
  }

  function move(task, status) {
    if (!editable) return;
    saveTask({ ...task, status });
  }

  return (
    <div className="stack">
      <div className="section-head">
        <BackButton onClick={onBack} label="Milestones" />
        <div>
          <p className="kicker">{project.code || "Project"} · {project.name} · {lane === "software" ? "Technical" : "Marketing"}</p>
          <h2>{milestone.title}</h2>
        </div>
        {editable ? <button className="primary" type="button" onClick={startTask}>Add task</button> : null}
      </div>
      {complete ? <p className="banner">Every task on this milestone is in Done. This milestone is completed.</p> : null}
      {!editable ? <p className="banner">This work is monitor only.</p> : (
        <p className="page-note">Open an employee to see their board. Move checked work into Done. When every task on this milestone is in Done, the milestone is completed.</p>
      )}
      {error ? <p className="form-error">{error}</p> : null}
      <article className="panel">
        <h2>Employee status</h2>
        <p>Select an employee to open that person’s Kanban board.</p>
        {boardPeople.length === 0 ? <p className="empty-copy">No employees assigned to this milestone.</p> : (
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Tasks</th>
                <th>Board</th>
              </tr>
            </thead>
            <tbody>
              {boardPeople.map((person) => {
                const mine = rows.filter((task) => (task.assigneeCode || "") === (person.code || ""));
                const laneId = employeeLaneStatus(mine);
                const column = BOARD_COLUMNS.find((item) => item.id === laneId);
                const active = (person.code || "") === (selected || "");
                return (
                  <tr key={person.code || "unassigned"} className={active ? "row-active" : undefined}>
                    <td>
                      <button className="text-button" type="button" onClick={() => setBoardCode(person.code)}>
                        {person.name}{person.code ? ` · ${person.code}` : ""}
                      </button>
                    </td>
                    <td>{mine.length}</td>
                    <td><span className={`pill kb-pill-${laneId}`}>{column?.label || "To Do"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </article>
      {owner ? (
        <article className="panel kb-panel">
          <div className="toolbar">
            <div>
              <h2>Kanban</h2>
              <p>This board belongs to {owner.name}{owner.code ? ` · ${owner.code}` : ""}. To Do, In-Progress, and Completed are employee columns. Done is yours.</p>
            </div>
          </div>
          <div className="kb-people" role="tablist" aria-label="Employee boards">
            {boardPeople.map((person) => (
              <button
                key={person.code || "unassigned"}
                type="button"
                role="tab"
                aria-selected={(person.code || "") === (selected || "")}
                className={(person.code || "") === (selected || "") ? "on" : ""}
                onClick={() => setBoardCode(person.code)}
              >
                {person.name}
              </button>
            ))}
          </div>
          <KanbanBoard
            columns={columns}
            tasks={boardTasks}
            owner={owner}
            canMove={(task, columnId) => editable && Boolean(columnId)}
            onMove={move}
            personName={(task) => personName(people, task.assigneeCode)}
            onAdd={editable ? startTask : null}
          />
        </article>
      ) : null}
      {editing ? (
        <MarketingTaskDialog
          task={editing}
          project={project}
          milestone={milestone}
          people={people.filter((person) => person.status === "Active" && codes.includes(person.code))}
          onClose={() => setEditing(null)}
          onSave={(draft) => {
            const message = saveTask(draft);
            if (message) setError(message);
            return message;
          }}
        />
      ) : null}
    </div>
  );
}

function MarketingTaskDialog({ task, project, milestone, people, onClose, onSave }) {
  const [draft, setDraft] = useState(task);
  const [error, setError] = useState("");
  const marketingMilestones = (project.milestones || []).filter((item) => milestoneDepartment(item, project) === "marketing");

  function submit(event) {
    event.preventDefault();
    const message = onSave(draft);
    if (message) setError(message);
  }

  return (
    <Modal onClose={onClose}>
      <form className="modal" onSubmit={submit}>
        <h2>{task.code ? "Edit task" : "New task"}</h2>
        <label>
          Task title
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
        </label>
        <label>
          Milestone
          <select value={draft.milestoneId || milestone?.id || ""} onChange={(event) => setDraft({ ...draft, milestoneId: event.target.value })} required>
            {marketingMilestones.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <div className="field-grid">
          <label>
            Assignee
            <select value={draft.assigneeCode || ""} onChange={(event) => setDraft({ ...draft, assigneeCode: event.target.value })}>
              <option value="">{people.length ? "Unassigned" : "Assign marketing employees on the milestone first"}</option>
              {people.map((person) => <option key={person.code} value={person.code}>{person.name} · {person.code}</option>)}
            </select>
          </label>
          <label>
            Priority
            <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>
              {TASK_PRIORITIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label>
            Status
            <select value={draft.status || "not-started"} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
              {TASK_STATUSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label>
            Due date
            <input type="date" value={draft.dueDate || ""} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} />
          </label>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="primary" type="submit">{task.code ? "Save changes" : "Add task"}</button>
          <button className="ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function isProjectOverdue(project) {
  if (!project?.dueDate || project.status === "completed") return false;
  return project.dueDate < todayIso();
}

function DueDateDialog({ project, error, onClose, onSave }) {
  const [startDate, setStartDate] = useState(project.startDate || todayIso());
  const [dueDate, setDueDate] = useState(project.dueDate || "");

  return (
    <Modal onClose={onClose}>
      <form
        className="modal sheet"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ startDate, dueDate });
        }}
      >
        <h2>{project.dueDate ? "Edit due date" : "Set due date"}</h2>
        <p className="lede">{project.code || "Project"} · {project.name}</p>
        <div className="field-grid">
          <label>
            Start date
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            Due date
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required />
          </label>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="primary" type="submit">Save due date</button>
          <button className="ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function AssignTeam({ project, people, error, onClose, onSave }) {
  const [codes, setCodes] = useState(project.marketingAssignees || []);

  function toggle(code) {
    setCodes((current) => (current.includes(code) ? current.filter((item) => item !== code) : [...current, code]));
  }

  return (
    <Modal onClose={onClose}>
      <form className="modal sheet" onSubmit={(event) => { event.preventDefault(); onSave(codes); }}>
        <h2>Assign {project.name}</h2>
        {people.length === 0 ? <p className="empty-copy">No active marketing team members yet. The CEO adds them in HRMS and sets a password.</p> : (
          <div className="assign-list">
            {people.map((person) => (
              <label key={person.code}>
                <input type="checkbox" checked={codes.includes(person.code)} onChange={() => toggle(person.code)} />
                <span>{person.name} · {person.code}</span>
              </label>
            ))}
          </div>
        )}
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="primary" type="submit" disabled={people.length === 0}>Save assignment</button>
          <button className="ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function InfoDocs({ data, commit, canEdit }) {
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const visibleClients = data.clients.filter(isVisibleToMarketing);

  function save(client) {
    const typedId = client.projectId.trim();
    const projectId = canonicalProjectCode(typedId) || typedId;
    if (!projectId || !client.brandName.trim() || !client.mainContactName.trim()) {
      return "Project ID, brand name, and main contact name are required.";
    }
    if (projectCodeTaken(projectId, { exceptMarketingId: client.id, clientName: client.brandName })) {
      return "That project ID is already used.";
    }
    const previousId = data.clients.find((item) => item.id === client.id)?.projectId || "";
    const sameId = previousId && (canonicalProjectCode(previousId) || previousId) === projectId;
    const linked = companyProjectCodes(client.id).some((item) => {
      const value = (canonicalProjectCode(item) || String(item || "").trim()).toLowerCase();
      return value === projectId.toLowerCase();
    });
    if (!sameId && !linked && !claimProjectCode(projectId, { exact: true })) {
      return "That project ID is already used.";
    }
    const next = { ...client, projectId };
    const exists = data.clients.some((item) => item.id === client.id);
    const nextData = {
      ...data,
      clients: exists
        ? data.clients.map((item) => (item.id === client.id ? next : item))
        : [next, ...data.clients],
    };
    commit(nextData);
    pushMarketingToPm(next);
    commit(loadMarketing());
    upsertMarketingProjectFromDoc(next);
    setEditing(null);
    return "";
  }

  if (editing) {
    return <InfoDocEditor client={editing} onCancel={() => setEditing(null)} onSave={save} />;
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <p>Client business profile used by content plans and reports.</p>
        {canEdit ? (
          <button className="primary" type="button" onClick={() => setEditing({
            ...blankClient(),
            projectId: suggestCompanyProjectCode(data.clients.map((item) => item.projectId)),
          })}>
            Add project
          </button>
        ) : null}
      </div>
      <article className="panel">
        {visibleClients.length === 0 ? (
          <p className="empty-copy">No marketing projects yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Project ID</th>
                <th>Brand</th>
                <th>Main contact</th>
                <th>Industry</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleClients.map((client) => (
                <tr key={client.id}>
                  <td><code>{client.projectId}</code></td>
                  <td>{client.brandName}</td>
                  <td>{client.mainContactName}</td>
                  <td>{client.industry || "—"}</td>
                  <td>
                    <RowActions
                      label={client.brandName}
                      canEdit={canEdit}
                      onView={() => setViewing(client)}
                      onDownload={() => downloadInfoDoc(client)}
                      onEdit={() => setEditing(client)}
                      onDelete={() => setRemoving(client)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
      {viewing ? (
        <LetterheadDialog
          title={`${viewing.brandName} info doc`}
          html={infoDocHtml(viewing)}
          fileName={infoDocFileName(viewing)}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {removing ? (
        <DeleteConfirm
          title={removing.brandName}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            commit({ ...data, clients: data.clients.filter((item) => item.id !== removing.id) });
            removeMarketingProjectFromDoc(removing.id);
            setRemoving(null);
          }}
        />
      ) : null}
    </div>
  );
}

function InfoDocEditor({ client, onCancel, onSave }) {
  const [draft, setDraft] = useState(client);
  const [error, setError] = useState("");
  const choices = useMemo(() => marketingServiceClients(), []);

  function setField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setSocial(channel, key, value) {
    setDraft((current) => ({
      ...current,
      social: {
        ...current.social,
        [channel]: { ...current.social[channel], [key]: value },
      },
    }));
  }

  function submit(event) {
    event.preventDefault();
    const message = onSave(draft);
    if (message) setError(message);
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="editor-head">
        <div>
          <BackButton onClick={onCancel} label="Back" />
          <h2>{client.brandName ? "Edit project" : "Add project"}</h2>
        </div>
        <div className="modal-actions">
          <button className="primary" type="submit">Save project</button>
          <button className="ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <section className="block">
        <h2>Main details</h2>
        <Field label="Project ID" value={draft.projectId} onChange={(value) => setField("projectId", value)} required />
      </section>
      <section className="block">
        <h2>A. Client details</h2>
        <label>
          Client
          <select
            value={choices.some((item) => item.name === draft.brandName) ? draft.brandName : ""}
            onChange={(event) => {
              const details = choices.find((item) => item.name === event.target.value);
              if (!details) return;
              const fetched = marketingFieldsFromPm(details);
              setDraft((current) => ({
                ...current,
                ...Object.fromEntries(Object.entries(fetched).filter(([, value]) => value)),
                projectId: fetched.projectId || current.projectId,
              }));
            }}
          >
            <option value="">{choices.length ? "Select a marketing client" : "No marketing or both-service clients yet"}</option>
            {choices.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
        </label>
        <div className="field-grid">
          <Field label="Main contact name" value={draft.mainContactName} onChange={(value) => setField("mainContactName", value)} required />
          <Field label="Main contact job title" value={draft.mainContactTitle} onChange={(value) => setField("mainContactTitle", value)} />
          <Field label="Assigned contact name" value={draft.assignedContactName} onChange={(value) => setField("assignedContactName", value)} />
          <Field label="Assigned contact job title" value={draft.assignedContactTitle} onChange={(value) => setField("assignedContactTitle", value)} />
        </div>
      </section>
      <section className="block">
        <h2>B. Business details</h2>
        <div className="field-grid">
          <Field label="Business / brand name" value={draft.brandName} onChange={(value) => setField("brandName", value)} required />
          <Field label="Registered legal name" value={draft.legalName} onChange={(value) => setField("legalName", value)} />
          <Field label="Business type / industry" value={draft.industry} onChange={(value) => setField("industry", value)} />
          <Field label="Business email address" value={draft.email} onChange={(value) => setField("email", value)} type="email" />
          <Field label="Phone number" value={draft.phone || ""} onChange={(value) => setField("phone", value)} />
          <Field label="Website URL" value={draft.website} onChange={(value) => setField("website", value)} />
          <Field label="Operating hours / days" value={draft.hours} onChange={(value) => setField("hours", value)} />
          <Field className="span-2" label="Business address" value={draft.address} onChange={(value) => setField("address", value)} />
          <Field className="span-2" label="Preferred contact method and time" value={draft.preferredContact} onChange={(value) => setField("preferredContact", value)} />
        </div>
      </section>
      <section className="block">
        <h2>C. Brand identity and assets</h2>
        <div className="field-grid">
          <Field label="Primary theme colour (HEX)" value={draft.primaryColor} onChange={(value) => setField("primaryColor", value)} />
          <Field label="Secondary / accent colours" value={draft.secondaryColors} onChange={(value) => setField("secondaryColors", value)} />
          <Field label="Preferred fonts" value={draft.fonts} onChange={(value) => setField("fonts", value)} />
          <Field label="Tagline / brand message" value={draft.tagline} onChange={(value) => setField("tagline", value)} />
        </div>
      </section>
      <section className="block">
        <h2>D. Social media credentials</h2>
        <div className="social-grid">
          <SocialRow label="Business mail" value={draft.social.email} onChange={(key, value) => setSocial("email", key, value)} />
          <SocialRow label="Facebook" value={draft.social.facebook} pageLink onChange={(key, value) => setSocial("facebook", key, value)} />
          <SocialRow label="Instagram" value={draft.social.instagram} onChange={(key, value) => setSocial("instagram", key, value)} />
          <SocialRow label="TikTok" value={draft.social.tiktok} onChange={(key, value) => setSocial("tiktok", key, value)} />
          <SocialRow label="YouTube" value={draft.social.youtube || { username: "", password: "" }} onChange={(key, value) => setSocial("youtube", key, value)} />
          <SocialRow label="LinkedIn" value={draft.social.linkedin || { username: "", password: "" }} onChange={(key, value) => setSocial("linkedin", key, value)} />
        </div>
      </section>
    </form>
  );
}

function SocialRow({ label, value, onChange, pageLink = false }) {
  return (
    <div className="social-row">
      <strong>{label}</strong>
      <Field label="Username" value={value.username} onChange={(next) => onChange("username", next)} />
      <Field label="Password" value={value.password} onChange={(next) => onChange("password", next)} />
      {pageLink ? (
        <Field label="Page link" value={value.pageLink || ""} onChange={(next) => onChange("pageLink", next)} />
      ) : <span />}
    </div>
  );
}

function InfoDocRead({ client }) {
  return (
    <article className="summary-doc">
      <p className="kicker">Client info doc</p>
      <h2>{client.brandName}</h2>
      <p>Project ID: {client.projectId}</p>
      <h3>Client details</h3>
      <ul>
        <li>Main contact: {client.mainContactName}{client.mainContactTitle ? `, ${client.mainContactTitle}` : ""}</li>
        <li>Assigned contact: {client.assignedContactName || "—"}{client.assignedContactTitle ? `, ${client.assignedContactTitle}` : ""}</li>
      </ul>
      <h3>Business details</h3>
      <ul>
        <li>Legal name: {client.legalName || "—"}</li>
        <li>Industry: {client.industry || "—"}</li>
        <li>Email: {client.email || "—"}</li>
        <li>Phone: {client.phone || "—"}</li>
        <li>Website: {client.website || "—"}</li>
        <li>Address: {client.address || "—"}</li>
        <li>Hours: {client.hours || "—"}</li>
        <li>Preferred contact: {client.preferredContact || "—"}</li>
      </ul>
      <h3>Brand identity</h3>
      <ul>
        <li>Primary colour: {client.primaryColor || "—"}</li>
        <li>Accent colours: {client.secondaryColors || "—"}</li>
        <li>Fonts: {client.fonts || "—"}</li>
        <li>Tagline: {client.tagline || "—"}</li>
      </ul>
      <h3>Social credentials</h3>
      <ul>
        <li>Business mail: {client.social.email.username || "—"} / {client.social.email.password || "—"}</li>
        <li>Facebook: {client.social.facebook.username || "—"} / {client.social.facebook.password || "—"} / {client.social.facebook.pageLink || "—"}</li>
        <li>Instagram: {client.social.instagram.username || "—"} / {client.social.instagram.password || "—"}</li>
        <li>TikTok: {client.social.tiktok.username || "—"} / {client.social.tiktok.password || "—"}</li>
      </ul>
    </article>
  );
}

function ContentPlans({ data, commit, canEdit }) {
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [removing, setRemoving] = useState(null);

  function clientName(clientId) {
    return data.clients.find((item) => item.id === clientId)?.brandName || "Client removed";
  }

  function save(plan) {
    if (!plan.clientId || !plan.title.trim() || !plan.startDate || !plan.endDate) {
      return "Choose a client, title, and the plan start and end dates.";
    }
    if (plan.endDate < plan.startDate) return "The end date is before the start date.";
    const exists = data.plans.some((item) => item.id === plan.id);
    commit({
      ...data,
      plans: exists ? data.plans.map((item) => (item.id === plan.id ? plan : item)) : [plan, ...data.plans],
    });
    setEditing(null);
    return "";
  }

  if (editing) return <PlanEditor plan={editing} clients={data.clients.filter(isVisibleToMarketing)} onCancel={() => setEditing(null)} onSave={save} />;

  return (
    <div className="stack">
      <div className="toolbar">
        <p>Monthly calendars with organic posts and one paid ad campaign for each month.</p>
        {canEdit ? (
          <button className="primary" type="button" onClick={() => setEditing(blankPlan())} disabled={data.clients.filter(isVisibleToMarketing).length === 0}>
            Add content plan
          </button>
        ) : null}
      </div>
      {data.clients.filter(isVisibleToMarketing).length === 0 ? <p className="banner">Add a client in Info Doc before creating a content plan.</p> : null}
      <article className="panel">
        {data.plans.length === 0 ? (
          <p className="empty-copy">No content plans yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Client</th>
                <th>Period</th>
                <th>Months</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.plans.map((plan) => (
                <tr key={plan.id}>
                  <td>{plan.title}</td>
                  <td>{clientName(plan.clientId)}</td>
                  <td>{periodLabel(plan.startDate, plan.endDate)}</td>
                  <td>{plan.months.length}</td>
                  <td>
                    <RowActions
                      label={plan.title}
                      canEdit={canEdit}
                      onView={() => setViewing(plan)}
                      onDownload={() => downloadPlan(plan, clientName(plan.clientId))}
                      onEdit={() => setEditing(plan)}
                      onDelete={() => setRemoving(plan)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
      {viewing ? (
        <LetterheadDialog
          title={viewing.title || "Content plan"}
          html={planHtml(viewing, clientName(viewing.clientId))}
          fileName={planFileName(viewing, clientName(viewing.clientId))}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {removing ? (
        <DeleteConfirm
          title={removing.title}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            commit({ ...data, plans: data.plans.filter((item) => item.id !== removing.id) });
            setRemoving(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PlanEditor({ plan, clients, onCancel, onSave }) {
  const [draft, setDraft] = useState(plan);
  const [error, setError] = useState("");

  function setField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateMonth(monthId, recipe) {
    setDraft((current) => ({
      ...current,
      months: current.months.map((month) => (month.id === monthId ? recipe(month) : month)),
    }));
  }

  function submit(event) {
    event.preventDefault();
    const message = onSave(draft);
    if (message) setError(message);
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="editor-head">
        <div>
          <BackButton onClick={onCancel} label="Back" />
          <h2>Content plan</h2>
        </div>
        <div className="modal-actions">
          <button className="primary" type="submit">Save content plan</button>
          <button className="ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <section className="block">
        <div className="field-grid">
          <label>
            Client
            <select value={draft.clientId} onChange={(event) => setField("clientId", event.target.value)} required>
              <option value="">Select a client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.projectId} — {client.brandName}
                </option>
              ))}
            </select>
          </label>
          <Field label="Plan title" value={draft.title} onChange={(value) => setField("title", value)} required />
          <Field label="Period start" type="date" value={draft.startDate} onChange={(value) => setField("startDate", value)} required />
          <Field label="Period end" type="date" value={draft.endDate} onChange={(value) => setField("endDate", value)} required />
          <Field label="Address" value={draft.address} onChange={(value) => setField("address", value)} />
          <Field label="Monthly output" value={draft.cadence} onChange={(value) => setField("cadence", value)} />
        </div>
      </section>
      {draft.months.map((month, index) => (
        <details key={month.id} className="month-block" open={index === 0}>
          <summary>{month.label || `Month ${index + 1}`}</summary>
          <div className="stack">
            <div className="field-grid">
              <Field label="Month label" value={month.label} onChange={(value) => updateMonth(month.id, (item) => ({ ...item, label: value }))} />
              <Field label="Theme" value={month.theme} onChange={(value) => updateMonth(month.id, (item) => ({ ...item, theme: value }))} />
              <Field label="Month start" type="date" value={month.startDate} onChange={(value) => updateMonth(month.id, (item) => ({ ...item, startDate: value }))} />
              <Field label="Month end" type="date" value={month.endDate} onChange={(value) => updateMonth(month.id, (item) => ({ ...item, endDate: value }))} />
            </div>
            <div className="panel">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Day</th>
                    <th>Time</th>
                    <th>Topic</th>
                    <th>Type</th>
                    <th>Goal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {month.posts.map((post) => (
                    <tr key={post.id}>
                      <td><input type="date" value={post.date} aria-label="Post date" onChange={(event) => updateMonth(month.id, (item) => ({ ...item, posts: item.posts.map((row) => row.id === post.id ? { ...row, date: event.target.value } : row) }))} /></td>
                      <td>{weekday(post.date) || "—"}</td>
                      <td><input type="time" value={post.time} aria-label="Post time" onChange={(event) => updateMonth(month.id, (item) => ({ ...item, posts: item.posts.map((row) => row.id === post.id ? { ...row, time: event.target.value } : row) }))} /></td>
                      <td><input value={post.topic} aria-label="Topic" onChange={(event) => updateMonth(month.id, (item) => ({ ...item, posts: item.posts.map((row) => row.id === post.id ? { ...row, topic: event.target.value } : row) }))} /></td>
                      <td>
                        <select value={post.type} aria-label="Type" onChange={(event) => updateMonth(month.id, (item) => ({ ...item, posts: item.posts.map((row) => row.id === post.id ? { ...row, type: event.target.value } : row) }))}>
                          <option>Image</option>
                          <option>Video</option>
                        </select>
                      </td>
                      <td><input value={post.goal} aria-label="Goal" onChange={(event) => updateMonth(month.id, (item) => ({ ...item, posts: item.posts.map((row) => row.id === post.id ? { ...row, goal: event.target.value } : row) }))} /></td>
                      <td>
                        <button className="ghost" type="button" onClick={() => updateMonth(month.id, (item) => ({ ...item, posts: item.posts.filter((row) => row.id !== post.id) }))}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="ghost" type="button" onClick={() => updateMonth(month.id, (item) => ({ ...item, posts: [...item.posts, blankPost()] }))}>
              Add post
            </button>
            <h3>Paid ad campaign</h3>
            <div className="field-grid">
              <Field label="Ad date" type="date" value={month.ad.date} onChange={(value) => updateMonth(month.id, (item) => ({ ...item, ad: { ...item.ad, date: value } }))} />
              <Field label="Ad time" type="time" value={month.ad.time} onChange={(value) => updateMonth(month.id, (item) => ({ ...item, ad: { ...item.ad, time: value } }))} />
              <Field label="Platforms" value={month.ad.platforms} onChange={(value) => updateMonth(month.id, (item) => ({ ...item, ad: { ...item.ad, platforms: value } }))} />
              <Field label="Ad type" value={month.ad.adType} onChange={(value) => updateMonth(month.id, (item) => ({ ...item, ad: { ...item.ad, adType: value } }))} />
              <Field label="Objective" value={month.ad.objective} onChange={(value) => updateMonth(month.id, (item) => ({ ...item, ad: { ...item.ad, objective: value } }))} />
              <Field label="Duration" value={month.ad.duration} onChange={(value) => updateMonth(month.id, (item) => ({ ...item, ad: { ...item.ad, duration: value } }))} />
              <Field className="span-2" label="Target" value={month.ad.target} onChange={(value) => updateMonth(month.id, (item) => ({ ...item, ad: { ...item.ad, target: value } }))} />
              <Field className="span-2" label="Product" value={month.ad.product} onChange={(value) => updateMonth(month.id, (item) => ({ ...item, ad: { ...item.ad, product: value } }))} />
              <Field className="span-2" label="Offer" value={month.ad.offer} onChange={(value) => updateMonth(month.id, (item) => ({ ...item, ad: { ...item.ad, offer: value } }))} />
              <Field className="span-2" label="Main message" value={month.ad.message} onChange={(value) => updateMonth(month.id, (item) => ({ ...item, ad: { ...item.ad, message: value } }))} />
              <Field className="span-2" label="Creative" value={month.ad.creative} onChange={(value) => updateMonth(month.id, (item) => ({ ...item, ad: { ...item.ad, creative: value } }))} />
            </div>
          </div>
        </details>
      ))}
      <button
        className="ghost"
        type="button"
        onClick={() => setDraft((current) => ({ ...current, months: [...current.months, blankMonth(current.months.length + 1)] }))}
      >
        Add month
      </button>
      <section className="block">
        <h2>To confirm before design starts</h2>
        <Field label="Notes, one item per line" type="area" value={draft.confirmNotes} onChange={(value) => setField("confirmNotes", value)} />
      </section>
    </form>
  );
}

function PlanRead({ plan, clientName }) {
  const notes = plan.confirmNotes.split("\n").map((line) => line.trim()).filter(Boolean);
  return (
    <article className="summary-doc">
      <p className="kicker">Content plan</p>
      <h2>{plan.title}</h2>
      <p>{clientName}</p>
      <p>{periodLabel(plan.startDate, plan.endDate)}{plan.address ? ` · ${plan.address}` : ""}</p>
      <p>{plan.cadence}</p>
      {plan.months.map((month) => (
        <section key={month.id}>
          <h3>{month.label}{month.theme ? ` · ${month.theme}` : ""}</h3>
          <p>{periodLabel(month.startDate, month.endDate)}</p>
          <ul>
            {month.posts.map((post) => (
              <li key={post.id}>
                {formatDate(post.date) || "Date not set"} {weekday(post.date)} {formatTime(post.time)} — {post.topic || "Untitled"} ({post.type}, {post.goal || "no goal"})
              </li>
            ))}
          </ul>
          <p>
            Paid ad: {formatDate(month.ad.date) || "date not set"} {formatTime(month.ad.time)} · {month.ad.platforms} · {month.ad.adType} · {month.ad.objective}
          </p>
        </section>
      ))}
      {notes.length ? (
        <>
          <h3>To confirm</h3>
          <ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul>
        </>
      ) : null}
    </article>
  );
}

function Reports({ data, commit, canEdit }) {
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState(null);
  const [removing, setRemoving] = useState(null);
  const needle = query.trim().toLowerCase();
  const reports = data.reports.filter((report) => {
    if (!needle) return true;
    return report.clientName.toLowerCase().includes(needle) || report.projectId.toLowerCase().includes(needle);
  });

  function save(report) {
    const exists = data.reports.some((item) => item.id === report.id);
    commit({
      ...data,
      reports: exists
        ? data.reports.map((item) => (item.id === report.id ? report : item))
        : [report, ...data.reports],
    });
    setDialog(null);
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <label>
          Filter by client name or ID
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Client name or project ID" />
        </label>
        {canEdit ? (
          <button className="primary" type="button" onClick={() => setDialog({ report: blankReport(), mode: "create" })}>
            Create new report
          </button>
        ) : null}
      </div>
      <article className="panel">
        {reports.length === 0 ? (
          <p className="empty-copy">{data.reports.length === 0 ? "No reports yet." : "No reports match that client name or ID."}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Project ID</th>
                <th>Period</th>
                <th>Platform</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td>{report.clientName}</td>
                  <td><code>{report.projectId}</code></td>
                  <td>{periodLabel(report.startDate, report.endDate)}</td>
                  <td>{reportPlatformsLabel(report) || "—"}</td>
                  <td>
                    <div className="icon-actions">
                      <IconButton label={`View ${report.clientName} report`} onClick={() => setDialog({ report, mode: "view" })}>
                        <EyeIcon />
                      </IconButton>
                      {canEdit ? (
                        <IconButton label={`Edit ${report.clientName} report`} onClick={() => setDialog({ report, mode: "edit" })}>
                          <EditIcon />
                        </IconButton>
                      ) : null}
                      <IconButton label={`Download ${report.clientName} report`} onClick={() => downloadReport(report)}>
                        <DownloadIcon />
                      </IconButton>
                      {canEdit ? (
                        <IconButton label={`Delete ${report.clientName} report`} tone="danger" onClick={() => setRemoving(report)}>
                          <DeleteIcon />
                        </IconButton>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
      {dialog?.mode === "view" ? (
        <LetterheadDialog
          title={dialog.report.title || `${dialog.report.clientName} report`}
          html={reportHtml(dialog.report)}
          fileName={reportFileName(dialog.report)}
          onClose={() => setDialog(null)}
        />
      ) : dialog ? (
        <ReportDialog
          report={dialog.report}
          mode={dialog.mode}
          clients={data.clients.filter(isVisibleToMarketing)}
          onClose={() => setDialog(null)}
          onSave={save}
        />
      ) : null}
      {removing ? (
        <DeleteConfirm
          title={`${removing.clientName} report`}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            commit({ ...data, reports: data.reports.filter((item) => item.id !== removing.id) });
            setRemoving(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ReportDialog({ report, mode, clients, onClose, onSave }) {
  const [draft, setDraft] = useState(() => normalizeReport(report));
  const [activePlatform, setActivePlatform] = useState("facebook");
  const [step, setStep] = useState("details");
  const [error, setError] = useState("");
  const stats = draft.platforms[activePlatform];

  function setField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setStats(nextStats) {
    setDraft((current) => ({
      ...current,
      platforms: { ...current.platforms, [activePlatform]: nextStats },
    }));
  }

  function setStat(key, value) {
    setStats({ ...stats, [key]: value });
  }

  function chooseClient(clientId) {
    const client = clients.find((item) => item.id === clientId);
    setDraft((current) => ({
      ...current,
      clientId,
      clientName: client?.brandName || "",
      projectId: client?.projectId || "",
    }));
  }

  function review(event) {
    event.preventDefault();
    if (!draft.clientId) {
      setError("Choose a client from Info Doc.");
      return;
    }
    if (!draft.startDate || !draft.endDate) {
      setError("Choose the report start and end dates.");
      return;
    }
    if (draft.endDate < draft.startDate) {
      setError("The end date is before the start date.");
      return;
    }
    if (!REPORT_PLATFORMS.some(({ id }) => platformHasData(draft.platforms[id]))) {
      setError("Record metrics for at least one social platform.");
      return;
    }
    if (!draft.clientSummary.trim()) {
      setError("Add the client summary before opening the summary.");
      return;
    }
    setError("");
    setStep("summary");
  }

  return (
    <Modal onClose={onClose}>
      <div className={`modal sheet${step === "summary" ? " quote-modal lh-modal" : ""}`}>
        <p className="step-label">{step === "details" ? "Report details" : "Report summary"}</p>
        <h2>{mode === "edit" ? "Edit report" : "Create new report"}</h2>
        {step === "details" ? (
          <form className="stack" onSubmit={review}>
            {clients.length === 0 ? <p className="banner">Add a client in Info Doc before creating a report.</p> : null}
            <div className="field-grid">
              <label>
                Client
                <select value={draft.clientId} onChange={(event) => chooseClient(event.target.value)} required>
                  <option value="">Select a client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.projectId} — {client.brandName}</option>
                  ))}
                </select>
              </label>
              <Field label="Report title" value={draft.title} onChange={(value) => setField("title", value)} />
              <Field label="Period start" type="date" value={draft.startDate} onChange={(value) => setField("startDate", value)} required />
              <Field label="Period end" type="date" value={draft.endDate} onChange={(value) => setField("endDate", value)} required />
            </div>
            <div className="subnav platform-tabs" role="tablist" aria-label="Social platforms">
              {REPORT_PLATFORMS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activePlatform === id}
                  className={`${activePlatform === id ? "active" : ""}${platformHasData(draft.platforms[id]) ? " has-data" : ""}`}
                  onClick={() => setActivePlatform(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <section className="block">
              <h2>Performance overview</h2>
              <Field label="Overview" type="area" value={stats.overview} onChange={(value) => setStat("overview", value)} />
              <div className="field-grid">
                <Field label="Total views" value={stats.totalViews} onChange={(value) => setStat("totalViews", value)} />
                <Field label="Viewers" value={stats.viewers} onChange={(value) => setStat("viewers", value)} />
                <Field label="Visits" value={stats.visits} onChange={(value) => setStat("visits", value)} />
                <Field label="Content interactions" value={stats.interactions} onChange={(value) => setStat("interactions", value)} />
                <Field label="Three-second video views" value={stats.videoViews} onChange={(value) => setStat("videoViews", value)} />
                <Field label="Watch time" value={stats.watchTime} onChange={(value) => setStat("watchTime", value)} />
                <Field label="New followers" value={stats.newFollowers} onChange={(value) => setStat("newFollowers", value)} />
                <Field label="Conversations started" value={stats.conversations} onChange={(value) => setStat("conversations", value)} />
              </div>
            </section>
            <section className="block">
              <h2>Audience reach</h2>
              <div className="field-grid">
                <Field label="Non-follower views %" value={stats.nonFollowerPercent} onChange={(value) => setStat("nonFollowerPercent", value)} />
                <Field label="Follower views %" value={stats.followerPercent} onChange={(value) => setStat("followerPercent", value)} />
                <Field className="span-2" label="Audience note" type="area" value={stats.audienceNote} onChange={(value) => setStat("audienceNote", value)} />
              </div>
            </section>
            <section className="block">
              <h2>Content performance</h2>
              <Field label="Content summary" type="area" value={stats.contentIntro} onChange={(value) => setStat("contentIntro", value)} />
              <div className="field-grid">
                <Field label="Reels views" value={stats.reelsViews} onChange={(value) => setStat("reelsViews", value)} />
                <Field label="Photo views" value={stats.photoViews} onChange={(value) => setStat("photoViews", value)} />
                <Field label="Content interactions" value={stats.contentInteractions} onChange={(value) => setStat("contentInteractions", value)} />
                <Field label="Photo interactions" value={stats.photoInteractions} onChange={(value) => setStat("photoInteractions", value)} />
                <Field label="Reels interactions" value={stats.reelsInteractions} onChange={(value) => setStat("reelsInteractions", value)} />
                <Field label="Stories interactions" value={stats.storiesInteractions} onChange={(value) => setStat("storiesInteractions", value)} />
              </div>
              <Field label="Video performance" type="area" value={stats.videoNote} onChange={(value) => setStat("videoNote", value)} />
            </section>
            <section className="block">
              <h2>Insights and client summary</h2>
              <div className="action-list">
                {draft.nextActions.map((action, index) => (
                  <Field
                    key={`${draft.id}-action-${index}`}
                    label={`Next action ${index + 1}`}
                    value={action}
                    onChange={(value) => setField("nextActions", draft.nextActions.map((item, itemIndex) => itemIndex === index ? value : item))}
                  />
                ))}
                <button className="ghost" type="button" onClick={() => setField("nextActions", [...draft.nextActions, ""])}>
                  Add action
                </button>
              </div>
              <Field label="Content direction" type="area" value={draft.contentDirection} onChange={(value) => setField("contentDirection", value)} />
              <Field label="Client summary" type="area" value={draft.clientSummary} onChange={(value) => setField("clientSummary", value)} required />
            </section>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="modal-actions">
              <button className="primary" type="submit">View summary</button>
              <button className="ghost" type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="stack">
            <iframe className="receipt-frame lh-frame" title={draft.title || "Report preview"} srcDoc={reportHtml(draft)} />
            <div className="modal-actions">
              <BackButton onClick={() => setStep("details")} label="Back" />
              <button className="primary" type="button" onClick={() => onSave(normalizeReport({ ...draft, savedAt: new Date().toISOString() }))}>
                Save report
              </button>
              <button className="ghost" type="button" onClick={() => downloadReport(draft)}>Download</button>
              <button className="ghost" type="button" onClick={onClose}>Close</button>
            </div>
          </div>
        )}
      </div>
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

function RowActions({ label, canEdit, onView, onEdit, onDelete, onDownload }) {
  return (
    <div className="icon-actions">
      <IconButton label={`View ${label}`} onClick={onView}><EyeIcon /></IconButton>
      {canEdit ? <IconButton label={`Edit ${label}`} onClick={onEdit}><EditIcon /></IconButton> : null}
      {onDownload ? <IconButton label={`Download ${label}`} onClick={onDownload}><DownloadIcon /></IconButton> : null}
      {canEdit ? <IconButton label={`Delete ${label}`} tone="danger" onClick={onDelete}><DeleteIcon /></IconButton> : null}
    </div>
  );
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

function DeleteConfirm({ title, onCancel, onConfirm }) {
  return (
    <Modal onClose={onCancel}>
      <form className="modal" onSubmit={(event) => { event.preventDefault(); onConfirm(); }}>
        <h2>Delete {title}</h2>
        <p className="lede">This removes it from the marketing workspace.</p>
        <div className="modal-actions">
          <button className="danger-button" type="submit">Delete</button>
          <button className="ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </Modal>
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

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v10M8 10l4 4 4-4M5 19h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
