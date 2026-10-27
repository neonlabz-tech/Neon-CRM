import { readSession } from "./api.js";
import { crmStorage } from "./storage.js";

let viewingAccount = "";

export function sessionAccount() {
  return readSession();
}

export function setViewingAccount(username) {
  viewingAccount = username || "";
}

export function dataOwner() {
  const session = sessionAccount();
  if (!session?.username) return "";
  if (session.role === "ceo") return viewingAccount;
  return session.username;
}

export function readAccount(base, username) {
  if (!username) return null;
  try {
    const raw = crmStorage.getItem(`${base}:${username}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function readScoped(base) {
  return readAccount(base, dataOwner());
}

export function writeScoped(base, data) {
  const owner = dataOwner();
  const session = sessionAccount();
  if (!owner || !session?.username) return;
  if (session.role === "ceo") {
    if (owner !== session.username) return;
  } else if (session.username !== owner) {
    return;
  }
  crmStorage.setItem(`${base}:${owner}`, JSON.stringify(data));
}
