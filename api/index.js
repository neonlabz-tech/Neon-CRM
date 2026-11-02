import { createApp, seedCeo, ensureCeoRecoveryEmail } from "../server/index.js";
import mongoose from "mongoose";
import "dotenv/config";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/neon-crm";

let ready = false;

async function ensureReady() {
  if (ready) return;
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(MONGODB_URI);
  }
  await seedCeo();
  await ensureCeoRecoveryEmail();
  ready = true;
}

const app = createApp();

export default async function handler(req, res) {
  await ensureReady();
  app(req, res);
}
