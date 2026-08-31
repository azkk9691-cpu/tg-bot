import prisma from '../database/prisma.js';
import { PROMO_CATEGORIES, DEFAULT_CARD_NUMBER, DEFAULT_CARD_HOLDER } from '../config/constants.js';
import { logger } from '../utils/logger.js';

export class AdminService {
  /**
   * Aggregate complete dashboard statistics
   */
  static async getStatistics() {
    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // 1. Total users
      const totalUsers = await prisma.user.count();

      // 2. Today's new users
      const todayNewUsers = await prisma.user.count({
        where: {
          createdAt: {
            gte: startOfToday,
          },
        },
      });

      // 3. Total approved deposits sum
      const totalDepositedAgg = await prisma.paymentRequest.aggregate({
        where: { status: 'APPROVED' },
        _sum: { amount: true },
      });
      const totalDeposited = totalDepositedAgg._sum.amount || BigInt(0);

      // 4. Total promo sales
      const totalSalesAgg = await prisma.purchase.aggregate({
        _count: { id: true },
        _sum: { price: true },
      });
      const totalPurchasesCount = totalSalesAgg._count.id || 0;
      const totalSalesRevenue = totalSalesAgg._sum.price || BigInt(0);

      // 5. Today's sales revenue
      const todaySalesAgg = await prisma.purchase.aggregate({
        where: {
          createdAt: {
            gte: startOfToday,
          },
        },
        _count: { id: true },
        _sum: { price: true },
      });
      const todaySalesRevenue = todaySalesAgg._sum.price || BigInt(0);
      const todaySalesCount = todaySalesAgg._count.id || 0;

      // 6. Total available promo codes
      const totalAvailablePromos = await prisma.promoCode.count({
        where: { status: 'AVAILABLE' },
      });

      // 7. Pending payment requests count
      const pendingPaymentsCount = await prisma.paymentRequest.count({
        where: { status: 'WAITING_APPROVAL' },
      });

      // 8. Breakdown by category
      const categoryStats = {};
      for (const [key, meta] of Object.entries(PROMO_CATEGORIES)) {
        const count = await prisma.promoCode.count({
          where: {
            category: key,
            status: 'AVAILABLE',
          },
        });
        categoryStats[key] = {
          name: meta.name,
          count,
        };
      }

      return {
        totalUsers,
        todayNewUsers,
        totalDeposited: Number(totalDeposited),
        totalPurchasesCount,
        totalSalesRevenue: Number(totalSalesRevenue),
        todaySalesRevenue: Number(todaySalesRevenue),
        todaySalesCount,
        totalAvailablePromos,
        pendingPaymentsCount,
        categoryStats,
      };
    } catch (error) {
      logger.error('Error calculating admin statistics:', error);
      throw error;
    }
  }

  /**
   * Get active payment card details
   */
  static async getPaymentCardDetails() {
    try {
      const cardSetting = await prisma.systemSetting.findUnique({
        where: { key: 'payment_card_number' },
      });
      const holderSetting = await prisma.systemSetting.findUnique({
        where: { key: 'payment_card_holder' },
      });

      return {
        cardNumber: cardSetting?.value || DEFAULT_CARD_NUMBER,
        cardHolder: holderSetting?.value || DEFAULT_CARD_HOLDER,
      };
    } catch (error) {
      logger.warn('Error reading card settings from DB, using fallback:', error.message);
      return {
        cardNumber: DEFAULT_CARD_NUMBER,
        cardHolder: DEFAULT_CARD_HOLDER,
      };
    }
  }

  /**
   * Update active payment card details
   */
  static async updatePaymentCardDetails(cardNumber, cardHolder) {
    try {
      await prisma.systemSetting.upsert({
        where: { key: 'payment_card_number' },
        update: { value: cardNumber.replace(/\s+/g, '') },
        create: {
          key: 'payment_card_number',
          value: cardNumber.replace(/\s+/g, ''),
          description: 'To\'lov uchun faol karta raqami',
        },
      });

      if (cardHolder) {
        await prisma.systemSetting.upsert({
          where: { key: 'payment_card_holder' },
          update: { value: cardHolder },
          create: {
            key: 'payment_card_holder',
            value: cardHolder,
            description: 'Karta egasining ismi',
          },
        });
      }

      return true;
    } catch (error) {
      logger.error('Error updating card details:', error);
      return false;
    }
  }
}
