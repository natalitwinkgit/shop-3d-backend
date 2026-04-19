import { getTelegramUpdates } from "./integrations/telegramApi.js";
import { handleTelegramUpdate } from "./services/botService.js";
import { logger } from "./utils/logger.js";

let stopped = false;

export const stopTelegramPolling = () => {
  stopped = true;
};

export const startTelegramPolling = async () => {
  let offset = 0;
  logger.info("Telegram polling started");

  while (!stopped) {
    try {
      const updates = await getTelegramUpdates({ offset, timeout: 30 });
      for (const update of updates || []) {
        offset = Math.max(offset, Number(update.update_id || 0) + 1);
        await handleTelegramUpdate(update).catch((error) => {
          logger.error("Telegram polling update failed", { updateId: update.update_id }, error);
        });
      }
    } catch (error) {
      logger.warn("Telegram polling failed, retrying", {}, error);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
};
