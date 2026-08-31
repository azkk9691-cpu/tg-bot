import { ChannelService } from '../services/channelService.js';
import { getMainMenuKeyboard } from '../keyboards/mainKeyboards.js';
import { getSubscriptionKeyboard } from '../keyboards/inlineKeyboards.js';
import { BUTTONS } from '../config/constants.js';
import { escapeHtml } from '../utils/formatters.js';
import { logger } from '../utils/logger.js';

/**
 * Send Main Menu to user
 */
export async function sendMainMenu(ctx, customMessage = null) {
  if (ctx.session) {
    ctx.session.reset();
  }

  const name = escapeHtml(ctx.from?.first_name || 'Foydalanuvchi');
  const message =
    customMessage ||
    `🏠 <b>Bosh sahifa</b>\n\n` +
      `Assalomu alaykum, <b>${name}</b>!\n` +
      `Quyidagi bo'limlardan birini tanlang:`;

  const keyboard = getMainMenuKeyboard(ctx.isAdmin);

  if (ctx.callbackQuery) {
    try {
      await ctx.answerCbQuery();
      await ctx.deleteMessage().catch(() => {});
    } catch {}
  }

  return await ctx.reply(message, {
    parse_mode: 'HTML',
    ...keyboard,
  });
}

/**
 * Register Start and Main Menu handlers
 */
export function registerStartHandlers(bot) {
  // /start command
  bot.command('start', async (ctx) => {
    try {
      // Check mandatory subscriptions
      if (!ctx.isAdmin) {
        const { isSubscribed, missingChannels } = await ChannelService.checkAllSubscriptions(
          ctx.telegram,
          ctx.from.id
        );

        if (!isSubscribed) {
          const text =
            `👋 <b>Assalomu alaykum!</b>\n\n` +
            `⚠️ Botdan foydalanish uchun avval quyidagi kanallarga obuna bo'ling:`;

          return await ctx.reply(text, {
            parse_mode: 'HTML',
            ...getSubscriptionKeyboard(missingChannels),
          });
        }
      }

      await sendMainMenu(ctx);
    } catch (error) {
      logger.error('Error in /start handler:', error);
      await ctx.reply("Xatolik yuz berdi. Iltimos, qayta /start bosing.");
    }
  });

  // Callback query: check_subscription
  bot.action('check_subscription', async (ctx) => {
    try {
      const { isSubscribed, missingChannels } = await ChannelService.checkAllSubscriptions(
        ctx.telegram,
        ctx.from.id
      );

      if (!isSubscribed) {
        await ctx.answerCbQuery(
          "⚠️ Siz hali barcha kanallarga obuna bo'lmadingiz. Iltimos, obuna bo'ling!",
          { show_alert: true }
        );
        return;
      }

      await ctx.answerCbQuery("✅ Obuna tasdiqlandi! Xush kelibsiz!", { show_alert: false });
      await ctx.deleteMessage().catch(() => {});
      await sendMainMenu(ctx, `🎉 <b>Obuna muvaffaqiyatli tasdiqlandi!</b>\n\n🏠 <b>Bosh sahifa:</b>\nQuyidagi bo'limlardan birini tanlang:`);
    } catch (error) {
      logger.error('Error in check_subscription action:', error);
      await ctx.answerCbQuery("⚠️ Tekshirishda xatolik yuz berdi. Qayta urinib ko'ring.", {
        show_alert: true,
      });
    }
  });

  // Main menu button / callback
  bot.hears(BUTTONS.MAIN_MENU, async (ctx) => {
    await sendMainMenu(ctx);
  });

  bot.action('nav_main_menu', async (ctx) => {
    await sendMainMenu(ctx);
  });

  bot.hears(BUTTONS.CANCEL, async (ctx) => {
    ctx.session?.reset();
    await sendMainMenu(ctx, `❌ <b>Amal bekor qilindi.</b>\n\n🏠 Bosh sahifaga qaytdingiz.`);
  });
}
