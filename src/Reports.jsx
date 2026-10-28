import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { LetterheadDialog } from "./Letterhead.jsx";
import { loadProjects } from "./projects.js";
import {
  deleteReport,
  loadReports,
  proposalDocument,
  saveProposal,
  saveReports,
  saveSrs,
  saveVideo,
  srsDocument,
} from "./reports.js";
import { formatQuoteDate, todayISO } from "./sales.js";

const TABS = [
  ["srs", "SRS Document"],
  ["proposal", "Proposal"],
  ["video", "Demo video"],
];

export function ReportsWorkspace({ canEdit = true, projects: projectSource } = {}) {
  const [tab, setTab] = useState("srs");
  const [data, setData] = useState(loadReports);
  const projects = useMemo(
    () => (projectSource || loadProjects().projects)
      .filter((project) => String(project.name || "").trim() && !project.archived)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [projectSource]
  );

  function apply(result) {
    if (!canEdit) return "Reports cannot be edited from this account.";
    if (!result.ok) return result.error;
    const stored = saveReports(result.data);
    setData(stored);
    return "";
  }

  return (
    <div className="stack">
      <div className="subnav" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "srs" ? <SrsPanel data={data} projects={projects} apply={apply} canEdit={canEdit} /> : null}
      {tab === "proposal" ? <ProposalPanel data={data} projects={projects} apply={apply} canEdit={canEdit} /> : null}
      {tab === "video" ? <VideoPanel data={data} projects={projects} apply={apply} canEdit={canEdit} /> : null}
    </div>
  );
}

