import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BackButton } from "./BackButton.jsx";
import { KanbanBoard } from "./Kanban.jsx";
import { notifyUser } from "./finance.js";
import { loadHrms } from "./hrms.js";
import { applyTaskProgress, canManageDepartment, formatDate, loadProjects, milestoneDepartment, milestoneTasksComplete, normalizeAssignees, saveProjects, withProjectCodes } from "./projects.js";
import { sessionAccount } from "./scope.js";
import { loadTeam } from "./team.js";
import { BOARD_COLUMNS, TASK_PRIORITIES, TASK_STATUSES, blankTask, cleanHtml, employeeLaneStatus, loadTasks, managerBoardColumns, nextTaskCode, saveTasks, stampTaskStatus } from "./tasks.js";

const TYPE_LABEL = {
  software: "Software project",
  marketing: "Marketing project",
  both: "Both",
};
const MILESTONE_STATUS = {
  pending: "Pending",
  "in-progress": "In progress",
  "at-risk": "At risk",
  done: "Done",
};

function loadActiveProjects() {
  const data = loadProjects();
  const coded = withProjectCodes(data.projects);
  if (coded.changed) saveProjects({ ...data, projects: coded.projects });
  return coded.projects.filter((project) => !project.archived);
}

export function TasksWorkspace() {
  const [tasks, setTasks] = useState(loadTasks);
  const [projects, setProjects] = useState(loadActiveProjects);
  const [members] = useState(() => loadTeam().members);
  const [employees] = useState(() => loadHrms().employees.filter((employee) => employee.memberType === "team" && employee.code));
  const [openProjectId, setOpenProjectId] = useState(null);
  const [openMilestoneId, setOpenMilestoneId] = useState(null);
  const openProject = projects.find((project) => project.id === openProjectId) || null;
  const openMilestone = openProject?.milestones?.find((item) => item.id === openMilestoneId) || null;

  function commitTasks(next, project = openProject) {
    saveTasks(next);
    setTasks(next);
    if (!project) return;
    const synced = applyTaskProgress(project, next);
    if (synced === project) return;
    const data = loadProjects();
    const rows = data.projects.map((item) => (item.id === synced.id ? synced : item));
    saveProjects({ ...data, projects: rows });
    setProjects(rows.filter((item) => !item.archived));
  }

  if (openProject && openMilestone) {
    return (
      <MilestoneBoard
        project={openProject}
        milestone={openMilestone}
        projects={projects}
        tasks={tasks}
        members={members}
        employees={employees}
        commit={commitTasks}
        onBack={() => setOpenMilestoneId(null)}
      />
    );
  }

  if (openProject) {
    return (
      <MilestoneList
        project={openProject}
        tasks={tasks}
        employees={employees}
        onBack={() => setOpenProjectId(null)}
        onOpen={setOpenMilestoneId}
      />
    );
  }

  return <ProjectList projects={projects} tasks={tasks} onOpen={(id) => { setOpenProjectId(id); setOpenMilestoneId(null); }} />;
}

