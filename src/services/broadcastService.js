import prisma from '../database/prisma.js';
import { logger } from '../utils/logger.js';

export class BroadcastService {
  /**
   * Broadcast message to all registered users with rate-limiting and error handling
   */
  static async sendBroadcast(telegram, sourceMessage, onProgress = null) {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          telegramId: true,
        },
      });

      const total = users.length;
      let sent = 0;
      let blocked = 0;
      let failed = 0;

      logger.info(`Starting broadcast to ${total} users...`);

      for (let i = 0; i < total; i++) {
        const user = users[i];
        const targetChatId = user.telegramId.toString();

        try {
          // Copy message preserving formatting, photos, entities
          await telegram.copyMessage(targetChatId, sourceMessage.chat.id, sourceMessage.message_id);
          sent++;
        } catch (error) {
          const errCode = error.response?.error_code;
          const description = error.response?.description || error.message;

          if (errCode === 403 || description.includes('bot was blocked') || description.includes('user is deactivated')) {
            blocked++;
          } else if (errCode === 429) {
            // Rate limit hit -> wait recommended time
            const retryAfter = (error.response?.parameters?.retry_after || 1) * 1000;
            logger.warn(`Rate limit hit during broadcast, waiting ${retryAfter}ms`);
            await new Promise((resolve) => setTimeout(resolve, retryAfter));
            // Retry once
            try {
              await telegram.copyMessage(targetChatId, sourceMessage.chat.id, sourceMessage.message_id);
              sent++;
            } catch {
              failed++;
            }
          } else {
            failed++;
          }
        }

        // Small delay to respect Telegram rate limits (~25-30 msg/sec)
        await new Promise((resolve) => setTimeout(resolve, 40));

        // Trigger progress callback every 50 users or at the end
        if (onProgress && (i % 50 === 0 || i === total - 1)) {
          onProgress({
            current: i + 1,
            total,
            sent,
            blocked,
            failed,
          });
        }
      }

      logger.info(`Broadcast completed: ${sent} sent, ${blocked} blocked, ${failed} failed.`);

      return {
        total,
        sent,
        blocked,
        failed,
      };
    } catch (error) {
      logger.error('Error during broadcast execution:', error);
      throw error;
    }
  }
}
