import { logger } from '../utils/logger.js';

export function errorHandler(error, ctx) {
  logger.error(`Unhandled bot error for update ${ctx.update?.update_id}:`, error);

  try {
    if (ctx.callbackQuery) {
      ctx.answerCbQuery("⚠️ Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.", {
        show_alert: true,
      }).catch(() => {});
    } else {
      ctx.reply(
        "⚠️ Texnik xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring yoki adminga murojaat qiling."
      ).catch(() => {});
    }
  } catch (err) {
    logger.error('Failed to send error message to user:', err);
  }
}
