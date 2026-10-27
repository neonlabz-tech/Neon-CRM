import "dotenv/config";
import mongoose from "mongoose";

const localUri = process.env.LOCAL_MONGODB_URI || "mongodb://127.0.0.1:27017/neon-crm";
const atlasUri = process.env.ATLAS_URI || "";

function dbNameFromUri(uri, fallback) {
  try {
    const parsed = new URL(uri.replace("mongodb+srv://", "https://").replace("mongodb://", "http://"));
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, "")).split("?")[0];
    return name || fallback;
  } catch {
    return fallback;
  }
}

if (!atlasUri || atlasUri.includes("127.0.0.1") || atlasUri.includes("localhost")) {
  console.error("Set ATLAS_URI in .env to your MongoDB Atlas connection string, including /neon-crm");
  process.exit(1);
}

const localName = dbNameFromUri(localUri, "neon-crm");
const atlasName = dbNameFromUri(atlasUri, "neon-crm");

const local = await mongoose.createConnection(localUri).asPromise();
const atlas = await mongoose.createConnection(atlasUri).asPromise();

const collections = ["users", "stores", "audits"];
for (const name of collections) {
  const docs = await local.useDb(localName).collection(name).find({}).toArray();
  const dest = atlas.useDb(atlasName).collection(name);
  await dest.deleteMany({});
  if (docs.length) await dest.insertMany(docs);
  console.log(`${name}: copied ${docs.length} document(s)`);
}

await local.close();
await atlas.close();
console.log(`Copied ${localName} to Atlas database ${atlasName}.`);
console.log("Then set MONGODB_URI in .env to the same Atlas string and run npm run dev.");
