import { Markup } from 'telegraf';
import { BUTTONS } from '../config/constants.js';
import { UserService } from '../services/userService.js';
import { formatMoney } from '../utils/formatters.js';
import { requireSubscription } from '../middlewares/checkSubscription.js';
import { logger } from '../utils/logger.js';

export function registerBalanceHandlers(bot) {
  bot.hears(BUTTONS.BALANCE, requireSubscription, async (ctx) => {
    try {
      const user = await UserService.getUserByTelegramId(ctx.from.id);
      const balanceAmount = user ? Number(user.balance) : 0;
      const formattedBalance = formatMoney(balanceAmount);

      const messageText =
        `💰 <b>Sizning balansingiz:</b> <code>${formattedBalance}</code>\n\n` +
        `💡 <i>Balans orqali istalgan BULDROP PM promokodlarini xarid qilishingiz mumkin.</i>`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("💳 Balans to'ldirish", 'nav_deposit')],
        [Markup.button.callback('🛒 Promokod sotib olish', 'nav_promo_list')],
      ]);

      await ctx.reply(messageText, {
        parse_mode: 'HTML',
        ...keyboard,
      });
    } catch (error) {
      logger.error('Error in balance handler:', error);
      await ctx.reply("Balansni yuklashda xatolik yuz berdi. Qayta urinib ko'ring.");
    }
  });
}
