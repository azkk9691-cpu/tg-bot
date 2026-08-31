import { Markup } from 'telegraf';
import prisma from '../database/prisma.js';
import { BUTTONS, USER_STATES, MIN_DEPOSIT_AMOUNT } from '../config/constants.js';
import { PaymentService } from '../services/paymentService.js';
import { AdminService } from '../services/adminService.js';
import { parseDepositAmount } from '../utils/validators.js';
import { formatMoney, formatDate, escapeHtml } from '../utils/formatters.js';
import {
  getMainDepositAmountsKeyboard,
  getPaymentMethodsKeyboard,
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
   * 1. Start deposit flow: Show Main Quick Amounts (Card)
   */
  async function promptDepositMethods(ctx) {
    if (ctx.session) {
      ctx.session.reset();
    }

    const text =
      `💳 <b>Balans to'ldirish</b>\n\n` +
      `Qancha summa kiritmoqchisiz? Quyidagi tayyor summalardan birini tanlang yoki o'zingiz kiriting:`;

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
  // 💳 KARTA ORQALI TO'LOV (CHEK YUBORISH)
  // ==========================================

  bot.action('pay_method:card', requireSubscription, async (ctx) => {
    await ctx.answerCbQuery();
    const text =
      `💳 <b>Karta orqali to'lov</b>\n\n` +
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
   * Helper: Generate Card Payment Request with receipt submission
   */
  async function createCardPaymentRequest(ctx, amount) {
    try {
      const user = ctx.dbUser;

      // 1. Create pending payment request in DB
      const paymentRequest = await PaymentService.createPaymentRequest(user.id, amount, 'CARD');
      const paymentCode = `BP${paymentRequest.id}`;

      // Update externalId to paymentCode for tracking
      await prisma.paymentRequest.update({
        where: { id: paymentRequest.id },
        data: { externalId: paymentCode },
      }).catch(() => {});

      // 2. Fetch active card info
      const cardDetails = await AdminService.getPaymentCardDetails();

      // 3. Set session to await receipt
      ctx.session.setState(USER_STATES.AWAITING_RECEIPT, {
        paymentRequestId: paymentRequest.id,
        amount,
        paymentCode,
      });

      const formattedAmount = formatMoney(amount);
      const formattedCard = cardDetails.cardNumber;

      const messageText =
        `💳 <b>To'lov ma'lumotlari</b>\n\n` +
        `💵 <b>To'lov summasi:</b> <code>${formattedAmount}</code>\n\n` +
        `💳 <b>Karta raqami (nusxalash uchun bosing):</b>\n` +
        `<code>${formattedCard}</code>\n` +
        `<i>(${escapeHtml(cardDetails.cardHolder)})</i>\n\n` +
        `📌 <b>Ko'rsatma:</b>\n` +
        `1. Yuqoridagi kartaga <code>${formattedAmount}</code> o'tkazing.\n` +
        `2. To'lov amalga oshirilgach, to'lov kvitansiyasi (chek) skrinshotini shu yerga rasm yoki fayl sifatida yuboring yoki quyidagi <b>"🧾 Chek yuborish"</b> tugmasini bosing.\n\n` +
        `⏱ <i>Chekingiz yuborilgach, ma'muriyat 10–15 daqiqa ichida to'lovni tasdiqlab balansingizga pulni o'tkazib beradi.</i>`;

      const keyboard = getAutoCardPaymentKeyboard(paymentRequest.id);

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

  // Handle custom amount text inputs
  bot.on('text', async (ctx, next) => {
    const state = ctx.session?.state;
    if (state !== USER_STATES.AWAITING_PAYMENT_AMOUNT) {
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
    return await createCardPaymentRequest(ctx, amount);
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
}
