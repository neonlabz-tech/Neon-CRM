import "dotenv/config";
import mongoose from "mongoose";
import { writeFileSync } from "node:fs";
import { User } from "./models.js";
import { openPassword } from "./passwordVault.js";

const out = process.argv[2];
await mongoose.connect(process.env.MONGODB_URI);
const user = await User.findOne({ username: "SD001" }).select("+passwordVault");
writeFileSync(out, openPassword(user?.passwordVault || ""), { encoding: "utf8" });
await mongoose.disconnect();
