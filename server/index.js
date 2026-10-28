import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";
import { Audit, Store, User } from "./models.js";
import { COMPANY, canReadStore, canWriteStore, isCeo, roleFromUsername } from "./access.js";
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
    res.json({
      user: publicUser(user),
      users: users.map((item) => publicUser(item)),
      stores: stores
        .filter((item) => canReadStore(req.user, item.key, item.owner))
        .map((item) => ({ key: item.key, owner: item.owner, data: item.data })),
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

  app.put("/api/stores/batch", requireAuth, async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const rejected = [];
    const accepted = [];
    for (const item of items) {
      const key = String(item?.key || "").trim();
      const owner = String(item?.owner || COMPANY).trim() || COMPANY;
      if (!key) continue;
      if (!canWriteStore(req.user, key, owner)) {
        rejected.push({ key, owner });
        continue;
      }
      accepted.push({ key, owner, deleted: Boolean(item.deleted), data: item.deleted ? undefined : item.data ?? null });
    }
    if (rejected.length) {
      await writeAudit(req.user.username, "stores.denied", { rejected });
      return res.status(403).json({ error: "You cannot change another account’s records." });
    }
    for (const item of accepted) {
      if (item.deleted) {
        await Store.deleteOne({ key: item.key, owner: item.owner });
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
    res.json({ ok: true });
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
