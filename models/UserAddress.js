import mongoose from "mongoose";

const userAddressSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    addressLine: { type: String, trim: true, default: "" },
    comment: { type: String, trim: true, default: "" },
    isPrimary: { type: Boolean, default: false, index: true },
    sortOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

userAddressSchema.index({ user: 1, sortOrder: 1 });
userAddressSchema.index({ user: 1, isPrimary: 1 });

export default mongoose.models.UserAddress || mongoose.model("UserAddress", userAddressSchema);
