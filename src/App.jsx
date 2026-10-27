import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ROLE_META,
  RECORDS,
  accessFor,
  deleteUser,
  findNav,
  loadUsers,
  navForRole,
  roleFromUsername,
  updateUser,
  verifyPassword,
} from "./crm.js";
import { MarketingTasksWorkspace, MarketingWorkspace, ProjectMaintenance } from "./Marketing.jsx";
import { ProjectsWorkspace } from "./Projects.jsx";
import { TeamWorkspace } from "./Team.jsx";
import { ClientsWorkspace } from "./Clients.jsx";
import { IssuesWorkspace, MarketingIssuesWorkspace } from "./Issues.jsx";
import { TasksWorkspace } from "./Tasks.jsx";
import { CeoPackages, SalesWorkspace } from "./Sales.jsx";
import { CeoSalesWorkspace } from "./CeoSales.jsx";
import { HrmsWorkspace } from "./Hrms.jsx";
import { FinanceWorkspace } from "./Finance.jsx";
import { ReportsWorkspace } from "./Reports.jsx";
import { CeoDashboard, MdDashboard, PmDashboard } from "./Dashboards.jsx";
import { EmployeeWorkspace } from "./Employee.jsx";
import { loadHrms } from "./hrms.js";
import { formatMoney, loadSales, OPEN_SALES_APPROVAL } from "./sales.js";
import { loadProjects } from "./projects.js";
import { loadMarketing } from "./marketing.js";
import { dataOwner, setViewingAccount } from "./scope.js";
import { api, readSession, writeSession } from "./api.js";
import { flushStores, getUsers, hydrateFromApi, setUsers } from "./storage.js";
import { BackButton } from "./BackButton.jsx";
import { NotificationBell } from "./Notifications.jsx";
import neonLogo from "./assets/neonlabz-logo.png";
import neonMark from "./assets/neonlabz-mark.png";

export default function App() {
  const [session, setSession] = useState(readSession);
  const [authView, setAuthView] = useState("login");
  const [ready, setReady] = useState(!readSession());
  const [bootError, setBootError] = useState("");

  useEffect(() => {
    const current = readSession();
    if (!current?.token) {
      if (current) {
        writeSession(null);
        setSession(null);
      }
      setReady(true);
      return undefined;
    }
    let cancelled = false;
    const waits = [0, 400, 800, 1600, 2500];

    async function boot() {
      let lastError = null;
      for (const wait of waits) {
        if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
        if (cancelled) return;
        try {
          const data = await hydrateFromApi();
          if (cancelled) return;
          if (data?.user) {
            setSession((current) => (
              current
                ? { ...current, mustChangePassword: Boolean(data.user.mustChangePassword) }
                : current
            ));
          }
          setBootError("");
          setReady(true);
          return;
        } catch (error) {
          lastError = error;
          if (error?.status === 401) {
            writeSession(null);
            setSession(null);
            setBootError(error.message || "Sign in again.");
            setReady(true);
            return;
          }
        }
      }
      if (cancelled) return;
      setBootError(lastError?.message || "Could not reach the server.");
      setReady(true);
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function persist() {
      flushStores();
    }
    window.addEventListener("beforeunload", persist);
    return () => window.removeEventListener("beforeunload", persist);
  }, []);

  function signIn(user, token) {
    const next = {
      username: user.username,
      role: roleFromUsername(user.username),
      token,
      mustChangePassword: Boolean(user.mustChangePassword),
    };
    writeSession(next);
    setSession(next);
    setReady(true);
  }

  function signOut() {
    api("/api/auth/logout", { method: "POST" }).catch(() => {});
    writeSession(null);
    setSession(null);
    setAuthView("login");
    setReady(true);
  }

  if (!ready) {
    return (
      <AuthLayout title="Neon Labz CRM" lede="Loading your workspace.">
        <p className="hint">Connecting to the server…</p>
      </AuthLayout>
    );
  }

  if (!session) {
    return authView === "forgot" ? (
      <ForgotPassword onBack={() => setAuthView("login")} />
    ) : (
      <Login onSuccess={signIn} onForgot={() => setAuthView("forgot")} bootError={bootError} />
    );
  }

  return (
    <>
      <Shell session={session} onSignOut={signOut} />
      {session.mustChangePassword ? (
        <ChangePassword
          username={session.username}
          required
          onChanged={() => setSession((current) => ({ ...current, mustChangePassword: false }))}
        />
      ) : null}
    </>
  );
}

function Login({ onSuccess, onForgot, bootError = "" }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(bootError);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const value = username.trim().toUpperCase();
    const pattern = roleFromUsername(value);
    if (!pattern) {
      setError("Use the username issued for your role, such as PM001 or EMP001.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: { username: value, password: password.trim() },
      });
      writeSession({
        username: data.user.username,
        role: data.user.role || pattern,
        token: data.token,
        mustChangePassword: Boolean(data.user.mustChangePassword),
      });
      try {
        await hydrateFromApi();
      } catch {
        // Workspace loads from cache; the next refresh retries the server.
      }
      onSuccess(data.user, data.token);
    } catch (err) {
      setError(err.message || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      lede={
        <>
          Use the username and password issued by the CEO.
          <br />
          There is no self-registration.
        </>
      }
    >
      <form className="form auth-form" onSubmit={submit}>
        <label>
          Username
          <span className="auth-field">
            <UserIcon />
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </span>
        </label>
        <label>
          Password
          <span className="auth-field">
            <LockIcon />
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              className="auth-eye"
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((current) => !current)}
            >
              <EyeIcon off={showPassword} />
            </button>
          </span>
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
          <ArrowRightIcon />
        </button>
        <button className="text-button auth-forgot" type="button" onClick={onForgot}>
          Forgot password?
        </button>
      </form>
    </AuthLayout>
  );
}

