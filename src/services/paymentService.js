import prisma from '../database/prisma.js';
import { PAYMENT_EXPIRE_MINUTES } from '../config/constants.js';
import { logger } from '../utils/logger.js';

export class PaymentService {
  /**
   * Create a new pending payment request with 5-minute expiry
   */
  static async createPaymentRequest(userId, amount) {
    try {
      const expiresAt = new Date(Date.now() + PAYMENT_EXPIRE_MINUTES * 60 * 1000);
      const amountBigInt = BigInt(amount);

      const paymentRequest = await prisma.paymentRequest.create({
        data: {
          userId: parseInt(userId, 10),
          amount: amountBigInt,
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
