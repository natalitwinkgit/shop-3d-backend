import mongoose from "mongoose";

import { telegramEnv } from "./env.js";
import { logger } from "../utils/logger.js";

export const connectTelegramDatabase = async () => {
  await mongoose.connect(telegramEnv.mongoUri);
  logger.info("Telegram service MongoDB connected");
};

export const disconnectTelegramDatabase = async () => {
  await mongoose.connection.close();
  logger.info("Telegram service MongoDB connection closed");
};
