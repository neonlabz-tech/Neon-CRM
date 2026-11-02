import { createHash, randomBytes } from "node:crypto";
import { COMPANY, roleFromUsername } from "./access.js";
import { PasswordReset, Store, User } from "./models.js";
import { sendMail } from "./mail.js";
import { sealPassword } from "./passwordVault.js";

export const RESET_MESSAGE = "If this account can be reset, the request has been received.";
const LINK_MINUTES = 30;
const REQUEST_DAYS = 7;

export function ceoRecoveryEmail() {
  return String(process.env.CEO_RECOVERY_EMAIL || "neonlabz@gmail.com").trim().toLowerCase();
}

export function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function roleLabel(role) {
  if (role === "pm") return "Project manager";
  if (role === "marketing") return "Marketing admin";
  if (role === "sales") return "Sales admin";
  if (role === "employee") return "Employee";
  if (role === "ceo") return "Chief Executive Officer";
  return "User";
}

async function accountDetail(username) {
  const hrms = await Store.findOne({ key: "neon-crm-hrms", owner: COMPANY }).lean();
  const employees = Array.isArray(hrms?.data?.employees) ? hrms.data.employees : [];
  const person = employees.find((item) => {
    const names = [item?.username, item?.code].map((value) => String(value || "").trim().toUpperCase());
    return names.includes(username);
  });
  return {
    name: String(person?.name || "").trim(),
    role: roleFromUsername(username) || "",
  };
}

function requestText(username, detail) {
  const who = detail.name ? `${username} (${detail.name}, ${roleLabel(detail.role)})` : `${username} (${roleLabel(detail.role)})`;
  return `${who} requested a password reset. Open User Management, issue a temporary password, and share it privately. They must change it the next time they sign in.`;
}

export async function requestPasswordReset(identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return { kind: "none" };
  if (isEmail(raw)) {
    const sent = await requestCeoLink(raw.toLowerCase());
    return sent ? { kind: "sent", username: sent } : { kind: "none" };
  }
  const username = raw.toUpperCase();
  const role = roleFromUsername(username);
  if (!role || role === "ceo") return { kind: "none" };
  const user = await User.findOne({ username, active: { $ne: false } });
  if (!user) return { kind: "none" };
  const existing = await PasswordReset.findOne({
    username,
    purpose: "staff-request",
    status: "open",
    expiresAt: { $gt: new Date() },
  });
  if (existing) return { kind: "none" };
  const detail = await accountDetail(username);
  await PasswordReset.create({
    username,
    purpose: "staff-request",
    expiresAt: new Date(Date.now() + REQUEST_DAYS * 24 * 60 * 60 * 1000),
    status: "open",
  });
  return { kind: "staff", username, detail };
}

async function requestCeoLink(email) {
  const user = await User.findOne({
    role: "ceo",
    email,
    active: { $ne: false },
  });
  if (!user) return "";
  const token = randomBytes(32).toString("hex");
  await PasswordReset.updateMany(
    { username: user.username, purpose: "ceo-link", status: "open" },
    { $set: { status: "completed", usedAt: new Date() } }
  );
  const created = await PasswordReset.create({
    username: user.username,
    tokenHash: hashToken(token),
    purpose: "ceo-link",
    expiresAt: new Date(Date.now() + LINK_MINUTES * 60 * 1000),
    status: "open",
  });
  const appUrl = String(process.env.APP_URL || "http://127.0.0.1:5173").replace(/\/$/, "").replace("://localhost", "://127.0.0.1");
  const link = `${appUrl}/reset/${token}`;
  try {
    await sendMail({
      to: email,
      subject: "Reset your NeonLabz CEO password",
      text: [
        "A password reset was requested for the NeonLabz CEO account.",
        "",
        "Click this link to open the password page. It expires in 30 minutes and can be used once:",
        link,
        "",
        "After you confirm the new password, it replaces the CEO password in the CRM.",
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
      html: [
        "<p>A password reset was requested for the NeonLabz CEO account.</p>",
        `<p><a href="${link}">Set a new password</a></p>`,
        "<p>The page asks for the new password and a confirmation. After you confirm it, the CEO password in the CRM is replaced. The link expires in 30 minutes and works once.</p>",
        `<p>If the button does not open, copy this address into the browser on this computer:<br>${link}</p>`,
        "<p>If you did not request this, you can ignore this email.</p>",
      ].join(""),
    });
  } catch (error) {
    await PasswordReset.deleteOne({ _id: created._id });
    const failure = new Error("Could not send the reset email.");
    failure.code = error.code || "MAIL_FAILED";
    throw failure;
  }
  return user.username;
}

export async function openResetRequests() {
  const rows = await PasswordReset.find({
    purpose: "staff-request",
    status: "open",
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 }).lean();
  const requests = [];
  for (const row of rows) {
    const detail = await accountDetail(row.username);
    requests.push({
      id: String(row._id),
      username: row.username,
      name: detail.name,
      role: detail.role,
      createdAt: row.createdAt,
      text: requestText(row.username, detail),
    });
  }
  return requests;
}

export async function completeStaffRequests(username) {
  const value = String(username || "").trim().toUpperCase();
  if (!value) return;
  await PasswordReset.updateMany(
    { username: value, purpose: "staff-request", status: "open" },
    { $set: { status: "completed", usedAt: new Date() } }
  );
}

export async function consumeResetToken(token, nextPassword, hashPassword) {
  const tokenHash = hashToken(token);
  const row = await PasswordReset.findOne({
    tokenHash,
    purpose: "ceo-link",
    status: "open",
    usedAt: null,
  });
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }
  const user = await User.findOne({ username: row.username }).select("+passwordHash");
  if (!user || user.role !== "ceo") {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }
  user.passwordHash = await hashPassword(nextPassword);
  user.passwordVault = sealPassword(nextPassword);
  user.passwordSource = "updated";
  user.passwordUpdatedAt = new Date();
  user.password = undefined;
  await user.save();
  await User.updateOne({ _id: user._id }, { $unset: { password: 1 } });
  row.status = "completed";
  row.usedAt = new Date();
  await row.save();
  await PasswordReset.updateMany(
    { username: user.username, purpose: "ceo-link", status: "open" },
    { $set: { status: "completed", usedAt: new Date() } }
  );
  return { ok: true, username: user.username };
}
