import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, uppercase: true, trim: true },
    role: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
    password: { type: String, select: false, default: undefined },
    passwordSource: { type: String, enum: ["issued", "updated"], default: "issued" },
    passwordUpdatedAt: { type: Date, default: null },
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

export const User = mongoose.models.User || mongoose.model("User", userSchema);
export const Store = mongoose.models.Store || mongoose.model("Store", storeSchema);
export const Audit = mongoose.models.Audit || mongoose.model("Audit", auditSchema);
