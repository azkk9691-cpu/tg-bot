import { ChannelService } from '../services/channelService.js';
import { getSubscriptionKeyboard } from '../keyboards/inlineKeyboards.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware or helper to verify channel subscriptions
 */
export async function requireSubscription(ctx, next) {
  // Admins bypass subscription check
  if (ctx.isAdmin) {
    return next();
  }

  if (!ctx.from) return next();

  try {
    const { isSubscribed, missingChannels } = await ChannelService.checkAllSubscriptions(
      ctx.telegram,
      ctx.from.id
    );

    if (!isSubscribed) {
      const messageText =
        `👋 <b>Assalomu alaykum!</b>\n\n` +
        `⚠️ Botdan foydalanish uchun avval quyidagi kanallarga obuna bo'ling:`;

      const keyboard = getSubscriptionKeyboard(missingChannels);

      if (ctx.callbackQuery) {
        await ctx.answerCbQuery("⚠️ Iltimos, barcha kanallarga obuna bo'ling!", { show_alert: true });
        await ctx.reply(messageText, { parse_mode: 'HTML', ...keyboard });
      } else {
        await ctx.reply(messageText, { parse_mode: 'HTML', ...keyboard });
      }
      return;
    }

    return next();
  } catch (error) {
    logger.error('Error in requireSubscription middleware:', error);
    return next();
  }
}
