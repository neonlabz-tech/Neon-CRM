import { useState } from "react";
import { formatPhone, loadHrms } from "./hrms.js";

export function TeamWorkspace() {
  const [hrms] = useState(loadHrms);
  const employees = hrms.employees;

  return (
    <div className="stack">
      {(hrms.departments || []).length === 0 ? <p className="empty-copy">No departments yet.</p> : hrms.departments.map((department) => {
        const people = employees
          .filter((employee) => employee.department === department.id)
          .sort((a, b) => a.name.localeCompare(b.name));
        return (
          <article className="panel" key={department.id}>
            <h2>{department.name}</h2>
            {people.length === 0 ? <p className="empty-copy">No employees in this department.</p> : (
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Access</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((employee) => (
                    <tr key={employee.id}>
                      <td>
                        <strong>{employee.name}</strong>
                        <br />
                        <small>{staffId(employee)}</small>
                      </td>
                      <td>{employee.email || "—"}</td>
                      <td>{employee.phone ? formatPhone(employee.phone) : "—"}</td>
                      <td>{employee.role || "—"}</td>
                      <td>{employee.memberType === "admin" ? "Admin" : "Team member"}</td>
                      <td><span className={`account-status ${employee.status === "Active" ? "active" : "inactive"}`}>{employee.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>
        );
      })}
    </div>
  );
}

function staffId(employee) {
  if (employee.memberType === "admin") return employee.username || "";
  return employee.code || "";
}
