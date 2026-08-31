import config from '../config/index.js';
import { UserService } from '../services/userService.js';
import { logger } from '../utils/logger.js';

/**
 * Authentication Middleware
 * Syncs user to database and attaches `ctx.dbUser`, `ctx.isAdmin`, and `ctx.isOwner`
 */
export function authMiddleware() {
  return async (ctx, next) => {
    if (!ctx.from) return next();

    try {
      const telegramId = BigInt(ctx.from.id);
      const username = ctx.from.username ? ctx.from.username.toLowerCase() : '';

      // Check if Owner (@yusupov_bulldrop)
      const isOwner =
        (config.ownerTelegramId && telegramId === config.ownerTelegramId) ||
        (config.ownerUsername && username === config.ownerUsername);

      // Check if Admin (@yusupov_bro or Owner)
      const isAdmin =
        isOwner ||
        config.adminTelegramIds.some((id) => id === telegramId) ||
        config.adminUsernames.some((u) => u === username);

      ctx.isOwner = Boolean(isOwner);
      ctx.isAdmin = Boolean(isAdmin);

      // Upsert user in database
      const dbUser = await UserService.findOrCreateUser(ctx.from);
      ctx.dbUser = dbUser;
    } catch (error) {
      logger.error('Error in auth middleware:', error);
    }

    return next();
  };
}
