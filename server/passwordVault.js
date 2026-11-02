import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const WEAK_SECRET = "neon-crm-dev-secret-change-me";

function vaultKey() {
  const configured = process.env.JWT_SECRET || "";
  const secret = configured && configured !== WEAK_SECRET ? configured : (configured || WEAK_SECRET);
  return scryptSync(secret, "neon-crm-password-vault", 32);
}

export function sealPassword(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function openPassword(sealed) {
  if (!sealed || !String(sealed).includes(".")) return "";
  try {
    const [iv, tag, data] = String(sealed).split(".");
    const decipher = createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}
