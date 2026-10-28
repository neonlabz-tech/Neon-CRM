import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import { createApp } from "./index.js";
import { Store, User } from "./models.js";

const uri = "mongodb://127.0.0.1:27017/neon-crm-test";
let server;
let base = "";
let ceoToken = "";

async function json(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

before(async () => {
  process.env.JWT_SECRET = "test-secret-not-for-production";
  process.env.NODE_ENV = "test";
  await mongoose.connect(uri);
  await User.deleteMany({});
  await Store.deleteMany({});
  const bcrypt = (await import("bcryptjs")).default;
  await User.create({
    username: "CEO001",
    role: "ceo",
    passwordHash: await bcrypt.hash("ceo12345", 10),
    passwordSource: "updated",
    active: true,
  });
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
});

test("login rejects a bad password and does not return a password field", async () => {
  const failed = await json("/api/auth/login", { method: "POST", body: { username: "CEO001", password: "wrong" } });
  assert.equal(failed.res.status, 401);
  const ok = await json("/api/auth/login", { method: "POST", body: { username: "CEO001", password: "ceo12345" } });
  assert.equal(ok.res.status, 200);
  assert.ok(ok.data.token);
  assert.equal(ok.data.user.username, "CEO001");
  assert.equal(ok.data.user.password, undefined);
  ceoToken = ok.data.token;
});

test("bootstrap hides other accounts from a non-CEO and never returns passwords", async () => {
  const bcrypt = (await import("bcryptjs")).default;
  await User.create({
    username: "SD001",
    role: "sales",
    passwordHash: await bcrypt.hash("sales123", 10),
    passwordSource: "updated",
    active: true,
  });
  await Store.create({ key: "neon-crm-sales", owner: "SD001", data: { quotes: ["secret"] } });
  await Store.create({ key: "neon-crm-finance", owner: "company", data: { payments: [1] } });
  const sales = await json("/api/auth/login", { method: "POST", body: { username: "SD001", password: "sales123" } });
  const boot = await json("/api/bootstrap", { token: sales.data.token });
  assert.equal(boot.res.status, 200);
  assert.ok(boot.data.users.every((user) => user.password === undefined));
  assert.ok(boot.data.stores.some((item) => item.key === "neon-crm-sales" && item.owner === "SD001"));
  assert.ok(!boot.data.stores.some((item) => item.key === "neon-crm-finance"));
});

test("a sales account cannot write another owner’s store", async () => {
  const sales = await json("/api/auth/login", { method: "POST", body: { username: "SD001", password: "sales123" } });
  const denied = await json("/api/stores/batch", {
    method: "PUT",
    token: sales.data.token,
    body: { items: [{ key: "neon-crm-sales", owner: "CEO001", data: { quotes: [] } }] },
  });
  assert.equal(denied.res.status, 403);
});

test("user sync cannot delete the CEO and does not return passwords", async () => {
  const sync = await json("/api/users", {
    method: "PUT",
    token: ceoToken,
    body: { users: [{ username: "SD001", password: "sales1234", active: true }] },
  });
  assert.equal(sync.res.status, 200);
  assert.ok(sync.data.users.some((user) => user.username === "CEO001"));
  assert.ok(sync.data.users.every((user) => user.password === undefined));
});

test("forgot password uses the same reply for known and unknown accounts", async () => {
  const bcrypt = (await import("bcryptjs")).default;
  const existing = await User.findOne({ username: "SD001" });
  if (!existing) {
    await User.create({
      username: "SD001",
      role: "sales",
      passwordHash: await bcrypt.hash("sales123", 10),
      passwordSource: "updated",
      active: true,
    });
  }
  const unknown = await json("/api/auth/forgot", { method: "POST", body: { username: "PM999" } });
  const known = await json("/api/auth/forgot", { method: "POST", body: { username: "SD001" } });
  assert.equal(unknown.res.status, 200);
  assert.equal(known.res.status, 200);
  assert.equal(unknown.data.message, known.data.message);
  assert.equal(unknown.data.password, undefined);
  assert.equal(known.data.username, undefined);
  const listed = await json("/api/auth/reset-requests", { token: ceoToken });
  assert.equal(listed.res.status, 200);
  assert.ok(listed.data.requests.some((item) => item.username === "SD001"));
});

test("viewing a password requires the CEO password and never returns one", async () => {
  const denied = await json("/api/users/password-view", {
    method: "POST",
    token: ceoToken,
    body: { username: "SD001", password: "wrong" },
  });
  assert.equal(denied.res.status, 401);
  assert.equal(denied.data.password, undefined);
  const checked = await json("/api/users/password-view", {
    method: "POST",
    token: ceoToken,
    body: { username: "SD001", password: "ceo12345" },
  });
  assert.equal(checked.res.status, 200);
  assert.equal(checked.data.viewable, false);
  assert.equal(checked.data.password, undefined);
  const issued = await json("/api/users", {
    method: "POST",
    token: ceoToken,
    body: { username: "SD001", password: "issued123", active: true },
  });
  assert.equal(issued.res.status, 200);
  const viewed = await json("/api/users/password-view", {
    method: "POST",
    token: ceoToken,
    body: { username: "SD001", password: "ceo12345" },
  });
  assert.equal(viewed.res.status, 200);
  assert.equal(viewed.data.viewable, true);
  assert.equal(viewed.data.password, "issued123");
  assert.equal(viewed.data.passwordHash, undefined);
});

test("CEO profile email is the password recovery address", async () => {
  await User.updateOne({ username: "CEO001" }, { $set: { email: "neonlabz@gmail.com", fullName: "Neon CEO" } });
  const profile = await json("/api/profile", { token: ceoToken });
  assert.equal(profile.res.status, 200);
  assert.equal(profile.data.profile.email, "neonlabz@gmail.com");
  assert.equal(profile.data.profile.password, undefined);
  assert.equal(profile.data.profile.passwordHash, undefined);
  const saved = await json("/api/profile", {
    method: "PUT",
    token: ceoToken,
    body: { fullName: "Neon CEO", email: "neonlabz@gmail.com", phone: "", address: "" },
  });
  assert.equal(saved.res.status, 200);
  assert.equal(saved.data.profile.email, "neonlabz@gmail.com");
  const reset = await json("/api/auth/forgot", { method: "POST", body: { username: "neonlabz@gmail.com" } });
  assert.equal(reset.res.status, 503);
  assert.match(reset.data.error, /could not be sent/i);
});

test("a CEO reset link is single use", async () => {
  const { PasswordReset } = await import("./models.js");
  const { hashToken } = await import("./passwordReset.js");
  const token = "test-reset-token";
  await PasswordReset.create({
    username: "CEO001",
    tokenHash: hashToken(token),
    purpose: "ceo-link",
    expiresAt: new Date(Date.now() + 60 * 1000),
    status: "open",
  });
  const reset = await json("/api/auth/reset", {
    method: "POST",
    body: { token, password: "newceo123" },
  });
  assert.equal(reset.res.status, 200);
  const again = await json("/api/auth/reset", {
    method: "POST",
    body: { token, password: "another123" },
  });
  assert.equal(again.res.status, 400);
  const login = await json("/api/auth/login", { method: "POST", body: { username: "CEO001", password: "newceo123" } });
  assert.equal(login.res.status, 200);
});
