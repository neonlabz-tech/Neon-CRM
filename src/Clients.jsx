import { useState } from "react";
import { createPortal } from "react-dom";
import { blankClient, blankSubContact, INDUSTRIES, nextClientCode, saveClients, TIERS } from "./clients.js";
import { publishClients, pushPmToMarketing } from "./clientSync.js";
import { clientsWithPaying, salesClientByName, salesClientDirectory } from "./sales.js";
import { dataOwner } from "./scope.js";

function companyClient(client) {
  if (client?.source === "own") return false;
  const name = String(client?.name || "").trim().toLowerCase();
  if (!name) return false;
  return salesClientDirectory().some((item) => item.name.trim().toLowerCase() === name);
}

function readClientPage(personal) {
  const published = publishClients();
  const listed = personal ? published.clients.filter((client) => !companyClient(client)) : clientsWithPaying(published.clients, dataOwner());
  return { ...published, clients: listed };
}

export function ClientsWorkspace({ personal = false } = {}) {
  const [page, setPage] = useState(() => readClientPage(personal));
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const clients = page.clients;

  function commit(nextClients) {
    saveClients(nextClients);
    const published = publishClients();
    const listed = personal ? published.clients.filter((client) => !companyClient(client)) : clientsWithPaying(published.clients, dataOwner());
    setPage({ ...published, clients: listed });
  }

  function save(client) {
    const name = client.name.trim();
    if (!name) return "Company name is required.";
    if (!client.contactName.trim()) return "Client main person name is required.";
    if (client.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.contactEmail.trim())) return "Enter a valid email address.";
    const subContacts = (client.subContacts || [])
      .map((person) => ({
        ...person,
        name: person.name.trim(),
        title: person.title.trim(),
        email: person.email.trim(),
        phone: person.phone.trim(),
      }))
      .filter((person) => person.name || person.title || person.email || person.phone);
    if (subContacts.some((person) => !person.name)) return "Each sub contact needs a name.";
    if (subContacts.some((person) => person.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email))) return "Enter a valid email for each sub contact.";
    const duplicate = clients.some((item) => item.id !== client.id && item.name.toLowerCase() === name.toLowerCase());
    if (duplicate) return "That company is already in the client list.";
    const saved = {
      ...client,
      name,
      contactName: client.contactName.trim(),
      contactTitle: client.contactTitle.trim(),
      assignedPerson: (client.assignedPerson || "").trim(),
      contactEmail: client.contactEmail.trim(),
      contactPhone: client.contactPhone.trim(),
      address: client.address.trim(),
      notes: client.notes.trim(),
      subContacts,
      code: client.code || nextClientCode(clients),
      source: personal ? "own" : (client.source === "own" ? "own" : ""),
    };
    delete saved.projectIds;
    const exists = clients.some((item) => item.id === saved.id);
    const nextClients = exists ? clients.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...clients];
    commit(nextClients);
    pushPmToMarketing(saved);
    setEditing(null);
    return "";
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <p>{personal
          ? "Clients for your own projects. Add the company, the main person, and contact details."
          : "Clients with a CEO-approved payment are listed here. Add the main person, assigned person, and contact details."}</p>
        <button className="primary" type="button" onClick={() => setEditing(blankClient())}>Add client</button>
      </div>
      <article className="panel">
        {clients.length === 0 ? <p className="empty-copy">{personal ? "No clients yet. Add a client for your own projects." : "No approved clients yet. When the CEO approves a payment, that client is listed here."}</p> : (
          <table>
            <thead>
              <tr>
                <th>Client ID</th>
                <th>Client</th>
                <th>Main person</th>
                <th>Assigned person</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td><code>{client.code || "—"}</code></td>
                  <td>{client.name}</td>
                  <td>{client.contactName ? `${client.contactName}${client.contactTitle ? ` · ${client.contactTitle}` : ""}` : "—"}</td>
                  <td>{client.assignedPerson || "—"}</td>
                  <td>{client.contactPhone || "—"}</td>
                  <td>{client.contactEmail || "—"}</td>
                  <td>
                    <div className="icon-actions">
                      <button className="ghost" type="button" onClick={() => setViewing(client)}>View</button>
                      <button className="ghost" type="button" onClick={() => setEditing(client)}>Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
      {editing ? <ClientDialog client={editing} salesPick={!personal} onClose={() => setEditing(null)} onSave={save} /> : null}
      {viewing ? (
        <ClientProfile
          client={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ClientDialog({ client, onClose, onSave, salesPick = true }) {
  const [draft, setDraft] = useState(client);
  const [error, setError] = useState("");
  const editing = Boolean(client.name);

  function setField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateSubContact(id, key, value) {
    setDraft((current) => ({
      ...current,
      subContacts: (current.subContacts || []).map((person) => (person.id === id ? { ...person, [key]: value } : person)),
    }));
  }

  function chooseLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use a JPG, PNG, or WEBP logo.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Logo must be 2MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setError("");
      setField("logo", String(reader.result || ""));
    };
    reader.readAsDataURL(file);
  }

  function submit(event) {
    event.preventDefault();
    const message = onSave(draft);
    if (message) setError(message);
  }

  return (
    <Modal onClose={onClose}>
      <form className="modal sheet" onSubmit={submit}>
        <h2>{editing ? "Edit client" : "Add new client"}</h2>
        <p className="lede">Keep the client’s basic information here. Email is optional.</p>
        {salesPick ? (
          <label>
            Client from sales
            <select
              value={salesClientDirectory().some((item) => item.name === draft.name) ? draft.name : ""}
              onChange={(event) => {
                const details = salesClientByName(event.target.value);
                if (!details) return;
                setDraft((current) => ({
                  ...current,
                  name: details.name,
                  contactEmail: details.email,
                  contactPhone: details.phone,
                  address: details.address,
                }));
              }}
            >
              <option value="">Select a follow-up client</option>
              {salesClientDirectory().map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
          </label>
        ) : null}
        <div className="field-grid">
          <label>
            Company name
            <input value={draft.name} onChange={(event) => setField("name", event.target.value)} required />
          </label>
          <label>
            Industry
            <select value={draft.industry} onChange={(event) => setField("industry", event.target.value)}>
              <option value="">Select industry</option>
              {industryOptions(draft.industry).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Tier
            <select value={draft.tier} onChange={(event) => setField("tier", event.target.value)}>
              <option value="">Select tier</option>
              {TIERS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>
            Company logo
            <input className="file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseLogo} />
          </label>
        </div>
        {draft.logo ? <img className="client-logo-preview" src={draft.logo} alt="" /> : null}
        <div className="section-head">
          <h3>People and contact</h3>
          <button className="icon-button" type="button" aria-label="Add sub contact" title="Add sub contact" onClick={() => setField("subContacts", [...(draft.subContacts || []), blankSubContact()])}>
            <PlusIcon />
          </button>
        </div>
        <div className="field-grid">
          <label>
            Client main person name
            <input value={draft.contactName} onChange={(event) => setField("contactName", event.target.value)} required />
          </label>
          <label>
            Job title
            <input value={draft.contactTitle} onChange={(event) => setField("contactTitle", event.target.value)} />
          </label>
          <label>
            Assigned person name
            <input value={draft.assignedPerson || ""} onChange={(event) => setField("assignedPerson", event.target.value)} />
          </label>
          <label>
            Contact number
            <input value={draft.contactPhone} onChange={(event) => setField("contactPhone", event.target.value)} />
          </label>
          <label>
            Email address
            <input type="email" value={draft.contactEmail} onChange={(event) => setField("contactEmail", event.target.value)} />
          </label>
        </div>
        {(draft.subContacts || []).map((person, index) => (
          <section className="sub-contact" key={person.id}>
            <div className="section-head">
              <h3>Sub contact {index + 1}</h3>
              <button
                className="ghost"
                type="button"
                onClick={() => setField("subContacts", draft.subContacts.filter((item) => item.id !== person.id))}
              >
                Remove
              </button>
            </div>
            <div className="field-grid">
              <label>
                Full name
                <input value={person.name} onChange={(event) => updateSubContact(person.id, "name", event.target.value)} required />
              </label>
              <label>
                Job title
                <input value={person.title} onChange={(event) => updateSubContact(person.id, "title", event.target.value)} />
              </label>
              <label>
                Email address
                <input type="email" value={person.email} onChange={(event) => updateSubContact(person.id, "email", event.target.value)} />
              </label>
              <label>
                Phone number
                <input value={person.phone} onChange={(event) => updateSubContact(person.id, "phone", event.target.value)} />
              </label>
            </div>
          </section>
        ))}
        <div className="field-grid">
          <label className="span-2">
            Office address
            <textarea value={draft.address} onChange={(event) => setField("address", event.target.value)} />
          </label>
          <label className="span-2">
            Internal notes
            <textarea value={draft.notes} onChange={(event) => setField("notes", event.target.value)} />
          </label>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="primary" type="submit">{editing ? "Save changes" : "Save client"}</button>
          <button className="ghost" type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function ClientProfile({ client, onClose, onEdit }) {
  return (
    <Modal onClose={onClose}>
      <div className="modal sheet client-profile">
        <div className="client-card-top">
          <Logo client={client} />
          <div>
            <h2>{client.name}</h2>
            <p className="client-meta">{clientLine(client)}</p>
          </div>
          <span className={`account-status ${client.status === "active" ? "active" : "inactive"}`}>
            {client.status === "active" ? "Active" : "Inactive"}
          </span>
        </div>
        {client.contactName ? (
          <div className="client-person">
            <span>{initials(client.contactName)}</span>
            <div>
              <strong>{client.contactName}</strong>
              <small>{client.contactTitle || "Main person"}</small>
            </div>
          </div>
        ) : <p>No main person yet. Edit the profile to add one.</p>}
        <ul className="client-facts">
          <li><span>Assigned person</span><strong>{client.assignedPerson || "—"}</strong></li>
          <li><span>Email</span><strong>{client.contactEmail || "—"}</strong></li>
          <li><span>Phone</span><strong>{client.contactPhone || "—"}</strong></li>
          <li><span>Office address</span><strong>{client.address || "—"}</strong></li>
          <li><span>Internal notes</span><strong>{client.notes || "—"}</strong></li>
          <li><span>Client ID</span><strong>{client.code || "—"}</strong></li>
        </ul>
        {client.subContacts?.length ? (
          <section className="client-sub-list">
            <span>Other contacts</span>
            <ul>
              {client.subContacts.map((person) => (
                <li key={person.id}>
                  <strong>{person.name}</strong>
                  <small>{[person.title, person.email, person.phone].filter(Boolean).join(" · ") || "Sub contact"}</small>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="modal-actions">
          <button className="ghost" type="button" onClick={onEdit}>Edit profile</button>
          <button className="ghost" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

function Logo({ client }) {
  if (client.logo) return <img className="client-logo" src={client.logo} alt="" />;
  return <span className="client-logo client-logo-fallback">{initials(client.name || "CL")}</span>;
}

function Modal({ children, onClose }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div onClick={(event) => event.stopPropagation()} role="presentation">{children}</div>
    </div>,
    document.body
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function industryOptions(current) {
  if (current && !INDUSTRIES.includes(current)) return [current, ...INDUSTRIES];
  return INDUSTRIES;
}

function clientLine(client) {
  if (client.industry && client.tier) return `${client.industry} • ${client.tier} Tier`;
  if (client.industry) return client.industry;
  if (client.tier) return `${client.tier} Tier`;
  if (client.origin === "marketing") return "Added by marketing";
  if (client.origin === "sales") return "Payment started";
  return "Added from a project";
}

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "CL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}
