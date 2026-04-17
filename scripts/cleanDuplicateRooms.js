import dotenv from "dotenv";
import mongoose from "mongoose";
import Translation from "../models/Translation.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI is not set");
  process.exit(1);
}

const collectRoomsPaths = (obj, prefix = []) => {
  const paths = [];
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const cur = [...prefix, k];
      if (k === "rooms") {
        paths.push(cur.join("."));
      }
      if (v && typeof v === "object") {
        paths.push(...collectRoomsPaths(v, cur));
      }
    }
  }
  return paths;
};

const getByPath = (obj, path) => {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
};

const run = async () => {
  try {
    await mongoose.connect(MONGO_URI, { dbName: process.env.MONGO_DB || undefined });
    console.log('Connected to MongoDB');

    const docs = await Translation.find().lean();
    for (const doc of docs) {
      console.log(`\nAnalyzing lang=${doc.lang} (id=${doc._id})`);
      const paths = collectRoomsPaths(doc);
      if (!paths.length) {
        console.log('  No rooms keys found');
        continue;
      }

      const rootRooms = getByPath(doc, 'rooms');
      console.log('  Found rooms paths:', paths.join(', '));
      if (!rootRooms) {
        console.log('  No root `rooms` present; skipping removals for safety.');
        continue;
      }

      let removedCount = 0;
      for (const p of paths) {
        if (p === 'rooms') continue; // keep root
        const val = getByPath(doc, p);
        try {
          const same = JSON.stringify(val) === JSON.stringify(rootRooms);
          if (same) {
            const unsetOp = { $unset: {} };
            unsetOp.$unset[p] = "";
            const res = await Translation.updateOne({ lang: doc.lang }, unsetOp, { upsert: false });
            console.log(`  Unset ${p}:`, res.modifiedCount ? 'removed' : 'no-op');
            removedCount += res.modifiedCount || 0;
          } else {
            console.log(`  KEEP ${p} (different from root)`);
          }
        } catch (e) {
          console.error(`  Error comparing/removing ${p}:`, e && e.message);
        }
      }
      console.log(`  Done lang=${doc.lang}: removed ${removedCount} duplicate rooms`);
    }
  } catch (err) {
    console.error('Failed:', err && err.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected');
  }
};

run();
