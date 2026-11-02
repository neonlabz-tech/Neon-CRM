import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { logActivity, loadActivity, formatStamp } from "./activity.js";
import { BackButton } from "./BackButton.jsx";
import { KanbanBoard } from "./Kanban.jsx";
import { notifyRole, notifyUser } from "./finance.js";
import { loadHrms } from "./hrms.js";
import { employeeMilestones, formatDate, milestoneDepartment, projectsForEmployee, syncOwnerProjectProgress } from "./projects.js";
import { sessionAccount } from "./scope.js";
import {
  TASK_PRIORITIES,
  blankTask,
  boardColumnOf,
  canEmployeeMove,
  cleanHtml,
  columnLabel,
  employeeBoardColumns,
  nextTaskCode,
  saveOwnerTasks,
  stampTaskStatus,
  tasksForOwner,
  uid,
} from "./tasks.js";

export function EmployeeWorkspace({ page = "dashboard" }) {
  const code = sessionAccount()?.username || "";
  const desk = useMemo(() => loadDesk(code), [code, page]);
  if (page === "projects") return <ProjectsPage desk={desk} />;
  if (page === "tasks") return <TasksPage desk={desk} />;
  if (page === "productivity") return <ProductivityPage desk={desk} />;
  if (page === "activity") return <ActivityPage />;
  return <DashboardPage desk={desk} />;
}

function useLiveTick(ms = 2500) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    function bump() {
      setTick((value) => value + 1);
    }
    const timer = window.setInterval(bump, ms);
    window.addEventListener("storage", bump);
    window.addEventListener("focus", bump);
    function onVisible() {
      if (document.visibilityState === "visible") bump();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", bump);
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms]);
  return tick;
}

function employeeHasOpenWork(tasks, milestoneId, code) {
  const rows = (tasks || []).filter((task) => task.milestoneId === milestoneId && task.assigneeCode === code);
  if (rows.length === 0) return true;
  return rows.some((task) => task.status !== "done");
}

