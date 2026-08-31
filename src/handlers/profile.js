import { Markup } from 'telegraf';
import { BUTTONS } from '../config/constants.js';
import { UserService } from '../services/userService.js';
import { formatMoney, formatDateOnly, escapeHtml } from '../utils/formatters.js';
import { requireSubscription } from '../middlewares/checkSubscription.js';
import { logger } from '../utils/logger.js';

export function registerProfileHandlers(bot) {
  bot.hears(BUTTONS.PROFILE, requireSubscription, async (ctx) => {
    try {
      const user = await UserService.getUserProfile(ctx.from.id);
      if (!user) {
        return ctx.reply("Profil ma'lumotlari topilmadi.");
      }

      const name = escapeHtml(user.firstName || 'Foydalanuvchi');
      const telegramId = user.telegramId.toString();
      const balance = formatMoney(Number(user.balance));
      const totalDeposited = formatMoney(Number(user.totalDeposited));
      const purchasesCount = user._count?.purchases || 0;
      const registeredDate = formatDateOnly(user.createdAt);

      // Ssilka faqat adminga ko'rinadi
      const nameDisplay = ctx.isAdmin
        ? `<a href="tg://user?id=${telegramId}">${name}</a> 👑`
        : name;

      let messageText =
        `👤 <b>Profil ma'lumotlari</b>\n\n` +
        `🏷 <b>Ism:</b> ${nameDisplay}\n` +
        `🆔 <b>Telegram ID:</b> <code>${telegramId}</code>\n` +
        `💰 <b>Balans:</b> <code>${balance}</code>\n` +
        `🛒 <b>Xaridlar soni:</b> ${purchasesCount} ta\n` +
        `💳 <b>Jami to'ldirilgan:</b> <code>${totalDeposited}</code>\n` +
        `📅 <b>Ro'yxatdan o'tgan sana:</b> ${registeredDate}`;

      if (ctx.isAdmin) {
        messageText += `\n\n🔗 <b>Sizning profilingiz:</b> <a href="tg://user?id=${telegramId}">Havola ustiga bosing</a>`;
      }

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("💳 Balans to'ldirish", 'nav_deposit')],
        [Markup.button.callback('📦 Mening promokodlarim', 'nav_my_promos')],
      ]);

      await ctx.reply(messageText, {
        parse_mode: 'HTML',
        ...keyboard,
      });
    } catch (error) {
      logger.error('Error in profile handler:', error);
      await ctx.reply("Profilni yuklashda xatolik yuz berdi.");
    }
  });
}
