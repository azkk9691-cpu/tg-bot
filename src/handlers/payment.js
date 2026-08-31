import { Markup } from 'telegraf';
import prisma from '../database/prisma.js';
import { BUTTONS, USER_STATES, PAYMENT_EXPIRE_MINUTES, MIN_DEPOSIT_AMOUNT } from '../config/constants.js';
import { PaymentService } from '../services/paymentService.js';
import { AdminService } from '../services/adminService.js';
import { CryptoPayService } from '../services/cryptoPayService.js';
import { SmsParserService } from '../services/smsParserService.js';
import { parseDepositAmount } from '../utils/validators.js';
import { formatMoney, formatDate, escapeHtml, formatNumber } from '../utils/formatters.js';
import {
  getMainDepositAmountsKeyboard,
  getPaymentMethodsKeyboard,
  getStarsDepositAmountsKeyboard,
  getCryptoDepositAmountsKeyboard,
  getCryptoPaymentActionKeyboard,
  getClickDepositAmountsKeyboard,
  getPaymeDepositAmountsKeyboard,
  getCardDepositAmountsKeyboard,
  getPaymentActionKeyboard,
  getAutoCardPaymentKeyboard,
} from '../keyboards/inlineKeyboards.js';
import { getCancelKeyboard, getMainMenuKeyboard } from '../keyboards/mainKeyboards.js';
import { getAdminPaymentApprovalKeyboard } from '../keyboards/adminKeyboards.js';
import { requireSubscription } from '../middlewares/checkSubscription.js';
import config from '../config/index.js';
import { logger } from '../utils/logger.js';

