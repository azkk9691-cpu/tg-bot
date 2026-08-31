import prisma from '../database/prisma.js';
import { PROMO_CATEGORIES } from '../config/constants.js';
import { logger } from '../utils/logger.js';

export class PromoService {
  /**
   * Get available stock count for each category
   */
  static async getAvailableStockCounts() {
    try {
      const counts = await prisma.promoCode.groupBy({
        by: ['category'],
        where: {
          status: 'AVAILABLE',
        },
        _count: {
          id: true,
        },
      });

      const stockMap = {};
      // Initialize all known categories with 0
      Object.keys(PROMO_CATEGORIES).forEach((catKey) => {
        stockMap[catKey] = 0;
      });

      counts.forEach((item) => {
        stockMap[item.category] = item._count.id;
      });

      return stockMap;
    } catch (error) {
      logger.error('Error fetching promo stock counts:', error);
      const fallback = {};
      Object.keys(PROMO_CATEGORIES).forEach((catKey) => {
        fallback[catKey] = 0;
      });
      return fallback;
    }
  }

  /**
   * Get stock details for admin (Available, Sold, Total)
   */
  static async getAdminStockOverview() {
    try {
      const result = {};

      for (const [key, meta] of Object.entries(PROMO_CATEGORIES)) {
        const available = await prisma.promoCode.count({
          where: { category: key, status: 'AVAILABLE' },
        });
        const sold = await prisma.promoCode.count({
          where: { category: key, status: 'SOLD' },
        });

        result[key] = {
          ...meta,
          available,
          sold,
          total: available + sold,
        };
      }

      return result;
    } catch (error) {
      logger.error('Error getting admin stock overview:', error);
      return {};
    }
  }

  /**
   * Bulk add promo codes for a specific category
   * Accepts newline, comma, semicolon, or space-separated codes
   */
  static async addPromoCodes(categoryKey, rawCodesText) {
    const meta = PROMO_CATEGORIES[categoryKey];
    if (!meta) {
      throw new Error(`Noma'lum kategoriya: ${categoryKey}`);
    }

    if (!rawCodesText || typeof rawCodesText !== 'string') {
      return { totalAdded: 0, duplicates: 0, totalProvided: 0 };
    }

    // Split by newlines, commas, semicolons, or multiple spaces
    const lines = rawCodesText
      .split(/[\r\n,;]+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      return { totalAdded: 0, duplicates: 0, totalProvided: 0 };
    }

    // Deduplicate within the input list
    const uniqueInputCodes = [...new Set(lines)];

    // Check which ones already exist in database
    const existing = await prisma.promoCode.findMany({
      where: {
        code: { in: uniqueInputCodes },
      },
      select: { code: true },
    });

    const existingSet = new Set(existing.map((e) => e.code));
    const toInsert = uniqueInputCodes.filter((c) => !existingSet.has(c));

    if (toInsert.length > 0) {
      for (const code of toInsert) {
        await prisma.promoCode.upsert({
          where: { code },
          update: {
            category: categoryKey,
            price: BigInt(meta.price),
            status: 'AVAILABLE',
          },
          create: {
            code,
            category: categoryKey,
            price: BigInt(meta.price),
            status: 'AVAILABLE',
          },
        });
      }
    }

    const duplicatesCount = uniqueInputCodes.length - toInsert.length;

    return {
      totalAdded: toInsert.length,
      duplicates: duplicatesCount,
      totalProvided: lines.length,
    };
  }

  /**
   * CRITICAL: Purchase a promo code atomically
   * Protected against race conditions and concurrent double-sales
   */
  static async purchasePromoCode(userId, categoryKey) {
    const meta = PROMO_CATEGORIES[categoryKey];
    if (!meta) {
      return { success: false, error: 'INVALID_CATEGORY', message: "Noto'g'ri mahsulot tanlandi." };
    }

    const priceBigInt = BigInt(meta.price);

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // 1. Fetch current user balance
          const user = await tx.user.findUnique({
            where: { id: parseInt(userId, 10) },
          });

          if (!user) {
            throw new Error('USER_NOT_FOUND');
          }

          if (user.balance < priceBigInt) {
            return {
              success: false,
              error: 'INSUFFICIENT_BALANCE',
              requiredAmount: meta.price,
              currentBalance: Number(user.balance),
            };
          }

          // 2. Select 1 available promo code within atomic transaction
          const candidatePromo = await tx.promoCode.findFirst({
            where: {
              category: categoryKey,
              status: 'AVAILABLE',
            },
          });

          if (!candidatePromo) {
            return {
              success: false,
              error: 'OUT_OF_STOCK',
              category: meta.name,
            };
          }

          const promoId = candidatePromo.id;
          const promoCode = candidatePromo.code;

          // 3. Mark promo code as SOLD to this user
          const updatedPromo = await tx.promoCode.update({
            where: { id: promoId },
            data: {
              status: 'SOLD',
              soldToUserId: user.id,
              soldAt: new Date(),
            },
          });

          // 4. Deduct balance from user
          const updatedUser = await tx.user.update({
            where: { id: user.id },
            data: {
              balance: {
                decrement: priceBigInt,
              },
            },
          });

          // 5. Create Purchase record
          const purchase = await tx.purchase.create({
            data: {
              userId: user.id,
              promoCodeId: promoId,
              category: categoryKey,
              price: priceBigInt,
            },
          });

          // 6. Create Transaction record
          await tx.transaction.create({
            data: {
              userId: user.id,
              type: 'PURCHASE',
              amount: priceBigInt,
              status: 'COMPLETED',
              description: `${meta.name} promokod xaridi`,
            },
          });

          return {
            success: true,
            promo: updatedPromo,
            code: promoCode,
            categoryName: meta.name,
            price: meta.price,
            remainingBalance: Number(updatedUser.balance),
            purchaseDate: new Date(),
          };
        },
        {
          maxWait: 5000,
          timeout: 10000,
        }
      );

      return result;
    } catch (error) {
      logger.error('Error during purchase transaction:', error);
      return {
        success: false,
        error: 'TRANSACTION_FAILED',
        message: "Xaridni amalga oshirishda xatolik yuz berdi. Qayta urinib ko'ring.",
      };
    }
  }

  /**
   * Get all promo codes purchased by a user
   */
  static async getUserPurchasedCodes(userId) {
    try {
      const purchases = await prisma.purchase.findMany({
        where: { userId: parseInt(userId, 10) },
        include: {
          promoCode: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return purchases;
    } catch (error) {
      logger.error(`Error getting purchased codes for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get promo codes list for admin inspection
   */
  static async getPromoCodesList(categoryKey = null, status = null, limit = 20) {
    try {
      const where = {};
      if (categoryKey) where.category = categoryKey;
      if (status) where.status = status;

      return await prisma.promoCode.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          soldToUser: {
            select: { id: true, telegramId: true, username: true, firstName: true },
          },
        },
      });
    } catch (error) {
      logger.error('Error getting promo codes list for admin:', error);
      return [];
    }
  }
}
