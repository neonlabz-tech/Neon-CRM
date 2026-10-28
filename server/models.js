import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, uppercase: true, trim: true },
    role: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
    passwordVault: { type: String, select: false, default: "" },
    password: { type: String, select: false, default: undefined },
    passwordSource: { type: String, enum: ["issued", "updated"], default: "issued" },
    passwordUpdatedAt: { type: Date, default: null },
    email: { type: String, lowercase: true, trim: true, default: "" },
    fullName: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const storeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, index: true },
    owner: { type: String, required: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

storeSchema.index({ key: 1, owner: 1 }, { unique: true });

const auditSchema = new mongoose.Schema(
  {
    actor: { type: String, required: true },
    action: { type: String, required: true },
    detail: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

auditSchema.index({ createdAt: -1 });

const passwordResetSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, uppercase: true, trim: true, index: true },
    tokenHash: { type: String, default: "", index: true },
    purpose: { type: String, enum: ["ceo-link", "staff-request"], required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    status: { type: String, enum: ["open", "completed"], default: "open" },
  },
  { timestamps: true }
);

export const User = mongoose.models.User || mongoose.model("User", userSchema);
export const Store = mongoose.models.Store || mongoose.model("Store", storeSchema);
export const Audit = mongoose.models.Audit || mongoose.model("Audit", auditSchema);
export const PasswordReset = mongoose.models.PasswordReset || mongoose.model("PasswordReset", passwordResetSchema);