function SrsPanel({ data, projects, apply, canEdit = true }) {
  const [draft, setDraft] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState("");

  function save(event) {
    event.preventDefault();
    const message = apply(saveSrs(data, draft));
    setError(message);
    if (!message) setDraft(null);
  }

  return (
    <div className="stack">
      {canEdit ? (
        <div className="toolbar">
          <button className="primary" type="button" onClick={() => { setDraft(blankSrs(projects)); setError(""); }}>Add SRS document</button>
        </div>
      ) : null}
      {canEdit && draft ? (
        <article className="panel">
          <h2>{draft.id ? "Edit SRS document" : "Add SRS document"}</h2>
          <form className="sales-form" onSubmit={save}>
            <ProjectField projects={projects} value={draft.projectId} onChange={(projectId) => setDraft({ ...draft, projectId })} />
            <div className="sales-grid">
              <label>Document title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required maxLength={200} /></label>
              <label>Prepared for<input value={draft.preparedFor} onChange={(event) => setDraft({ ...draft, preparedFor: event.target.value })} maxLength={200} /></label>
              <label>Date<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
              <label className="span-all">Introduction<textarea value={draft.introduction} onChange={(event) => setDraft({ ...draft, introduction: event.target.value })} rows={4} /></label>
              <label className="span-all">Functional requirements<textarea value={draft.functional} onChange={(event) => setDraft({ ...draft, functional: event.target.value })} rows={5} placeholder="One requirement per line" /></label>
              <label className="span-all">Non-functional requirements<textarea value={draft.nonFunctional} onChange={(event) => setDraft({ ...draft, nonFunctional: event.target.value })} rows={4} placeholder="One requirement per line" /></label>
              <label className="span-all">Assumptions<textarea value={draft.assumptions} onChange={(event) => setDraft({ ...draft, assumptions: event.target.value })} rows={3} placeholder="One assumption per line" /></label>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="modal-actions">
              <button className="primary" type="submit">Save document</button>
              <button className="ghost" type="button" onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
            </div>
          </form>
        </article>
      ) : null}
      <RecordList
        rows={data.srs}
        projects={projects}
        empty="No SRS documents yet."
        onView={setViewing}
        onEdit={canEdit ? (record) => { setDraft(record); setError(""); } : null}
        onDelete={canEdit ? setRemoving : null}
      />
      {viewing ? (
        <LetterheadDialog
          title={viewing.title || "SRS"}
          html={srsDocument(viewing, projectName(projects, viewing.projectId))}
          fileName={viewing.title || "srs"}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {removing ? <Confirm title={`Delete ${removing.title}?`} onCancel={() => setRemoving(null)} onConfirm={() => { apply(deleteReport(data, "srs", removing.id)); setRemoving(null); }} /> : null}
    </div>
  );
}

function ProposalPanel({ data, projects, apply, canEdit = true }) {
  const [draft, setDraft] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState("");

  function save(event) {
    event.preventDefault();
    const message = apply(saveProposal(data, draft));
    setError(message);
    if (!message) setDraft(null);
  }

  function patch(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function patchRow(key, index, field, value) {
    setDraft((current) => ({
      ...current,
      [key]: current[key].map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)),
    }));
  }

  return (
    <div className="stack">
      {canEdit ? (
        <div className="toolbar">
          <button className="primary" type="button" onClick={() => { setDraft(blankProposal(projects)); setError(""); }}>Add proposal</button>
        </div>
      ) : null}
      {canEdit && draft ? (
        <article className="panel">
          <h2>{draft.id ? "Edit proposal" : "Add proposal"}</h2>
          <form className="sales-form" onSubmit={save}>
            <ProjectField projects={projects} value={draft.projectId} onChange={(projectId) => patch("projectId", projectId)} />
            <h3>1. Basic details</h3>
            <div className="sales-grid">
              <label className="span-all">Proposal title<input value={draft.title} onChange={(event) => patch("title", event.target.value)} required maxLength={200} placeholder="E-Commerce Platform & Digital Marketing Proposal" /></label>
              <label className="span-all">Subtitle<input value={draft.subtitle} onChange={(event) => patch("subtitle", event.target.value)} maxLength={300} /></label>
              <label>Prepared for<input value={draft.preparedFor} onChange={(event) => patch("preparedFor", event.target.value)} maxLength={200} /></label>
              <label>Date<input type="date" value={draft.date} onChange={(event) => patch("date", event.target.value)} /></label>
              <label>Proposal validity<input value={draft.validity} onChange={(event) => patch("validity", event.target.value)} maxLength={80} placeholder="14 days" /></label>
              <label className="span-all">Client details / company and scope<textarea value={draft.companyScope} onChange={(event) => patch("companyScope", event.target.value)} rows={3} /></label>
              <label className="span-all">Proposal document summary<textarea value={draft.summary} onChange={(event) => patch("summary", event.target.value)} rows={4} /></label>
            </div>
            <h3>2. Website and dashboards</h3>
            <div className="sales-grid">
              <label>Customer dashboard title<input value={draft.customerTitle} onChange={(event) => patch("customerTitle", event.target.value)} /></label>
              <label>Customer role<input value={draft.customerRole} onChange={(event) => patch("customerRole", event.target.value)} /></label>
              <label className="span-all">Customer features<textarea value={draft.customerFeatures} onChange={(event) => patch("customerFeatures", event.target.value)} rows={4} placeholder="One feature per line" /></label>
              <label>Admin dashboard title<input value={draft.adminTitle} onChange={(event) => patch("adminTitle", event.target.value)} /></label>
              <label>Admin role<input value={draft.adminRole} onChange={(event) => patch("adminRole", event.target.value)} /></label>
              <label className="span-all">Admin features<textarea value={draft.adminFeatures} onChange={(event) => patch("adminFeatures", event.target.value)} rows={4} placeholder="One feature per line" /></label>
            </div>
            <h3>3. Technical setup</h3>
            {draft.stack.map((row, index) => (
              <div className="sales-grid" key={`stack-${index}`}>
                <label>Layer<input value={row.layer} onChange={(event) => patchRow("stack", index, "layer", event.target.value)} /></label>
                <label>Technology<input value={row.technology} onChange={(event) => patchRow("stack", index, "technology", event.target.value)} /></label>
                <label>Purpose<input value={row.purpose} onChange={(event) => patchRow("stack", index, "purpose", event.target.value)} /></label>
              </div>
            ))}
            <button className="ghost" type="button" onClick={() => patch("stack", [...draft.stack, { layer: "", technology: "", purpose: "" }])}>Add layer</button>
            <h3>4. Marketing and branding</h3>
            {draft.brand.map((row, index) => (
              <div className="sales-grid" key={`brand-${index}`}>
                <label>Title<input value={row.title} onChange={(event) => patchRow("brand", index, "title", event.target.value)} placeholder="Tagline, brand voice, visual mood" /></label>
                <label className="span-all">Description<textarea value={row.text} onChange={(event) => patchRow("brand", index, "text", event.target.value)} rows={2} /></label>
              </div>
            ))}
            <div className="sales-grid">
              <label>Package name<input value={draft.packageName} onChange={(event) => patch("packageName", event.target.value)} placeholder="Complimentary Marketing Package" /></label>
              <label>Package investment<input value={draft.packageInvestment} onChange={(event) => patch("packageInvestment", event.target.value)} placeholder="0" /></label>
            </div>
            {draft.packageStats.map((row, index) => (
              <div className="sales-grid" key={`stat-${index}`}>
                <label>Figure<input value={row.value} onChange={(event) => patchRow("packageStats", index, "value", event.target.value)} placeholder="24" /></label>
                <label>Label<input value={row.label} onChange={(event) => patchRow("packageStats", index, "label", event.target.value)} placeholder="Social posts" /></label>
              </div>
            ))}
            <h3>5. Budget, payment and timeline</h3>
            {draft.budget.map((row, index) => (
              <div className="sales-grid" key={`budget-${index}`}>
                <label>Deliverable<input value={row.deliverable} onChange={(event) => patchRow("budget", index, "deliverable", event.target.value)} /></label>
                <label>One-time fee<input value={row.fee} onChange={(event) => patchRow("budget", index, "fee", event.target.value)} placeholder="Included" /></label>
                <label>Investment (LKR)<input value={row.amount} onChange={(event) => patchRow("budget", index, "amount", event.target.value)} /></label>
              </div>
            ))}
            <button className="ghost" type="button" onClick={() => patch("budget", [...draft.budget, { deliverable: "", fee: "", amount: "" }])}>Add deliverable</button>
            <div className="sales-grid">
              <label>Total project cost (LKR)<input value={draft.totalAmount} onChange={(event) => patch("totalAmount", event.target.value)} /></label>
              <label>Total note<input value={draft.totalNote} onChange={(event) => patch("totalNote", event.target.value)} placeholder="Taxes and third-party fees are confirmed separately." /></label>
              <label>Total duration<input value={draft.duration} onChange={(event) => patch("duration", event.target.value)} placeholder="11 weeks (2.5 months)" /></label>
              <label>Earliest start<input type="date" value={draft.startDate} onChange={(event) => patch("startDate", event.target.value)} /></label>
              <label>Production launch<input type="date" value={draft.launchDate} onChange={(event) => patch("launchDate", event.target.value)} /></label>
            </div>
            <h3>6. Scope, terms and acceptance</h3>
            <div className="sales-grid">
              <label className="span-all">Terms<textarea value={draft.terms} onChange={(event) => patch("terms", event.target.value)} rows={4} placeholder="One term per line" /></label>
              <label>Client signatory<input value={draft.clientSignName} onChange={(event) => patch("clientSignName", event.target.value)} /></label>
              <label>Client title<input value={draft.clientSignTitle} onChange={(event) => patch("clientSignTitle", event.target.value)} /></label>
              <label>Client date<input type="date" value={draft.clientSignDate} onChange={(event) => patch("clientSignDate", event.target.value)} /></label>
              <label>Neon Labz signatory<input value={draft.companySignName} onChange={(event) => patch("companySignName", event.target.value)} /></label>
              <label>Neon Labz title<input value={draft.companySignTitle} onChange={(event) => patch("companySignTitle", event.target.value)} /></label>
              <label>Neon Labz date<input type="date" value={draft.companySignDate} onChange={(event) => patch("companySignDate", event.target.value)} /></label>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="modal-actions">
              <button className="primary" type="submit">Save proposal</button>
              <button className="ghost" type="button" onClick={() => setViewing(draft)}>Preview</button>
              <button className="ghost" type="button" onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
            </div>
          </form>
        </article>
      ) : null}
      <RecordList
        rows={data.proposals}
        projects={projects}
        empty="No proposals yet."
        onView={setViewing}
        onEdit={canEdit ? (record) => { setDraft(proposalDraft(record)); setError(""); } : null}
        onDelete={canEdit ? setRemoving : null}
      />
      {viewing ? (
        <LetterheadDialog
          title={viewing.title || "Proposal"}
          html={proposalDocument(viewing)}
          fileName={viewing.title || "proposal"}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {removing ? <Confirm title={`Delete ${removing.title}?`} onCancel={() => setRemoving(null)} onConfirm={() => { apply(deleteReport(data, "proposals", removing.id)); setRemoving(null); if (viewing?.id === removing.id) setViewing(null); }} /> : null}
    </div>
  );
}

function VideoPanel({ data, projects, apply, canEdit = true }) {
  const [draft, setDraft] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState("");

  function save(event) {
    event.preventDefault();
    const message = apply(saveVideo(data, draft));
    setError(message);
    if (!message) setDraft(null);
  }

  return (
    <div className="stack">
      {canEdit ? (
        <div className="toolbar">
          <button className="primary" type="button" onClick={() => { setDraft(blankVideo(projects)); setError(""); }}>Add demo video</button>
        </div>
      ) : null}
      {canEdit && draft ? (
        <article className="panel">
          <h2>{draft.id ? "Edit demo video" : "Add demo video"}</h2>
          <form className="sales-form" onSubmit={save}>
            <ProjectField projects={projects} value={draft.projectId} onChange={(projectId) => setDraft({ ...draft, projectId })} />
            <div className="sales-grid">
              <label>Title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required maxLength={200} /></label>
              <label>Date<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label>
              <label className="span-all">Video link<input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://" /></label>
              <label className="span-all">Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={3} /></label>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="modal-actions">
              <button className="primary" type="submit">Save video</button>
              <button className="ghost" type="button" onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
            </div>
          </form>
        </article>
      ) : null}
      <article className="panel">
        {data.videos.length === 0 ? <p className="empty-copy">No demo videos yet.</p> : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Project</th>
                  <th>Date</th>
                  <th>Link</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.videos.map((video) => (
                  <tr key={video.id}>
                    <td><strong>{video.title}</strong></td>
                    <td>{projectName(projects, video.projectId)}</td>
                    <td>{formatQuoteDate(video.date)}</td>
                    <td className="cell-wrap">
                      {video.url ? <a href={video.url} target="_blank" rel="noreferrer">{video.url}</a> : "No link yet."}
                    </td>
                    <td>
                      <div className="icon-actions">
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`View ${video.title}`}
                          title="View"
                          onClick={() => setViewing(video)}
                        >
                          <EyeIcon />
                        </button>
                        {canEdit ? (
                          <button
                            className="icon-button"
                            type="button"
                            aria-label={`Edit ${video.title}`}
                            title="Edit"
                            onClick={() => { setDraft(video); setError(""); }}
                          >
                            <EditIcon />
                          </button>
                        ) : null}
                        {canEdit ? (
                          <button
                            className="icon-button danger"
                            type="button"
                            aria-label={`Delete ${video.title}`}
                            title="Delete"
                            onClick={() => setRemoving(video)}
                          >
                            <DeleteIcon />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
      {viewing ? <VideoSummary video={viewing} projects={projects} onClose={() => setViewing(null)} /> : null}
      {removing ? <Confirm title={`Delete ${removing.title}?`} onCancel={() => setRemoving(null)} onConfirm={() => { apply(deleteReport(data, "videos", removing.id)); setRemoving(null); if (viewing?.id === removing.id) setViewing(null); }} /> : null}
    </div>
  );
}

function RecordList({ rows, projects, empty, onView, onEdit, onDelete }) {
  return (
    <article className="panel">
      {rows.length === 0 ? <p className="empty-copy">{empty}</p> : (
        <div className="tablewrap">
        <table>
          <thead><tr><th>Title</th><th>Project</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.title}</strong></td>
                <td>{projectName(projects, row.projectId)}</td>
                <td>{formatQuoteDate(row.date)}</td>
                <td>
                  <div className="icon-actions">
                    <button className="ghost" type="button" onClick={() => onView(row)}>View</button>
                    {onEdit ? <button className="ghost" type="button" onClick={() => onEdit(row)}>Edit</button> : null}
                    {onDelete ? <button className="ghost" type="button" onClick={() => onDelete(row)}>Delete</button> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </article>
  );
}

function ProjectField({ projects, value, onChange }) {
  return (
    <label>
      Project
      <select value={value} onChange={(event) => onChange(event.target.value)} required>
        <option value="">{projects.length ? "Select a project" : "No projects registered yet"}</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>{project.code ? `${project.code} · ${project.name}` : project.name}</option>
        ))}
      </select>
    </label>
  );
}

function VideoSummary({ video, projects, onClose }) {
  const link = String(video.url || "").trim();
  return createPortal(
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section className="modal" role="dialog" aria-labelledby="video-summary-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="video-summary-title" className="summary-title">{video.title || "Demo video"}</h2>
        <dl className="summary-list">
          <div>
            <dt className="tone-project">Project</dt>
            <dd>{projectName(projects, video.projectId)}</dd>
          </div>
          <div>
            <dt className="tone-date">Date</dt>
            <dd>{formatQuoteDate(video.date)}</dd>
          </div>
          <div>
            <dt className="tone-link">Link</dt>
            <dd>{link ? <a href={link} target="_blank" rel="noreferrer">{link}</a> : "No link yet."}</dd>
          </div>
          <div>
            <dt className="tone-notes">Notes</dt>
            <dd>{video.notes || "No notes."}</dd>
          </div>
        </dl>
        <div className="modal-actions">
          <button className="ghost" type="button" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function Confirm({ title, onConfirm, onCancel }) {
  return (
    <article className="panel">
      <h2>{title}</h2>
      <div className="modal-actions">
        <button className="danger-button" type="button" onClick={onConfirm}>Delete</button>
        <button className="ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </article>
  );
}

function blankSrs() {
  return { id: "", projectId: "", title: "", preparedFor: "", date: todayISO(), introduction: "", functional: "", nonFunctional: "", assumptions: "" };
}

function blankProposal() {
  return {
    id: "",
    projectId: "",
    title: "",
    subtitle: "",
    preparedFor: "",
    date: todayISO(),
    companyScope: "",
    validity: "",
    summary: "",
    customerTitle: "",
    customerRole: "",
    customerFeatures: "",
    adminTitle: "",
    adminRole: "",
    adminFeatures: "",
    stack: [
      { layer: "Frontend", technology: "", purpose: "" },
      { layer: "Backend", technology: "", purpose: "" },
      { layer: "Database", technology: "", purpose: "" },
      { layer: "Payment Gateway", technology: "", purpose: "" },
      { layer: "Production Hosting", technology: "", purpose: "" },
    ],
    brand: [
      { title: "", text: "" },
      { title: "", text: "" },
      { title: "", text: "" },
    ],
    packageName: "",
    packageStats: [
      { value: "", label: "" },
      { value: "", label: "" },
      { value: "", label: "" },
    ],
    packageInvestment: "",
    budget: [{ deliverable: "", fee: "", amount: "" }],
    totalAmount: "",
    totalNote: "",
    duration: "",
    startDate: "",
    launchDate: "",
    terms: "",
    clientSignName: "",
    clientSignTitle: "",
    clientSignDate: "",
    companySignName: "",
    companySignTitle: "",
    companySignDate: "",
  };
}

function proposalDraft(record) {
  const blank = blankProposal();
  return {
    ...blank,
    ...record,
    stack: record.stack?.length ? record.stack : blank.stack,
    brand: record.brand?.length ? record.brand : blank.brand,
    packageStats: record.packageStats?.length ? record.packageStats : blank.packageStats,
    budget: record.budget?.length ? record.budget : blank.budget,
  };
}

function blankVideo() {
  return { id: "", projectId: "", title: "", url: "", notes: "", date: todayISO() };
}

function projectName(projects, id) {
  return projects.find((project) => project.id === id)?.name || "Project removed";
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

