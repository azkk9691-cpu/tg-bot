import { Markup } from 'telegraf';
import {
  BUTTONS,
  USER_STATES,
  PROMO_CATEGORIES,
} from '../config/constants.js';
import { AdminService } from '../services/adminService.js';
import { PromoService } from '../services/promoService.js';
import { PaymentService } from '../services/paymentService.js';
import { UserService } from '../services/userService.js';
import { ChannelService } from '../services/channelService.js';
import { BroadcastService } from '../services/broadcastService.js';
import {
  formatMoney,
  formatNumber,
  formatDate,
  escapeHtml,
} from '../utils/formatters.js';
import {
  getAdminMenuKeyboard,
  getAdminPromoCategorySelectKeyboard,
  getAdminSettingsKeyboard,
  getAdminChannelManageKeyboard,
  getAdminPaymentApprovalKeyboard,
} from '../keyboards/adminKeyboards.js';
import { getCancelKeyboard, getMainMenuKeyboard } from '../keyboards/mainKeyboards.js';
import { SmsParserService } from '../services/smsParserService.js';
import { logger } from '../utils/logger.js';

export function registerAdminHandlers(bot) {
  /**
   * Middleware to verify admin authorization
   */
  const requireAdmin = async (ctx, next) => {
    if (!ctx.isAdmin) {
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery("⛔ Bu bo'lim faqat adminlar uchun!", { show_alert: true });
      } else {
        await ctx.reply("⛔ Kechirasiz, sizda admin huquqlari mavjud emas.");
      }
      return;
    }
    return next();
  };

  /**
   * Open Admin Panel
   */
  async function openAdminPanel(ctx) {
    if (ctx.session) ctx.session.reset();

    const roleTitle = ctx.isOwner ? '👑 Asosiy Ega (Owner)' : '🛡 Administrator';
    const text =
      `👑 <b>Admin Panelga xush kelibsiz!</b>\n` +
      `Sizning maqomingiz: <b>${roleTitle}</b>\n\n` +
      `Boshqaruv menyusidan kerakli bo'limni tanlang:`;

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      await ctx.deleteMessage().catch(() => {});
    }

    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...getAdminMenuKeyboard(),
    });
  }

  bot.command('admin', requireAdmin, openAdminPanel);
  bot.hears(BUTTONS.ADMIN_PANEL, requireAdmin, openAdminPanel);
  bot.action('admin_main', requireAdmin, openAdminPanel);

  /**
   * 1. ➕ Promokod qo'shish - Category selection
   */
  bot.hears('➕ Promokod qo\'shish', requireAdmin, async (ctx) => {
    const text =
      `➕ <b>Promokod qo'shish</b>\n\n` +
      `Qaysi kategoriya uchun promokod qo'shmoqchisiz? Tanlang:`;

    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...getAdminPromoCategorySelectKeyboard(),
    });
  });

  bot.action(/admin_add_cat:(.+)/, requireAdmin, async (ctx) => {
    const categoryKey = ctx.match[1];
    const meta = PROMO_CATEGORIES[categoryKey];

    if (!meta) {
      await ctx.answerCbQuery("Noma'lum kategoriya!", { show_alert: true });
      return;
    }

    ctx.session.setState(USER_STATES.ADMIN_AWAITING_PROMO_CODES, { categoryKey });

    await ctx.answerCbQuery();
    await ctx.reply(
      `📥 <b>${meta.name} (${formatMoney(meta.price)}) uchun promokodlarni yuboring:</b>\n\n` +
        `Har bir promokodni yangi qatordan yozing:\n\n` +
        `<i>Masalan:\n` +
        `PROMO123\n` +
        `PROMO456\n` +
        `PROMO789</i>`,
      {
        parse_mode: 'HTML',
        ...getCancelKeyboard(),
      }
    );
  });

  /**
   * 2. 📋 Promokodlar - Stocks Overview
   */
  bot.hears('📋 Promokodlar', requireAdmin, async (ctx) => {
    try {
      const overview = await PromoService.getAdminStockOverview();

      let text = `📋 <b>Promokodlar holati va qoldiqlari:</b>\n\n`;

      for (const [key, data] of Object.entries(overview)) {
        text +=
          `<b>${data.badge} ${data.name} (${formatMoney(data.price)})</b>\n` +
          `  ├ 🟢 Mavjud: <b>${data.available} ta</b>\n` +
          `  ├ 🔴 Sotilgan: <b>${data.sold} ta</b>\n` +
          `  └ 📦 Jami: <b>${data.total} ta</b>\n\n`;
      }

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('➕ Yangi promokod qo\'shish', 'admin_prompt_add_promo')],
        [Markup.button.callback('👑 Admin Panel', 'admin_main')],
      ]);

      await ctx.reply(text, {
        parse_mode: 'HTML',
        ...keyboard,
      });
    } catch (error) {
      logger.error('Error in admin promo overview:', error);
      await ctx.reply("Promokodlar ma'lumotini yuklashda xatolik yuz berdi.");
    }
  });

  bot.action('admin_prompt_add_promo', requireAdmin, async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      `➕ <b>Promokod qo'shish uchun kategoriyani tanlang:</b>`,
      {
        parse_mode: 'HTML',
        ...getAdminPromoCategorySelectKeyboard(),
      }
    );
  });

  /**
   * 3. ⏳ Kutilayotgan to'lovlar
   */
  bot.hears('⏳ Kutilayotgan to\'lovlar', requireAdmin, async (ctx) => {
    try {
      const pending = await PaymentService.getPendingPaymentRequests();

      if (pending.length === 0) {
        return await ctx.reply(
          `⏳ <b>Kutilayotgan to'lovlar yo'q.</b>\n\nBarcha to'lovlar ko'rib chiqilgan.`,
          { parse_mode: 'HTML' }
        );
      }

      await ctx.reply(
        `⏳ <b>Kutilayotgan to'lovlar ro'yxati (${pending.length} ta):</b>`,
        { parse_mode: 'HTML' }
      );

      for (const req of pending) {
        const user = req.user;
        const name = escapeHtml(user.firstName || 'Foydalanuvchi');
        const usernameStr = user.username ? `@${escapeHtml(user.username)}` : 'Mavjud emas';
        const amountStr = formatMoney(Number(req.amount));
        const dateStr = formatDate(req.createdAt);

        const caption =
          `💳 <b>To'lov so'rovi #${req.id}</b>\n\n` +
          `👤 <b>Foydalanuvchi:</b> <a href="tg://user?id=${user.telegramId.toString()}">${name}</a> (${usernameStr})\n` +
          `🆔 <b>Telegram ID:</b> <code>${user.telegramId.toString()}</code>\n` +
          `🔗 <b>Profil havolasi:</b> <a href="tg://user?id=${user.telegramId.toString()}">Mijoz profiliga o'tish</a>\n` +
          `💵 <b>Summa:</b> <code>${amountStr}</code>\n` +
          `⏰ <b>Sana:</b> ${dateStr}\n\n` +
          `Tasdiqlaysizmi?`;

        const keyboard = getAdminPaymentApprovalKeyboard(req.id);

        if (req.receiptFileId) {
          try {
            await ctx.telegram.sendPhoto(ctx.chat.id, req.receiptFileId, {
              caption,
              parse_mode: 'HTML',
              ...keyboard,
            });
          } catch {
            await ctx.reply(caption, { parse_mode: 'HTML', ...keyboard });
          }
        } else {
          await ctx.reply(caption, { parse_mode: 'HTML', ...keyboard });
        }
      }
    } catch (error) {
      logger.error('Error fetching pending payments for admin:', error);
      await ctx.reply("To'lovlarni yuklashda xatolik yuz berdi.");
    }
  });

  /**
   * 4. 📊 Statistika
   */
  bot.hears('📊 Statistika', requireAdmin, async (ctx) => {
    try {
      const stats = await AdminService.getStatistics();

      let catText = '';
      for (const [key, item] of Object.entries(stats.categoryStats)) {
        catText += `  ├ ${item.name}: <b>${item.count} ta</b>\n`;
      }

      const text =
        `📊 <b>Bot Statistikasi</b>\n\n` +
        `👥 <b>Jami foydalanuvchilar:</b> ${formatNumber(stats.totalUsers)} ta\n` +
        `🆕 <b>Bugun qo'shilgan:</b> ${formatNumber(stats.todayNewUsers)} ta\n\n` +
        `💳 <b>Jami balans to'ldirishlar:</b> <code>${formatMoney(stats.totalDeposited)}</code>\n` +
        `🛒 <b>Jami sotuvlar:</b> ${formatNumber(stats.totalPurchasesCount)} ta (<code>${formatMoney(stats.totalSalesRevenue)}</code>)\n` +
        `📈 <b>Bugungi savdo:</b> ${formatNumber(stats.todaySalesCount)} ta (<code>${formatMoney(stats.todaySalesRevenue)}</code>)\n\n` +
        `📦 <b>Mavjud promokodlar:</b> ${formatNumber(stats.totalAvailablePromos)} ta\n` +
        `⏳ <b>Kutilayotgan to'lovlar:</b> ${formatNumber(stats.pendingPaymentsCount)} ta\n\n` +
        `📦 <b>Kategoriyalar bo'yicha qoldiq:</b>\n${catText}`;

      await ctx.reply(text, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      logger.error('Error generating admin stats:', error);
      await ctx.reply("Statistikani hisoblashda xatolik yuz berdi.");
    }
  });

  /**
   * 5. 👥 Foydalanuvchilar - Search / Profile check
   */
  bot.hears('👥 Foydalanuvchilar', requireAdmin, async (ctx) => {
    ctx.session.setState(USER_STATES.ADMIN_AWAITING_USER_ID_SEARCH);
    await ctx.reply(
      `👥 <b>Foydalanuvchini qidirish:</b>\n\n` +
        `Foydalanuvchining Telegram ID raqamini yoki username'ini yuboring:\n` +
        `<i>Masalan: <code>123456789</code> yoki <code>@username</code></i>`,
      {
        parse_mode: 'HTML',
        ...getCancelKeyboard(),
      }
    );
  });

  /**
   * 6. 📢 Hammaga xabar yuborish (Broadcast)
   */
  bot.hears('📢 Hammaga xabar yuborish', requireAdmin, async (ctx) => {
    ctx.session.setState(USER_STATES.ADMIN_AWAITING_BROADCAST);
    await ctx.reply(
      `📢 <b>Hammaga xabar yuborish (Broadcast)</b>\n\n` +
        `Barcha foydalanuvchilarga yuboriladigan xabarni (matn, rasm, video) shu yerga yuboring.\n\n` +
        `<i>Xabar qanday yuborilsa, foydalanuvchilarga xuddi shunday yetkaziladi.</i>`,
      {
        parse_mode: 'HTML',
        ...getCancelKeyboard(),
      }
    );
  });

  /**
   * 7. ⚙️ Sozlamalar
   */
  bot.hears('⚙️ Sozlamalar', requireAdmin, async (ctx) => {
    try {
      const card = await AdminService.getPaymentCardDetails();
      const channels = await ChannelService.getRequiredChannels();
      const isChannelsEnabled = await ChannelService.isSubscriptionRequired();
      const adsStatusText = isChannelsEnabled ? '🟢 Yoqilgan' : '🔴 O\'chirilgan (Adsiz)';

      const text =
        `⚙️ <b>Bot Sozlamalari</b>\n\n` +
        `💳 <b>To'lov kartasi:</b> <code>${card.cardNumber}</code> (${escapeHtml(card.cardHolder)})\n` +
        `📢 <b>Majburiy obuna (Reklama):</b> <b>${adsStatusText}</b>\n` +
        `📋 <b>Faol kanallar soni:</b> ${channels.length} ta\n\n` +
        `Kerakli sozlamani tanlang:`;

      await ctx.reply(text, {
        parse_mode: 'HTML',
        ...getAdminSettingsKeyboard(isChannelsEnabled),
      });
    } catch (error) {
      logger.error('Error fetching settings:', error);
      await ctx.reply("Sozlamalarni yuklashda xatolik yuz berdi.");
    }
  });

  bot.action('admin_settings', requireAdmin, async (ctx) => {
    await ctx.answerCbQuery();
    const card = await AdminService.getPaymentCardDetails();
    const channels = await ChannelService.getRequiredChannels();
    const isChannelsEnabled = await ChannelService.isSubscriptionRequired();
    const adsStatusText = isChannelsEnabled ? '🟢 Yoqilgan' : '🔴 O\'chirilgan (Adsiz)';

    const text =
      `⚙️ <b>Bot Sozlamalari</b>\n\n` +
      `💳 <b>To'lov kartasi:</b> <code>${card.cardNumber}</code> (${escapeHtml(card.cardHolder)})\n` +
      `📢 <b>Majburiy obuna (Reklama):</b> <b>${adsStatusText}</b>\n` +
      `📋 <b>Faol kanallar soni:</b> ${channels.length} ta\n\n` +
      `Kerakli sozlamani tanlang:`;

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...getAdminSettingsKeyboard(isChannelsEnabled),
    });
  });

  bot.action('admin_toggle_ads', requireAdmin, async (ctx) => {
    const current = await ChannelService.isSubscriptionRequired();
    const nextState = !current;
    await ChannelService.setSubscriptionRequired(nextState);

    await ctx.answerCbQuery(
      nextState
        ? "📢 Majburiy obuna (Reklama) yoqildi!"
        : "🚫 Majburiy obuna o'chirildi! Bot endi to'liq adsiz ishlaydi.",
      { show_alert: true }
    );

    const card = await AdminService.getPaymentCardDetails();
    const channels = await ChannelService.getRequiredChannels();
    const adsStatusText = nextState ? '🟢 Yoqilgan' : '🔴 O\'chirilgan (Adsiz)';

    const text =
      `⚙️ <b>Bot Sozlamalari</b>\n\n` +
      `💳 <b>To'lov kartasi:</b> <code>${card.cardNumber}</code> (${escapeHtml(card.cardHolder)})\n` +
      `📢 <b>Majburiy obuna (Reklama):</b> <b>${adsStatusText}</b>\n` +
      `📋 <b>Faol kanallar soni:</b> ${channels.length} ta\n\n` +
      `Kerakli sozlamani tanlang:`;

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...getAdminSettingsKeyboard(nextState),
    });
  });

  bot.action('admin_set_card', requireAdmin, async (ctx) => {
    ctx.session.setState(USER_STATES.ADMIN_AWAITING_CARD_NUMBER);
    await ctx.answerCbQuery();
    await ctx.reply(
      `💳 <b>Yangi karta raqami va karta egasini yuboring:</b>\n\n` +
        `Format: <code>KartaRaqami - KartaEgasi</code>\n` +
        `Masalan: <code>6262910202797114 - BULDROP PM</code>`,
      {
        parse_mode: 'HTML',
        ...getCancelKeyboard(),
      }
    );
  });

  bot.action('admin_manage_channels', requireAdmin, async (ctx) => {
    await ctx.answerCbQuery();
    const channels = await ChannelService.getRequiredChannels();

    const text =
      `📢 <b>Majburiy kanallar boshqaruvi:</b>\n\n` +
      `Kanal holatini o'zgartirish uchun ustiga bosing yoki yangi qo'shing:`;

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...getAdminChannelManageKeyboard(channels),
    });
  });

  bot.action(/admin_toggle_channel:(\d+)/, requireAdmin, async (ctx) => {
    const id = ctx.match[1];
    await ChannelService.toggleChannel(id);
    await ctx.answerCbQuery("Kanal holati o'zgartirildi!");

    const channels = await ChannelService.getRequiredChannels();
    await ctx.editMessageReplyMarkup(getAdminChannelManageKeyboard(channels).reply_markup);
  });

  bot.action(/admin_delete_channel:(\d+)/, requireAdmin, async (ctx) => {
    const id = ctx.match[1];
    await ChannelService.deleteChannel(id);
    await ctx.answerCbQuery("Kanal o'chirildi!");

    const channels = await ChannelService.getRequiredChannels();
    await ctx.editMessageReplyMarkup(getAdminChannelManageKeyboard(channels).reply_markup);
  });

  bot.action('admin_add_channel', requireAdmin, async (ctx) => {
    ctx.session.setState(USER_STATES.ADMIN_AWAITING_CHANNEL_ADD);
    await ctx.answerCbQuery();
    await ctx.reply(
      `📢 <b>Yangi kanal qo'shish:</b>\n\n` +
        `Format: <code>Username | Nomi | Havola</code>\n` +
        `Masalan: <code>BULXPM | BULXPM | https://t.me/BULXPM</code>`,
      {
        parse_mode: 'HTML',
        ...getCancelKeyboard(),
      }
    );
  });

  /**
   * Admin Payment Confirmation Action (Approve)
   */
  bot.action(/admin_approve_pay:(\d+)/, requireAdmin, async (ctx) => {
    const paymentId = ctx.match[1];

    try {
      const result = await PaymentService.approvePayment(paymentId, ctx.from.id);

      if (!result.success) {
        await ctx.answerCbQuery(`⚠️ ${result.message}`, { show_alert: true });
        return;
      }

      await ctx.answerCbQuery("✅ To'lov muvaffaqiyatli tasdiqlandi!", { show_alert: false });

      // Update admin message
      const adminUsername = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
      const formattedAmount = formatMoney(result.amount);
      const newBalFormatted = formatMoney(result.newBalance);

      await ctx.editMessageCaption(
        `✅ <b>To'lov tasdiqlandi!</b>\n\n` +
          `👤 Foydalanuvchi: ${escapeHtml(result.user.firstName || '')} (ID: <code>${result.user.telegramId}</code>)\n` +
          `💵 Summa: <code>${formattedAmount}</code>\n` +
          `💰 Yangi balansi: <code>${newBalFormatted}</code>\n` +
          `👑 Tasdiqladi: ${adminUsername}`,
        { parse_mode: 'HTML' }
      ).catch(() => {
        ctx.editMessageText(
          `✅ <b>To'lov tasdiqlandi!</b>\n\n` +
            `💵 Summa: <code>${formattedAmount}</code> qo'shildi.\n` +
            `👑 Tasdiqladi: ${adminUsername}`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
      });

      // Send congratulatory message to User
      try {
        const userTgId = result.user.telegramId.toString();
        const userNotification =
          `🎉 <b>To'lov muvaffaqiyatli tasdiqlandi!</b>\n\n` +
          `➕ Balansingizga <b>${formattedAmount}</b> qo'shildi.\n\n` +
          `💰 <b>Yangi balansingiz:</b>\n` +
          `<code>${newBalFormatted}</code>\n\n` +
          `<i>Xarid qilish uchun "Promokod sotib olish" bo'limiga o'tishingiz mumkin.</i>`;

        const userKeyboard = Markup.inlineKeyboard([
          [Markup.button.callback('🛒 Promokod sotib olish', 'nav_promo_list')],
          [Markup.button.callback('🏠 Bosh menyu', 'nav_main_menu')],
        ]);

        await ctx.telegram.sendMessage(userTgId, userNotification, {
          parse_mode: 'HTML',
          ...userKeyboard,
        });
      } catch (userErr) {
        logger.warn('Could not send payment confirmation to user:', userErr.message);
      }
    } catch (error) {
      logger.error('Error approving payment in admin action:', error);
      await ctx.answerCbQuery("To'lovni tasdiqlashda xatolik!", { show_alert: true });
    }
  });

  /**
   * Admin Payment Rejection Action (Reject)
   */
  bot.action(/admin_reject_pay:(\d+)/, requireAdmin, async (ctx) => {
    const paymentId = ctx.match[1];

    try {
      const result = await PaymentService.rejectPayment(paymentId, ctx.from.id);

      if (!result.success) {
        await ctx.answerCbQuery(`⚠️ ${result.message}`, { show_alert: true });
        return;
      }

      await ctx.answerCbQuery("❌ To'lov rad etildi.", { show_alert: false });

      const adminUsername = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
      const formattedAmount = formatMoney(result.amount);

      await ctx.editMessageCaption(
        `❌ <b>To'lov rad etildi.</b>\n\n` +
          `👤 Foydalanuvchi: ${escapeHtml(result.user.firstName || '')} (ID: <code>${result.user.telegramId}</code>)\n` +
          `💵 Summa: <code>${formattedAmount}</code>\n` +
          `👑 Rad qildi: ${adminUsername}`,
        { parse_mode: 'HTML' }
      ).catch(() => {
        ctx.editMessageText(
          `❌ <b>To'lov rad etildi.</b>\n\n` +
            `💵 Summa: <code>${formattedAmount}</code>\n` +
            `👑 Rad qildi: ${adminUsername}`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
      });

      // Send rejection notification to user
      try {
        const userTgId = result.user.telegramId.toString();
        const userNotification =
          `❌ <b>To'lovingiz rad etildi!</b>\n\n` +
          `💵 <b>Summa:</b> <code>${formattedAmount}</code>\n` +
          `⚠️ <b>Sabab:</b> Chek ma'lumotlari tasdiqlanmadi.\n\n` +
          `❓ <i>Savollar yoki tushunmovchiliklar bo'lsa, murojaat qilishingiz mumkin:</i>\n` +
          `@yusupov_bulldrop`;

        const userKeyboard = Markup.inlineKeyboard([
          [Markup.button.url('💬 @yusupov_bulldrop', 'https://t.me/yusupov_bulldrop')],
          [Markup.button.callback('🏠 Bosh menyu', 'nav_main_menu')],
        ]);

        await ctx.telegram.sendMessage(userTgId, userNotification, {
          parse_mode: 'HTML',
          ...userKeyboard,
        });
      } catch (userErr) {
        logger.warn('Could not send rejection notification to user:', userErr.message);
      }
    } catch (error) {
      logger.error('Error rejecting payment in admin action:', error);
      await ctx.answerCbQuery("Xatolik yuz berdi.", { show_alert: true });
    }
  });

  /**
   * Handle Admin Text & Message Inputs for states:
   * - ADMIN_AWAITING_PROMO_CODES
   * - ADMIN_AWAITING_BROADCAST
   * - ADMIN_AWAITING_CARD_NUMBER
   * - ADMIN_AWAITING_CHANNEL_ADD
   * - ADMIN_AWAITING_USER_ID_SEARCH
   */
  bot.on(['text', 'photo', 'video'], async (ctx, next) => {
    if (!ctx.isAdmin) {
      return next();
    }

    const state = ctx.session?.state;
    if (!state || !state.startsWith('ADMIN_')) {
      return next();
    }

    const text = ctx.message?.text?.trim() || '';

    if (text === BUTTONS.CANCEL) {
      ctx.session.reset();
      return await ctx.reply('❌ Bekor qilindi.', getAdminMenuKeyboard());
    }

    // 1. Adding Promo Codes
    if (state === USER_STATES.ADMIN_AWAITING_PROMO_CODES) {
      const categoryKey = ctx.session.data.categoryKey;
      const meta = PROMO_CATEGORIES[categoryKey];

      try {
        const result = await PromoService.addPromoCodes(categoryKey, text);
        ctx.session.reset();

        const successText =
          `✅ <b>Promokodlar muvaffaqiyatli qo'shildi!</b>\n\n` +
          `⚡ <b>Kategoriya:</b> ${meta.name} (${formatMoney(meta.price)})\n` +
          `📥 <b>Yuborilgan:</b> ${result.totalProvided} ta\n` +
          `➕ <b>Qo'shildi:</b> <b>${result.totalAdded} ta</b>\n` +
          `⚠️ <b>Mavjud/Dublikat (o'tkazildi):</b> ${result.duplicates} ta`;

        await ctx.reply(successText, {
          parse_mode: 'HTML',
          ...getAdminMenuKeyboard(),
        });
      } catch (error) {
        logger.error('Error adding promo codes:', error);
        await ctx.reply(`⚠️ Xatolik: ${error.message}`, getAdminMenuKeyboard());
      }
      return;
    }

    // 2. Broadcast Message
    if (state === USER_STATES.ADMIN_AWAITING_BROADCAST) {
      ctx.session.reset();
      const statusMsg = await ctx.reply("⏳ Xabar barcha foydalanuvchilarga yuborilmoqda, kuting...");

      try {
        const result = await BroadcastService.sendBroadcast(ctx.telegram, ctx.message);

        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMsg.message_id,
          null,
          `📢 <b>Xabar tarqatish yakunlandi!</b>\n\n` +
            `👥 <b>Jami foydalanuvchilar:</b> ${result.total} ta\n` +
            `✅ <b>Muvaffaqiyatli yetkazildi:</b> ${result.sent} ta\n` +
            `🚫 <b>Botni bloklagan:</b> ${result.blocked} ta\n` +
            `❌ <b>Xatoliklar:</b> ${result.failed} ta`,
          { parse_mode: 'HTML' }
        );
      } catch (error) {
        logger.error('Error during broadcast:', error);
        await ctx.reply("Xabar tarqatishda xatolik yuz berdi.", getAdminMenuKeyboard());
      }
      return;
    }

    // 3. Update Card Number
    if (state === USER_STATES.ADMIN_AWAITING_CARD_NUMBER) {
      ctx.session.reset();
      const parts = text.split('-').map((s) => s.trim());
      const cardNum = parts[0];
      const holder = parts[1] || 'BULDROP PM';

      if (!cardNum || cardNum.length < 12) {
        return await ctx.reply(
          "⚠️ Karta raqami noto'g'ri. Iltimos, kamida 16 xonali karta raqamini kiriting.",
          getAdminMenuKeyboard()
        );
      }

      await AdminService.updatePaymentCardDetails(cardNum, holder);
      await ctx.reply(
        `✅ <b>Karta ma'lumotlari yangilandi!</b>\n\n` +
          `💳 Karta: <code>${cardNum}</code>\n` +
          `👤 Egasi: ${escapeHtml(holder)}`,
        {
          parse_mode: 'HTML',
          ...getAdminMenuKeyboard(),
        }
      );
      return;
    }

    // 4. Add Channel
    if (state === USER_STATES.ADMIN_AWAITING_CHANNEL_ADD) {
      ctx.session.reset();
      const parts = text.split('|').map((s) => s.trim());
      if (parts.length < 2) {
        return await ctx.reply(
          "⚠️ Format noto'g'ri. Masalan: <code>BULXPM | BULXPM | https://t.me/BULXPM</code>",
          { parse_mode: 'HTML', ...getAdminMenuKeyboard() }
        );
      }

      const username = parts[0];
      const title = parts[1];
      const url = parts[2] || `https://t.me/${username}`;

      await ChannelService.addChannel(username, title, url);
      await ctx.reply(
        `✅ <b>Kanal muvaffaqiyatli qo'shildi!</b>\n\n` +
          `📢 Nomi: ${escapeHtml(title)}\n` +
          `🔗 Havola: ${url}`,
        {
          parse_mode: 'HTML',
          ...getAdminMenuKeyboard(),
        }
      );
      return;
    }

    // 5. User Search
    if (state === USER_STATES.ADMIN_AWAITING_USER_ID_SEARCH) {
      ctx.session.reset();
      const results = await UserService.searchUser(text);

      if (results.length === 0) {
        return await ctx.reply(
          "⚠️ Foydalanuvchi topilmadi.",
          getAdminMenuKeyboard()
        );
      }

      for (const u of results) {
        const name = escapeHtml(u.firstName || 'Foydalanuvchi');
        const usernameStr = u.username ? `@${escapeHtml(u.username)}` : 'Mavjud emas';
        const balanceStr = formatMoney(Number(u.balance));
        const totalDepStr = formatMoney(Number(u.totalDeposited));
        const dateStr = formatDate(u.createdAt);

        const info =
          `👤 <b>Foydalanuvchi ma'lumotlari:</b>\n\n` +
          `🏷 <b>Ism:</b> <a href="tg://user?id=${u.telegramId.toString()}">${name}</a>\n` +
          `🔗 <b>Username:</b> ${usernameStr}\n` +
          `🆔 <b>Telegram ID:</b> <code>${u.telegramId.toString()}</code>\n` +
          `🔗 <b>Profil havolasi:</b> <a href="tg://user?id=${u.telegramId.toString()}">Mijoz profilinga o'tish</a>\n` +
          `💰 <b>Balans:</b> <code>${balanceStr}</code>\n` +
          `💳 <b>Jami to'ldirilgan:</b> <code>${totalDepStr}</code>\n` +
          `📅 <b>Ro'yxatdan o'tgan:</b> ${dateStr}`;

        await ctx.reply(info, {
          parse_mode: 'HTML',
        });
      }

      await ctx.reply("Admin menyusi:", getAdminMenuKeyboard());
      return;
    }

    return next();
  });

  /**
   * Admin Simulation: Test Incoming SMS Auto-Payment
   */
  bot.command('test_sms', requireAdmin, async (ctx) => {
    const text = ctx.message.text.replace('/test_sms', '').trim();
    if (!text) {
      return ctx.reply(
        "📱 <b>SMS Test buyrug'i</b>\n\n" +
          "Masalan:\n<code>/test_sms Karta 8600 ga 20000 UZS tushdi. Izoh: BP1</code>\n\n" +
          "Ushbu buyruq orqali kartaga pul tushganini simulyatsiya qilib, avtomatik to'lovni sinab ko'rishingiz mumkin.",
        { parse_mode: 'HTML' }
      );
    }

    const result = await SmsParserService.processIncomingSms({
      sender: '3700',
      message: text,
      bot,
    });

    if (result.matched) {
      await ctx.reply(
        `✅ <b>To'lov avtomatik tarzda tasdiqlandi!</b>\n\n` +
          `👤 <b>Mijoz:</b> ${result.user?.firstName} (ID: ${result.user?.telegramId})\n` +
          `💵 <b>Summa:</b> ${formatMoney(result.amount)}\n` +
          `💰 <b>Yangi balans:</b> ${formatMoney(result.newBalance)}`,
        { parse_mode: 'HTML' }
      );
    } else {
      await ctx.reply(
        `⚠️ <b>SMS qabul qilindi, lekin mos keluvchi to'lov so'rovi topilmadi.</b>\n\n` +
          `💵 Summa: ${result.amount ? formatMoney(result.amount) : 'Aniqlanmadi'}\n` +
          `💬 Kod: ${result.commentCode || "Yo'q"}\n\n` +
          `<i>SMS keshda saqlandi. Foydalanuvchi "To'lovni tekshirish" tugmasini bossa, balansi to'ldiriladi.</i>`,
        { parse_mode: 'HTML' }
      );
    }
  });
}
