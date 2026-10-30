import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { Audit, Store, User } from "./models.js";
import { COMPANY, canReadStore, canWriteStore, isCeo, roleFromUsername } from "./access.js";
import {
  REGISTRY_KEY,
  RegistryError,
  claimRegistryCode,
  leadPhoneOwner,
  releaseLeadPhone,
  reserveLeadPhone,
  unionRegistryIds,
} from "./registryStore.js";
import {
  RESET_MESSAGE,
  ceoRecoveryEmail,
  completeStaffRequests,
  consumeResetToken,
  openResetRequests,
  requestPasswordReset,
} from "./passwordReset.js";
import { openPassword, sealPassword } from "./passwordVault.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/neon-crm";
const JWT_SECRET = process.env.JWT_SECRET || "";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d";
const MIN_PASSWORD = 8;
const COOKIE_NAME = "neon_crm_token";
const WEAK_SECRET = "neon-crm-dev-secret-change-me";

function secret() {
  if (JWT_SECRET && JWT_SECRET !== WEAK_SECRET) return JWT_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Set JWT_SECRET in .env to a long random value before running in production.");
  }
  return JWT_SECRET || WEAK_SECRET;
}

function corsOrigins() {
  const raw = process.env.CORS_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173";
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function publicUser(user) {
  return {
    username: user.username,
    role: user.role || roleFromUsername(user.username),
    passwordSource: user.passwordSource === "updated" ? "updated" : "issued",
    passwordUpdatedAt: user.passwordUpdatedAt || null,
    active: user.active !== false,
    mustChangePassword: user.passwordSource !== "updated",
  };
}

function tokenFor(user) {
  return jwt.sign(
    { username: user.username, role: user.role || roleFromUsername(user.username) },
    secret(),
    { expiresIn: JWT_EXPIRES }
  );
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

function readToken(req) {
  const header = String(req.headers.authorization || "");
  if (header.startsWith("Bearer ")) return header.slice(7);
  return req.cookies?.[COOKIE_NAME] || "";
}

function requireAuth(req, res, next) {
  try {
    req.user = jwt.verify(readToken(req), secret());
    next();
  } catch {
    res.status(401).json({ error: "Sign in again." });
  }
}

function requireCeo(req, res, next) {
  if (req.user?.role !== "ceo") {
    return res.status(403).json({ error: "Only the CEO can do that." });
  }
  next();
}

async function writeAudit(actor, action, detail = {}) {
  try {
    await Audit.create({ actor: actor || "system", action, detail });
  } catch (error) {
    console.error("Could not write audit log.", error.message);
  }
}

function employeeCodeOnProject(project, code) {
  const named = [...(project?.assignees || []), ...(project?.marketingAssignees || [])]
    .some((value) => String(value || "").trim().toUpperCase() === code);
  if (named) return true;
  return (project?.milestones || []).some((item) =>
    (item?.assignees || []).some((value) => String(value || "").trim().toUpperCase() === code)
  );
}

function employeeAssignedStores(stores, username) {
  const code = String(username || "").trim().toUpperCase();
  if (!/^EMP\d{3}$/.test(code)) return [];
  const extra = [];
  for (const item of stores) {
    if (item.owner === code) continue;
    if (item.key === "neon-crm-projects") {
      const projects = (Array.isArray(item.data?.projects) ? item.data.projects : [])
        .filter((project) => !project?.archived && employeeCodeOnProject(project, code));
      if (projects.length) extra.push({ key: item.key, owner: item.owner, data: { projects, meetings: [] } });
    }
    if (item.key === "neon-crm-tasks" && Array.isArray(item.data)) {
      const tasks = item.data.filter((task) => String(task?.assigneeCode || "").trim().toUpperCase() === code);
      if (tasks.length) extra.push({ key: item.key, owner: item.owner, data: tasks });
    }
  }
  return extra;
}

async function mergeEmployeeTasks(owner, username, incoming) {
  const code = String(username || "").trim().toUpperCase();
  const existing = await Store.findOne({ key: "neon-crm-tasks", owner }).lean();
  const current = Array.isArray(existing?.data) ? existing.data : [];
  const kept = current.filter((task) => String(task?.assigneeCode || "").trim().toUpperCase() !== code);
  const mine = (Array.isArray(incoming) ? incoming : [])
    .filter((task) => String(task?.assigneeCode || "").trim().toUpperCase() === code);
  await Store.findOneAndUpdate(
    { key: "neon-crm-tasks", owner },
    { key: "neon-crm-tasks", owner, data: [...mine, ...kept] },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

async function passwordMatches(user, password) {
  if (!user || !password) return false;
  if (user.passwordHash) return bcrypt.compare(password, user.passwordHash);
  return Boolean(user.password) && user.password === password;
}

async function stripLegacyPassword(user) {
  if (!user?.password) return;
  user.password = undefined;
  await User.updateOne({ _id: user._id }, { $unset: { password: 1 } });
}

async function migrateUsers() {
  await User.updateMany({ password: { $exists: true } }, { $unset: { password: 1 } });
}

async function seedCeo() {
  await migrateUsers();
  const existing = await User.findOne({ username: "CEO001" });
  if (existing) return;
  await User.create({
    username: "CEO001",
    role: "ceo",
    passwordHash: await bcrypt.hash("ceo123", 10),
    passwordSource: "issued",
    active: true,
  });
  console.log("Seeded CEO001. Sign in and set a new password of at least 8 characters.");
}

async function ensureCeoRecoveryEmail() {
  const email = ceoRecoveryEmail();
  await User.updateOne(
    { username: "CEO001", $or: [{ email: { $exists: false } }, { email: null }, { email: "" }] },
    { $set: { email } }
  );
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again in a few minutes." },
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many reset attempts. Try again in a few minutes." },
});

export function createApp() {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: corsOrigins(), credentials: true }));
  app.use(express.json({ limit: "15mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 });
  });

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    const username = String(req.body?.username || "").trim().toUpperCase();
    const password = String(req.body?.password || "").trim();
    const role = roleFromUsername(username);
    if (!role) {
      return res.status(400).json({ error: "Use the username issued for your role, such as PM001 or EMP001." });
    }
    const user = await User.findOne({ username }).select("+passwordHash +password");
    if (!user) {
      await writeAudit(username, "login.failed", { reason: "missing" });
      return res.status(401).json({
        error: `${username} has no login yet. The CEO must set a password in User Management or HRMS before this person can sign in.`,
      });
    }
    if (!(await passwordMatches(user, password))) {
      await writeAudit(username, "login.failed", { reason: "password" });
      return res.status(401).json({ error: "Username or password is incorrect." });
    }
    if (user.active === false) return res.status(403).json({ error: "This account is inactive. Ask the CEO to activate it." });
    await stripLegacyPassword(user);
    const token = tokenFor(user);
    res.cookie(COOKIE_NAME, token, cookieOptions());
    await writeAudit(username, "login.ok");
    res.json({ token, user: publicUser(user) });
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: 0 });
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(401).json({ error: "Sign in again." });
    res.json({ user: publicUser(user) });
  });

  app.get("/api/bootstrap", requireAuth, async (req, res) => {
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(401).json({ error: "Sign in again." });
    const users = await User.find().sort({ username: 1 });
    const stores = await Store.find();
    const visible = stores
      .filter((item) => canReadStore(req.user, item.key, item.owner))
      .map((item) => ({ key: item.key, owner: item.owner, data: item.data }));
    const assigned = req.user.role === "employee" ? employeeAssignedStores(stores, req.user.username) : [];
    res.json({
      user: publicUser(user),
      users: users.map((item) => publicUser(item)),
      stores: [...visible, ...assigned],
    });
  });

  app.post("/api/users", requireAuth, requireCeo, async (req, res) => {
    const username = String(req.body?.username || "").trim().toUpperCase();
    const role = roleFromUsername(username);
    const password = typeof req.body?.password === "string" ? req.body.password.trim() : "";
    if (!role || role === "ceo") {
      return res.status(400).json({ error: "That username cannot be created this way." });
    }
    const existing = await User.findOne({ username }).select("+passwordHash");
    if (!existing && password.length < MIN_PASSWORD) {
      return res.status(400).json({ error: `Use at least ${MIN_PASSWORD} characters for the password.` });
    }
    if (password && password.length < MIN_PASSWORD) {
      return res.status(400).json({ error: `Use at least ${MIN_PASSWORD} characters for the password.` });
    }
    if (!existing && !password) {
      return res.status(400).json({ error: `Use at least ${MIN_PASSWORD} characters for the password.` });
    }
    const passwordHash = password ? await bcrypt.hash(password, 10) : existing.passwordHash;
    let user;
    if (existing) {
      existing.role = role;
      existing.passwordHash = passwordHash;
      if (password) {
        existing.passwordSource = "issued";
        existing.passwordUpdatedAt = new Date();
        existing.passwordVault = sealPassword(password);
      }
      existing.active = req.body.active === false ? false : true;
      existing.password = undefined;
      user = await existing.save();
      await User.updateOne({ _id: user._id }, { $unset: { password: 1 } });
    } else {
      user = await User.create({
        username,
        role,
        passwordHash,
        passwordVault: sealPassword(password),
        passwordSource: "issued",
        active: req.body.active === false ? false : true,
      });
    }
    if (password) {
      await completeStaffRequests(username);
      await writeAudit(req.user.username, "password.reset.issued", { username });
    }
    await writeAudit(req.user.username, existing ? "user.updated" : "user.created", { username });
    const users = await User.find().sort({ username: 1 });
    res.json({ user: publicUser(user), users: users.map((item) => publicUser(item)) });
  });

  app.put("/api/users", requireAuth, requireCeo, async (req, res) => {
    const incoming = Array.isArray(req.body?.users) ? req.body.users : [];
    const kept = [];
    for (const item of incoming) {
      const username = String(item?.username || "").trim().toUpperCase();
      const role = roleFromUsername(username);
      if (!role) continue;
      const nextPassword = typeof item.password === "string" ? item.password.trim() : "";
      const existing = await User.findOne({ username }).select("+passwordHash");
      if (isCeo(username, role) && nextPassword) {
        if (!existing) continue;
        kept.push(username);
        continue;
      }
      if (nextPassword && nextPassword.length < MIN_PASSWORD) {
        return res.status(400).json({ error: `Use at least ${MIN_PASSWORD} characters for a new password.` });
      }
      let passwordHash = existing?.passwordHash;
      if (nextPassword) passwordHash = await bcrypt.hash(nextPassword, 10);
      if (!passwordHash) continue;
      const next = await User.findOneAndUpdate(
        { username },
        {
          $set: {
            username,
            role,
            passwordHash,
            ...(nextPassword ? { passwordVault: sealPassword(nextPassword) } : {}),
            passwordSource: nextPassword ? "issued" : (existing?.passwordSource || "issued"),
            passwordUpdatedAt: nextPassword ? new Date() : existing?.passwordUpdatedAt || null,
            active: isCeo(username, role) ? true : item.active !== false,
          },
          $unset: { password: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      kept.push(next.username);
    }
    const ceos = await User.find({ $or: [{ role: "ceo" }, { username: /^CEO\d{3}$/ }] }).select("username");
    ceos.forEach((item) => {
      if (!kept.includes(item.username)) kept.push(item.username);
    });
    const removed = await User.find({ username: { $nin: kept } }).select("username");
    await User.deleteMany({ username: { $nin: kept }, role: { $ne: "ceo" }, username: { $not: /^CEO\d{3}$/ } });
    if (removed.length) {
      await writeAudit(req.user.username, "users.removed", { usernames: removed.map((item) => item.username) });
    }
    await writeAudit(req.user.username, "users.updated", { usernames: kept });
    const users = await User.find().sort({ username: 1 });
    res.json({ users: users.map((item) => publicUser(item)) });
  });

  app.post("/api/auth/password", requireAuth, async (req, res) => {
    const currentPassword = String(req.body?.currentPassword || "").trim();
    const nextPassword = String(req.body?.nextPassword || "").trim();
    const user = await User.findOne({ username: req.user.username }).select("+passwordHash +password");
    if (!user) return res.status(401).json({ error: "Sign in again." });
    if (!(await passwordMatches(user, currentPassword))) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    if (nextPassword.length < MIN_PASSWORD) {
      return res.status(400).json({ error: `Use at least ${MIN_PASSWORD} characters for the new password.` });
    }
    if (nextPassword === currentPassword) {
      return res.status(400).json({ error: "Choose a password that is different from the current one." });
    }
    user.passwordHash = await bcrypt.hash(nextPassword, 10);
    user.passwordVault = sealPassword(nextPassword);
    user.password = undefined;
    user.passwordSource = "updated";
    user.passwordUpdatedAt = new Date();
    await user.save();
    await User.updateOne({ _id: user._id }, { $unset: { password: 1 } });
    await writeAudit(user.username, "password.changed");
    res.json({ user: publicUser(user) });
  });

  app.post("/api/auth/forgot", resetLimiter, async (req, res) => {
    const identifier = String(req.body?.username || "").trim();
    let result = null;
    try {
      result = await requestPasswordReset(identifier);
      if (result?.kind === "staff") {
        await writeAudit(result.username, "password.reset.requested", { role: result.detail?.role || "" });
      } else if (result?.kind === "sent") {
        await writeAudit(result.username, "password.reset.email_sent", {});
      }
    } catch (error) {
      await writeAudit("system", "password.reset.email_failed", { code: error.code || "MAIL_FAILED" });
      const rejected = error.code === "EAUTH";
      return res.status(503).json({
        error: rejected
          ? "Gmail rejected the sending mailbox login, so the reset email was not sent. Check SMTP_USER and SMTP_PASS, then try again."
          : "The reset email could not be sent. Check the mail settings and try again.",
      });
    }
    res.json({ ok: true, message: RESET_MESSAGE });
  });

  function profileView(user) {
    return {
      username: user.username,
      fullName: user.fullName || "",
      email: user.email || "",
      phone: user.phone || "",
      address: user.address || "",
    };
  }

  app.get("/api/profile", requireAuth, requireCeo, async (req, res) => {
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(401).json({ error: "Sign in again." });
    res.json({ profile: profileView(user) });
  });

  app.put("/api/profile", requireAuth, requireCeo, async (req, res) => {
    const user = await User.findOne({ username: req.user.username }).select("+passwordHash +password");
    if (!user) return res.status(401).json({ error: "Sign in again." });
    const fullName = String(req.body?.fullName || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const phoneDigits = String(req.body?.phone || "").replace(/\D/g, "");
    const address = String(req.body?.address || "").trim();
    if (!fullName) return res.status(400).json({ error: "Enter your full name." });
    if (fullName.length > 120) return res.status(400).json({ error: "Full name must be 120 characters or fewer." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (phoneDigits && phoneDigits.length !== 10) return res.status(400).json({ error: "Enter a 10-digit phone number, or leave the phone blank." });
    if (address.length > 300) return res.status(400).json({ error: "Address must be 300 characters or fewer." });
    const taken = await User.findOne({ email, username: { $ne: user.username } });
    if (taken) return res.status(400).json({ error: "That email is already used by another account." });
    const emailChanged = email !== user.email;
    user.fullName = fullName;
    user.email = email;
    user.phone = phoneDigits;
    user.address = address;
    await user.save();
    await writeAudit(user.username, "profile.updated", { emailChanged });
    res.json({
      ok: true,
      message: emailChanged
        ? "Profile saved. Password reset emails will now go to this address."
        : "Profile saved.",
      profile: profileView(user),
    });
  });

  app.post("/api/auth/reset", resetLimiter, async (req, res) => {
    const token = String(req.body?.token || "").trim();
    const nextPassword = String(req.body?.password || "").trim();
    if (nextPassword.length < MIN_PASSWORD) {
      return res.status(400).json({ error: `Use at least ${MIN_PASSWORD} characters for the new password.` });
    }
    const result = await consumeResetToken(token, nextPassword, (value) => bcrypt.hash(value, 10));
    if (!result.ok) return res.status(400).json({ error: result.error });
    await writeAudit(result.username, "password.reset.completed", {});
    res.json({ ok: true });
  });

  app.get("/api/auth/reset-requests", requireAuth, requireCeo, async (_req, res) => {
    const requests = await openResetRequests();
    res.json({ requests });
  });

  app.post("/api/users/password-view", requireAuth, requireCeo, async (req, res) => {
    const username = String(req.body?.username || "").trim().toUpperCase();
    const password = String(req.body?.password || "").trim();
    const ceo = await User.findOne({ username: req.user.username }).select("+passwordHash +password");
    if (!ceo || !(await passwordMatches(ceo, password))) {
      await writeAudit(req.user.username, "password.view.denied", { username });
      return res.status(401).json({ error: "Password is incorrect." });
    }
    if (!username || username === req.user.username) {
      await writeAudit(req.user.username, "password.view.checked", { username, result: "own-account" });
      return res.json({
        ok: true,
        viewable: false,
        message: "Your own password is not shown here. Use Change password to replace it.",
      });
    }
    const user = await User.findOne({ username }).select("+passwordVault");
    const revealed = openPassword(user?.passwordVault);
    if (!revealed) {
      await writeAudit(req.user.username, "password.view.checked", { username, result: "unavailable" });
      return res.json({
        ok: true,
        viewable: false,
        message: "This password was saved before viewing was enabled. Issue a new temporary password, then it can be viewed.",
      });
    }
    await writeAudit(req.user.username, "password.view.revealed", { username });
    res.json({ ok: true, viewable: true, password: revealed });
  });

  app.post("/api/auth/verify", requireAuth, loginLimiter, async (req, res) => {
    const username = String(req.body?.username || req.user.username).trim().toUpperCase();
    const password = String(req.body?.password || "").trim();
    if (req.user.role !== "ceo" && username !== req.user.username) {
      return res.status(403).json({ error: "Password is incorrect." });
    }
    const user = await User.findOne({ username }).select("+passwordHash +password");
    if (!user || !(await passwordMatches(user, password))) {
      return res.status(401).json({ error: "Password is incorrect." });
    }
    res.json({ ok: true });
  });

  app.post("/api/registry/claim", requireAuth, async (req, res) => {
    if (!canWriteStore(req.user, REGISTRY_KEY, COMPANY)) {
      return res.status(403).json({ error: "You cannot reserve an ID." });
    }
    try {
      const code = await claimRegistryCode(req.body?.book, req.body?.preferred, { exact: Boolean(req.body?.exact) });
      res.json({ ok: true, code });
    } catch (error) {
      const status = error instanceof RegistryError ? error.status : 500;
      res.status(status).json({ error: error instanceof RegistryError ? error.message : "Could not reserve an ID." });
    }
  });

  app.get("/api/registry/phone", requireAuth, async (req, res) => {
    if (!canReadStore(req.user, REGISTRY_KEY, COMPANY)) {
      return res.status(403).json({ error: "You cannot look up that phone number." });
    }
    const holder = await leadPhoneOwner(req.query?.phone);
    res.json({ ok: true, holder });
  });

  app.post("/api/registry/phone", requireAuth, async (req, res) => {
    if (!canWriteStore(req.user, REGISTRY_KEY, COMPANY)) {
      return res.status(403).json({ error: "You cannot reserve a phone number." });
    }
    try {
      await reserveLeadPhone(req.body?.leadId, req.body?.phone);
      res.json({ ok: true });
    } catch (error) {
      const status = error instanceof RegistryError ? error.status : 500;
      res.status(status).json({ error: error instanceof RegistryError ? error.message : "Could not save that phone number." });
    }
  });

  app.post("/api/registry/phone/release", requireAuth, async (req, res) => {
    if (!canWriteStore(req.user, REGISTRY_KEY, COMPANY)) {
      return res.status(403).json({ error: "You cannot change a phone number." });
    }
    await releaseLeadPhone(req.body?.leadId);
    res.json({ ok: true });
  });

  app.post("/api/finance/project-invoices", requireAuth, async (req, res) => {
    const role = req.user.role;
    if (role !== "sales" && role !== "ceo") {
      return res.status(403).json({ error: "Only sales can submit a payment for approval." });
    }
    const body = req.body || {};
    const salesOwner = String(body.salesOwner || "").trim().toUpperCase();
    const paymentId = String(body.paymentId || "").trim();
    const quoteId = String(body.quoteId || "").trim();
    const amount = Number(body.amount);
    const received = Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
    if (role === "sales" && salesOwner !== String(req.user.username || "").toUpperCase()) {
      return res.status(403).json({ error: "You can only submit your own payment." });
    }
    if (!paymentId || !quoteId || !salesOwner || received <= 0) {
      return res.status(400).json({ error: "Payment details are incomplete." });
    }
    const financeKey = "neon-crm-finance";
    const noticesKey = "neon-crm-notices";
    const existingStore = await Store.findOne({ key: financeKey, owner: COMPANY }).lean();
    const current = existingStore?.data && typeof existingStore.data === "object" && !Array.isArray(existingStore.data)
      ? existingStore.data
      : {};
    const invoices = Array.isArray(current.projectInvoices) ? current.projectInvoices : [];
    const found = invoices.find((item) => item?.paymentId === paymentId && String(item.salesOwner || "").toUpperCase() === salesOwner);
    if (found) return res.json({ ok: true, invoice: found });
    const sequence = invoices.filter((item) => item?.quoteId === quoteId).length + 1;
    const stem = String(body.clientName || body.company || "CLT").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase() || "CLT";
    const invoice = {
      id: crypto.randomUUID(),
      receiptNo: `RCP-${stem}-${String(sequence).padStart(3, "0")}`,
      paymentId,
      salesOwner,
      pmOwners: Array.isArray(body.pmOwners) ? body.pmOwners.map(String) : [],
      sharedWithPms: body.sharedWithPms === true,
      quoteId,
      quoteNumber: String(body.quoteNumber || ""),
      quoteTotal: Number.isFinite(Number(body.quoteTotal)) ? Math.round(Number(body.quoteTotal) * 100) / 100 : 0,
      projectName: String(body.projectName || ""),
      projectDetail: String(body.projectDetail || ""),
      clientName: String(body.clientName || ""),
      company: String(body.company || ""),
      contact: String(body.contact || ""),
      amount: received,
      type: String(body.type || ""),
      method: String(body.method || ""),
      transactionId: String(body.transactionId || ""),
      date: String(body.date || ""),
      approval: "pending",
    };
    await Store.findOneAndUpdate(
      { key: financeKey, owner: COMPANY },
      {
        key: financeKey,
        owner: COMPANY,
        data: {
          ...current,
          payments: Array.isArray(current.payments) ? current.payments : [],
          expenses: Array.isArray(current.expenses) ? current.expenses : [],
          revenue: Array.isArray(current.revenue) ? current.revenue : [],
          categories: Array.isArray(current.categories) ? current.categories : [],
          projectInvoices: [invoice, ...invoices],
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    const noticeStore = await Store.findOne({ key: noticesKey, owner: COMPANY }).lean();
    const notices = Array.isArray(noticeStore?.data) ? [...noticeStore.data] : [];
    const who = invoice.clientName || invoice.projectName || "a client";
    const text = `${salesOwner} submitted a payment of LKR ${received.toLocaleString("en-US")} for ${who}. Review it under Sales, Sales & Collection Approvals.`;
    const ceos = await User.find({ role: "ceo", active: { $ne: false } }).select("username").lean();
    ceos.forEach((ceo) => {
      if (notices.some((item) => item?.to === ceo.username && item?.text === text)) return;
      notices.unshift({
        id: crypto.randomUUID(),
        to: ceo.username,
        text,
        invoiceId: invoice.id,
        created: new Date().toISOString(),
      });
    });
    await Store.findOneAndUpdate(
      { key: noticesKey, owner: COMPANY },
      { key: noticesKey, owner: COMPANY, data: notices.slice(0, 80) },
      { upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ ok: true, invoice });
  });

  app.put("/api/stores/batch", requireAuth, async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const rejected = [];
    const accepted = [];
    for (const item of items) {
      const key = String(item?.key || "").trim();
      const owner = String(item?.owner || COMPANY).trim() || COMPANY;
      if (!key) continue;
      const ownTasks = req.user.role === "employee"
        && key === "neon-crm-tasks"
        && owner !== req.user.username
        && owner !== COMPANY
        && !item.deleted;
      if (!canWriteStore(req.user, key, owner) && !ownTasks) {
        rejected.push({ key, owner });
        continue;
      }
      accepted.push({
        key,
        owner,
        deleted: Boolean(item.deleted),
        data: item.deleted ? undefined : item.data ?? null,
        mergeEmployeeTasks: ownTasks,
      });
    }
    if (rejected.length) {
      await writeAudit(req.user.username, "stores.denied", { rejected });
    }
    if (!accepted.length) {
      if (rejected.length) {
        return res.status(403).json({ error: "You cannot change another account’s records.", rejected });
      }
      return res.json({ ok: true, rejected: [] });
    }
    for (const item of accepted) {
      if (item.mergeEmployeeTasks) {
        await mergeEmployeeTasks(item.owner, req.user.username, item.data);
        continue;
      }
      if (item.deleted) {
        await Store.deleteOne({ key: item.key, owner: item.owner });
        continue;
      }
      if (item.key === REGISTRY_KEY && item.owner === COMPANY) {
        await unionRegistryIds(item.data);
        continue;
      }
      await Store.findOneAndUpdate(
        { key: item.key, owner: item.owner },
        { key: item.key, owner: item.owner, data: item.data },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }
    if (accepted.length) {
      await writeAudit(req.user.username, "stores.saved", {
        items: accepted.map((item) => ({ key: item.key, owner: item.owner, deleted: item.deleted })),
      });
    }
    res.json({ ok: true, rejected });
  });

  app.delete("/api/stores/owner/:owner", requireAuth, requireCeo, async (req, res) => {
    const owner = String(req.params.owner || "").trim().toUpperCase();
    if (!owner || owner === COMPANY || isCeo(owner)) {
      return res.status(400).json({ error: "That account was not found." });
    }
    await Store.deleteMany({ owner });
    await writeAudit(req.user.username, "stores.owner-cleared", { owner });
    res.json({ ok: true });
  });

  app.get("/api/audit", requireAuth, requireCeo, async (_req, res) => {
    const rows = await Audit.find().sort({ createdAt: -1 }).limit(200).lean();
    res.json({
      events: rows.map((item) => ({
        id: String(item._id),
        at: item.createdAt,
        actor: item.actor,
        action: item.action,
        detail: item.detail || {},
      })),
    });
  });

  const dist = path.join(__dirname, "..", "dist");
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res, next) => {
    res.sendFile(path.join(dist, "index.html"), (err) => {
      if (err) next();
    });
  });

  return app;
}

export async function start() {
  try {
    secret();
    await mongoose.connect(MONGODB_URI);
    await seedCeo();
    await ensureCeoRecoveryEmail();
    const app = createApp();
    app.listen(PORT, () => {
      console.log(`Neon CRM API on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Could not start the API. Is MongoDB running, and is JWT_SECRET set?");
    console.error(error.message);
    process.exit(1);
  }
}

const launchedDirectly = process.argv[1] && path.normalize(fileURLToPath(import.meta.url)) === path.normalize(process.argv[1]);
if (launchedDirectly) start();
