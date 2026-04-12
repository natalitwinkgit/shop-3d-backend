import { getAllColors, lookupColor, findColors } from "../services/colorService.js";

export const getColors = async (req, res, next) => {
  try {
    const colors = await getAllColors({ onlyActive: req.query.active !== "false" });
    res.json(colors);
  } catch (error) {
    next(error);
  }
};

export const searchColors = async (req, res, next) => {
  try {
    const query = String(req.query.q || "").trim();
    if (!query) {
      return res.status(400).json({ message: "q is required" });
    }

    const colors = await findColors(query);
    res.json(colors);
  } catch (error) {
    next(error);
  }
};

export const getNearestColor = async (req, res, next) => {
  try {
    const hex = req.query.hex ? String(req.query.hex).trim() : undefined;
    const rgb = req.query.rgb ? String(req.query.rgb).trim() : undefined;

    if (!hex && !rgb) {
      return res.status(400).json({ message: "hex or rgb is required" });
    }

    const result = await lookupColor({ hex, rgb });
    if (!result) {
      return res.status(400).json({ message: "Invalid hex or rgb format or no colors available" });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};
