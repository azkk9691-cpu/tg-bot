import { Markup } from 'telegraf';
import { BUTTONS, PROMO_CATEGORIES } from '../config/constants.js';
import { PromoService } from '../services/promoService.js';
import { UserService } from '../services/userService.js';
import { formatMoney, formatDate } from '../utils/formatters.js';
import {
  getPromoCategoriesKeyboard,
  getPromoConfirmKeyboard,
  getInsufficientBalanceKeyboard,
} from '../keyboards/inlineKeyboards.js';
import { requireSubscription } from '../middlewares/checkSubscription.js';
import { logger } from '../utils/logger.js';

export function registerPromoHandlers(bot) {
  /**
   * Display Available Promo Categories
   */
  async function showPromoCategories(ctx) {
    try {
      const stockCounts = await PromoService.getAvailableStockCounts();
      const text =
        `🛒 <b>BULDROP PM Promokodlari</b>\n\n` +
        `Quyidagi ro'yxatdan o'zingizga kerakli bo'lgan promokodni tanlang:`;

      const keyboard = getPromoCategoriesKeyboard(stockCounts);

      if (ctx.callbackQuery) {
        await ctx.answerCbQuery();
        await ctx.editMessageText(text, {
          parse_mode: 'HTML',
          ...keyboard,
        });
      } else {
        await ctx.reply(text, {
          parse_mode: 'HTML',
          ...keyboard,
        });
      }
    } catch (error) {
      logger.error('Error in showPromoCategories:', error);
      await ctx.reply("Promokodlar ro'yxatini yuklashda xatolik yuz berdi.");
    }
  }

  bot.hears(BUTTONS.BUY_PROMO, requireSubscription, showPromoCategories);
  bot.action('nav_promo_list', requireSubscription, showPromoCategories);

  /**
   * Select a specific promo code category -> Show confirmation details
   */
  bot.action(/select_promo:(.+)/, requireSubscription, async (ctx) => {
    try {
      const categoryKey = ctx.match[1];
      const meta = PROMO_CATEGORIES[categoryKey];

      if (!meta) {
        await ctx.answerCbQuery("Noto'g'ri mahsulot tanlandi.", { show_alert: true });
        return;
      }

      // Check stock
      const stockCounts = await PromoService.getAvailableStockCounts();
      const inStock = stockCounts[categoryKey] || 0;

      if (inStock <= 0) {
        await ctx.answerCbQuery(
          "⚠️ Hozircha ushbu turdagi promokodlar mavjud emas. Tez orada qo'shiladi!",
          { show_alert: true }
        );
        return;
      }

      // Fetch user balance
      const user = await UserService.getUserByTelegramId(ctx.from.id);
      const userBalance = user ? Number(user.balance) : 0;

      const formattedPrice = formatMoney(meta.price);
      const formattedBalance = formatMoney(userBalance);

      const messageText =
        `📦 <b>Tanlangan mahsulot</b>\n\n` +
        `⚡ <b>Mahsulot:</b> ${meta.name}\n` +
        `💰 <b>Narxi:</b> ${formattedPrice}\n` +
        `💳 <b>Sizning balansingiz:</b> ${formattedBalance}\n\n` +
        `<i>Balansingizdan ${formattedPrice} yechiladi.</i>`;

      await ctx.answerCbQuery();
      await ctx.editMessageText(messageText, {
        parse_mode: 'HTML',
        ...getPromoConfirmKeyboard(categoryKey),
      });
    } catch (error) {
      logger.error('Error selecting promo:', error);
      await ctx.answerCbQuery("Xatolik yuz berdi. Qayta urinib ko'ring.", { show_alert: true });
    }
  });

  /**
   * Confirm and execute promo purchase (Concurrency Safe)
   */
  bot.action(/confirm_buy:(.+)/, requireSubscription, async (ctx) => {
    try {
      const categoryKey = ctx.match[1];
      const meta = PROMO_CATEGORIES[categoryKey];

      if (!meta) {
        await ctx.answerCbQuery("Noto'g'ri mahsulot tanlandi.", { show_alert: true });
        return;
      }

      const user = await UserService.findOrCreateUser(ctx.from);

      // Execute purchase in transaction with locking
      const result = await PromoService.purchasePromoCode(user.id, categoryKey);

      if (!result.success) {
        if (result.error === 'INSUFFICIENT_BALANCE') {
          await ctx.answerCbQuery("⚠️ Balansingizda mablag' yetarli emas!", { show_alert: true });

          const needed = formatMoney(result.requiredAmount);
          const current = formatMoney(result.currentBalance);

          const errorText =
            `⚠️ <b>Balansingizda mablag' yetarli emas!</b>\n\n` +
            `⚡ <b>Mahsulot:</b> ${meta.name}\n` +
            `💰 <b>Kerakli summa:</b> ${needed}\n` +
            `💳 <b>Sizning balansingiz:</b> ${current}\n\n` +
            `<i>Balansni to'ldirish orqali xarid qilishingiz mumkin.</i>`;

          await ctx.editMessageText(errorText, {
            parse_mode: 'HTML',
            ...getInsufficientBalanceKeyboard(),
          });
          return;
        }

        if (result.error === 'OUT_OF_STOCK') {
          await ctx.answerCbQuery("⚠️ Hozircha ushbu turdagi promokodlar qolmagan!", {
            show_alert: true,
          });

          await ctx.editMessageText(
            `⚠️ <b>Hozircha ushbu turdagi promokodlar mavjud emas.</b>\n\n` +
              `<i>Admin promokod qo'shganidan so'ng xarid qilishingiz mumkin.</i>`,
            {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [Markup.button.callback('⬅️ Orqaga', 'nav_promo_list')],
                [Markup.button.callback('🏠 Bosh menyu', 'nav_main_menu')],
              ]),
            }
          );
          return;
        }

        await ctx.answerCbQuery(result.message || 'Xarid amalga oshmadi.', { show_alert: true });
        return;
      }

      // Successful purchase!
      await ctx.answerCbQuery('🎉 Xarid muvaffaqiyatli amalga oshirildi!', { show_alert: false });

      const purchaseDateFormatted = formatDate(result.purchaseDate);

      const successText =
        `🎉 <b>Xaridingiz muvaffaqiyatli!</b>\n\n` +
        `⚡ <b>Mahsulot:</b> ${result.categoryName}\n\n` +
        `🔑 <b>Sizning promokodingiz:</b>\n` +
        `<code>${result.code}</code>\n\n` +
        `📅 <b>Xarid sanasi:</b>\n${purchaseDateFormatted}\n\n` +
        `💰 <b>Qolgan balansingiz:</b> ${formatMoney(result.remainingBalance)}\n\n` +
        `<i>Kod ustiga bir marta bossangiz nusxa olinadi.</i>`;

      const successKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📦 Mening promokodlarim', 'nav_my_promos')],
        [Markup.button.callback('🛒 Yana xarid qilish', 'nav_promo_list')],
        [Markup.button.callback('🏠 Bosh menyu', 'nav_main_menu')],
      ]);

      await ctx.editMessageText(successText, {
        parse_mode: 'HTML',
        ...successKeyboard,
      });
    } catch (error) {
      logger.error('Error confirming purchase:', error);
      await ctx.answerCbQuery("Xatolik yuz berdi. Qayta urinib ko'ring.", { show_alert: true });
    }
  });

  /**
   * Display User's Purchased Promo Codes
   */
  async function showMyPromos(ctx) {
    try {
      const user = await UserService.getUserByTelegramId(ctx.from.id);
      if (!user) {
        return ctx.reply("Foydalanuvchi ma'lumotlari topilmadi.");
      }

      const purchases = await PromoService.getUserPurchasedCodes(user.id);

      if (purchases.length === 0) {
        const emptyText =
          `📦 <b>Mening promokodlarim</b>\n\n` +
          `Sizda hali sotib olingan promokodlar mavjud emas.\n\n` +
          `<i>Xarid qilish uchun "Promokod sotib olish" bo'limiga o'ting.</i>`;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('🛒 Promokod sotib olish', 'nav_promo_list')],
        ]);

        if (ctx.callbackQuery) {
          await ctx.answerCbQuery();
          return await ctx.editMessageText(emptyText, { parse_mode: 'HTML', ...keyboard });
        }
        return await ctx.reply(emptyText, { parse_mode: 'HTML', ...keyboard });
      }

      let messageText = `📦 <b>Sizning promokodlaringiz (${purchases.length} ta):</b>\n\n`;

      purchases.slice(0, 15).forEach((p, idx) => {
        const catMeta = PROMO_CATEGORIES[p.category] || { name: p.category };
        const formattedDate = formatDate(p.createdAt);

        messageText +=
          `<b>${idx + 1}. ⚡ ${catMeta.name}</b>\n` +
          `🔑 Kod: <code>${p.promoCode.code}</code>\n` +
          `📅 Xarid qilingan sana: ${formattedDate}\n` +
          `-------------------------\n`;
      });

      if (purchases.length > 15) {
        messageText += `<i>...va yana ${purchases.length - 15} ta promokod.</i>\n`;
      }

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🛒 Yangi promokod sotib olish', 'nav_promo_list')],
        [Markup.button.callback('🏠 Bosh menyu', 'nav_main_menu')],
      ]);

      if (ctx.callbackQuery) {
        await ctx.answerCbQuery();
        return await ctx.editMessageText(messageText, { parse_mode: 'HTML', ...keyboard });
      }

      await ctx.reply(messageText, { parse_mode: 'HTML', ...keyboard });
    } catch (error) {
      logger.error('Error in showMyPromos:', error);
      await ctx.reply("Promokodlarni yuklashda xatolik yuz berdi.");
    }
  }

  bot.hears(BUTTONS.MY_PROMOS, requireSubscription, showMyPromos);
  bot.action('nav_my_promos', requireSubscription, showMyPromos);
}
