import prisma from '../database/prisma.js';
import { logger } from '../utils/logger.js';

export class UserService {
  /**
   * Find or create user on Telegram interaction
   */
  static async findOrCreateUser(telegramUser) {
    if (!telegramUser || !telegramUser.id) return null;

    const telegramId = BigInt(telegramUser.id);
    const username = telegramUser.username || null;
    const firstName = telegramUser.first_name || 'Foydalanuvchi';

    try {
      const user = await prisma.user.upsert({
        where: { telegramId },
        update: {
          username,
          firstName,
        },
        create: {
          telegramId,
          username,
          firstName,
          balance: BigInt(0),
          totalDeposited: BigInt(0),
        },
      });

      return user;
    } catch (error) {
      logger.error(`Error in findOrCreateUser for ID ${telegramUser.id}:`, error);
      throw error;
    }
  }

  /**
   * Get user by Telegram ID
   */
  static async getUserByTelegramId(telegramId) {
    try {
      const tId = BigInt(telegramId);
      return await prisma.user.findUnique({
        where: { telegramId: tId },
      });
    } catch (error) {
      logger.error(`Error getting user by telegramId ${telegramId}:`, error);
      return null;
    }
  }

  /**
   * Get user by internal database ID
   */
  static async getUserById(id) {
    try {
      return await prisma.user.findUnique({
        where: { id: parseInt(id, 10) },
      });
    } catch (error) {
      logger.error(`Error getting user by ID ${id}:`, error);
      return null;
    }
  }

  /**
   * Get full user profile statistics
   */
  static async getUserProfile(telegramId) {
    try {
      const tId = BigInt(telegramId);
      const user = await prisma.user.findUnique({
        where: { telegramId: tId },
        include: {
          _count: {
            select: {
              purchases: true,
              transactions: true,
            },
          },
        },
      });

      return user;
    } catch (error) {
      logger.error(`Error in getUserProfile for ID ${telegramId}:`, error);
      return null;
    }
  }

  /**
   * Search user by Telegram ID or Username
   */
  static async searchUser(query) {
    try {
      const trimmed = query.trim().replace('@', '');
      const numericId = /^\d+$/.test(trimmed) ? BigInt(trimmed) : null;

      if (numericId) {
        const byId = await prisma.user.findUnique({
          where: { telegramId: numericId },
          include: {
            _count: { select: { purchases: true } },
          },
        });
        if (byId) return [byId];
      }

      return await prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: trimmed, mode: 'insensitive' } },
            { firstName: { contains: trimmed, mode: 'insensitive' } },
          ],
        },
        take: 10,
      });
    } catch (error) {
      logger.error('Error searching user:', error);
      return [];
    }
  }

  /**
   * Admin manual balance adjustment
   */
  static async adjustBalance(userId, amount, description = 'Admin tuzatishi') {
    try {
      const amountBigInt = BigInt(amount);

      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: parseInt(userId, 10) },
          data: {
            balance: {
              increment: amountBigInt,
            },
          },
        });

        await tx.transaction.create({
          data: {
            userId: user.id,
            type: 'ADMIN_ADJUST',
            amount: amountBigInt,
            status: 'COMPLETED',
            description,
          },
        });

        return user;
      });
    } catch (error) {
      logger.error('Error adjusting balance:', error);
      throw error;
    }
  }
}