function ForgotPassword({ onBack }) {
  const [username, setUsername] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    if (!roleFromUsername(username)) {
      setError("Enter a company username such as SD001.");
      setSent(false);
      return;
    }
    setError("");
    setSent(true);
  }

  return (
    <AuthLayout
      title="Forgot password"
      lede="Password resets stay with the CEO. Submit your username and she will issue a new password."
    >
      <form className="form auth-form" onSubmit={submit}>
        <label>
          Username
          <span className="auth-field">
            <UserIcon />
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </span>
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        {sent ? (
          <p className="form-note">
            Request received for {username.trim().toUpperCase()}. The CEO will share a new password with you.
          </p>
        ) : null}
        <button className="auth-submit" type="submit">
          Request reset
        </button>
        <BackButton onClick={onBack} label="Back to sign in" />
      </form>
    </AuthLayout>
  );
}

function AuthLayout({ title, lede, children }) {
  return (
    <main className="auth">
      <section className="auth-card">
        <img className="auth-logo" src={neonLogo} alt="NeonLabz" />
        <h2>{title}</h2>
        <p className="lede">{lede}</p>
        {children}
      </section>
    </main>
  );
}

function accountsForPage(pageId, users) {
  const active = users.filter((user) => user.active && user.role !== "ceo" && user.role !== "employee");
  if (pageId === "overview" || pageId === "pm-overview" || pageId === "marketing-overview") return [];
  if (pageId === "projects") return active.filter((user) => user.role === "pm");
  if (pageId === "marketing") return active.filter((user) => user.role === "marketing");
  if (pageId === "sales" || pageId.startsWith("sales-")) return active.filter((user) => user.role === "sales");
  if (pageId === "ceo-sales" || pageId.startsWith("ceo-sales-")) return [];
  if (pageId === "overview") return active;
  return [];
}

