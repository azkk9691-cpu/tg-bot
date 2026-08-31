import { Telegraf } from 'telegraf';
import config from '../config/index.js';
import { sessionMiddleware } from '../middlewares/session.js';
import { authMiddleware } from '../middlewares/auth.js';
import { errorHandler } from '../middlewares/errorHandler.js';

import { registerStartHandlers } from '../handlers/start.js';
import { registerBalanceHandlers } from '../handlers/balance.js';
import { registerPaymentHandlers } from '../handlers/payment.js';
import { registerPromoHandlers } from '../handlers/promo.js';
import { registerProfileHandlers } from '../handlers/profile.js';
import { registerAdminHandlers } from '../handlers/admin.js';

/**
 * Initialize and configure Telegraf bot instance
 */
export function createBot() {
  if (!config.botToken) {
    throw new Error('BOT_TOKEN is not defined in environment variables.');
  }

  const bot = new Telegraf(config.botToken, {
    handlerTimeout: 90000,
  });

  // 1. Session middleware
  bot.use(sessionMiddleware());

  // 2. Auth & Database sync middleware
  bot.use(authMiddleware());

  // 3. Register Handlers
  registerStartHandlers(bot);
  registerBalanceHandlers(bot);
  registerPaymentHandlers(bot);
  registerPromoHandlers(bot);
  registerProfileHandlers(bot);
  registerAdminHandlers(bot);

  // 4. Global Error handling
  bot.catch(errorHandler);

  return bot;
}