function loadDesk(code) {
  const person = loadHrms().employees.find((item) => item.code === code) || { name: code, code, role: "Employee" };
  const projects = projectsForEmployee(code);
  const cache = new Map();
  const tasks = [];
  for (const project of projects) {
    if (!cache.has(project.owner)) cache.set(project.owner, tasksForOwner(project.owner));
    const rows = cache.get(project.owner) || [];
    for (const task of rows) {
      if (task.projectId !== project.id || task.assigneeCode !== code) continue;
      const milestone = (project.milestones || []).find((item) => item.id === task.milestoneId);
      tasks.push({
        ...task,
        projectName: project.name,
        projectCode: project.code,
        owner: project.owner,
        client: project.client,
        milestoneTitle: milestone?.title || "",
      });
    }
  }
  return { person, projects, tasks, code };
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function firstName(person) {
  return String(person?.name || person?.code || "there").split(" ")[0];
}

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isOverdue(task) {
  if (!task.dueDate || task.status === "completed" || task.status === "done") return false;
  const due = new Date(`${task.dueDate}T00:00:00`);
  return !Number.isNaN(due.getTime()) && due < startOfDay();
}

function isSoon(task) {
  if (!task.dueDate || task.status === "completed" || task.status === "done") return false;
  const due = new Date(`${task.dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return false;
  const today = startOfDay();
  const days = Math.round((due - today) / 86400000);
  return days >= 0 && days <= 3;
}

function countBy(tasks, status) {
  return tasks.filter((task) => (status === "todo" ? boardColumnOf(task) === "todo" : task.status === status)).length;
}

function ProgressBar({ value }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="emp-bar" aria-hidden="true">
      <i className={pct === 100 ? "full" : ""} style={{ width: `${pct}%` }} />
    </div>
  );
}

function DashboardPage({ desk }) {
  const { person, projects, tasks } = desk;
  const completed = tasks.filter((task) => task.status === "completed" || task.status === "done").length;
  const pct = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const overdue = tasks.filter(isOverdue);
  const upcoming = tasks.filter(isSoon).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const week = lastDays(7).map((day) => ({
    ...day,
    count: tasks.filter((task) => sameDay(task.completedAt || task.doneAt, day.date)).length,
  }));

  return (
    <div className="stack emp-desk">
      <div>
        <h2>Good {greeting()}, {firstName(person)}</h2>
        <p>Here is your task and project overview.</p>
      </div>
      <section className="dash-metrics">
        <article className="dash-kpi tone-0"><span>Total projects</span><strong>{projects.length}</strong></article>
        <article className="dash-kpi tone-1"><span>Assigned tasks</span><strong>{tasks.length}</strong></article>
        <article className="dash-kpi tone-3"><span>To Do</span><strong>{countBy(tasks, "not-started")}</strong></article>
        <article className="dash-kpi tone-2"><span>In-Progress</span><strong>{countBy(tasks, "in-progress")}</strong></article>
        <article className="dash-kpi tone-4"><span>Completed</span><strong>{tasks.filter((task) => task.status === "completed" || task.status === "done").length}</strong></article>
        <article className="dash-kpi tone-1"><span>Overdue</span><strong>{overdue.length}</strong></article>
      </section>
      <article className="panel">
        <div className="toolbar">
          <div>
            <h2>Overall task completion</h2>
            <p>{completed} of {tasks.length} tasks finished.</p>
          </div>
          <b>{pct}%</b>
        </div>
        <ProgressBar value={pct} />
      </article>
      <article className="panel">
        <h2>Last 7 days</h2>
        <p>Tasks you marked Completed.</p>
        <div className="emp-chart">
          {week.map((day) => (
            <div key={day.key}>
              <small>{day.count}</small>
              <i style={{ height: `${Math.max(4, Math.round((day.count / Math.max(1, ...week.map((item) => item.count))) * 110))}px` }} />
              <small>{day.label}</small>
            </div>
          ))}
        </div>
      </article>
      <div className="chart-grid">
        <article className="panel">
          <h2>My projects</h2>
          {projects.length === 0 ? <p className="empty-copy">No milestone has been assigned to you yet.</p> : projects.map((project) => {
            const rows = tasks.filter((task) => task.projectId === project.id);
            const done = rows.filter((task) => task.status === "completed" || task.status === "done").length;
            const share = rows.length ? Math.round((done / rows.length) * 100) : 0;
            return (
              <div className="minirow" key={`${project.owner}:${project.id}`}>
                <div>
                  <strong>{project.name}</strong>
                  <small className="muted">{project.owner} · {employeeMilestones(project, desk.code).length} milestones</small>
                </div>
                <div className="emp-mini">
                  <ProgressBar value={share} />
                  <small>{share}%</small>
                </div>
              </div>
            );
          })}
        </article>
        <article className="panel">
          <h2>Upcoming deadlines</h2>
          {upcoming.length === 0 ? <p className="empty-copy">Nothing due in the next 3 days.</p> : upcoming.map((task) => (
            <div className="minirow" key={task.id}>
              <div>
                <strong>{task.title}</strong>
                <small className="muted">{task.projectName} · {formatDate(task.dueDate)}</small>
              </div>
              <span className={`pill kb-pill-${boardColumnOf(task)}`}>{columnLabel(boardColumnOf(task))}</span>
            </div>
          ))}
          <h2 className="emp-subhead">Overdue</h2>
          {overdue.length === 0 ? <p className="empty-copy">No overdue tasks.</p> : overdue.map((task) => (
            <div className="minirow" key={task.id}>
              <div>
                <strong>{task.title}</strong>
                <small className="muted">{task.projectName} · {formatDate(task.dueDate)}</small>
              </div>
              <span className="pill od">Overdue</span>
            </div>
          ))}
        </article>
      </div>
    </div>
  );
}

function ProjectsPage({ desk }) {
  const { code, projects } = desk;
  const [revision, setRevision] = useState(0);
  const tick = useLiveTick();
  const live = useMemo(() => projectsForEmployee(code), [code, revision, tick]);
  const [openId, setOpenId] = useState("");
  const open = live.find((project) => `${project.owner}:${project.id}` === openId) || null;

  return open ? (
    <ProjectWork
      project={open}
      code={code}
      person={desk.person}
      onBack={() => { setOpenId(""); setRevision((value) => value + 1); }}
    />
  ) : (
    <article className="panel">
      <div className="toolbar">
        <div>
          <h2>My projects</h2>
          <p>Projects appear here when a project manager assigns you to a milestone.</p>
        </div>
      </div>
      {projects.length === 0 ? <p className="empty-copy">No milestone has been assigned to you yet.</p> : (
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Client</th>
              <th>Project manager</th>
              <th>Milestones</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {live.map((project) => (
              <tr key={`${project.owner}:${project.id}`}>
                <td>{project.code ? `${project.code} · ` : ""}{project.name}</td>
                <td>{project.client || "—"}</td>
                <td>{project.owner}</td>
                <td>{employeeMilestones(project, code).length}</td>
                <td><button className="ghost" type="button" onClick={() => setOpenId(`${project.owner}:${project.id}`)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

function ProjectWork({ project, code, person, onBack }) {
  const tick = useLiveTick();
  const liveProject = useMemo(
    () => projectsForEmployee(code).find((item) => item.owner === project.owner && item.id === project.id) || project,
    [code, project.owner, project.id, tick]
  );
  const [tasks, setTasks] = useState(() => tasksForOwner(project.owner));
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setTasks(tasksForOwner(project.owner));
  }, [project.owner, tick]);
  const milestones = employeeMilestones(liveProject, code);
  const mine = tasks.filter((task) => task.projectId === liveProject.id && task.assigneeCode === code);
  const openMilestones = milestones.filter((milestone) => employeeHasOpenWork(mine, milestone.id, code));
  const waiting = milestones.length > 0 && openMilestones.length === 0;
  const columns = employeeBoardColumns();

  function persist(next, notice, activity) {
    saveOwnerTasks(project.owner, next);
    syncOwnerProjectProgress(project.owner, liveProject.id, next);
    setTasks(next);
    if (notice) notifyUser(project.owner, notice);
    if (activity) logActivity(activity);
  }

  function save(draft) {
    const title = draft.title.trim();
    if (!title) return "Task title is required.";
    if (!openMilestones.some((item) => item.id === draft.milestoneId)) return "This milestone is finished. Wait for the next assignment.";
    if (draft.startDate && draft.dueDate && draft.dueDate < draft.startDate) return "Due date cannot be before the start date.";
    const existing = tasks.find((task) => task.id === draft.id);
    if (existing && existing.assigneeCode && existing.assigneeCode !== code) return "This task belongs to another employee.";
    if (existing?.status === "done") return "The project manager has already marked this task done.";
    const mark = openMilestones.find((item) => item.id === draft.milestoneId) || {};
    const lane = milestoneDepartment(mark, liveProject);
    const status = existing?.status === "done"
      ? "done"
      : (draft.status === "completed" || draft.status === "in-progress" ? draft.status : "not-started");
    const saved = stampTaskStatus({
      ...draft,
      id: draft.id || uid(),
      title,
      description: cleanHtml(draft.description),
      projectId: liveProject.id,
      assigneeCode: code,
      createdBy: existing?.createdBy || code,
      code: existing?.code || draft.code || nextTaskCode(tasks),
      department: lane,
    }, status);
    const next = existing ? tasks.map((task) => (task.id === saved.id ? saved : task)) : [saved, ...tasks];
    persist(next, `${code} ${existing ? "updated" : "added"} “${title}” on ${liveProject.name}.`, {
      action: existing ? (existing.status !== status ? "Task Status Changed" : "Task Details Updated") : "Task Created",
      note: existing && existing.status !== status ? `${title} → ${columnLabel(boardColumnOf(saved))}` : title,
      taskId: saved.id,
      taskTitle: title,
      projectName: liveProject.name,
      milestoneTitle: mark.title || "",
      from: existing ? columnLabel(boardColumnOf(existing)) : "",
      to: columnLabel(boardColumnOf(saved)),
    });
    if (lane === "marketing") notifyRole("marketing", `${code} updated work on ${liveProject.name}.`);
    setEditing(null);
    setError("");
    return "";
  }

  function move(task, status) {
    if (task.assigneeCode !== code) return;
    if (!canEmployeeMove(task, status === "completed" ? "completed" : status === "in-progress" ? "doing" : "todo")) return;
    if (status === "done") return;
    const message = save({ ...task, status });
    if (message) setError(message);
  }

  return (
    <div className="stack">
      <div className="section-head">
        <BackButton onClick={onBack} label="My projects" />
        <div>
          <p className="kicker">{liveProject.owner} · {liveProject.code || "Project"}</p>
          <h2>{liveProject.name}</h2>
        </div>
        {openMilestones.length ? (
          <button className="primary" type="button" onClick={() => setEditing(blankTask(liveProject.id, openMilestones[0].id))}>Add task</button>
        ) : null}
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {milestones.length === 0 ? (
        <article className="panel empty-panel">
          <h2>No milestones yet</h2>
          <p>You can add tasks after a project manager or marketing admin assigns you to a milestone.</p>
        </article>
      ) : waiting ? (
        <article className="panel empty-panel">
          <h2>Waiting for the next assignment</h2>
          <p>All of your completed work on this project has been moved to Done. This board is clear until you are assigned to the next milestone or given a new task.</p>
        </article>
      ) : openMilestones.map((milestone) => {
        const rows = mine.filter((task) => task.milestoneId === milestone.id && task.status !== "done");
        return (
          <article className="panel kb-panel" key={milestone.id}>
            <div className="toolbar">
              <div>
                <h2>{milestone.title}</h2>
                <p>Move your work through To Do, In-Progress, and Completed. When the admin marks it Done, this board refreshes.</p>
              </div>
              <button className="primary compact" type="button" onClick={() => setEditing(blankTask(liveProject.id, milestone.id))}>+ Add task</button>
            </div>
            <KanbanBoard
              columns={columns}
              tasks={rows}
              owner={{ name: person.name || code, code }}
              canMove={(task, columnId) => task.assigneeCode === code && canEmployeeMove(task, columnId)}
              onMove={move}
              onAdd={() => setEditing(blankTask(liveProject.id, milestone.id))}
              hint="Drop cards here"
            />
          </article>
        );
      })}
      {editing ? (
        <TaskForm
          task={{ ...editing, assigneeCode: code, status: editing.status === "done" ? "completed" : (editing.status || "not-started") }}
          milestones={openMilestones}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </div>
  );
}

function TasksPage({ desk }) {
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [revision, setRevision] = useState(0);
  const tick = useLiveTick();
  const live = useMemo(() => loadDesk(desk.code), [desk.code, revision, tick]);
  const rows = live.tasks.filter((task) => {
    const hay = `${task.title} ${task.projectName} ${task.milestoneTitle}`.toLowerCase();
    if (query && !hay.includes(query.trim().toLowerCase())) return false;
    if (projectId && task.projectId !== projectId) return false;
    if (status && task.status !== status) return false;
    if (priority && task.priority !== priority) return false;
    return true;
  });

  function move(task, nextStatus) {
    if (!canEmployeeMove(task, nextStatus === "completed" ? "completed" : nextStatus === "in-progress" ? "doing" : "todo")) return;
    const all = tasksForOwner(task.owner);
    const existing = all.find((item) => item.id === task.id);
    if (!existing || existing.status === "done") return;
    const saved = stampTaskStatus(existing, nextStatus);
    const next = all.map((item) => (item.id === saved.id ? saved : item));
    saveOwnerTasks(task.owner, next);
    syncOwnerProjectProgress(task.owner, task.projectId, next);
    notifyUser(task.owner, `${desk.code} moved “${task.title}” to ${columnLabel(boardColumnOf(saved))}.`);
    logActivity({
      action: "Task Status Changed",
      note: `${task.title} → ${columnLabel(boardColumnOf(saved))}`,
      taskId: task.id,
      taskTitle: task.title,
      projectName: task.projectName,
      milestoneTitle: task.milestoneTitle,
      from: columnLabel(boardColumnOf(existing)),
      to: columnLabel(boardColumnOf(saved)),
    });
    setRevision((value) => value + 1);
  }

  return (
    <div className="stack">
      <article className="panel">
        <div className="toolbar emp-filters">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by title…" />
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">All projects</option>
            {desk.projects.map((project) => (
              <option key={`${project.owner}:${project.id}`} value={project.id}>{project.name}</option>
            ))}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            <option value="not-started">To Do</option>
            <option value="in-progress">In-Progress</option>
            <option value="completed">Completed</option>
            <option value="done">Done</option>
          </select>
          <select value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="">All priorities</option>
            {TASK_PRIORITIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
        {rows.length === 0 ? <p className="empty-copy">No tasks match these filters.</p> : (
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Project</th>
                <th>Milestone</th>
                <th>Due</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((task) => (
                <tr key={task.id}>
                  <td>
                    <strong>{task.title}</strong>
                    {isOverdue(task) ? <span className="pill od">Overdue</span> : null}
                  </td>
                  <td>{task.projectName}</td>
                  <td>{task.milestoneTitle || "—"}</td>
                  <td>{formatDate(task.dueDate)}</td>
                  <td>{TASK_PRIORITIES.find(([id]) => id === task.priority)?.[1] || "Medium"}</td>
                  <td>
                    {task.status === "done" ? <span className="pill kb-pill-done">Done</span> : (
                      <select aria-label={`Move ${task.title}`} value={task.status} onChange={(event) => move(task, event.target.value)}>
                        <option value="not-started">To Do</option>
                        <option value="in-progress">In-Progress</option>
                        <option value="completed">Completed</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </div>
  );
}

function ProductivityPage({ desk }) {
  const [range, setRange] = useState("week");
  const days = range === "month" ? lastDays(30) : range === "year" ? lastMonths(12) : lastDays(7);
  const completed = desk.tasks.filter((task) => task.status === "completed" || task.status === "done");
  const buckets = days.map((day) => ({
    ...day,
    count: completed.filter((task) => (range === "year" ? sameMonth(task.completedAt || task.doneAt, day.date) : sameDay(task.completedAt || task.doneAt, day.date))).length,
  }));
  const total = buckets.reduce((sum, day) => sum + day.count, 0);
  const overdue = desk.tasks.filter(isOverdue).length;
  const doing = countBy(desk.tasks, "in-progress");
  const max = Math.max(1, ...buckets.map((day) => day.count));

  return (
    <div className="stack emp-desk">
      <div className="toolbar">
        <p>Completed work for {desk.person.name || desk.code}.</p>
        <div className="emp-range">
          <button className={range === "week" ? "primary compact" : "ghost"} type="button" onClick={() => setRange("week")}>7 days</button>
          <button className={range === "month" ? "primary compact" : "ghost"} type="button" onClick={() => setRange("month")}>Month</button>
          <button className={range === "year" ? "primary compact" : "ghost"} type="button" onClick={() => setRange("year")}>Year</button>
        </div>
      </div>
      <section className="dash-metrics">
        <article className="dash-kpi tone-4"><span>Finished in this period</span><strong>{total}</strong></article>
        <article className="dash-kpi tone-2"><span>Currently doing</span><strong>{doing}</strong></article>
        <article className="dash-kpi tone-1"><span>Overdue</span><strong>{overdue}</strong></article>
        <article className="dash-kpi tone-0"><span>All assigned tasks</span><strong>{desk.tasks.length}</strong></article>
      </section>
      <article className="panel">
        <h2>Items completed</h2>
        <div className="emp-chart">
          {buckets.map((day) => (
            <div key={day.key}>
              <small>{day.count}</small>
              <i style={{ height: `${Math.max(4, Math.round((day.count / max) * 120))}px` }} />
              <small>{day.label}</small>
            </div>
          ))}
        </div>
      </article>
      <article className="panel">
        <table>
          <thead>
            <tr>
              <th>{range === "year" ? "Month" : "Day"}</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
            {[...buckets].reverse().map((day) => (
              <tr key={day.key}>
                <td>{day.full}</td>
                <td>{day.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </div>
  );
}

function ActivityPage() {
  const rows = loadActivity();
  return (
    <article className="panel">
      <div className="toolbar">
        <div>
          <h2>My activity</h2>
          <p>Status changes you made on your Kanban boards.</p>
        </div>
      </div>
      {rows.length === 0 ? <p className="empty-copy">No Kanban changes yet.</p> : rows.map((row) => (
        <div className="minirow" key={row.id}>
          <div>
            <strong>{row.action}</strong>
            {row.note ? `: ${row.note}` : ""}
            <small className="muted">{[row.projectName, row.milestoneTitle, row.taskTitle].filter(Boolean).join(" · ")}</small>
          </div>
          <small>{formatStamp(row.ts)}</small>
        </div>
      ))}
    </article>
  );
}

function TaskForm({ task, milestones, onClose, onSave }) {
  const [draft, setDraft] = useState(task);
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    const message = onSave(draft);
    if (message) setError(message);
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div onClick={(event) => event.stopPropagation()} role="presentation">
        <form className="modal" onSubmit={submit}>
          <h2>{task.code ? "Edit task" : "New task"}</h2>
          <label>
            Task
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
          </label>
          <label>
            Milestone
            <select value={draft.milestoneId} onChange={(event) => setDraft({ ...draft, milestoneId: event.target.value })} required>
              {milestones.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <div className="field-grid">
            <label>
              Priority
              <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>
                {TASK_PRIORITIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label>
              Status
              <select value={draft.status === "completed" || draft.status === "in-progress" ? draft.status : "not-started"} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
                <option value="not-started">To Do</option>
                <option value="in-progress">In-Progress</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <label>
              Start
              <input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} />
            </label>
            <label>
              Due
              <input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} />
            </label>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="modal-actions">
            <button className="primary" type="submit">Save task</button>
            <button className="ghost" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function lastDays(count) {
  const rows = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = startOfDay();
    date.setDate(date.getDate() - i);
    rows.push({
      date,
      key: date.toDateString(),
      label: date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }),
      full: date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
    });
  }
  return rows;
}

function lastMonths(count) {
  const rows = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    rows.push({
      date,
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: date.toLocaleDateString(undefined, { month: "short" }),
      full: date.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    });
  }
  return rows;
}

function sameDay(stamp, date) {
  if (!stamp) return false;
  const value = new Date(stamp);
  if (Number.isNaN(value.getTime())) return false;
  return value.getFullYear() === date.getFullYear() && value.getMonth() === date.getMonth() && value.getDate() === date.getDate();
}

function sameMonth(stamp, date) {
  if (!stamp) return false;
  const value = new Date(stamp);
  if (Number.isNaN(value.getTime())) return false;
  return value.getFullYear() === date.getFullYear() && value.getMonth() === date.getMonth();
}
