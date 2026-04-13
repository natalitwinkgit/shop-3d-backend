import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: String(process.env.NODE_ENV || "development"),
  port: Number(process.env.PORT || 5000),
  mongoUri: String(
    process.env.MONGO_URI || process.env.MONGO_URL || process.env.DATABASE_URL || ""
  ).trim(),
  jwtSecret: String(process.env.JWT_SECRET || "").trim(),
};
