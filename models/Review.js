// server/models/Review.js
import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 80, default: "" },
    text: { type: String, trim: true, maxlength: 2000, default: "" },

    // moderation
    isApproved: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// user can leave 1 review per product
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

// helpful indexes for global list
reviewSchema.index({ createdAt: -1 });
reviewSchema.index({ rating: -1 });

// optional: search by title/text (enable if you want q search faster)
// reviewSchema.index({ title: "text", text: "text" });

export default mongoose.model("Review", reviewSchema);
