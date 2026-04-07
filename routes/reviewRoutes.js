// server/routes/reviewRoutes.js
import express from "express";
import mongoose from "mongoose";
import Review from "../models/Review.js";
import Product from "../models/Product.js";
import { protect } from "../middleware/authMiddleware.js";
import { isAdminRole } from "../models/userModel.js";

const router = express.Router();

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const oid = (id) => new mongoose.Types.ObjectId(id);

const noCache = (res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
};

const isAdmin = (req) => isAdminRole(req?.user?.role);

/**
 * Recompute ratingAvg/ratingCount in Product from approved reviews
 */
async function recomputeAndUpdateProductRating(productId) {
  const productObjId = oid(productId);

  const stats = await Review.aggregate([
    { $match: { product: productObjId, isApproved: true } },
    {
      $group: {
        _id: "$product",
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);

  const meta = stats?.[0] || { avgRating: 0, count: 0 };
  const avgRating = Math.round(Number(meta.avgRating || 0) * 10) / 10;
  const count = Number(meta.count || 0);

  await Product.findByIdAndUpdate(productId, {
    $set: { ratingAvg: avgRating, ratingCount: count },
  });

  return { avgRating, count };
}

/**
 * Helper: build sort object from query
 * sort = newest | oldest | rating_desc | rating_asc
 */
function parseSort(sort = "newest") {
  switch (String(sort)) {
    case "oldest":
      return { createdAt: 1 };
    case "rating_desc":
      return { rating: -1, createdAt: -1 };
    case "rating_asc":
      return { rating: 1, createdAt: -1 };
    case "newest":
    default:
      return { createdAt: -1 };
  }
}

/**
 * PUBLIC
 * GET /api/reviews/product/:productId?page=1&limit=10
 */
router.get("/product/:productId", async (req, res) => {
  try {
    noCache(res);

    const { productId } = req.params;
    if (!isValidId(productId)) return res.status(400).json({ message: "Invalid productId" });

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 50);
    const skip = (page - 1) * limit;

    const filter = { product: oid(productId), isApproved: true };

    const [items, total, stats] = await Promise.all([
      Review.find(filter)
        .populate("user", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments(filter),
      Review.aggregate([
        { $match: filter },
        { $group: { _id: "$product", avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
      ]),
    ]);

    const meta = stats?.[0] || { avgRating: 0, count: 0 };
    const avgRating = Math.round(Number(meta.avgRating || 0) * 10) / 10;

    res.json({
      items,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      avgRating,
      count: Number(meta.count || total || 0),
    });
  } catch (e) {
    console.error("GET /api/reviews/product/:productId error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ✅ NEW (PUBLIC) — All reviews page (like "Reviews" page)
 * GET /api/reviews?page=1&limit=20&sort=newest&q=диван&rating=5&productId=...
 *
 * Returns: items[] with populated user + product preview fields
 */
router.get("/", async (req, res) => {
  try {
    noCache(res);

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 50);
    const skip = (page - 1) * limit;

    const sort = parseSort(req.query.sort);

    const filter = { isApproved: true };

    // optional product filter
    const productId = String(req.query.productId || "").trim();
    if (productId) {
      if (!isValidId(productId)) return res.status(400).json({ message: "Invalid productId" });
      filter.product = oid(productId);
    }

    // optional rating filter
    const rating = Number(req.query.rating);
    if (Number.isFinite(rating) && rating >= 1 && rating <= 5) {
      filter.rating = rating;
    }

    // optional text search (simple regex, no text index required)
    const q = String(req.query.q || "").trim();
    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [{ title: { $regex: safe, $options: "i" } }, { text: { $regex: safe, $options: "i" } }];
    }

    const [items, total, avgAgg] = await Promise.all([
      Review.find(filter)
        .populate("user", "name")
        .populate("product", "name category subCategory image images price discount")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Review.countDocuments(filter),
      Review.aggregate([
        { $match: filter },
        { $group: { _id: null, avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
      ]),
    ]);

    const meta = avgAgg?.[0] || { avgRating: 0, count: 0 };
    const avgRating = Math.round(Number(meta.avgRating || 0) * 10) / 10;

    res.json({
      items,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      avgRating,
      count: Number(meta.count || total || 0),
    });
  } catch (e) {
    console.error("GET /api/reviews error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ✅ NEW (PUBLIC) — stats helper (all or by product)
 * GET /api/reviews/stats?productId=...
 */
router.get("/stats", async (req, res) => {
  try {
    noCache(res);

    const productId = String(req.query.productId || "").trim();
    const match = { isApproved: true };

    if (productId) {
      if (!isValidId(productId)) return res.status(400).json({ message: "Invalid productId" });
      match.product = oid(productId);
    }

    const stats = await Review.aggregate([
      { $match: match },
      {
        $group: {
          _id: productId ? "$product" : null,
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 },
          r1: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
          r2: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
          r3: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
          r4: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
          r5: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
        },
      },
    ]);

    const meta = stats?.[0] || { avgRating: 0, count: 0, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };
    res.json({
      avgRating: Math.round(Number(meta.avgRating || 0) * 10) / 10,
      count: Number(meta.count || 0),
      breakdown: {
        1: Number(meta.r1 || 0),
        2: Number(meta.r2 || 0),
        3: Number(meta.r3 || 0),
        4: Number(meta.r4 || 0),
        5: Number(meta.r5 || 0),
      },
    });
  } catch (e) {
    console.error("GET /api/reviews/stats error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * AUTH (user)
 * POST /api/reviews
 * body: { productId, rating, title, text }
 * upsert: 1 review per product per user
 */
router.post("/", protect, async (req, res) => {
  try {
    const { productId, rating, title, text } = req.body;

    if (!productId || rating == null) {
      return res.status(400).json({ message: "productId and rating are required" });
    }
    if (!isValidId(productId)) return res.status(400).json({ message: "Invalid productId" });

    const r = Number(rating);
    if (!Number.isFinite(r) || r < 1 || r > 5) {
      return res.status(400).json({ message: "rating must be 1..5" });
    }

    const exists = await Product.findById(productId).select("_id");
    if (!exists) return res.status(404).json({ message: "Product not found" });

    const doc = await Review.findOneAndUpdate(
      { product: productId, user: req.user._id },
      {
        rating: r,
        title: title || "",
        text: text || "",
        isApproved: true,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).populate("user", "name");

    const { avgRating, count } = await recomputeAndUpdateProductRating(productId);

    res.json({ review: doc, avgRating, count });
  } catch (e) {
    console.error("POST /api/reviews error:", e);
    // unique constraint (rare race)
    if (e?.code === 11000) return res.status(409).json({ message: "Review already exists" });
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ✅ NEW (admin) — approve/unapprove review
 * PATCH /api/reviews/:id/approve
 * body: { isApproved: true/false }
 */
router.patch("/:id/approve", protect, async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: "Admin only" });

    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid review id" });

    const isApproved = !!req.body?.isApproved;

    const doc = await Review.findByIdAndUpdate(
      id,
      { $set: { isApproved } },
      { new: true }
    );

    if (!doc) return res.status(404).json({ message: "Review not found" });

    // update product rating if product exists
    await recomputeAndUpdateProductRating(doc.product);

    res.json({ ok: true, review: doc });
  } catch (e) {
    console.error("PATCH /api/reviews/:id/approve error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ✅ NEW (admin or owner) — delete review
 * DELETE /api/reviews/:id
 */
router.delete("/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ message: "Invalid review id" });

    const doc = await Review.findById(id);
    if (!doc) return res.status(404).json({ message: "Review not found" });

    const owner = String(doc.user) === String(req.user._id);
    if (!owner && !isAdmin(req)) return res.status(403).json({ message: "Forbidden" });

    const productId = String(doc.product);
    await Review.deleteOne({ _id: id });

    await recomputeAndUpdateProductRating(productId);

    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/reviews/:id error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
