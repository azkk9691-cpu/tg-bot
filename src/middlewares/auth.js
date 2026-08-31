import config from '../config/index.js';
import { UserService } from '../services/userService.js';
import { logger } from '../utils/logger.js';

/**
 * Authentication Middleware
 * Syncs user to database and attaches `ctx.dbUser` and `ctx.isAdmin`
 */
export function authMiddleware() {
  return async (ctx, next) => {
    if (!ctx.from) return next();

    try {
      const telegramId = BigInt(ctx.from.id);

      // Check if admin (supports multiple IDs)
      const isAdmin = config.adminTelegramIds.some((id) => id === telegramId);
      ctx.isAdmin = isAdmin;

      // Upsert user in database
      const dbUser = await UserService.findOrCreateUser(ctx.from);
      ctx.dbUser = dbUser;
    } catch (error) {
      logger.error('Error in auth middleware:', error);
    }

    return next();
  };
}
