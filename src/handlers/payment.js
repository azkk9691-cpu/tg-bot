import { Markup } from 'telegraf';
import { BUTTONS, USER_STATES, PAYMENT_EXPIRE_MINUTES } from '../config/constants.js';
import { PaymentService } from '../services/paymentService.js';
import { AdminService } from '../services/adminService.js';
import { parseDepositAmount } from '../utils/validators.js';
import { formatMoney, formatDate, escapeHtml } from '../utils/formatters.js';
import { getPaymentActionKeyboard } from '../keyboards/inlineKeyboards.js';
import { getCancelKeyboard, getMainMenuKeyboard } from '../keyboards/mainKeyboards.js';
import { getAdminPaymentApprovalKeyboard } from '../keyboards/adminKeyboards.js';
import { requireSubscription } from '../middlewares/checkSubscription.js';
import config from '../config/index.js';
import { logger } from '../utils/logger.js';

export function registerPaymentHandlers(bot) {
  /**
   * Start deposit flow
   */
  async function promptDepositAmount(ctx) {
    ctx.session.setState(USER_STATES.AWAITING_PAYMENT_AMOUNT);

    const text =
      `💵 <b>Qancha summa kiritmoqchisiz?</b>\n\n` +
      `<i>(Kamida 1 000 so'm)</i>\n\n` +
      `Masalan: <code>20000</code> yoki <code>50 000</code>`;

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    await ctx.reply(text, {
      parse_mode: 'HTML',
      ...getCancelKeyboard(),
    });
  }

  bot.hears(BUTTONS.DEPOSIT, requireSubscription, promptDepositAmount);
  bot.action('nav_deposit', requireSubscription, promptDepositAmount);

  /**
   * Handle text amount input while in AWAITING_PAYMENT_AMOUNT state
   */
  bot.on('text', async (ctx, next) => {
    if (ctx.session?.state !== USER_STATES.AWAITING_PAYMENT_AMOUNT) {
      return next();
    }

    const text = ctx.message.text.trim();

    if (text === BUTTONS.CANCEL || text === BUTTONS.MAIN_MENU) {
      ctx.session.reset();
      return ctx.reply(
        '🏠 Bosh sahifaga qaytdingiz.',
        getMainMenuKeyboard(ctx.isAdmin)
      );
    }

    const parseResult = parseDepositAmount(text);
    if (!parseResult.isValid) {
      return ctx.reply(`⚠️ ${parseResult.error}\n\nIltimos, qaytadan summa kiriting:`, {
        parse_mode: 'HTML',
        ...getCancelKeyboard(),
      });
    }

    try {
      const user = ctx.dbUser;
      const amount = parseResult.amount;

      // 1. Create pending payment request in DB
      const paymentRequest = await PaymentService.createPaymentRequest(user.id, amount);

      // 2. Fetch active card info
      const cardDetails = await AdminService.getPaymentCardDetails();

      // 3. Set session to await receipt
      ctx.session.setState(USER_STATES.AWAITING_RECEIPT, {
        paymentRequestId: paymentRequest.id,
        amount,
      });

      const formattedAmount = formatMoney(amount);
      const formattedCard = cardDetails.cardNumber;

      const messageText =
        `💳 <b>To'lov summasi:</b> <code>${formattedAmount}</code>\n\n` +
        `💳 <b>Karta raqami:</b>\n` +
        `<code>${formattedCard}</code>\n` +
        `<i>(${escapeHtml(cardDetails.cardHolder)})</i>\n\n` +
        `⏳ <b>Sizga to'lov uchun ${PAYMENT_EXPIRE_MINUTES} daqiqa vaqt berildi.</b>\n\n` +
        `Pul o'tkazilgandan keyin to'lov chekini rasm yoki fayl ko'rinishida yuboring yoki quyidagi tugmani bosing:`;

      await ctx.reply(messageText, {
        parse_mode: 'HTML',
        ...getPaymentActionKeyboard(paymentRequest.id),
      });
    } catch (error) {
      logger.error('Error initiating payment request:', error);
      ctx.session.reset();
      await ctx.reply(
        "To'lov so'rovini yaratishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.",
        getMainMenuKeyboard(ctx.isAdmin)
      );
    }
  });

  /**
   * Action when clicking "🧾 Chek yuborish" button
   */
  bot.action(/send_receipt:(\d+)/, async (ctx) => {
    const paymentId = parseInt(ctx.match[1], 10);
    ctx.session.setState(USER_STATES.AWAITING_RECEIPT, { paymentRequestId: paymentId });

    await ctx.answerCbQuery();
    await ctx.reply(
      `📸 <b>To'lov chekini (skrinshot yoki rasmini) shu yerga yuboring:</b>\n\n` +
        `<i>Rasm yuklangandan so'ng u tekshirish uchun adminga yuboriladi.</i>`,
      {
        parse_mode: 'HTML',
        ...getCancelKeyboard(),
      }
    );
  });

  /**
   * Handle receipt upload (Photo)
   */
  bot.on('photo', async (ctx, next) => {
    if (ctx.session?.state !== USER_STATES.AWAITING_RECEIPT) {
      return next();
    }

    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id; // highest resolution
    await processReceiptSubmission(ctx, fileId, 'photo');
  });

  /**
   * Handle receipt upload (Document / PDF / image file)
   */
  bot.on('document', async (ctx, next) => {
    if (ctx.session?.state !== USER_STATES.AWAITING_RECEIPT) {
      return next();
    }

    const fileId = ctx.message.document.file_id;
    await processReceiptSubmission(ctx, fileId, 'document');
  });

  /**
   * Process receipt submission and notify Admin
   */
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
      // 1. Attach receipt in database
      const updatedPayment = await PaymentService.attachReceipt(paymentRequestId, fileId);

      ctx.session.reset();

      const formattedAmount = formatMoney(Number(updatedPayment.amount));

      // 2. Notify user
      await ctx.reply(
        `✅ <b>To'lov chekingiz qabul qilindi!</b>\n\n` +
          `💵 <b>Summa:</b> <code>${formattedAmount}</code>\n` +
          `⏳ <b>Holat:</b> Admin tekshiruvida\n\n` +
          `<i>Admin chekni tekshirib tasdiqlagandan so'ng, pul balansingizga avtomatik qo'shiladi va sizga xabar yuboriladi.</i>`,
        {
          parse_mode: 'HTML',
          ...getMainMenuKeyboard(ctx.isAdmin),
        }
      );

      // 3. Forward to Admin
      if (config.adminTelegramId) {
        const adminChatId = config.adminTelegramId.toString();
        const user = ctx.dbUser;
        const userFullName = escapeHtml(user.firstName || 'Foydalanuvchi');
        const usernameStr = user.username ? `@${escapeHtml(user.username)}` : 'Mavjud emas';
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
