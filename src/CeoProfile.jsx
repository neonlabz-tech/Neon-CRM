import { useEffect, useState } from "react";
import { api, readSession, writeSession } from "./api.js";
import { getUsers, setUsers } from "./storage.js";

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function CeoProfile({ onClose }) {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    api("/api/profile")
      .then((data) => {
        if (stop) return;
        const profile = data.profile || {};
        setUsername(profile.username || "");
        setFullName(profile.fullName || "");
        setEmail(profile.email || "");
        setPhone(formatPhone(profile.phone || ""));
        setAddress(profile.address || "");
      })
      .catch((err) => {
        if (!stop) setError(err.message || "Could not load the profile.");
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });
    return () => {
      stop = true;
    };
  }, []);

  function closePassword() {
    setChanging(false);
    setCurrentPassword("");
    setNextPassword("");
    setConfirm("");
    setPasswordError("");
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await api("/api/profile", {
        method: "PUT",
        body: { fullName, email, phone, address },
      });
      const profile = data.profile || {};
      setFullName(profile.fullName || fullName);
      setEmail(profile.email || email);
      setPhone(formatPhone(profile.phone || ""));
      setAddress(profile.address || "");
      setMessage(data.message || "Profile saved.");
    } catch (err) {
      setError(err.message || "Could not save the profile.");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    if (nextPassword !== confirm) {
      setPasswordError("New passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    try {
      await api("/api/auth/password", {
        method: "POST",
        body: { currentPassword, nextPassword },
      });
      if (username) {
        setUsers(getUsers().map((user) => (
          user.username === username
            ? { ...user, password: "", passwordSource: "updated", passwordUpdatedAt: new Date().toISOString(), mustChangePassword: false }
            : user
        )));
      }
      const current = readSession();
      if (current) writeSession({ ...current, mustChangePassword: false });
      setPasswordMessage("Password updated. It stays hidden.");
      setCurrentPassword("");
      setNextPassword("");
      setConfirm("");
      setChanging(false);
    } catch (err) {
      setPasswordError(err.message || "Could not update the password.");
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <section className="modal">
      <h2>Profile</h2>
      <p className="lede">These details belong to the CEO account. Password reset links are sent to the email saved here.</p>
      {loading ? <p className="empty-copy">Loading profile…</p> : (
        <>
          <form className="profile-form" onSubmit={submit}>
            <label>
              Full name
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={120} required />
            </label>
            <label>
              Email address
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>
              Phone number
              <input value={phone} onChange={(event) => setPhone(formatPhone(event.target.value))} inputMode="numeric" placeholder="077-123-4567" />
            </label>
            <label>
              Address
              <textarea value={address} onChange={(event) => setAddress(event.target.value)} maxLength={300} rows={3} />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            {message ? <p className="form-note">{message}</p> : null}
            <div className="modal-actions">
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save profile"}
              </button>
              {onClose ? (
                <button className="ghost" type="button" onClick={onClose}>
                  Close
                </button>
              ) : null}
            </div>
          </form>
          {changing ? (
            <form className="profile-form" onSubmit={changePassword}>
              <label>
                Current password
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <label>
                New password
                <input
                  type="password"
                  value={nextPassword}
                  onChange={(event) => setNextPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              <label>
                Confirm new password
                <input
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              {passwordError ? <p className="form-error">{passwordError}</p> : null}
              <div className="modal-actions">
                <button className="primary" type="submit" disabled={passwordBusy}>
                  {passwordBusy ? "Saving…" : "Save password"}
                </button>
                <button className="ghost" type="button" onClick={closePassword}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button className="link-btn" type="button" onClick={() => { setChanging(true); setPasswordMessage(""); }}>
              Change password?
            </button>
          )}
          {passwordMessage ? <p className="form-note">{passwordMessage}</p> : null}
        </>
      )}
      {loading && onClose ? (
        <div className="modal-actions">
          <button className="ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      ) : null}
    </section>
  );
}
