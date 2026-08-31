import { Markup } from 'telegraf';
import { BUTTONS, USER_STATES, PAYMENT_EXPIRE_MINUTES } from '../config/constants.js';
import { PaymentService } from '../services/paymentService.js';
import { AdminService } from '../services/adminService.js';
import { parseDepositAmount } from '../utils/validators.js';
import { formatMoney, formatDate, escapeHtml } from '../utils/formatters.js';
import {
  getCardDepositAmountsKeyboard,
  getPaymentActionKeyboard,
} from '../keyboards/inlineKeyboards.js';
import { getCancelKeyboard, getMainMenuKeyboard } from '../keyboards/mainKeyboards.js';
import { getAdminPaymentApprovalKeyboard } from '../keyboards/adminKeyboards.js';
import { requireSubscription } from '../middlewares/checkSubscription.js';
import config from '../config/index.js';
import { logger } from '../utils/logger.js';

export function registerPaymentHandlers(bot) {
  /**
   * 1. Start deposit flow: Show quick amount options
   */
  async function promptDepositAmount(ctx) {
    if (ctx.session) {
      ctx.session.reset();
    }

    const text =
      `💳 <b>Balans to'ldirish</b>\n\n` +
      `Qancha summa kiritmoqchisiz? Quyidagi tayyor summalardan birini tanlang yoki o'zingiz kiriting:`;

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...getCardDepositAmountsKeyboard(),
      }).catch(() => ctx.reply(text, { parse_mode: 'HTML', ...getCardDepositAmountsKeyboard() }));
    } else {
      await ctx.reply(text, {
        parse_mode: 'HTML',
        ...getCardDepositAmountsKeyboard(),
      });
    }
  }

  bot.hears(BUTTONS.DEPOSIT, requireSubscription, promptDepositAmount);
  bot.action('nav_deposit', requireSubscription, promptDepositAmount);

  /**
   * 2. Quick amount selection via callback buttons (e.g. 10k, 20k, 50k, 100k...)
   */
  bot.action(/card_pack:(\d+)/, requireSubscription, async (ctx) => {
    const amount = parseInt(ctx.match[1], 10);
    await ctx.answerCbQuery();
    await createCardPaymentRequest(ctx, amount);
  });

  /**
   * 3. Custom amount entry button
   */
  bot.action('card_custom_amount', requireSubscription, async (ctx) => {
    ctx.session.setState(USER_STATES.AWAITING_PAYMENT_AMOUNT);
    await ctx.answerCbQuery();

    await ctx.reply(
      `💵 <b>Qancha summa kiritmoqchisiz?</b>\n\n` +
        `<i>(Kamida 1 000 so'm)</i>\n\n` +
        `Masalan: <code>20000</code> yoki <code>50 000</code>`,
      {
        parse_mode: 'HTML',
        ...getCancelKeyboard(),
      }
    );
  });

  /**
   * 4. Handle text amount input from user
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

    await createCardPaymentRequest(ctx, parseResult.amount);
  });

  /**
   * Helper: Generate Card Payment Request and prompt for receipt upload
   */
  async function createCardPaymentRequest(ctx, amount) {
    try {
      const user = ctx.dbUser;

      // 1. Create pending payment request in DB
      const paymentRequest = await PaymentService.createPaymentRequest(user.id, amount, 'CARD');

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
        `💳 <b>To'lov ma'lumotlari</b>\n\n` +
        `💵 <b>To'lov summasi:</b> <code>${formattedAmount}</code>\n\n` +
        `💳 <b>Karta raqami (nusxalash uchun bosing):</b>\n` +
        `<code>${formattedCard}</code>\n` +
        `<i>(${escapeHtml(cardDetails.cardHolder)})</i>\n\n` +
        `⏳ <b>To'lov uchun ajratilgan vaqt:</b> ${PAYMENT_EXPIRE_MINUTES} daqiqa\n\n` +
        `📲 <i>To'lovni amalga oshirgach, chekning skrinshotini shu yerga yuboring yoki quyidagi <b>"🧾 Chek yuborish"</b> tugmasini bosing:</i>`;

      if (ctx.callbackQuery) {
        await ctx.editMessageText(messageText, {
          parse_mode: 'HTML',
          ...getPaymentActionKeyboard(paymentRequest.id),
        }).catch(() => ctx.reply(messageText, {
          parse_mode: 'HTML',
          ...getPaymentActionKeyboard(paymentRequest.id),
        }));
      } else {
        await ctx.reply(messageText, {
          parse_mode: 'HTML',
          ...getPaymentActionKeyboard(paymentRequest.id),
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

  /**
   * 5. Action when clicking "🧾 Chek yuborish" button
   */
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

  /**
   * 6. Handle receipt upload (Photo)
   */
  bot.on('photo', async (ctx, next) => {
    if (ctx.session?.state !== USER_STATES.AWAITING_RECEIPT) {
      return next();
    }

    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;
    await processReceiptSubmission(ctx, fileId, 'photo');
  });

  /**
   * 7. Handle receipt upload (Document / PDF / image file)
   */
  bot.on('document', async (ctx, next) => {
    if (ctx.session?.state !== USER_STATES.AWAITING_RECEIPT) {
      return next();
    }

    const fileId = ctx.message.document.file_id;
    await processReceiptSubmission(ctx, fileId, 'document');
  });

  /**
   * 8. Process receipt submission and forward to Admin for approval
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

      // 2. Inform user in polite literary Uzbek
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

      // 3. Forward to all Admins (Owner & Admin) for approval
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