function ProjectList({ projects, tasks, onOpen }) {
  return (
    <div className="stack">
      <article className="panel">
        <div className="toolbar">
          <div>
            <h2>Projects</h2>
            <p>Open a project to review its milestones and employee boards.</p>
          </div>
        </div>
        {projects.length === 0 ? <p className="empty-copy">No active projects yet.</p> : (
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
              {projects.map((project) => {
                const rows = tasks.filter((task) => task.projectId === project.id);
                const done = rows.filter((task) => task.status === "done").length;
                return (
                  <tr key={project.id}>
                    <td><code>{project.code || "—"}</code></td>
                    <td>{project.name}</td>
                    <td>{project.client || "—"}</td>
                    <td>{(project.milestones || []).length}</td>
                    <td>{rows.length === 0 ? "No tasks" : `${done} of ${rows.length} done`}</td>
                    <td>
                      <button className="ghost" type="button" onClick={() => onOpen(project.id)}>Open</button>
                    </td>
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

function MilestoneList({ project, tasks, employees, onBack, onOpen }) {
  const milestones = project.milestones || [];
  return (
    <div className="stack">
      <div className="section-head">
        <BackButton onClick={onBack} label="All projects" />
        <div>
          <p className="kicker">{project.code || "Project"} · {TYPE_LABEL[project.type] || "Project"}</p>
          <h2>{project.name}</h2>
        </div>
      </div>
      {project.type === "marketing" ? <p className="banner">Marketing manages this project. You can monitor milestone status.</p> : null}
      <article className="panel">
        {milestones.length === 0 ? <p className="empty-copy">No milestones yet. Add them on the Milestones tab.</p> : (
          <table>
            <thead>
              <tr>
                <th>Milestone</th>
                <th>Work</th>
                <th>Employees</th>
                <th>Due</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((milestone) => {
                const codes = normalizeAssignees(milestone.assignees);
                const rows = tasks.filter((task) => task.milestoneId === milestone.id);
                const complete = milestoneTasksComplete(milestone, rows);
                return (
                  <tr key={milestone.id}>
                    <td>{milestone.title}</td>
                    <td>{milestoneDepartment(milestone, project) === "marketing" ? "Marketing" : "Technical"}</td>
                    <td>{codes.length ? codes.map((code) => employees.find((person) => person.code === code)?.name || code).join(", ") : "—"}</td>
                    <td>{formatDate(milestone.dueDate) || "—"}</td>
                    <td>
                      <span className={`project-status milestone-${complete ? "done" : milestone.status}`}>
                        {complete || milestone.status === "done" ? "Completed" : (MILESTONE_STATUS[milestone.status] || "Pending")}
                      </span>
                    </td>
                    <td><button className="ghost" type="button" onClick={() => onOpen(milestone.id)}>Open</button></td>
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

function MilestoneBoard({ project, milestone, projects, tasks, members, employees, commit, onBack }) {
  const role = sessionAccount()?.role;
  const lane = milestoneDepartment(milestone, project);
  const editable = canManageDepartment(role, project, lane);
  const rows = tasks.filter((task) => task.milestoneId === milestone.id);
  const codes = normalizeAssignees(milestone.assignees);
  const loose = rows.some((task) => !task.assigneeCode);
  const people = [
    ...codes.map((code) => {
      const person = employees.find((item) => item.code === code);
      return { code, name: person?.name || code };
    }),
    ...(loose ? [{ code: "", name: "Unassigned" }] : []),
  ];
  const [boardCode, setBoardCode] = useState(codes[0] || "");
  const [editing, setEditing] = useState(null);
  const columns = managerBoardColumns();
  const live = projects.find((item) => item.id === project.id) || project;
  const current = (live.milestones || []).find((item) => item.id === milestone.id) || milestone;
  const complete = milestoneTasksComplete(current, rows);
  const selected = people.some((person) => person.code === boardCode) ? boardCode : (people[0]?.code ?? "");
  const owner = people.find((person) => person.code === selected) || people[0];
  const boardTasks = rows.filter((task) => (task.assigneeCode || "") === (selected || ""));

  function personName(task) {
    return taskPerson(task, employees, members);
  }

  function startTask() {
    const draft = blankTask(project.id, milestone.id);
    draft.assigneeCode = selected;
    setEditing(draft);
  }

  function save(draft) {
    const title = draft.title.trim();
    if (!title) return "Task title is required.";
    const ownerProject = projects.find((item) => item.id === (draft.projectId || project.id)) || project;
    const mark = ownerProject.milestones?.find((item) => item.id === (draft.milestoneId || milestone.id)) || milestone;
    const work = milestoneDepartment(mark, ownerProject);
    if (!canManageDepartment(role, ownerProject, work)) return "Marketing manages this work. You can monitor it.";
    if (draft.startDate && draft.dueDate && draft.dueDate < draft.startDate) return "Due date cannot be before the start date.";
    const allowed = normalizeAssignees(mark.assignees);
    const assigneeCode = String(draft.assigneeCode || "").toUpperCase();
    if (assigneeCode && allowed.length && !allowed.includes(assigneeCode)) return "Assign that employee to this milestone first.";
    const status = TASK_STATUSES.some(([id]) => id === draft.status) ? draft.status : "not-started";
    const previous = tasks.find((task) => task.id === draft.id);
    const saved = stampTaskStatus({
      ...draft,
      title,
      description: cleanHtml(draft.description),
      projectId: ownerProject.id,
      milestoneId: mark.id,
      assigneeCode,
      department: work,
      createdBy: draft.createdBy || sessionAccount()?.username || "",
      code: draft.code || nextTaskCode(tasks),
    }, status);
    const exists = tasks.some((task) => task.id === saved.id);
    const next = exists ? tasks.map((task) => (task.id === saved.id ? saved : task)) : [saved, ...tasks];
    commit(next, ownerProject);
    if (assigneeCode && assigneeCode !== previous?.assigneeCode) {
      const manager = sessionAccount()?.username || "Your project manager";
      notifyUser(assigneeCode, `${manager} assigned you the task “${title}” on ${ownerProject.name}. Open My projects to update it.`);
    }
    if (status === "done" && previous?.status !== "done" && assigneeCode) {
      notifyUser(assigneeCode, `${sessionAccount()?.username || "Project manager"} marked “${title}” as done.`);
    }
    setEditing(null);
    return "";
  }

  function move(task, status) {
    if (!editable) return;
    save({ ...task, status });
  }

  return (
    <div className="stack">
      <div className="section-head">
        <BackButton onClick={onBack} label="Milestones" />
        <div>
          <p className="kicker">{project.name} · {lane === "marketing" ? "Marketing" : "Technical"}</p>
          <h2>{current.title}</h2>
        </div>
        {editable ? <button className="primary" type="button" onClick={startTask}>Add task</button> : null}
      </div>
      {complete ? <p className="banner">Every task on this milestone is in Done. This milestone is completed.</p> : null}
      {!editable ? <p className="banner">Marketing manages this work. You can monitor employee status.</p> : (
        <p className="page-note">Open an employee to see their board. Move checked work into Done. When every task on this milestone is in Done, the milestone is completed.</p>
      )}
      <article className="panel">
        <h2>Employee status</h2>
        <p>Select an employee to open that person’s Kanban board.</p>
        {people.length === 0 ? <p className="empty-copy">No employees assigned to this milestone.</p> : (
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Tasks</th>
                <th>Board</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
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
            {people.map((person) => (
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
            personName={personName}
            onAdd={editable ? startTask : null}
          />
        </article>
      ) : null}
      {editing ? (
        <TaskDialog
          task={editing}
          projects={projects}
          employees={employees}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      ) : null}
    </div>
  );
}

function TaskDialog({ task, projects, employees, onClose, onSave }) {
  const [draft, setDraft] = useState(task);
  const [error, setError] = useState("");
  const editing = Boolean(task.code);
  const selected = projects.find((item) => item.id === draft.projectId);
  const role = sessionAccount()?.role;
  const milestoneOptions = (selected?.milestones || []).filter((item) => canManageDepartment(role, selected, milestoneDepartment(item, selected)));
  const selectedMilestone = milestoneOptions.find((item) => item.id === draft.milestoneId);
  const lane = selected ? milestoneDepartment(selectedMilestone, selected) : "software";
  const assigned = employees.filter((person) => normalizeAssignees(selectedMilestone?.assignees?.length ? selectedMilestone.assignees : (lane === "marketing" ? selected?.marketingAssignees : selected?.assignees)).includes(person.code));

  function setField(key, value) {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === "projectId") {
        const chosen = projects.find((item) => item.id === value);
        const milestones = chosen?.milestones || [];
        if (!milestones.some((item) => item.id === current.milestoneId)) next.milestoneId = "";
        if (!normalizeAssignees(chosen?.assignees).includes(current.assigneeCode)) next.assigneeCode = "";
      }
      return next;
    });
  }

  function submit(event) {
    event.preventDefault();
    const message = onSave(draft);
    if (message) setError(message);
  }

  return (
    <Modal onClose={onClose}>
      <form className="modal sheet issue-dialog" onSubmit={submit}>
        <div className="issue-view-badges">
          {editing ? <code>{task.code}</code> : null}
          <h2>{editing ? "Edit task" : "Create new task"}</h2>
        </div>
        <label>
          Task title
          <input value={draft.title} onChange={(event) => setField("title", event.target.value)} placeholder="Short name for the task" required />
        </label>
        <div className="field-grid">
          <label>
            Associated project
            <select value={draft.projectId} onChange={(event) => setField("projectId", event.target.value)} required>
              <option value="">Select a project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.code || "No ID"} · {project.name}</option>
              ))}
            </select>
          </label>
          <label>
            Milestone
            <select value={draft.milestoneId} onChange={(event) => setField("milestoneId", event.target.value)} required>
              <option value="">{milestoneOptions.length === 0 ? "No milestones yet" : "Select a milestone"}</option>
              {milestoneOptions.map((milestone) => (
                <option key={milestone.id} value={milestone.id}>{milestone.title}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="field-grid">
          <label>
            Priority
            <select value={draft.priority} onChange={(event) => setField("priority", event.target.value)}>
              {TASK_PRIORITIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label>
            Assignee
            <select value={draft.assigneeCode || ""} onChange={(event) => setField("assigneeCode", event.target.value)}>
              <option value="">{assigned.length ? "Unassigned" : "Assign employees on the project first"}</option>
              {assigned.map((person) => (
                <option key={person.code} value={person.code}>{person.name} · {person.code}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={draft.status || "not-started"} onChange={(event) => setField("status", event.target.value)}>
              {TASK_STATUSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label>
            Start date
            <input type="date" value={draft.startDate} onChange={(event) => setField("startDate", event.target.value)} />
          </label>
          <label>
            Due date
            <span className="date-field">
              <input type="date" value={draft.dueDate} onChange={(event) => setField("dueDate", event.target.value)} />
              {draft.dueDate ? (
                <button className="icon-button danger" type="button" aria-label="Clear due date" title="Clear due date" onClick={() => setField("dueDate", "")}>
                  <DeleteIcon />
                </button>
              ) : null}
            </span>
          </label>
        </div>
        <label>
          Description
          <RichText value={draft.description} onChange={(value) => setField("description", value)} placeholder="Add the task breakdown and acceptance criteria..." />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions task-actions">
          <button className="ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="primary" type="submit">{editing ? "Update task" : "Create task"}</button>
        </div>
      </form>
    </Modal>
  );
}

function RichText({ value, onChange, placeholder }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = value || "";
  }, []);

  function apply(command) {
    ref.current?.focus();
    document.execCommand(command, false, null);
    onChange(ref.current?.innerHTML || "");
  }

  return (
    <div className="rich-text">
      <div className="rich-toolbar" role="toolbar" aria-label="Description formatting">
        <button type="button" aria-label="Bold" onMouseDown={(event) => event.preventDefault()} onClick={() => apply("bold")}><b>B</b></button>
        <button type="button" aria-label="Italic" onMouseDown={(event) => event.preventDefault()} onClick={() => apply("italic")}><i>I</i></button>
        <button type="button" aria-label="Underline" onMouseDown={(event) => event.preventDefault()} onClick={() => apply("underline")}><u>U</u></button>
        <button type="button" aria-label="Bulleted list" onMouseDown={(event) => event.preventDefault()} onClick={() => apply("insertUnorderedList")}>•</button>
        <button type="button" aria-label="Numbered list" onMouseDown={(event) => event.preventDefault()} onClick={() => apply("insertOrderedList")}>1.</button>
      </div>
      <div
        ref={ref}
        className="rich-area"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Description"
        data-placeholder={placeholder}
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
      />
    </div>
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

function taskPerson(task, employees, members) {
  if (task.assigneeCode) {
    const employee = employees.find((person) => person.code === task.assigneeCode);
    return employee ? `${employee.name} · ${employee.code}` : task.assigneeCode;
  }
  const member = members.find((person) => person.id === task.assigneeId);
  return member?.name || "Unassigned";
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
