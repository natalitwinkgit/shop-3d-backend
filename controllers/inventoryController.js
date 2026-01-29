import Inventory from "../models/Inventory.js";

const toNum = (x, def = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
};

const clamp0 = (n) => Math.max(0, toNum(n, 0));

// GET /api/inventory/product/:productId
export async function getByProduct(req, res) {
  try {
    const { productId } = req.params;

    const items = await Inventory.find({ product: productId })
      .populate("location", "type city nameKey addressKey isActive")
      .lean();

    const out = items.map((it) => {
      const onHand = clamp0(it.onHand);
      const reserved = clamp0(it.reserved);
      const available = Math.max(0, onHand - reserved);

      return {
        locationId: it.location?._id,
        locationType: it.location?.type || "",
        city: it.location?.city || "",
        locationNameKey: it.location?.nameKey || "",
        addressKey: it.location?.addressKey || "",
        isActive: it.location?.isActive ?? true,

        onHand,
        reserved,
        available,
      };
    });

    return res.json(out);
  } catch (e) {
    return res.status(500).json({ message: "Inventory load failed", error: String(e?.message || e) });
  }
}

// PATCH /api/inventory
export async function upsert(req, res) {
  try {
    const { productId, locationId } = req.body;

    if (!productId || !locationId) {
      return res.status(400).json({ message: "productId and locationId are required" });
    }

    const onHand = clamp0(req.body.onHand);
    const reserved = clamp0(req.body.reserved);

    const doc = await Inventory.findOneAndUpdate(
      { product: productId, location: locationId },
      { $set: { onHand, reserved } },
      { new: true, upsert: true }
    )
      .populate("location", "type city nameKey addressKey isActive")
      .lean();

    const available = Math.max(0, clamp0(doc.onHand) - clamp0(doc.reserved));

    return res.json({
      locationId: doc.location?._id,
      locationType: doc.location?.type || "",
      city: doc.location?.city || "",
      locationNameKey: doc.location?.nameKey || "",
      addressKey: doc.location?.addressKey || "",
      isActive: doc.location?.isActive ?? true,

      onHand: clamp0(doc.onHand),
      reserved: clamp0(doc.reserved),
      available,
    });
  } catch (e) {
    if (String(e).includes("E11000")) {
      return res.status(409).json({ message: "Duplicate inventory row (product+location)" });
    }
    return res.status(500).json({ message: "Upsert failed", error: String(e?.message || e) });
  }
}
