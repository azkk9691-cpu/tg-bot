import prisma from '../database/prisma.js';
import { PAYMENT_EXPIRE_MINUTES } from '../config/constants.js';
import { logger } from '../utils/logger.js';

export class PaymentService {
  /**
   * Create a new pending payment request with expiry
   */
  static async createPaymentRequest(userId, amount, provider = 'CARD', externalId = null, currency = 'UZS') {
    try {
      const expiresAt = new Date(Date.now() + PAYMENT_EXPIRE_MINUTES * 60 * 1000);
      const amountBigInt = BigInt(amount);

      const paymentRequest = await prisma.paymentRequest.create({
        data: {
          userId: parseInt(userId, 10),
          amount: amountBigInt,
          provider,
          externalId: externalId ? String(externalId) : null,
          currency,
          status: 'PENDING',
          expiresAt,
        },
      });

      return paymentRequest;
    } catch (error) {
      logger.error('Error creating payment request:', error);
      throw error;
    }
  }

  /**
   * Process an Automatic Payment (Telegram Stars, CryptoBot, Click, Payme)
   * Idempotent and atomic transaction
   */
  static async processAutoPayment({
    userId,
    amount,
    provider = 'STARS',
    externalId = null,
    currency = 'UZS',
    description = 'Avtomatik to\'lov',
  }) {
    const uId = parseInt(userId, 10);
    const amountBigInt = BigInt(amount);

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // 1. Check for duplicate external ID to prevent double payouts
          if (externalId) {
            const existing = await tx.paymentRequest.findFirst({
              where: {
                externalId: String(externalId),
                status: 'APPROVED',
              },
            });
            if (existing) {
              const user = await tx.user.findUnique({ where: { id: uId } });
              return {
                success: true,
                isDuplicate: true,
                user,
                amount: Number(existing.amount),
                newBalance: Number(user?.balance || 0),
              };
            }
          }

          // 2. Create approved payment request
          const now = new Date();
          const paymentRequest = await tx.paymentRequest.create({
            data: {
              userId: uId,
              amount: amountBigInt,
              provider,
              externalId: externalId ? String(externalId) : null,
              currency,
              status: 'APPROVED',
              expiresAt: now,
              approvedAt: now,
            },
          });

          // 3. Increment user balance and totalDeposited
          const updatedUser = await tx.user.update({
            where: { id: uId },
            data: {
              balance: { increment: amountBigInt },
              totalDeposited: { increment: amountBigInt },
            },
          });

          // 4. Create Transaction record
          const transaction = await tx.transaction.create({
            data: {
              userId: uId,
              type: 'DEPOSIT',
              amount: amountBigInt,
              status: 'COMPLETED',
              description,
              paymentRequestId: paymentRequest.id,
            },
          });

          return {
            success: true,
            isDuplicate: false,
            payment: paymentRequest,
            transaction,
            user: updatedUser,
            amount: Number(amountBigInt),
            newBalance: Number(updatedUser.balance),
          };
        },
        {
          maxWait: 5000,
          timeout: 10000,
        }
      );

      return result;
    } catch (error) {
      logger.error('Error in processAutoPayment:', error);
      return {
        success: false,
        error: 'AUTO_PAYMENT_ERROR',
        message: error.message || 'Avtomatik to\'lovni qayta ishlashda xatolik.',
      };
    }
  }

  /**
   * Get payment request by ID
   */
  static async getPaymentRequest(id) {
    try {
      return await prisma.paymentRequest.findUnique({
        where: { id: parseInt(id, 10) },
        include: {
          user: true,
        },
      });
    } catch (error) {
      logger.error(`Error getting payment request ${id}:`, error);
      return null;
    }
  }

  /**
   * Attach receipt file to payment request and move status to WAITING_APPROVAL
   */
  static async attachReceipt(paymentRequestId, receiptFileId) {
    try {
      const updated = await prisma.paymentRequest.update({
        where: { id: parseInt(paymentRequestId, 10) },
        data: {
          receiptFileId,
          status: 'WAITING_APPROVAL',
        },
        include: {
          user: true,
        },
      });

      return updated;
    } catch (error) {
      logger.error(`Error attaching receipt to payment request ${paymentRequestId}:`, error);
      throw error;
    }
  }

  /**
   * CRITICAL: Admin Approves Payment Request
   * Strictly atomic transaction to prevent double approvals
   */
  static async approvePayment(paymentRequestId, adminTelegramId) {
    const pId = parseInt(paymentRequestId, 10);
    const adminIdBigInt = adminTelegramId ? BigInt(adminTelegramId) : null;

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // 1. Fetch current payment request with lock / fresh state
          const payment = await tx.paymentRequest.findUnique({
            where: { id: pId },
            include: { user: true },
          });

          if (!payment) {
            return { success: false, error: 'NOT_FOUND', message: "To'lov so'rovi topilmadi." };
          }

          if (payment.status === 'APPROVED') {
            return {
              success: false,
              error: 'ALREADY_APPROVED',
              message: "Ushbu to'lov allaqachon tasdiqlangan!",
            };
          }

          if (payment.status === 'REJECTED') {
            return {
              success: false,
              error: 'ALREADY_REJECTED',
              message: "Ushbu to'lov allaqachon rad etilgan!",
            };
          }

          // 2. Mark payment request as APPROVED
          const updatedPayment = await tx.paymentRequest.update({
            where: { id: pId },
            data: {
              status: 'APPROVED',
              approvedAt: new Date(),
              approvedBy: adminIdBigInt,
            },
          });

          // 3. Increment user balance and totalDeposited
          const updatedUser = await tx.user.update({
            where: { id: payment.userId },
            data: {
              balance: {
                increment: payment.amount,
              },
              totalDeposited: {
                increment: payment.amount,
              },
            },
          });

          // 4. Create Transaction record
          await tx.transaction.create({
            data: {
              userId: payment.userId,
              type: 'DEPOSIT',
              amount: payment.amount,
              status: 'COMPLETED',
              description: `Karta orqali balans to'ldirish (Tasdiqladi: ${adminTelegramId || 'Admin'})`,
              paymentRequestId: payment.id,
            },
          });

          return {
            success: true,
            payment: updatedPayment,
            user: updatedUser,
            amount: Number(payment.amount),
            newBalance: Number(updatedUser.balance),
          };
        },
        {
          maxWait: 5000,
          timeout: 10000,
        }
      );

      return result;
    } catch (error) {
      logger.error(`Error approving payment ${paymentRequestId}:`, error);
      return {
        success: false,
        error: 'TRANSACTION_ERROR',
        message: "To'lovni tasdiqlashda tizim xatoligi yuz berdi.",
      };
    }
  }

  /**
   * CRITICAL: Admin Rejects Payment Request
   */
  static async rejectPayment(paymentRequestId, adminTelegramId, reason = 'Chek tasdiqlanmadi') {
    const pId = parseInt(paymentRequestId, 10);
    const adminIdBigInt = adminTelegramId ? BigInt(adminTelegramId) : null;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const payment = await tx.paymentRequest.findUnique({
          where: { id: pId },
          include: { user: true },
        });

        if (!payment) {
          return { success: false, error: 'NOT_FOUND', message: "To'lov so'rovi topilmadi." };
        }

        if (payment.status === 'APPROVED') {
          return {
            success: false,
            error: 'ALREADY_APPROVED',
            message: "Ushbu to'lov allaqachon tasdiqlangan, rad etib bo'lmaydi!",
          };
        }

        if (payment.status === 'REJECTED') {
          return {
            success: false,
            error: 'ALREADY_REJECTED',
            message: "Ushbu to'lov allaqachon rad etilgan!",
          };
        }

        // Mark as REJECTED
        const updatedPayment = await tx.paymentRequest.update({
          where: { id: pId },
          data: {
            status: 'REJECTED',
            approvedAt: new Date(),
            approvedBy: adminIdBigInt,
          },
        });

        // Record rejected transaction
        await tx.transaction.create({
          data: {
            userId: payment.userId,
            type: 'DEPOSIT',
            amount: payment.amount,
            status: 'REJECTED',
            description: `To'lov rad etildi (${reason})`,
            paymentRequestId: payment.id,
          },
        });

        return {
          success: true,
          payment: updatedPayment,
          user: payment.user,
          amount: Number(payment.amount),
        };
      });

      return result;
    } catch (error) {
      logger.error(`Error rejecting payment ${paymentRequestId}:`, error);
      return {
        success: false,
        error: 'TRANSACTION_ERROR',
        message: "To'lovni rad etishda xatolik yuz berdi.",
      };
    }
  }

  /**
   * Get pending payment requests for admin dashboard
   */
  static async getPendingPaymentRequests() {
    try {
      return await prisma.paymentRequest.findMany({
        where: {
          status: 'WAITING_APPROVAL',
        },
        include: {
          user: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 20,
      });
    } catch (error) {
      logger.error('Error fetching pending payments:', error);
      return [];
    }
  }
}