function Shell({ session, onSignOut }) {
  const role = ROLE_META[session.role];
  const items = useMemo(() => navForRole(session.role), [session.role]);
  const accounts = useMemo(() => loadUsers().filter((user) => user.active && user.role !== "ceo" && user.role !== "employee"), []);
  const [history, setHistory] = useState([role.home]);
  const [viewId, setViewId] = useState("");
  const [pageKey, setPageKey] = useState(0);
  const [openGroup, setOpenGroup] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  const page = history[history.length - 1];
  const current = findNav(page) ?? items[0];
  const access = accessFor(session.role, current.id);
  const pageAccounts = session.role === "ceo" ? accountsForPage(current.id, accounts) : [];
  const selectedAccount = pageAccounts.some((user) => user.username === viewId) ? viewId : (pageAccounts[0]?.username || "");
  const ownRecords = current.parentId === "own-projects";
  if (session.role === "ceo") setViewingAccount(ownRecords ? session.username : selectedAccount);
  else setViewingAccount("");

  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    function sync() {
      setNarrow(query.matches);
      if (!query.matches) setMenuOpen(false);
    }
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onKey(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    document.body.classList.add("nav-locked");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("nav-locked");
    };
  }, [menuOpen]);

  useEffect(() => {
    if (session.role !== "ceo") return undefined;
    function onOpen() {
      setHistory((currentHistory) => (
        currentHistory[currentHistory.length - 1] === "ceo-sales" ? currentHistory : [...currentHistory, "ceo-sales"]
      ));
    }
    window.addEventListener(OPEN_SALES_APPROVAL, onOpen);
    return () => window.removeEventListener(OPEN_SALES_APPROVAL, onOpen);
  }, [session.role]);

  function openPage(id, keepMenu = false) {
    setHistory((currentHistory) => (currentHistory[currentHistory.length - 1] === id ? currentHistory : [...currentHistory, id]));
    if (id === page) setPageKey((value) => value + 1);
    if (!keepMenu) setMenuOpen(false);
  }

  function goBack() {
    const nextHistory = history.length > 1 ? history.slice(0, -1) : history;
    const destination = findNav(nextHistory[nextHistory.length - 1]);
    if (destination?.parentId !== "own-projects") setOpenGroup("");
    setHistory(nextHistory);
  }

  function toggleGroup(item) {
    if (openGroup === item.id) {
      setOpenGroup("");
      return;
    }
    setOpenGroup(item.id);
    if (!item.children.some((child) => child.id === current.id)) openPage(item.children[0].id, true);
  }

  return (
    <div className={menuOpen ? "shell menu-open" : "shell"}>
      {menuOpen ? <button className="nav-scrim" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} /> : null}
      <aside className="sidebar" id="app-sidebar" aria-hidden={narrow && !menuOpen} inert={narrow && !menuOpen ? true : undefined}>
        <div className="sidebar-brand">
          <div className="sidebar-lockup">
            <img className="sidebar-mark" src={neonMark} alt="" />
            <span className="sidebar-wordmark">NeonLabz<i>.</i></span>
          </div>
          <button className="sidebar-close" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
            <CloseMenuIcon />
          </button>
        </div>
        <div className="who">
          <span className="avatar">{session.username.slice(0, 2)}</span>
          <div>
            <strong>{session.username}</strong>
            <small>{role.label}</small>
          </div>
        </div>
        <nav>
          {items.map((item) => {
            const childOpen = item.children?.some((child) => child.id === current.id);
            const expanded = item.children && openGroup === item.id;
            return (
              <div key={item.id} className={item.children ? "nav-group" : undefined}>
                <button
                  type="button"
                  className={item.id === current.id || childOpen ? "nav-item active" : "nav-item"}
                  aria-expanded={item.children ? expanded : undefined}
                  onClick={() => (item.children ? toggleGroup(item) : (setOpenGroup(""), openPage(item.id)))}
                >
                  <NavGlyph name={navIconFor(item.id)} />
                  <span>{item.label}</span>
                </button>
                {expanded ? (
                  <div className="nav-sub">
                    {item.children.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        className={child.id === current.id ? "nav-item sub active" : "nav-item sub"}
                        onClick={() => openPage(child.id)}
                      >
                        <NavGlyph name={navIconFor(child.id)} />
                        <span>{child.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-actions">
          <button className="sign-out" type="button" onClick={() => { setMenuOpen(false); setChangingPassword(true); }}>
            <LockIcon />
            Change password
          </button>
          <button className="sign-out" type="button" onClick={onSignOut}>
            <LogoutIcon />
            Sign out
          </button>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="nav-toggle"
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="app-sidebar"
              onClick={() => setMenuOpen((value) => !value)}
            >
              <MenuIcon />
            </button>
            {history.length > 1 ? <BackButton onClick={goBack} label="Back" /> : null}
            <div>
              <h1>{current.label}</h1>
            </div>
          </div>
          <div className="topbar-tools">
            <NotificationBell />
            {pageAccounts.length ? (
              <label className="owner-filter">
                Account
                <select value={selectedAccount} onChange={(event) => setViewId(event.target.value)}>
                  {pageAccounts.map((user) => (
                    <option key={user.username} value={user.username}>{user.username}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {session.role !== "employee" && current.id !== "overview" && current.id !== "users" && current.id !== "ceo-sales" && current.parentId !== "ceo-sales" && !PLACEHOLDER_PAGES[current.id] ? (
              <span className={access === "full" ? "pill full" : "pill view"}>
                {access === "full" ? "Full access" : "Overview only"}
              </span>
            ) : null}
          </div>
        </header>
        <div className="content">
          <PageView
            key={`${current.id}:${selectedAccount}:${pageKey}`}
            pageId={current.id}
            access={access}
            ceoUsername={session.username}
          />
        </div>
      </section>
      {changingPassword && !session.mustChangePassword ? (
        <ChangePassword username={session.username} onClose={() => setChangingPassword(false)} />
      ) : null}
    </div>
  );
}

function ChangePassword({ username, onClose, onChanged, required = false }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (nextPassword !== confirm) {
      setError("New passwords do not match.");
      setSaved(false);
      return;
    }
    try {
      await api("/api/auth/password", {
        method: "POST",
        body: { currentPassword, nextPassword },
      });
      setUsers(getUsers().map((user) => (
        user.username === username
          ? { ...user, password: "", passwordSource: "updated", passwordUpdatedAt: new Date().toISOString(), mustChangePassword: false }
          : user
      )));
      const current = readSession();
      if (current) writeSession({ ...current, mustChangePassword: false });
      onChanged?.();
      setError("");
      setSaved(true);
      setCurrentPassword("");
      setNextPassword("");
      setConfirm("");
    } catch (err) {
      setError(err.message || "Could not update the password.");
      setSaved(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <h2 id="password-title">Change password</h2>
        <p className="lede">
          {required
            ? "Set a new password of at least 8 characters before using the CRM. The issued password cannot be used after this."
            : "The new password is stored as a hash and cannot be viewed later."}
        </p>
        <label>
          Current password
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            value={nextPassword}
            onChange={(event) => setNextPassword(event.target.value)}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        {saved ? <p className="form-note">Password updated. It stays hidden.</p> : null}
        <div className="modal-actions">
          <button className="primary" type="submit">
            Save password
          </button>
          {required || !onClose ? null : (
            <button className="ghost" type="button" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function accessCopy(role, pageId, access) {
  if (pageId === "overview") {
    return "A summary of every CEO section, including payments waiting for approval.";
  }
  if (pageId === "pm-overview") {
    return "A summary of projects, tasks, issues, clients, packages, reports, and the team.";
  }
  if (pageId === "marketing-overview") {
    return "A summary of info documents, content plans, reports, and brands.";
  }
  if (pageId === "users") {
    return "Usernames issued in HRMS for admins and team members. Passwords are hashed and cannot be viewed. Issue a new password if someone is locked out.";
  }
  if (pageId === "hrms") {
    return "Add departments, then add each person as an admin or a team member and set their password.";
  }
  if (pageId === "finance") {
    return "Payroll, expenses, and revenue. Paid payroll is included with expenses as salary.";
  }
  if (pageId === "marketing-projects") {
    return "Marketing projects you created and marketing or Both projects from the project manager. Add milestones and employees here. Track progress on Tasks.";
  }
  if (pageId === "marketing-tasks") {
    return "Open a project, then a milestone, then an employee board. Move checked work into Done. When every task on that milestone is in Done, the milestone is completed.";
  }
  if (pageId === "marketing-issues") {
    return "Open issues on the marketing side, who they are assigned to, and how far each one has moved.";
  }
  if (pageId === "marketing" && access === "full") {
    return "Client info documents, content plans, and reports for the marketing team.";
  }
  if (pageId === "marketing") {
    return role === "pm"
      ? "View only. Info documents, content plans, and reports recorded by marketing admins."
      : "View only. Open Projects to monitor marketing-admin projects, milestones, assigned employees, due dates, and task progress.";
  }
  if (pageId === "own-project-list") {
    return "Your projects, sprints, and milestones. Only this account can view or edit them.";
  }
  if (pageId === "own-leads") {
    return "Your leads, call outcomes, and follow-ups. They stay on this account, separate from the sales department.";
  }
  if (pageId === "own-clients") {
    return "Your clients. Other departments cannot open them.";
  }
  if (pageId === "own-marketing") {
    return "Marketing records for your projects. They stay separate from the marketing department.";
  }
  if (pageId === "own-payments") {
    return "Payments for your projects. They stay separate from the sales department.";
  }
  if (pageId === "projects" && role === "ceo") {
    return "View only. Projects, quotations, sprints, milestones, and reports recorded by the project manager.";
  }
  if (pageId === "projects" && access === "full") {
    return "Projects created for approved clients. Add milestones and employees on the Milestones tab. Quotations lists sales quotations and the promised packages.";
  }
  if (pageId === "team") {
    return "View only. Departments and employees registered by the CEO.";
  }
  if (pageId === "clients") {
    return "Clients with a CEO-approved payment. Add the main person, assigned person, and contact details. Projects are managed on the Projects tab.";
  }
  if (pageId === "issues") {
    return "Open issues, who they are assigned to, and how far each one has moved.";
  }
  if (pageId === "task") {
    return "Open a project, then a milestone, then an employee. Move checked work into Done. When every task on that milestone is in Done, the milestone is completed.";
  }
  if (pageId === "employee-home") {
    return "Your projects, open tasks, deadlines, and recent completion.";
  }
  if (pageId === "employee-projects") {
    return "Projects appear after a manager assigns you to a milestone. Open a project to move your tasks through To Do, In-Progress, and Completed.";
  }
  if (pageId === "employee-tasks") {
    return "Every task assigned to you, across all of your projects.";
  }
  if (pageId === "employee-productivity") {
    return "Your own completed work for the last 7 days, month, or year.";
  }
  if (pageId === "employee-activity") {
    return "The Kanban moves you made on your boards.";
  }
  if (pageId === "sales-overview") {
    return "Today’s mission, monthly target, confirmed collections, call performance, and follow-ups due.";
  }
  if (pageId === "sales-sample") {
    return "Converted leads are listed as clients. Record the promised package so payments can use that quotation.";
  }
  if (pageId === "sales-payments") {
    return "Choose a converted client. The quotation is selected automatically. Enter the amount received. The CEO must approve it before it is counted as a collection.";
  }
  if (pageId === "sales-follow") {
    return "Lead register, call outcomes, and scheduled follow-ups. Converted leads become clients with a client ID under Quotations.";
  }
  if (pageId === "packages") {
    return "View packages created by the CEO. Packages cannot be added or edited here.";
  }
  if (pageId === "ceo-packages") {
    return "Add, view, and delete packages, then prepare a quotation and download the invoice for any company project.";
  }
  if (pageId === "reports") {
    return "SRS documents, proposals, and demo videos. Each one is written by hand for a registered project.";
  }
  if (pageId === "sales-packages") {
    return "View only. The CEO maintains the service packages used in quotations.";
  }
  if (pageId === "sales") {
    return "View only. The project manager records quotations. The sales admin manages payments and follow-ups.";
  }
  if (PLACEHOLDER_PAGES[pageId]) {
    return "This section is in the sidebar for now. The contents will be added when you define them.";
  }
  if (access === "full") {
    return "Full access to this department.";
  }
  if (role === "ceo") {
    return "Overview only. Department details cannot be edited from the CEO account.";
  }
  return "View only. This department is managed by its own team.";
}

function PageView({ pageId, access, ceoUsername }) {
  if (pageId === "overview") return <CeoDashboard />;
  if (pageId === "pm-overview") return <PmDashboard />;
  if (pageId === "marketing-overview") return <MdDashboard />;
  if (pageId === "users") return <UserManagement ceoUsername={ceoUsername} />;
  if (pageId === "hrms") return <HrmsWorkspace />;
  if (pageId === "finance") return <FinanceWorkspace />;
  if (pageId === "marketing-projects") return <ProjectMaintenance canEdit={access === "full"} />;
  if (pageId === "marketing-tasks") return <MarketingTasksWorkspace canEdit={access === "full"} />;
  if (pageId === "marketing-issues") return <MarketingIssuesWorkspace />;
  if (pageId === "marketing") return <MarketingWorkspace access={access} />;
  if (pageId === "own-project-list") {
    return <ProjectsWorkspace access="full" username={ceoUsername} showListTab showQuotations={false} showSalesFeed={false} />;
  }
  if (pageId === "own-leads") {
    return <SalesWorkspace access="full" username={ceoUsername} section="follow" personal />;
  }
  if (pageId === "own-clients") return <ClientsWorkspace />;
  if (pageId === "own-marketing") return <MarketingWorkspace access="full" />;
  if (pageId === "own-payments") return <SalesWorkspace access="full" username={ceoUsername} section="payments" paymentsSource="own" />;
  if (pageId === "projects") return <ProjectsWorkspace access={access} username={ceoUsername} />;
  if (pageId === "team") return <TeamWorkspace />;
  if (pageId === "clients") return <ClientsWorkspace />;
  if (pageId === "issues") return <IssuesWorkspace />;
  if (pageId === "task") return <TasksWorkspace />;
  if (pageId === "employee-home") return <EmployeeWorkspace page="dashboard" />;
  if (pageId === "employee-projects") return <EmployeeWorkspace page="projects" />;
  if (pageId === "employee-tasks") return <EmployeeWorkspace page="tasks" />;
  if (pageId === "employee-productivity") return <EmployeeWorkspace page="productivity" />;
  if (pageId === "employee-activity") return <EmployeeWorkspace page="activity" />;
  if (pageId === "sales") return <SalesWorkspace access={access} username={ceoUsername} />;
  if (pageId === "ceo-sales" || pageId.startsWith("ceo-sales-")) {
    return <CeoSalesWorkspace initialTab={pageId === "ceo-sales" ? "overview" : pageId.replace("ceo-sales-", "")} />;
  }
  if (pageId === "sales-overview") return <SalesWorkspace access={access} username={ceoUsername} section="overview" />;
  if (pageId === "sales-sample") return <SalesWorkspace access={access} username={ceoUsername} section="sample" />;
  if (pageId === "sales-payments") return <SalesWorkspace access={access} username={ceoUsername} section="payments" />;
  if (pageId === "sales-follow") return <SalesWorkspace access={access} username={ceoUsername} section="follow" />;
  if (pageId === "ceo-packages") return <CeoPackages username={ceoUsername} />;
  if (pageId === "packages" || pageId === "sales-packages") return <SalesWorkspace access={access} username={ceoUsername} section="packages" />;
  if (pageId === "reports") return <ReportsWorkspace />;
  if (PLACEHOLDER_PAGES[pageId]) return <SectionPlaceholder title={PLACEHOLDER_PAGES[pageId]} />;
  return <Department pageId={pageId} access={access} />;
}

const PLACEHOLDER_PAGES = {};

function UserManagement({ ceoUsername }) {
  const [revision, setRevision] = useState(0);
  const users = loadUsers();
  const hrms = loadHrms();
  const employees = hrms.employees;

  function refresh() {
    setRevision((value) => value + 1);
  }

  return (
    <div className="stack" key={revision}>
      <UserGroup
        title="Chief Executive Officer"
        rows={users.filter((user) => user.role === "ceo")}
        ceoUsername={ceoUsername}
        onChanged={refresh}
      />
      {hrms.departments.length === 0 ? (
        <p className="empty-copy">No departments yet. Add a department in HRMS, then add an admin or a team member and set a password.</p>
      ) : hrms.departments.map((department) => (
        <AdminAccounts
          key={department.id}
          department={department}
          employees={employees.filter((employee) => employee.department === department.id)}
          users={users}
          ceoUsername={ceoUsername}
          onChanged={refresh}
        />
      ))}
    </div>
  );
}

function loginName(employee) {
  if (employee.memberType === "admin") return employee.username || "";
  return employee.code || employee.username || "";
}

function AdminAccounts({ department, employees, users, ceoUsername, onChanged }) {
  const [editing, setEditing] = useState(null);
  const rows = [...employees].sort((a, b) => {
    if (a.memberType === b.memberType) return a.name.localeCompare(b.name);
    return a.memberType === "admin" ? -1 : 1;
  });
  return (
    <article className="panel">
      <h2>{department.name}</h2>
      {rows.length === 0 ? (
        <p className="empty-copy">No employees in this department. Add an admin or a team member in HRMS to issue a username and password.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Access</th>
              <th>Username</th>
              <th>Password</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((employee) => {
              const username = loginName(employee);
              const account = users.find((user) => user.username === username);
              return (
                <tr key={employee.id}>
                  <td>{employee.name}</td>
                  <td>{employee.memberType === "admin" ? "Admin" : "Team member"}</td>
                  <td><code>{username || "—"}</code></td>
                  <td>{account ? <span className="password-mask" aria-label="Password hidden">••••••</span> : "—"}</td>
                  <td>
                    <span className={account?.active ? "account-status active" : "account-status inactive"}>
                      {account ? (account.active ? "Active" : "Inactive") : "Password not set"}
                    </span>
                  </td>
                  <td>
                    {username ? (
                      <div className="icon-actions">
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={account ? `Edit ${username}` : `Set password for ${username}`}
                          title={account ? "Issue a new password" : "Set password so this person can sign in"}
                          onClick={() => setEditing(account || { username, role: roleFromUsername(username) || department.role, active: true, needsPassword: true })}
                        >
                          <EditIcon />
                        </button>
                      </div>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {editing ? (
        <EditUserDialog
          user={editing}
          ceoUsername={ceoUsername}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
    </article>
  );
}

function UserGroup({ title, rows, ceoUsername, onChanged }) {
  return (
    <article className="panel">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="empty-copy">No accounts in this department yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((user) => (
              <UserRow key={user.username} user={user} ceoUsername={ceoUsername} onChanged={onChanged} />
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

function UserRow({ user, ceoUsername, onChanged }) {
  const [dialog, setDialog] = useState(null);

  return (
    <>
      <tr>
        <td>
          <code>{user.username}</code>
        </td>
        <td>
          <span className={user.active ? "account-status active" : "account-status inactive"}>
            {user.active ? "Active" : "Inactive"}
          </span>
        </td>
        <td>
          <div className="icon-actions">
            <button
              className="icon-button"
              type="button"
              aria-label={`Edit ${user.username}`}
              title="Issue a new password"
              onClick={() => setDialog("edit")}
            >
              <EditIcon />
            </button>
            {user.role === "ceo" ? null : (
              <button
                className="icon-button danger"
                type="button"
                aria-label={`Delete ${user.username}`}
                title="Delete"
                onClick={() => setDialog("delete")}
              >
                <DeleteIcon />
              </button>
            )}
          </div>
        </td>
      </tr>
      {dialog === "edit" ? (
        <EditUserDialog
          user={user}
          ceoUsername={ceoUsername}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            onChanged();
          }}
        />
      ) : null}
      {dialog === "delete" ? (
        <DeleteUserDialog
          user={user}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            setDialog(null);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

function EditUserDialog({ user, ceoUsername, onClose, onSaved }) {
  const [verified, setVerified] = useState(false);
  const [ceoPassword, setCeoPassword] = useState("");
  const [active, setActive] = useState(user.active);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  async function verify(event) {
    event.preventDefault();
    const result = await verifyPassword(ceoUsername, ceoPassword);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    setCeoPassword("");
    setVerified(true);
  }

  async function submit(event) {
    event.preventDefault();
    const creating = Boolean(user.needsPassword);
    if (creating && password.trim().length < 8) {
      setError("Use at least 8 characters for the password.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    const result = await updateUser(user.username, {
      password,
      active: user.role === "ceo" ? true : active,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  if (!verified) {
    return (
      <Modal>
        <form className="modal" onSubmit={verify}>
          <h2>Confirm your password</h2>
          <p className="lede">Enter your password to edit the login for {user.username}.</p>
          <label>
            Your password
            <input
              type="password"
              value={ceoPassword}
              onChange={(event) => setCeoPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="modal-actions">
            <button className="primary" type="submit">
              Verify
            </button>
            <button className="ghost" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal>
      <form className="modal" onSubmit={submit}>
        <h2>{user.needsPassword ? `Set password for ${user.username}` : `Edit ${user.username}`}</h2>
        <p className="lede">
          {user.needsPassword
            ? "This person is listed in HRMS but has no login yet. Set a password of at least 8 characters so they can sign in."
            : "Update the account status or issue a new password of at least 8 characters. The current password cannot be viewed."}
        </p>
        {user.role === "ceo" ? null : (
          <label>
            Status
            <select value={active ? "active" : "inactive"} onChange={(event) => setActive(event.target.value === "active")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        )}
        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={user.needsPassword ? "At least 8 characters" : "Leave blank to keep the current password"}
            required={Boolean(user.needsPassword)}
            minLength={user.needsPassword ? 8 : undefined}
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="Repeat the new password"
            required={Boolean(user.needsPassword)}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="primary" type="submit">
            Save changes
          </button>
          <button className="ghost" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteUserDialog({ user, onClose, onDeleted }) {
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState("");

  function submit(event) {
    event.preventDefault();
    if (phrase.trim().toLowerCase() !== "delete") {
      setError("Type delete to confirm.");
      return;
    }
    const result = deleteUser(user.username);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDeleted();
  }

  return (
    <Modal>
      <form className="modal" onSubmit={submit}>
        <h2>Delete {user.username}</h2>
        <p className="lede">This removes the account. Type delete to confirm.</p>
        <label>
          Confirmation
          <input
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            placeholder="delete"
            aria-label="Type delete to confirm"
            autoComplete="off"
            required
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="danger-button" type="submit">
            Delete user
          </button>
          <button className="ghost" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ children }) {
  return createPortal(<div className="modal-backdrop">{children}</div>, document.body);
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseMenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon({ off = false }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {off ? <path d="M4 20 20 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : null}
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5.5 19c1.2-3.2 3.4-4.8 6.5-4.8s5.3 1.6 6.5 4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="11" width="12" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 12h11M17 8l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function navIconFor(id) {
  if (id.includes("overview") || id === "employee-home") return "home";
  if (id.includes("task")) return "check";
  if (id.includes("issue")) return "alert";
  if (id.includes("marketing")) return "chart";
  if (id.includes("client") || id === "hrms" || id === "users" || id === "team") return "users";
  if (id.includes("package")) return "box";
  if (id.includes("sales") || id.includes("follow") || id.includes("lead")) return "trend";
  if (id.includes("payment") || id === "finance") return "card";
  if (id.includes("report") || id.includes("sample")) return "file";
  if (id.includes("productivity")) return "chart";
  if (id.includes("activity")) return "clock";
  return "folder";
}

function NavGlyph({ name }) {
  if (name === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 11 12 4.5 19.5 11v8.5H14v-5h-4v5H4.5V11Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "check") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4.5" y="4.5" width="15" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="m8 12 2.6 2.6L16.5 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "alert") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4.5 21 19.5H3L12 4.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 10v4.5M12 17.2v.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "chart") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19V11M10 19V5M15 19v-6M20 19V8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "users") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4 19c.8-3.2 2.6-4.8 5-4.8s4.2 1.6 5 4.8M16 9.2a2.6 2.6 0 1 0 0-1M20.2 19c-.6-2.6-1.8-4-3.6-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "box") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 8.5 12 4.5l7.5 4v11L12 19.5l-7.5-4v-11Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 4.5v15M4.5 8.5 12 12.5l7.5-4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (name === "trend") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 16.5 10 10l4 4 6-7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 6.5h5v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "card") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="6" width="17" height="12" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3.5 10h17M7 14h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "file") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4.5h7l5 5V19.5H7V4.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M14 4.5V10h5.5M9.5 13.5h5M9.5 16.5h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "clock") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 8.5V12l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 8h6.2l1.8 2H20.5v9.5h-17V8Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 16.5V20h3.5L19 8.5 15.5 5 4 16.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M13.5 7 17 10.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 7V5h6v2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M8 7l1 12h6l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function Overview() {
  const owner = dataOwner();
  const account = loadUsers().find((user) => user.username === owner);
  if (!account) return <p className="empty-copy">Choose an account.</p>;
  if (account.role === "pm") {
    const projects = loadProjects().projects.filter((project) => !project.archived);
    const quotes = loadSales().quotes;
    return (
      <div className="stack">
        <DepartmentTable title={`${owner} projects`} rows={projects.map((project) => ({
          id: project.id,
          title: project.name || project.client || "Project",
          owner,
          status: project.status,
          detail: [project.code, project.client].filter(Boolean).join(" · "),
        }))} access="view" />
        <DepartmentTable title={`${owner} quotations`} rows={quotes.map((quote) => ({
          id: quote.id,
          title: `${quote.number} · ${quote.client}`,
          owner,
          status: "Quotation",
          detail: formatMoney(quote.total),
        }))} access="view" />
      </div>
    );
  }
  if (account.role === "marketing") {
    const docs = loadMarketing().clients;
    return (
      <DepartmentTable title={`${owner} marketing`} rows={docs.map((doc) => ({
        id: doc.projectId || doc.id,
        title: doc.brandName || "Info document",
        owner,
        status: doc.origin || "Marketing",
        detail: doc.industry || "",
      }))} access="view" />
    );
  }
  const sales = loadSales();
  return (
    <div className="stack">
      <DepartmentTable title={`${owner} payments`} rows={sales.payments.map((payment) => ({
        id: payment.id,
        title: formatMoney(payment.amount),
        owner,
        status: payment.status,
        detail: `${payment.date} · ${payment.type}`,
      }))} access="view" />
      <DepartmentTable title={`${owner} follow-ups`} rows={(sales.followUps || []).map((item) => ({
        id: item.id,
        title: item.name,
        owner,
        status: item.status,
        detail: item.contact,
      }))} access="view" />
    </div>
  );
}

function SectionPlaceholder({ title }) {
  return (
    <article className="panel empty-panel">
      <h2>{title}</h2>
      <p>This section is in the sidebar only for now. The contents will be added when you define them.</p>
    </article>
  );
}

function Department({ pageId, access }) {
  const [rows, setRows] = useState(RECORDS[pageId]);
  const [draft, setDraft] = useState("");

  function addRecord(event) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setRows((current) => [
      {
        id: `NEW-${current.length + 1}`,
        title,
        owner: "You",
        status: "New",
        detail: "Added in this preview",
      },
      ...current,
    ]);
    setDraft("");
  }

  function markUpdated(id) {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, status: "Updated", detail: "Edited in this preview" } : row
      )
    );
  }

  return (
    <div className="stack">
      {access === "full" ? (
        <form className="composer" onSubmit={addRecord}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a record title"
            aria-label="New record title"
          />
          <button className="primary" type="submit">
            Add record
          </button>
        </form>
      ) : (
        <p className="banner">Editing is turned off on this page. You can review the records only.</p>
      )}
      <DepartmentTable rows={rows} access={access} onEdit={markUpdated} />
    </div>
  );
}

function DepartmentTable({ title, rows, access, onEdit }) {
  return (
    <article className="panel">
      {title ? <h2>{title}</h2> : null}
      {rows.length === 0 ? <p className="empty-copy">No records yet.</p> : (
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Record</th>
            <th>Owner</th>
            <th>Status</th>
            <th>Detail</th>
            {access === "full" ? <th>Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.title}</td>
              <td>{row.owner}</td>
              <td>
                <span className="status">{row.status}</span>
              </td>
              <td>{row.detail}</td>
              {access === "full" ? (
                <td>
                <button className="ghost" type="button" onClick={() => onEdit(row.id)}>
                  Edit
                </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </article>
  );
}
