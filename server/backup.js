import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { Audit, Store, User } from "./models.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/neon-crm";
const folder = path.join(__dirname, "..", "backups");

await mongoose.connect(uri);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
await fs.mkdir(folder, { recursive: true });
const file = path.join(folder, `neon-crm-${stamp}.json`);

const payload = {
  at: new Date().toISOString(),
  users: await User.find().select("+passwordHash").lean(),
  stores: await Store.find().lean(),
  audit: await Audit.find().sort({ createdAt: -1 }).limit(2000).lean(),
};

await fs.writeFile(file, JSON.stringify(payload, null, 2), "utf8");
await mongoose.disconnect();
console.log(`Backup written to ${file}`);
