import { useState } from "react";
import { createPortal } from "react-dom";
import { USER_DEPARTMENTS, loadUsers, nextUsername } from "./crm.js";
import { todayISO } from "./sales.js";
import {
  MEMBER_TYPES,
  ACTIVITY_CATEGORIES,
  ACTIVITY_STATUSES,
  EMPLOYMENT_STATUSES,
  HR_ROLES,
  LEAVE_TYPES,
  deleteDepartment,
  deleteHrmsRecord,
  employeeById,
  formatPhone,
  loadHrms,
  nextTeamCode,
  saveActivity,
  saveDepartment,
  saveEmployee,
  saveLeave,
} from "./hrms.js";

const TABS = [
  ["employees", "Employees"],
  ["leaves", "Leave register"],
  ["activities", "Activities"],
];

export function HrmsWorkspace() {
  const today = todayISO();
  const [data, setData] = useState(loadHrms);
  const [tab, setTab] = useState("employees");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [person, setPerson] = useState("");
  const [draft, setDraft] = useState(null);
  const [departmentDraft, setDepartmentDraft] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const rows = visibleRows(data, tab, query, filter, person);

  function openTab(next) {
    setTab(next);
    setQuery("");
    setFilter("all");
    setPerson("");
    setDraft(null);
    setDepartmentDraft(null);
    setRemoving(null);
    setError("");
  }

  async function apply(result, message) {
    const resolved = await result;
    if (!resolved.ok) {
      setError(resolved.error);
      return;
    }
    setData(resolved.data);
    setDraft(null);
    setDepartmentDraft(null);
    setRemoving(null);
    setError("");
    setNotice(message);
  }

  function submit(event) {
    event.preventDefault();
    if (tab === "employees") apply(saveEmployee(data, draft), "Employee saved.");
    else if (tab === "leaves") apply(saveLeave(data, draft), "Leave record saved.");
    else apply(saveActivity(data, draft), "Activity saved.");
  }

  function askRemove(record) {
    if (tab === "employees" && data.leaves.some((leave) => leave.employeeId === record.id)) {
      setError("This employee has linked leave records. Change their employment status to retain history.");
      setRemoving(null);
      return;
    }
    setError("");
    setRemoving(record);
  }

  function remove(event) {
    event.preventDefault();
    apply(deleteHrmsRecord(data, tab, removing.id), "Record deleted.");
  }

  function backup() {
    downloadText(`NeonLabz_HRMS_Backup_${today}.json`, JSON.stringify(data, null, 2), "application/json");
  }

  return (
    <div className="stack">
      <div className="toolbar hr-head">
        <div className="subnav" role="tablist" aria-label="HRMS registers">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? "active" : ""} aria-selected={tab === id} onClick={() => openTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="icon-actions">
          <button className="ghost" type="button" onClick={backup}>Download HRMS backup</button>
          <button className="ghost" type="button" onClick={() => exportRegister(tab, rows, data)}>Export current register CSV</button>
        </div>
      </div>
      <div className="toolbar hr-filters">
        <label className="hr-search">
          Search
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names, email, descriptions…" />
        </label>
        <label>
          Filter
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            {filterOptions(tab).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {tab === "leaves" ? (
          <label>
            Employee
            <select value={person} onChange={(event) => setPerson(event.target.value)}>
              <option value="">All employees</option>
              {data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
          </label>
        ) : null}
        {tab === "employees" ? (
          <button className="primary" type="button" onClick={() => { setDepartmentDraft({ id: "", name: "", role: "pm" }); setDraft(null); setRemoving(null); setError(""); }}>
            + Add department
          </button>
        ) : (
          <button className="primary" type="button" onClick={() => {
            const next = blankDraft(tab, data, today);
            if (!next) {
              setError("Add an active employee first.");
              return;
            }
            setDraft(next);
            setDepartmentDraft(null);
            setError("");
            setRemoving(null);
          }}>
            + Add {addLabel(tab)}
          </button>
        )}
      </div>
      {notice ? <p className="page-note">{notice}</p> : null}
      {error && !draft && !removing ? <p className="form-error">{error}</p> : null}
      {departmentDraft ? (
        <Modal>
          <form className="modal sheet" onSubmit={(event) => { event.preventDefault(); apply(saveDepartment(data, departmentDraft), "Department saved."); }}>
            <h2>{departmentDraft.id ? "Edit department" : "Add department"}</h2>
            <div className="sales-grid">
              <label>Department name<input value={departmentDraft.name} onChange={(event) => setDepartmentDraft({ ...departmentDraft, name: event.target.value })} required maxLength={80} placeholder="Technical" /></label>
              <label>
                Admin sign-in
                <select value={departmentDraft.role} onChange={(event) => setDepartmentDraft({ ...departmentDraft, role: event.target.value })}>
                  {USER_DEPARTMENTS.map((item) => <option key={item.role} value={item.role}>{item.label} ({item.prefix})</option>)}
                </select>
              </label>
            </div>
            <p className="page-note">{USER_DEPARTMENTS.find((item) => item.role === departmentDraft.role)?.hint}</p>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="modal-actions">
              <button className="primary" type="submit">Save department</button>
              <button className="ghost" type="button" onClick={() => { setDepartmentDraft(null); setError(""); }}>Cancel</button>
            </div>
          </form>
        </Modal>
      ) : null}
      {draft ? (
        <Modal>
          <form className="modal sheet" onSubmit={submit}>
            <h2>{draft.id ? "Edit" : "Add"} {recordLabel(tab)}</h2>
            <RecordFields tab={tab} draft={draft} setDraft={setDraft} data={data} />
            {error ? <p className="form-error">{error}</p> : null}
            <div className="modal-actions">
              <button className="primary" type="submit">Save record</button>
              <button className="ghost" type="button" onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
            </div>
          </form>
        </Modal>
      ) : null}
      {removing ? (
        <Modal>
          <form className="modal" onSubmit={remove}>
            <h2>Delete this {tab === "employees" ? "employee" : "record"}?</h2>
            <p className="lede">{removeCopy(tab, removing, data)}</p>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="modal-actions">
              <button className="danger-button" type="submit">Delete</button>
              <button className="ghost" type="button" onClick={() => { setRemoving(null); setError(""); }}>Cancel</button>
            </div>
          </form>
        </Modal>
      ) : null}
      <article className="panel">
        <Register
          tab={tab}
          rows={rows}
          data={data}
          onEdit={(record) => { setDraft(editDraft(tab, record, data)); setDepartmentDraft(null); setError(""); setRemoving(null); }}
          onDelete={askRemove}
          onAddMember={(departmentId) => {
            const next = blankDraft("employees", data, today);
            setDraft({ ...next, department: departmentId });
            setDepartmentDraft(null);
            setError("");
            setRemoving(null);
          }}
          onEditDepartment={(department) => { setDepartmentDraft({ id: department.id, name: department.name, role: department.role }); setDraft(null); setError(""); }}
          onDeleteDepartment={(department) => apply(deleteDepartment(data, department.id), "Department removed.")}
        />
        <p className="page-note">{countCopy(tab, rows.length, data)}</p>
      </article>
    </div>
  );
}

function RecordFields({ tab, draft, setDraft, data }) {
  function setField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  if (tab === "employees") {
    return (
      <div className="sales-grid">
        <label>Full name<input value={draft.name} onChange={(event) => setField("name", event.target.value)} required maxLength={200} /></label>
        <label>Email address<input type="email" value={draft.email} onChange={(event) => setField("email", event.target.value)} required maxLength={200} /></label>
        <label>Phone number<input type="tel" inputMode="numeric" value={draft.phone} onChange={(event) => setField("phone", formatPhone(event.target.value))} placeholder="000-000-0000" required maxLength={12} /></label>
        <label>Joining date<input type="date" value={draft.join} onChange={(event) => setField("join", event.target.value)} required /></label>
        <label>
          Role designation
          <select value={draft.role} onChange={(event) => setField("role", event.target.value)}>
            {HR_ROLES.map((role) => <option key={role}>{role}</option>)}
          </select>
        </label>
        {draft.role === "Custom Role" ? (
          <label>Custom role title<input value={draft.customRole} onChange={(event) => setField("customRole", event.target.value)} required maxLength={200} /></label>
        ) : null}
        <label>
          Employment status
          <select value={draft.status} onChange={(event) => setField("status", event.target.value)}>
            {EMPLOYMENT_STATUSES.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label>
          Department
          <select value={draft.department} onChange={(event) => setField("department", event.target.value)} required>
            {departmentsOf(data).length === 0 ? <option value="">Add a department first</option> : null}
            {departmentsOf(data).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          Access
          <select value={draft.memberType} onChange={(event) => setField("memberType", event.target.value)}>
            {MEMBER_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <PasswordField label="Password" value={draft.password} onChange={(value) => setField("password", value)} placeholder={hasEmployeeLogin(draft) ? "Leave blank to keep the current password" : "Password to share"} required={!hasEmployeeLogin(draft)} />
        <PasswordField label="Confirm password" value={draft.confirm} onChange={(value) => setField("confirm", value)} placeholder="Repeat password" required={Boolean(draft.password)} />
        <p className="page-note">{signInNote(draft, data)}</p>
      </div>
    );
  }
  if (tab === "leaves") {
    const department = draft.department || departmentsOf(data)[0]?.id || "";
    const people = data.employees.filter((employee) => employee.department === department && (employee.status === "Active" || employee.id === draft.employeeId));
    return (
      <div className="sales-grid">
        <label>
          Department
          <select
            value={department}
            onChange={(event) => {
              const nextDepartment = event.target.value;
              const nextPerson = data.employees.find((employee) => employee.department === nextDepartment && employee.status === "Active");
              setDraft((current) => ({ ...current, department: nextDepartment, employeeId: nextPerson?.id || "" }));
            }}
          >
            {departmentsOf(data).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          Employee
          <select value={draft.employeeId} onChange={(event) => setField("employeeId", event.target.value)} required>
            {people.length === 0 ? <option value="">No employees in this department</option> : null}
            {people.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
          </select>
        </label>
        <label>Leave date<input type="date" value={draft.date} onChange={(event) => setField("date", event.target.value)} required /></label>
        <label>
          Leave type
          <select value={draft.type} onChange={(event) => setField("type", event.target.value)}>
            {LEAVE_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        <label className="span-all">Description<textarea value={draft.description} onChange={(event) => setField("description", event.target.value)} required maxLength={1500} /></label>
      </div>
    );
  }
  return (
    <div className="sales-grid">
      <label>Activity name<input value={draft.name} onChange={(event) => setField("name", event.target.value)} required maxLength={200} /></label>
      <label>
        Category
        <select value={draft.category} onChange={(event) => setField("category", event.target.value)}>
          {ACTIVITY_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
        </select>
      </label>
      <label>Scheduled date<input type="date" value={draft.date} onChange={(event) => setField("date", event.target.value)} required /></label>
      <label>
        Status
        <select value={draft.status} onChange={(event) => setField("status", event.target.value)}>
          {ACTIVITY_STATUSES.map((status) => <option key={status}>{status}</option>)}
        </select>
      </label>
      <label className="span-all">Description<textarea value={draft.description} onChange={(event) => setField("description", event.target.value)} required maxLength={1500} /></label>
    </div>
  );
}

function Register({ tab, rows, data, onEdit, onDelete, onAddMember, onEditDepartment, onDeleteDepartment }) {
  if (tab === "employees") {
    return (
      <div className="stack dept-list">
        {departmentsOf(data).length === 0 ? <p className="empty-copy">No departments yet. Add a department, then add an admin or a team member inside it.</p> : departmentsOf(data).map((department, index) => {
          const people = rows.filter((employee) => employee.department === department.id);
          const occupied = data.employees.some((employee) => employee.department === department.id);
          const count = people.length;
          return (
            <section key={department.id} className={`dept-card tone-${index % 3}`}>
              <div className="dept-head">
                <div className="dept-title">
                  <span className="dept-mark" aria-hidden="true">{initials(department.name)}</span>
                  <div>
                    <h3>{department.name}</h3>
                    <p>{count} {count === 1 ? "member" : "members"}</p>
                  </div>
                </div>
                <div className="dept-actions">
                  <button className="dept-add" type="button" onClick={() => onAddMember(department.id)}>Add member</button>
                  <button className="dept-edit" type="button" onClick={() => onEditDepartment(department)}>Edit</button>
                  {occupied ? null : <button className="dept-delete" type="button" onClick={() => onDeleteDepartment(department)}>Delete</button>}
                </div>
              </div>
              {people.length === 0 ? <p className="empty-copy">No employees in this department.</p> : (
                <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th><th>Email</th><th>Phone</th><th>Join date</th><th>Role</th><th>Access</th><th>Status</th><th>Leave records</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((employee) => (
                      <tr key={employee.id}>
                        <td>
                          <div className="hr-person">
                            <span className="hr-avatar">{initials(employee.name)}</span>
                            <div>
                              <strong>{employee.name}</strong>
                              <small>{staffId(employee)}</small>
                            </div>
                          </div>
                        </td>
                        <td>{employee.email}</td>
                        <td>{formatPhone(employee.phone)}</td>
                        <td>{employee.join}</td>
                        <td>{employee.role}</td>
                        <td>{employee.memberType === "admin" ? "Admin" : "Team member"}</td>
                        <td><Status value={employee.status} /></td>
                        <td>{data.leaves.filter((leave) => leave.employeeId === employee.id).length}</td>
                        <td><RowActions onEdit={() => onEdit(employee)} onDelete={() => onDelete(employee)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    );
  }
  if (tab === "leaves") {
    return (
      <div className="tablewrap">
      <table>
        <thead>
          <tr><th>Employee</th><th>Leave date</th><th>Type</th><th>Description</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={5}>No matching records.</td></tr> : rows.map((leave) => {
            const employee = employeeById(data, leave.employeeId);
            return (
              <tr key={leave.id}>
                <td><strong>{employee?.name || "Unknown"}</strong><br /><small>{staffId(employee)}</small></td>
                <td>{leave.date}</td>
                <td>{leave.type}</td>
                <td>{leave.description}</td>
                <td><RowActions onEdit={() => onEdit(leave)} onDelete={() => onDelete(leave)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    );
  }
  return (
    <div className="tablewrap">
    <table>
      <thead>
        <tr><th>Activity</th><th>Category</th><th>Scheduled date</th><th>Description</th><th>Status</th><th>Actions</th></tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <tr><td colSpan={6}>No matching records.</td></tr> : rows.map((activity) => (
          <tr key={activity.id}>
            <td><strong>{activity.name}</strong></td>
            <td>{activity.category}</td>
            <td>{activity.date}</td>
            <td>{activity.description}</td>
            <td><Status value={activity.status} /></td>
            <td><RowActions onEdit={() => onEdit(activity)} onDelete={() => onDelete(activity)} /></td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

function RowActions({ onEdit, onDelete }) {
  return (
    <div className="icon-actions">
      <IconButton label="Edit" onClick={onEdit}>
        <EditIcon />
      </IconButton>
      <IconButton label="Delete" tone="danger" onClick={onDelete}>
        <DeleteIcon />
      </IconButton>
    </div>
  );
}

function IconButton({ label, onClick, tone, children }) {
  return (
    <button className={tone === "danger" ? "icon-button danger" : "icon-button"} type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
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

function Status({ value }) {
  const tone = value === "Active" || value === "Completed" || value === "Paid"
    ? "completed"
    : value === "Scheduled"
      ? "scheduled"
      : "cancelled";
  return <span className={`project-status ${tone}`}>{value}</span>;
}

function blankDraft(tab, data, today) {
  if (tab === "employees") {
    return { id: "", name: "", email: "", phone: "", join: today, role: "Intern", customRole: "", status: "Active", department: departmentsOf(data)[0]?.id || "", memberType: "team", username: "", password: "", confirm: "" };
  }
  if (tab === "leaves") {
    const department = departmentsOf(data).find((item) => data.employees.some((employee) => employee.department === item.id && employee.status === "Active"))?.id;
    const person = data.employees.find((employee) => employee.department === department && employee.status === "Active");
    if (!person) return null;
    return { id: "", employeeId: person.id, department, date: today, type: LEAVE_TYPES[0], description: "" };
  }
  return { id: "", name: "", category: "Team Meeting", date: today, description: "", status: "Scheduled" };
}

function hasEmployeeLogin(draft) {
  const login = draft.memberType === "admin"
    ? String(draft.username || "").toUpperCase()
    : String(draft.code || draft.username || "").toUpperCase();
  return Boolean(draft.id && login && loadUsers().some((user) => user.username === login));
}

function editDraft(tab, record, data) {
  if (tab === "leaves") {
    const employee = employeeById(data, record.employeeId);
    return { ...record, department: employee?.department || departmentsOf(data)[0]?.id || "" };
  }
  if (tab !== "employees") return { ...record };
  const known = HR_ROLES.includes(record.role) && record.role !== "Custom Role";
  return { ...record, phone: formatPhone(record.phone), role: known ? record.role : "Custom Role", customRole: known ? "" : record.role, password: "", confirm: "" };
}

function visibleRows(data, tab, query, filter, person) {
  const text = query.trim().toLowerCase();
  if (tab === "employees") {
    return data.employees.filter((employee) => {
      const haystack = [employee.code, employee.name, employee.email, employee.phone, employee.role, employee.status, employee.username, employee.memberType, departmentLabel(data, employee.department)].join(" ").toLowerCase();
      return (!text || haystack.includes(text)) && (filter === "all" || employee.status === filter);
    });
  }
  if (tab === "leaves") {
    return data.leaves.filter((leave) => {
      const employee = employeeById(data, leave.employeeId);
      const haystack = [employee?.name, employee?.code, leave.date, leave.type, leave.description].join(" ").toLowerCase();
      return (!text || haystack.includes(text)) && (filter === "all" || leave.type === filter) && (!person || leave.employeeId === person);
    });
  }
  return data.activities.filter((activity) => {
    const haystack = [activity.name, activity.category, activity.date, activity.description, activity.status].join(" ").toLowerCase();
    return (!text || haystack.includes(text)) && (filter === "all" || activity.status === filter);
  });
}

function filterOptions(tab) {
  if (tab === "employees") return [{ value: "all", label: "All statuses" }, ...EMPLOYMENT_STATUSES.map((status) => ({ value: status, label: status }))];
  if (tab === "leaves") return [{ value: "all", label: "All leave types" }, ...LEAVE_TYPES.map((type) => ({ value: type, label: type }))];
  return [{ value: "all", label: "All statuses" }, ...ACTIVITY_STATUSES.map((status) => ({ value: status, label: status }))];
}

function addLabel(tab) {
  if (tab === "employees") return "employee";
  if (tab === "leaves") return "leave";
  return "activity";
}

function recordLabel(tab) {
  if (tab === "employees") return "employee";
  if (tab === "leaves") return "leave record";
  return "activity";
}

function removeCopy(tab, record, data) {
  if (tab === "employees") return `This removes ${record.name}. Leave history must be cleared first.`;
  if (tab === "leaves") return `This removes the ${record.type} record for ${employeeById(data, record.employeeId)?.name || "this employee"}.`;
  return `This removes ${record.name}.`;
}

function countCopy(tab, shown, data) {
  const total = tab === "employees" ? data.employees.length : tab === "leaves" ? data.leaves.length : data.activities.length;
  const noun = tab === "leaves" ? "leave records" : tab;
  return `Showing ${shown} of ${total} ${noun}.`;
}

function exportRegister(tab, rows, data) {
  const table = tab === "employees"
    ? [["Code", "Name", "Email", "Phone", "Join date", "Role", "Status"], ...rows.map((row) => [row.code, row.name, row.email, row.phone, row.join, row.role, row.status])]
    : tab === "leaves"
      ? [["Employee", "Date", "Type", "Description"], ...rows.map((row) => [employeeById(data, row.employeeId)?.name || "", row.date, row.type, row.description])]
      : [["Name", "Category", "Date", "Description", "Status"], ...rows.map((row) => [row.name, row.category, row.date, row.description, row.status])];
  const csv = table.map((line) => line.map(csvCell).join(",")).join("\r\n");
  const name = `NeonLabz_HRM_${tab}_${todayISO()}.csv`;
  downloadText(name, `\uFEFF${csv}`, "text/csv;charset=utf-8");
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`;
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

function departmentsOf(data) {
  return Array.isArray(data?.departments) ? data.departments : [];
}

function departmentLabel(data, id) {
  return departmentsOf(data).find((item) => item.id === id)?.name || "";
}

function Modal({ children }) {
  return createPortal(
    <div className="modal-backdrop">
      <div>{children}</div>
    </div>,
    document.body
  );
}

function PasswordField({ label, value, onChange, placeholder, required }) {
  const [visible, setVisible] = useState(false);
  return (
    <label>
      {label}
      <span className="secret-field">
        <input type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="new-password" placeholder={placeholder} required={required} />
        <button className="secret-toggle" type="button" aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} onClick={() => setVisible((current) => !current)}>
          <EyeIcon off={visible} />
        </button>
      </span>
    </label>
  );
}

function EyeIcon({ off = false }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {off ? <path d="M4 20 20 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : null}
    </svg>
  );
}

function signInNote(draft, data) {
  const department = departmentsOf(data).find((item) => item.id === draft.department);
  if (!department) return "Add a department before adding people.";
  if (draft.memberType === "admin") {
    const username = draft.username || nextUsername(loadUsers(), department.prefix);
    return `Admin of ${department.name}. Signs in as ${username}. Set the password to share.`;
  }
  return `Team member of ${department.name}. Signs in as ${draft.code || nextTeamCode(data)}. Set the password to share.`;
}

function staffId(employee) {
  if (!employee) return "";
  if (employee.memberType === "admin") return employee.username || "";
  return employee.code || "";
}

function initials(name) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}