export function registerPaymentHandlers(bot) {
  /**
   * 1. Start deposit flow: Show Main Quick Amounts (Card Auto + Stars + Crypto)
   */
  async function promptDepositMethods(ctx) {
    if (ctx.session) {
      ctx.session.reset();
    }

    const text =
      `💳 <b>Balans to'ldirish (Avtomatik ⚡️)</b>\n\n` +
      `Qancha summa kiritmoqchisiz? Quyidagi tayyor summalardan birini tanlang yoki o'zingiz kiriting:\n\n` +
      `⚡️ <i>To'lov amalga oshirilishi bilan pul <b>5-10 soniya ichida</b> balansingizga avtomatik tarzda tushadi! Admin tekshiruvi shart emas.</i>`;

    const keyboard = getMainDepositAmountsKeyboard();

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...keyboard,
      }).catch(() => ctx.reply(text, { parse_mode: 'HTML', ...keyboard }));
    } else {
      await ctx.reply(text, {
        parse_mode: 'HTML',
        ...keyboard,
      });
    }
  }

  bot.hears(BUTTONS.DEPOSIT, requireSubscription, promptDepositMethods);
  bot.action('nav_deposit', requireSubscription, promptDepositMethods);

  // ==========================================
  // ⭐️ TELEGRAM STARS (100% AVTOMATIK)
  // ==========================================

  bot.action('pay_method:stars', requireSubscription, async (ctx) => {
    await ctx.answerCbQuery();
    const starsRate = config.starsRate || 250;
    const text =
      `⭐ <b>Telegram Stars orqali avtomatik to'lov</b>\n\n` +
      `⚡️ <b>100% Avtomatik:</b> To'lov qilingan zahoti mablag' avtomatik balansingizga qo'shiladi!\n` +
      `💳 Bank kartangiz, Apple Pay yoki Google Pay orqali Telegram ichida to'lov qilasiz.\n\n` +
      `📈 Kurs: <b>1 ⭐ = ${formatNumber(starsRate)} so'm</b>\n\n` +
      `Kerakli to'lov paketini tanlang yoki o'zingiz summa kiriting:`;

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...getStarsDepositAmountsKeyboard(starsRate),
    }).catch(() => ctx.reply(text, { parse_mode: 'HTML', ...getStarsDepositAmountsKeyboard(starsRate) }));
  });

  bot.action(/stars_pack:(\d+)/, requireSubscription, async (ctx) => {
    const stars = parseInt(ctx.match[1], 10);
    const starsRate = config.starsRate || 250;
    const amountUzs = stars * starsRate;
    await ctx.answerCbQuery();
    await sendStarsInvoice(ctx, stars, amountUzs);
  });

  bot.action('stars_custom', requireSubscription, async (ctx) => {
    ctx.session.setState(USER_STATES.AWAITING_STARS_AMOUNT);
    await ctx.answerCbQuery();

    const starsRate = config.starsRate || 250;
    await ctx.reply(
      `⭐ <b>Qancha summa kiritmoqchisiz?</b>\n\n` +
        `<i>(Kamida ${MIN_DEPOSIT_AMOUNT} so'm)</i>\n\n` +
        `Kurs: 1 ⭐ = ${formatNumber(starsRate)} so'm\n\n` +
        `Masalan: <code>25000</code> yoki <code>50 000</code> so'm kiriting:`,
      {
        parse_mode: 'HTML',
        ...getCancelKeyboard(),
      }
    );
  });

  async function sendStarsInvoice(ctx, stars, amountUzs) {
    try {
      const user = ctx.dbUser;
      const formattedUzs = formatMoney(amountUzs);

      await ctx.replyWithInvoice({
        title: `⭐ ${formattedUzs} Balans to'ldirish`,
        description: `BULDROP PM botida ${formattedUzs} miqdorida hisobingizni to'ldirish uchun to'lov (${stars} Stars)`,
        payload: JSON.stringify({
          userId: user.id,
          telegramId: user.telegramId.toString(),
          amount: amountUzs,
          stars,
          provider: 'STARS',
          timestamp: Date.now(),
        }),
        provider_token: '', // MUST be empty string for Telegram Stars
        currency: 'XTR',
        prices: [
          {
            label: `${formattedUzs} (${stars} ⭐)`,
            amount: stars,
          },
        ],
      });
    } catch (error) {
      logger.error('Error sending Telegram Stars invoice:', error);
      await ctx.reply(
        "Stars hisob-fakturasini yaratishda xatolik yuz berdi. Iltimos, boshqa to'lov turidan foydalaning.",
        getMainMenuKeyboard(ctx.isAdmin)
      );
    }
  }

  // ==========================================
  // 🤖 CRYPTOBOT (USDT / TON - 100% AVTOMATIK)
  // ==========================================

  bot.action('pay_method:crypto', requireSubscription, async (ctx) => {
    await ctx.answerCbQuery();

    if (!CryptoPayService.isConfigured()) {
      const text =
        `🤖 <b>CryptoBot to'lov tizimi</b>\n\n` +
        `⚠️ CryptoBot to'lov tizimi hozirda sozlanmoqda.\n\n` +
        `Iltimos, ⭐ <b>Telegram Stars</b> (avtomatik) yoki 💳 <b>Karta orqali</b> to'lov qiling.`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('⭐ Telegram Stars (Avtomatik)', 'pay_method:stars')],
        [Markup.button.callback('💳 Karta orqali to\'lov', 'pay_method:card')],
        [Markup.button.callback('⬅️ To\'lov usullari', 'nav_deposit')],
      ]);

      return await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...keyboard,
      }).catch(() => ctx.reply(text, { parse_mode: 'HTML', ...keyboard }));
    }

    const text =
      `🤖 <b>CryptoBot orqali avtomatik to'lov</b>\n\n` +
      `⚡️ <b>100% Avtomatik:</b> USDT yoki TON orqali to'lovni bajarasiz va pul to'g'ridan-to'g'ri balansingizga tushadi!\n\n` +
      `Kerakli summani tanlang yoki o'zingiz kiriting:`;

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...getCryptoDepositAmountsKeyboard(),
    }).catch(() => ctx.reply(text, { parse_mode: 'HTML', ...getCryptoDepositAmountsKeyboard() }));
  });

  bot.action(/crypto_pack:(\d+)/, requireSubscription, async (ctx) => {
    const amount = parseInt(ctx.match[1], 10);
    await ctx.answerCbQuery();
    await createCryptoInvoiceFlow(ctx, amount);
  });

  bot.action('crypto_custom', requireSubscription, async (ctx) => {
    ctx.session.setState(USER_STATES.AWAITING_CRYPTO_AMOUNT);
    await ctx.answerCbQuery();

    await ctx.reply(
      `🤖 <b>Qancha summa kiritmoqchisiz?</b>\n\n` +
        `<i>(Kamida ${MIN_DEPOSIT_AMOUNT} so'm)</i>\n\n` +
        `Masalan: <code>50000</code> yoki <code>100 000</code>`,
      {
        parse_mode: 'HTML',
        ...getCancelKeyboard(),
      }
    );
  });

  async function createCryptoInvoiceFlow(ctx, amountUzs) {
    try {
      const user = ctx.dbUser;
      const invoice = await CryptoPayService.createInvoice({
        amountUzs,
        userId: user.id,
        description: `BULDROP PM Balans to'ldirish (${formatMoney(amountUzs)})`,
      });

      // Save pending record in DB
      await PaymentService.createPaymentRequest(
        user.id,
        amountUzs,
        'CRYPTOBOT',
        `crypto_${invoice.invoiceId}`,
        'USDT'
      );

      const formattedAmount = formatMoney(amountUzs);
      const text =
        `🤖 <b>CryptoBot to'lov schyoti yaratildi!</b>\n\n` +
        `💵 <b>To'lov summasi:</b> <code>${formattedAmount}</code> (~<code>${invoice.amountUsdt} USDT</code>)\n` +
        `⏳ <b>Amal qilish vaqti:</b> 30 daqiqa\n\n` +
        `1️⃣ Quyidagi <b>"💳 To'lash (@CryptoBot)"</b> tugmasini bosib to'lovni yakunlang.\n` +
        `2️⃣ To'lovni amalga oshirgach, <b>"🔄 To'lovni tekshirish"</b> tugmasini bosing — hisobingiz darhol to'ldiriladi!`;

      const keyboard = getCryptoPaymentActionKeyboard(invoice.payUrl, invoice.invoiceId, amountUzs);

      if (ctx.callbackQuery) {
        await ctx.editMessageText(text, {
          parse_mode: 'HTML',
          ...keyboard,
        }).catch(() => ctx.reply(text, { parse_mode: 'HTML', ...keyboard }));
      } else {
        await ctx.reply(text, {
          parse_mode: 'HTML',
          ...keyboard,
        });
      }
    } catch (error) {
      logger.error('Error creating CryptoBot invoice:', error);
      await ctx.reply(
        "CryptoBot orqali to'lov yaratishda xatolik yuz berdi. Iltimos, boshqa to'lov turidan foydalaning.",
        getMainMenuKeyboard(ctx.isAdmin)
      );
    }
  }

  // Handle CryptoBot Payment Status Check Button
  bot.action(/check_crypto:(\d+):(\d+)/, async (ctx) => {
    const invoiceId = ctx.match[1];
    const amountUzs = parseInt(ctx.match[2], 10);
    const userId = ctx.dbUser.id;

    try {
      const result = await CryptoPayService.checkAndProcessInvoice(invoiceId, userId, amountUzs);

      if (result.status === 'PAID') {
        await ctx.answerCbQuery('✅ To\'lov muvaffaqiyatli qabul qilindi!', { show_alert: false });

        const formattedAmount = formatMoney(amountUzs);
        const formattedBalance = formatMoney(result.paymentResult.newBalance);

        const successText =
          `🎉 <b>To'lov muvaffaqiyatli qabul qilindi!</b>\n\n` +
          `💵 <b>Hisobingizga qo'shildi:</b> <code>+${formattedAmount}</code>\n` +
          `💰 <b>Joriy balansingiz:</b> <code>${formattedBalance}</code>\n\n` +
          `<i>Mablag' avtomatik tarzda hisobingizga tushirildi. Xaridlarni boshlashingiz mumkin!</i> ✨`;

        await ctx.editMessageText(successText, {
          parse_mode: 'HTML',
          ...getMainMenuKeyboard(ctx.isAdmin),
        }).catch(() => ctx.reply(successText, { parse_mode: 'HTML', ...getMainMenuKeyboard(ctx.isAdmin) }));

        // Notify Admins
        if (config.adminTelegramIds && config.adminTelegramIds.length > 0) {
          const user = ctx.dbUser;
          const userFullName = escapeHtml(user.firstName || 'Foydalanuvchi');
          const username = user.username ? `@${escapeHtml(user.username)}` : `<a href="tg://user?id=${user.telegramId}">Profil</a>`;
          const adminNotice =
            `⚡️ <b>Yangi avtomatik to'lov! (CryptoBot)</b>\n\n` +
            `👤 <b>Foydalanuvchi:</b> ${userFullName} (${username})\n` +
            `🆔 <b>ID:</b> <code>${user.telegramId}</code>\n` +
            `💵 <b>Summa:</b> <code>${formattedAmount}</code>\n` +
            `🧾 <b>Schyot ID:</b> <code>${invoiceId}</code>\n` +
            `⏰ <b>Vaqt:</b> ${formatDate(new Date())}\n\n` +
            `✅ <i>Balans avtomatik to'ldirildi!</i>`;

          for (const adminId of config.adminTelegramIds) {
            try {
              await ctx.telegram.sendMessage(adminId.toString(), adminNotice, { parse_mode: 'HTML' });
            } catch {}
          }
        }
      } else if (result.status === 'EXPIRED') {
        await ctx.answerCbQuery('⚠️ Ushbu to\'lov so\'rovining vaqti tugagan. Iltimos, yangi so\'rov yarating.', {
          show_alert: true,
        });
      } else {
        await ctx.answerCbQuery('⏳ To\'lov hali kelib tushmadi. Iltimos, @CryptoBot orqali to\'lovni yakunlab, so\'ng qayta bosing.', {
          show_alert: true,
        });
      }
    } catch (error) {
      logger.error('Error checking crypto payment:', error);
      await ctx.answerCbQuery('⚠️ To\'lovni tekshirishda xatolik yuz berdi. Qayta urinib ko\'ring.', {
        show_alert: true,
      });
    }
  });

  // ==========================================
  // 🔹 CLICK & PAYME (TELEGRAM PAYMENTS PROVIDERS)
  // ==========================================

  bot.action('pay_method:click', requireSubscription, async (ctx) => {
    await ctx.answerCbQuery();
    const text =
      `🔹 <b>Click orqali to'lov</b>\n\n` +
      `⚡️ <b>100% Avtomatik:</b> To'lovni Click orqali bajarasiz va pul bir zumda hisobingizga tushadi!\n\n` +
      `Kerakli summani tanlang:`;

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...getClickDepositAmountsKeyboard(),
    }).catch(() => ctx.reply(text, { parse_mode: 'HTML', ...getClickDepositAmountsKeyboard() }));
  });

  bot.action(/click_pack:(\d+)/, requireSubscription, async (ctx) => {
    const amount = parseInt(ctx.match[1], 10);
    await ctx.answerCbQuery();
    await sendProviderInvoice(ctx, amount, 'CLICK', config.clickProviderToken);
  });

  bot.action('pay_method:payme', requireSubscription, async (ctx) => {
    await ctx.answerCbQuery();
    const text =
      `🔹 <b>Payme orqali to'lov</b>\n\n` +
      `⚡️ <b>100% Avtomatik:</b> To'lovni Payme orqali bajarasiz va pul bir zumda hisobingizga tushadi!\n\n` +
      `Kerakli summani tanlang:`;

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...getPaymeDepositAmountsKeyboard(),
    }).catch(() => ctx.reply(text, { parse_mode: 'HTML', ...getPaymeDepositAmountsKeyboard() }));
  });

  bot.action(/payme_pack:(\d+)/, requireSubscription, async (ctx) => {
    const amount = parseInt(ctx.match[1], 10);
    await ctx.answerCbQuery();
    await sendProviderInvoice(ctx, amount, 'PAYME', config.paymeProviderToken);
  });

  async function sendProviderInvoice(ctx, amountUzs, providerName, providerToken) {
    try {
      const user = ctx.dbUser;
      const formattedAmount = formatMoney(amountUzs);

      await ctx.replyWithInvoice({
        title: `${providerName} - ${formattedAmount}`,
        description: `BULDROP PM botida ${formattedAmount} miqdorida hisobni to'ldirish`,
        payload: JSON.stringify({
          userId: user.id,
          telegramId: user.telegramId.toString(),
          amount: amountUzs,
          provider: providerName,
          timestamp: Date.now(),
        }),
        provider_token: providerToken,
        currency: 'UZS',
        prices: [{ label: `${formattedAmount}`, amount: amountUzs * 100 }], // In tiyins
      });
    } catch (error) {
      logger.error(`Error sending ${providerName} invoice:`, error);
      await ctx.reply(
        `${providerName} to'lovini yaratishda xatolik yuz berdi. Iltimos, boshqa to'lov turidan foydalaning.`,
        getMainMenuKeyboard(ctx.isAdmin)
      );
    }
  }

  // ==========================================
  // ==========================================
  // 💳 KARTA ORQALI AVTOMATIK TO'LOV (⚡️ @gayrat_pmbot kabi)
  // ==========================================

  bot.action('pay_method:card', requireSubscription, async (ctx) => {
    await ctx.answerCbQuery();
    const text =
      `💳 <b>Karta orqali avtomatik to'lov</b>\n\n` +
      `⚡️ <b>100% Avtomatik:</b> To'lovni amalga oshirishingiz bilan pul 5–10 soniya ichida balansingizga avtomatik qo'shiladi! Admin tekshiruvi shart emas.\n\n` +
      `Kerakli summani tanlang yoki o'zingiz kiriting:`;

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...getCardDepositAmountsKeyboard(),
    }).catch(() => ctx.reply(text, { parse_mode: 'HTML', ...getCardDepositAmountsKeyboard() }));
  });

  bot.action(/card_pack:(\d+)/, requireSubscription, async (ctx) => {
    const amount = parseInt(ctx.match[1], 10);
    await ctx.answerCbQuery();
    await createCardPaymentRequest(ctx, amount);
  });

  bot.action('card_custom_amount', requireSubscription, async (ctx) => {
    ctx.session.setState(USER_STATES.AWAITING_PAYMENT_AMOUNT);
    await ctx.answerCbQuery();

    await ctx.reply(
      `💵 <b>Qancha summa kiritmoqchisiz?</b>\n\n` +
        `<i>(Kamida ${MIN_DEPOSIT_AMOUNT} so'm)</i>\n\n` +
        `Masalan: <code>20000</code> yoki <code>50 000</code>`,
      {
        parse_mode: 'HTML',
        ...getCancelKeyboard(),
      }
    );
  });

  /**
   * Helper: Generate Card Payment Request with unique payment code and instant check
   */
  async function createCardPaymentRequest(ctx, amount) {
    try {
      const user = ctx.dbUser;

      // 1. Create pending payment request in DB
      const paymentRequest = await PaymentService.createPaymentRequest(user.id, amount, 'CARD');
      const paymentCode = `BP${paymentRequest.id}`;

      // Update externalId to paymentCode for exact matching
      await prisma.paymentRequest.update({
        where: { id: paymentRequest.id },
        data: { externalId: paymentCode },
      }).catch(() => {});

      // 2. Fetch active card info
      const cardDetails = await AdminService.getPaymentCardDetails();

      // 3. Set session
      ctx.session.setState(USER_STATES.AWAITING_RECEIPT, {
        paymentRequestId: paymentRequest.id,
        amount,
        paymentCode,
      });

      const formattedAmount = formatMoney(amount);
      const formattedCard = cardDetails.cardNumber;

      const messageText =
        `💳 <b>To'lov ma'lumotlari (Avtomatik ⚡️)</b>\n\n` +
        `💵 <b>To'lov summasi:</b> <code>${formattedAmount}</code>\n\n` +
        `💳 <b>Karta raqami (nusxalash uchun bosing):</b>\n` +
        `<code>${formattedCard}</code>\n` +
        `<i>(${escapeHtml(cardDetails.cardHolder)})</i>\n\n` +
        `💬 <b>To'lov izohi (komment):</b>\n` +
        `<code>${paymentCode}</code>\n\n` +
        `⚡️ <b>DIQQAT:</b> To'lovni Click, Payme yoki istalgan bank ilovasi orqali o'tkazing. Pul kartaga tushishi bilan <b>5–10 soniya ichida</b> balansingizga avtomatik qo'shiladi!\n` +
        `<i>(Admin tasdiqlashi shart emas)</i>\n\n` +
        `⚠️ <i>To'lov qilayotganda izohga (kommentariyaga) <code>${paymentCode}</code> kodini yozsangiz, to'lovingiz bir zumda avtomatik tasdiqlanadi. Agar to'lov qilgan bo'lsangiz, quyidagi <b>"🔄 To'lovni tekshirish"</b> tugmasini bosing:</i>`;

      const keyboard = getAutoCardPaymentKeyboard(paymentRequest.id, formattedCard, amount);

      if (ctx.callbackQuery) {
        await ctx.editMessageText(messageText, {
          parse_mode: 'HTML',
          ...keyboard,
        }).catch(() => ctx.reply(messageText, {
          parse_mode: 'HTML',
          ...keyboard,
        }));
      } else {
        await ctx.reply(messageText, {
          parse_mode: 'HTML',
          ...keyboard,
        });
      }
    } catch (error) {
      logger.error('Error initiating card payment request:', error);
      ctx.session.reset();
      await ctx.reply(
        "To'lov so'rovini yaratishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.",
        getMainMenuKeyboard(ctx.isAdmin)
      );
    }
  }

  // Handle "To'lovni tekshirish" button for card payments
  bot.action(/check_card_payment:(\d+)/, async (ctx) => {
    const paymentId = parseInt(ctx.match[1], 10);
    const user = ctx.dbUser;

    try {
      const payment = await PaymentService.getPaymentRequest(paymentId);
      if (!payment) {
        return await ctx.answerCbQuery("⚠️ To'lov so'rovi topilmadi.", { show_alert: true });
      }

      if (payment.status === 'APPROVED') {
        await ctx.answerCbQuery("✅ Ushbu to'lov allaqachon balansingizga tushirilgan!", { show_alert: false });
        return await ctx.editMessageText(
          `🎉 <b>To'lov tasdiqlangan!</b>\n\n` +
          `💵 <b>Summa:</b> <code>+${formatMoney(Number(payment.amount))}</code>\n\n` +
          `<i>Mablag' balansingizga muvaffaqiyatli qo'shilgan. Xaridlarni boshlashingiz mumkin!</i> ✨`,
          {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(ctx.isAdmin),
          }
        ).catch(() => {});
      }

      // Check recent incoming SMS deposits via SmsParserService
      const claimResult = await SmsParserService.checkAndClaimDeposit(paymentId, user.id, Number(payment.amount), bot);

      if (claimResult.status === 'PAID') {
        await ctx.answerCbQuery("✅ To'lov muvaffaqiyatli qabul qilindi!", { show_alert: false });

        const formattedAmount = formatMoney(Number(payment.amount));
        const formattedBalance = formatMoney(claimResult.newBalance);

        return await ctx.editMessageText(
          `🎉 <b>To'lov muvaffaqiyatli qabul qilindi!</b>\n\n` +
          `💵 <b>Hisobingizga qo'shildi:</b> <code>+${formattedAmount}</code>\n` +
          `💰 <b>Joriy balansingiz:</b> <code>${formattedBalance}</code>\n\n` +
          `<i>Mablag' kartaga tushishi bilan bir zumda balansingizga avtomatik o'tkazildi! Xaridlarni amalga oshirishingiz mumkin.</i> ✨`,
          {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(ctx.isAdmin),
          }
        ).catch(() => ctx.reply(
          `🎉 <b>To'lov muvaffaqiyatli qabul qilindi!</b>\n\n` +
          `💵 <b>Hisobingizga qo'shildi:</b> <code>+${formattedAmount}</code>\n` +
          `💰 <b>Joriy balansingiz:</b> <code>${formattedBalance}</code>`,
          {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(ctx.isAdmin),
          }
        ));
      }

      // If not yet claimed
      await ctx.answerCbQuery(
        "⏳ To'lov hali hisobga kelib tushmadi.\n\nIltimos, agar to'lovni endi bajargan bo'lsangiz, 5–10 soniya kuting va qayta tekshiring.",
        { show_alert: true }
      );
    } catch (err) {
      logger.error('Error in check_card_payment action:', err);
      await ctx.answerCbQuery("⚠️ Tekshirishda xatolik yuz berdi. Qayta urinib ko'ring.", { show_alert: true });
    }
  });

  // Handle custom amount text inputs
  bot.on('text', async (ctx, next) => {
    const state = ctx.session?.state;
    if (
      state !== USER_STATES.AWAITING_PAYMENT_AMOUNT &&
      state !== USER_STATES.AWAITING_STARS_AMOUNT &&
      state !== USER_STATES.AWAITING_CRYPTO_AMOUNT
    ) {
      return next();
    }

    const text = ctx.message.text.trim();

    if (text === BUTTONS.CANCEL || text === BUTTONS.MAIN_MENU) {
      ctx.session.reset();
      return ctx.reply('🏠 Bosh sahifaga qaytdingiz.', getMainMenuKeyboard(ctx.isAdmin));
    }

    const parseResult = parseDepositAmount(text);
    if (!parseResult.isValid) {
      return ctx.reply(`⚠️ ${parseResult.error}\n\nIltimos, qaytadan summa kiriting:`, {
        parse_mode: 'HTML',
        ...getCancelKeyboard(),
      });
    }

    const amount = parseResult.amount;

    if (state === USER_STATES.AWAITING_STARS_AMOUNT) {
      ctx.session.reset();
      const starsRate = config.starsRate || 250;
      const stars = Math.ceil(amount / starsRate);
      return await sendStarsInvoice(ctx, stars, amount);
    }

    if (state === USER_STATES.AWAITING_CRYPTO_AMOUNT) {
      ctx.session.reset();
      return await createCryptoInvoiceFlow(ctx, amount);
    }

    if (state === USER_STATES.AWAITING_PAYMENT_AMOUNT) {
      return await createCardPaymentRequest(ctx, amount);
    }
  });

  bot.action(/send_receipt:(\d+)/, async (ctx) => {
    const paymentId = parseInt(ctx.match[1], 10);
    ctx.session.setState(USER_STATES.AWAITING_RECEIPT, { paymentRequestId: paymentId });

    await ctx.answerCbQuery();
    await ctx.reply(
      `📸 <b>To'lov chekini yuborish</b>\n\n` +
        `Iltimos, to'lov kvitansiyasi (chek) skrinshotini rasm yoki fayl ko'rinishida shu yerga yuboring.\n\n` +
        `⏱ <i>Chekingiz yuborilgach, ma'muriyat (admin) uni <b>10–15 daqiqa ichida</b> ko'rib chiqadi va mablag'ni balansingizga to'liq o'tkazib beradi.</i>`,
      {
        parse_mode: 'HTML',
        ...getCancelKeyboard(),
      }
    );
  });

  bot.on('photo', async (ctx, next) => {
    if (ctx.session?.state !== USER_STATES.AWAITING_RECEIPT) {
      return next();
    }

    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;
    await processReceiptSubmission(ctx, fileId, 'photo');
  });

  bot.on('document', async (ctx, next) => {
    if (ctx.session?.state !== USER_STATES.AWAITING_RECEIPT) {
      return next();
    }

    const fileId = ctx.message.document.file_id;
    await processReceiptSubmission(ctx, fileId, 'document');
  });

  async function processReceiptSubmission(ctx, fileId, fileType) {
    const sessionData = ctx.session.data || {};
    const paymentRequestId = sessionData.paymentRequestId;

    if (!paymentRequestId) {
      ctx.session.reset();
      return ctx.reply(
        "⚠️ To'lov so'rovi topilmadi yoki vaqti tugagan. Iltimos, yangitdan balans to'ldirishni boshlang.",
        getMainMenuKeyboard(ctx.isAdmin)
      );
    }

    try {
      const updatedPayment = await PaymentService.attachReceipt(paymentRequestId, fileId);
      ctx.session.reset();

      const formattedAmount = formatMoney(Number(updatedPayment.amount));

      await ctx.reply(
        `✅ <b>To'lov chekingiz muvaffaqiyatli qabul qilindi!</b>\n\n` +
          `💵 <b>To'lov summasi:</b> <code>${formattedAmount}</code>\n` +
          `⏳ <b>Holati:</b> Ma'muriyat tekshiruvida\n\n` +
          `⏱ <i>Ma'muriyat (admin) <b>10–15 daqiqa ichida</b> to'lov chekingizni ko'rib chiqadi va mablag'ni to'liq balansingizga tushirib beradi. To'lov tasdiqlanishi bilan sizga xabar yuboramiz.</i>\n\n` +
          `<i>Sabringiz uchun tashakkur!</i> 😊`,
        {
          parse_mode: 'HTML',
          ...getMainMenuKeyboard(ctx.isAdmin),
        }
      );

      if (config.adminTelegramIds && config.adminTelegramIds.length > 0) {
        const user = ctx.dbUser;
        const userFullName = escapeHtml(user.firstName || 'Foydalanuvchi');
        const formattedDate = formatDate(updatedPayment.createdAt);

        const userProfileLink = user.username
          ? `@${escapeHtml(user.username)}`
          : `<a href="tg://user?id=${user.telegramId.toString()}">Profilga o'tish</a>`;

        const adminCaption =
          `🔔 <b>Yangi to'lov so'rovi! (#${updatedPayment.id})</b>\n\n` +
          `👤 <b>Foydalanuvchi:</b> <a href="tg://user?id=${user.telegramId.toString()}">${userFullName}</a> (${userProfileLink})\n` +
          `🆔 <b>Telegram ID:</b> <code>${user.telegramId.toString()}</code>\n` +
          `🔗 <b>Profil havolasi:</b> <a href="tg://user?id=${user.telegramId.toString()}">Mijoz profilinga o'tish</a>\n` +
          `💵 <b>To'lov summasi:</b> <code>${formattedAmount}</code>\n` +
          `⏰ <b>Vaqt:</b> ${formattedDate}\n\n` +
          `To'lovni tasdiqlaysizmi?`;

        const adminKeyboard = getAdminPaymentApprovalKeyboard(updatedPayment.id);

        for (const adminId of config.adminTelegramIds) {
          try {
            const adminChatId = adminId.toString();
            if (fileType === 'photo') {
              await ctx.telegram.sendPhoto(adminChatId, fileId, {
                caption: adminCaption,
                parse_mode: 'HTML',
                ...adminKeyboard,
              });
            } else {
              await ctx.telegram.sendDocument(adminChatId, fileId, {
                caption: adminCaption,
                parse_mode: 'HTML',
                ...adminKeyboard,
              });
            }
          } catch (sendErr) {
            logger.warn(`Could not send payment notification to admin ${adminId}:`, sendErr.message);
          }
        }
      }
    } catch (error) {
      logger.error('Error processing receipt upload:', error);
      await ctx.reply(
        "Chekni saqlashda xatolik yuz berdi. Iltimos, qaytadan yuborib ko'ring.",
        getCancelKeyboard()
      );
    }
  }

  // ==========================================================
  // ⚡️ GLOBAL AUTOMATIC PAYMENT HANDLERS (STARS, CLICK, PAYME)
  // ==========================================================

  /**
   * Always respond to Pre-Checkout Queries (Telegraf)
   */
  bot.on('pre_checkout_query', async (ctx) => {
    try {
      logger.info('Pre-checkout query received:', ctx.preCheckoutQuery);
      await ctx.answerPreCheckoutQuery(true);
    } catch (error) {
      logger.error('Error answering pre_checkout_query:', error);
      try {
        await ctx.answerPreCheckoutQuery(false, "To'lovni amalga oshirishda xatolik yuz berdi.");
      } catch {}
    }
  });

  /**
   * Handle Successful Automatic Payments (Telegram Stars, Native Invoices)
   */
  bot.on('successful_payment', async (ctx) => {
    try {
      const payment = ctx.message.successful_payment;
      logger.info('Successful payment received:', payment);

      let payload = {};
      try {
        payload = JSON.parse(payment.invoice_payload);
      } catch (e) {
        payload = {
          userId: ctx.dbUser?.id,
          amount: payment.total_amount * (config.starsRate || 250),
          provider: payment.currency === 'XTR' ? 'STARS' : 'CARD',
        };
      }

      const userId = payload.userId || ctx.dbUser?.id;
      const currency = payment.currency || 'XTR';
      const provider = payload.provider || (currency === 'XTR' ? 'STARS' : 'CARD');
      const amount = payload.amount || (currency === 'XTR' ? payment.total_amount * (config.starsRate || 250) : payment.total_amount / 100);
      const externalId = payment.telegram_payment_charge_id || `charge_${Date.now()}`;

      const desc = provider === 'STARS'
        ? `Telegram Stars orqali avtomatik to'lov (${payment.total_amount} ⭐)`
        : `${provider} orqali avtomatik to'lov`;

      const result = await PaymentService.processAutoPayment({
        userId,
        amount,
        provider,
        externalId,
        currency,
        description: desc,
      });

      if (result.success) {
        const formattedAmount = formatMoney(Number(result.amount));
        const formattedBalance = formatMoney(Number(result.newBalance));

        await ctx.reply(
          `🎉 <b>To'lov muvaffaqiyatli qabul qilindi!</b>\n\n` +
            `💵 <b>Hisobingizga qo'shildi:</b> <code>+${formattedAmount}</code>\n` +
            `💰 <b>Joriy balansingiz:</b> <code>${formattedBalance}</code>\n\n` +
            `<i>Mablag' avtomatik tarzda hisobingizga tushirildi. Xaridlarni amalga oshirishingiz mumkin!</i> ✨`,
          {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(ctx.isAdmin),
          }
        );

        // Notify Admins about automatic payment
        if (config.adminTelegramIds && config.adminTelegramIds.length > 0) {
          const user = ctx.dbUser;
          const userFullName = escapeHtml(user?.firstName || ctx.from?.first_name || 'Foydalanuvchi');
          const username = user?.username || ctx.from?.username || '';
          const userLink = username
            ? `@${escapeHtml(username)}`
            : `<a href="tg://user?id=${ctx.from.id}">Profil</a>`;

          const adminNotice =
            `⚡️ <b>Yangi avtomatik to'lov! (${provider})</b>\n\n` +
            `👤 <b>Foydalanuvchi:</b> ${userFullName} (${userLink})\n` +
            `🆔 <b>ID:</b> <code>${ctx.from.id}</code>\n` +
            `💵 <b>Summa:</b> <code>${formattedAmount}</code> (${payment.total_amount} ${currency})\n` +
            `💳 <b>Usul:</b> ${provider}\n` +
            `🧾 <b>Tranzaksiya ID:</b> <code>${externalId}</code>\n` +
            `⏰ <b>Vaqt:</b> ${formatDate(new Date())}\n\n` +
            `✅ <i>Balans bir zumda avtomatik to'ldirildi!</i>`;

          for (const adminId of config.adminTelegramIds) {
            try {
              await ctx.telegram.sendMessage(adminId.toString(), adminNotice, { parse_mode: 'HTML' });
            } catch (sendErr) {
              logger.warn(`Could not send auto-deposit alert to admin ${adminId}:`, sendErr.message);
            }
          }
        }
      } else {
        logger.error('Error in processAutoPayment result:', result);
        await ctx.reply(
          `⚠️ To'lovingiz qabul qilindi (${payment.telegram_payment_charge_id}), ammo balansni yangilashda xatolik yuz berdi.\n` +
            `Iltimos, adminga murojaat qiling: @${config.ownerUsername}`,
          getMainMenuKeyboard(ctx.isAdmin)
        );
      }
    } catch (error) {
      logger.error('Error handling successful_payment:', error);
      await ctx.reply(
        `⚠️ To'lovni qayta ishlashda xatolik yuz berdi. Iltimos, adminga murojaat qiling: @${config.ownerUsername}`
      );
    }
  });
}
