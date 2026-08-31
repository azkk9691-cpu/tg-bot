import prisma from '../database/prisma.js';
import { PaymentService } from './paymentService.js';
import { formatMoney, formatDate, escapeHtml } from '../utils/formatters.js';
import { getMainMenuKeyboard } from '../keyboards/mainKeyboards.js';
import config from '../config/index.js';
import { logger } from '../utils/logger.js';

// In-memory cache for recent unassigned incoming bank deposits (valid for 30 mins)
const recentBankDeposits = [];

export class SmsParserService {
  /**
   * Parse incoming SMS from Bank / Uzcard / Humo / Click / Payme
   * Extracts amount and comment/code
   */
  static parseSms(smsText) {
    if (!smsText || typeof smsText !== 'string') {
      return { success: false, error: 'INVALID_TEXT' };
    }

    const text = smsText.replace(/\r?\n/g, ' ').trim();

    // 1. Extract Amount
    let amount = null;

    // Matches: "+20 000 UZS", "20000.00 UZS", "20 000 UZS", "20000 so'm", "popolnenie: +20 000 UZS", etc.
    const uzsMatch =
      text.match(/(?:\+|tushdi|o'tkazildi|popolnenie|perevod|summa:?|na summu:?)\s*:?\s*(\d[\d\s.,]*)\s*(?:UZS|so'?m|sum)/i) ||
      text.match(/(\d[\d\s.,]*)\s*(?:UZS|so'?m|sum)\s*(?:tushdi|o'tkazildi|popolnenie|perevod|karta)/i) ||
      text.match(/(\d[\d\s.,]*)\s*(?:UZS|so'?m|sum)/i) ||
      text.match(/(?:\+|tushdi|summa:?)\s*(\d[\d\s.,]+)/i);

    if (uzsMatch && uzsMatch[1]) {
      let cleanStr = uzsMatch[1].trim().replace(/\s+/g, '').replace(/,/g, '');
      if (cleanStr.endsWith('.00')) {
        cleanStr = cleanStr.slice(0, -3);
      } else if (cleanStr.includes('.')) {
        cleanStr = cleanStr.split('.')[0];
      }
      const parsed = parseInt(cleanStr, 10);
      if (!isNaN(parsed) && parsed > 0) {
        amount = parsed;
      }
    }

    // 2. Extract Comment / Payment Code (e.g. BP1234, BP-1234, 1234, or Telegram ID)
    let commentCode = null;
    const commentMatch =
      text.match(/(?:izoh|komment|kod|code|comment|bp|to'lov):\s*([A-Za-z0-9_-]+)/i) ||
      text.match(/\b(BP[-_]?\d+)\b/i);

    if (commentMatch && commentMatch[1]) {
      commentCode = commentMatch[1].trim().toUpperCase();
    }

    return {
      success: amount !== null,
      amount,
      commentCode,
      rawText: smsText,
    };
  }

  /**
   * Process incoming SMS, find matching pending payment request, and auto-credit balance
   */
  static async processIncomingSms({ sender = 'BANK', message = '', bot = null }) {
    logger.info(`📱 [SMS Webhook] Received from [${sender}]: "${message}"`);

    const parsed = this.parseSms(message);
    if (!parsed.success || !parsed.amount) {
      logger.warn(`⚠️ Could not extract amount from SMS: "${message}"`);
      return { success: false, error: 'NO_AMOUNT_FOUND', message };
    }

    const { amount, commentCode } = parsed;
    const amountBigInt = BigInt(amount);

    // Save to recentBankDeposits cache
    const depositRecord = {
      id: `dep_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      amount,
      commentCode,
      sender,
      rawText: message,
      timestamp: Date.now(),
      claimed: false,
      claimedByUserId: null,
    };
    recentBankDeposits.push(depositRecord);

    // Keep only last 50 deposits within 30 minutes
    const cutoff = Date.now() - 30 * 60 * 1000;
    while (recentBankDeposits.length > 50 || (recentBankDeposits[0] && recentBankDeposits[0].timestamp < cutoff)) {
      recentBankDeposits.shift();
    }

    // 1. Try to find matching pending PaymentRequest
    let targetPayment = null;

    // Search by comment code (e.g. BP1234 or externalId)
    if (commentCode) {
      const numMatch = commentCode.match(/\d+/);
      const possibleId = numMatch ? parseInt(numMatch[0], 10) : null;

      targetPayment = await prisma.paymentRequest.findFirst({
        where: {
          status: 'PENDING',
          provider: 'CARD',
          OR: [
            { externalId: commentCode },
            possibleId ? { id: possibleId } : undefined,
          ].filter(Boolean),
        },
        include: { user: true },
      });
    }

    // If not found by comment, search by exact amount within last 20 minutes
    if (!targetPayment) {
      const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
      targetPayment = await prisma.paymentRequest.findFirst({
        where: {
          status: 'PENDING',
          provider: 'CARD',
          amount: amountBigInt,
          createdAt: { gte: twentyMinsAgo },
        },
        orderBy: { createdAt: 'desc' },
        include: { user: true },
      });
    }

    // If still not found, search by any latest pending request for this amount
    if (!targetPayment) {
      targetPayment = await prisma.paymentRequest.findFirst({
        where: {
          status: 'PENDING',
          provider: 'CARD',
          amount: amountBigInt,
        },
        orderBy: { createdAt: 'desc' },
        include: { user: true },
      });
    }

    if (targetPayment) {
      depositRecord.claimed = true;
      depositRecord.claimedByUserId = targetPayment.userId;

      const result = await PaymentService.processAutoPayment({
        userId: targetPayment.userId,
        amount,
        provider: 'CARD',
        externalId: `sms_auto_${targetPayment.id}_${Date.now()}`,
        currency: 'UZS',
        description: `Karta orqali avtomatik to'lov (${sender})`,
      });

      // Update original payment request to APPROVED
      await prisma.paymentRequest.update({
        where: { id: targetPayment.id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
        },
      }).catch(() => {});

      const formattedAmount = formatMoney(amount);
      const user = targetPayment.user;

      // Send Instant Notification to User on Telegram
      if (bot && user?.telegramId) {
        try {
          const userText =
            `🎉 <b>To'lovingiz muvaffaqiyatli qabul qilindi!</b>\n\n` +
            `💵 <b>Hisobingizga qo'shildi:</b> <code>+${formattedAmount}</code>\n` +
            `💰 <b>Joriy balansingiz:</b> <code>${formatMoney(result.newBalance)}</code>\n\n` +
            `<i>Mablag' kartaga tushishi bilan bir zumda balansingizga avtomatik o'tkazildi! Xaridlarni boshlashingiz mumkin.</i> ✨`;

          await bot.telegram.sendMessage(user.telegramId.toString(), userText, {
            parse_mode: 'HTML',
            ...getMainMenuKeyboard(false),
          });
        } catch (msgErr) {
          logger.error(`Could not send auto-deposit notification to user ${user.telegramId}:`, msgErr);
        }
      }

      // Notify Admins
      if (bot && config.adminTelegramIds && config.adminTelegramIds.length > 0) {
        const userFullName = escapeHtml(user?.firstName || 'Foydalanuvchi');
        const username = user?.username ? `@${escapeHtml(user.username)}` : `<a href="tg://user?id=${user?.telegramId}">Profil</a>`;
        const adminNotice =
          `⚡️ <b>Karta orqali yangi avtomatik to'lov!</b>\n\n` +
          `👤 <b>Foydalanuvchi:</b> ${userFullName} (${username})\n` +
          `🆔 <b>Telegram ID:</b> <code>${user?.telegramId}</code>\n` +
          `💵 <b>Summa:</b> <code>${formattedAmount}</code>\n` +
          `💬 <b>To'lov kodi:</b> <code>${commentCode || `BP${targetPayment.id}`}</code>\n` +
          `📱 <b>SMS matni:</b> <code>${escapeHtml(message)}</code>\n` +
          `⏰ <b>Vaqt:</b> ${formatDate(new Date())}\n\n` +
          `✅ <i>Balans bir zumda avtomatik to'ldirildi!</i>`;

        for (const adminId of config.adminTelegramIds) {
          try {
            await bot.telegram.sendMessage(adminId.toString(), adminNotice, { parse_mode: 'HTML' });
          } catch {}
        }
      }

      return {
        success: true,
        matched: true,
        paymentRequest: targetPayment,
        user,
        amount,
        newBalance: result.newBalance,
      };
    }

    logger.info(`SMS parsed (${amount} UZS, code: ${commentCode || 'none'}), but no pending request matched. Saved in cache.`);
    return {
      success: true,
      matched: false,
      amount,
      commentCode,
      message: 'No matching pending request at this moment. Cached for user manual check.',
    };
  }

  /**
   * Check if there is an unassigned deposit in cache for a given user & amount
   */
  static async checkAndClaimDeposit(paymentRequestId, userId, expectedAmount, bot = null) {
    const pId = parseInt(paymentRequestId, 10);
    const uId = parseInt(userId, 10);

    const payment = await prisma.paymentRequest.findUnique({
      where: { id: pId },
      include: { user: true },
    });

    if (!payment || payment.status === 'APPROVED') {
      return { success: payment?.status === 'APPROVED', status: payment?.status || 'NOT_FOUND', payment };
    }

    const amount = Number(payment.amount);
    const paymentCode = `BP${payment.id}`.toUpperCase();

    // Check recentBankDeposits
    const matchingDeposit = recentBankDeposits.find(
      (d) =>
        !d.claimed &&
        (d.amount === amount ||
          (d.commentCode && (d.commentCode === paymentCode || d.commentCode === String(payment.id))))
    );

    if (matchingDeposit) {
      matchingDeposit.claimed = true;
      matchingDeposit.claimedByUserId = uId;

      const result = await PaymentService.processAutoPayment({
        userId: uId,
        amount,
        provider: 'CARD',
        externalId: `sms_claim_${payment.id}_${Date.now()}`,
        currency: 'UZS',
        description: `Karta orqali avtomatik to'lov (Tekshiruv orqali)`,
      });

      await prisma.paymentRequest.update({
        where: { id: pId },
        data: { status: 'APPROVED', approvedAt: new Date() },
      }).catch(() => {});

      // Notify admin
      if (bot && config.adminTelegramIds) {
        for (const adminId of config.adminTelegramIds) {
          try {
            await bot.telegram.sendMessage(
              adminId.toString(),
              `⚡️ <b>Foydalanuvchi to'lovni tekshirdi va tasdiqlandi!</b>\n` +
                `👤 <b>Mijoz:</b> ${payment.user.firstName} (ID: ${payment.user.telegramId})\n` +
                `💵 <b>Summa:</b> ${formatMoney(amount)}\n` +
                `🧾 <b>Kod:</b> ${paymentCode}\n` +
                `✅ <i>Balans avtomatik yangilandi!</i>`,
              { parse_mode: 'HTML' }
            );
          } catch {}
        }
      }

      return {
        success: true,
        status: 'PAID',
        newBalance: result.newBalance,
        amount,
      };
    }

    return {
      success: false,
      status: 'PENDING',
      amount,
    };
  }
}
