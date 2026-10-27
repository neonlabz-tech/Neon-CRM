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
