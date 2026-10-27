const SESSION_KEY = "neon-crm-session";

export function readSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeSession(session) {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage access errors and still try sessionStorage.
  }
  if (!session) sessionStorage.removeItem(SESSION_KEY);
  else sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function token() {
  return readSession()?.token || "";
}

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || "Request failed.");
    error.status = res.status;
    throw error;
  }
  return data;
}
