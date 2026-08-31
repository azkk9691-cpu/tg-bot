import http from 'http';
import config, { validateConfig } from './config/index.js';
import { connectDatabase, disconnectDatabase } from './database/prisma.js';
import { ChannelService } from './services/channelService.js';
import { createBot } from './bot/bot.js';
import { logger } from './utils/logger.js';

// Global error handlers to prevent unexpected process crashes
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception thrown:', err);
});

async function main() {
  logger.info('=========================================');
  logger.info('🚀 Starting BULDROP PM Telegram Bot...');
  logger.info('=========================================');

  // Validate configuration
  validateConfig();

  // Connect to Database
  const isDbConnected = await connectDatabase();
  if (!isDbConnected) {
    logger.warn('⚠️ Running without active database connection or connection failed. Please check DATABASE_URL in .env');
  } else {
    // Seed default channels if empty
    try {
      await ChannelService.seedDefaultChannels();
    } catch (e) {
      logger.warn('Channel check/seed warning:', e.message);
    }
  }

  // Create and launch bot
  try {
    // Start lightweight HTTP health-check server for Cloud Hostings (Render, Koyeb, Railway, etc.)
    const port = process.env.PORT || 3000;
    const startTime = new Date();
    const server = http.createServer((req, res) => {
      if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'online',
            service: 'BULDROP PM Telegram Bot',
            uptimeSeconds: Math.floor(process.uptime()),
            startedAt: startTime.toISOString(),
          })
        );
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    server.listen(port, () => {
      logger.info(`🌐 Health check server listening on port ${port}`);

      // Auto keep-alive ping for Render free tier (pings every 10 minutes to prevent sleep)
      const renderUrl = process.env.RENDER_EXTERNAL_URL || 'https://buldrop-tg-bot.onrender.com';
      if (process.env.NODE_ENV === 'production' && process.env.RENDER_EXTERNAL_URL) {
        setInterval(async () => {
          try {
            const https = await import('https');
            https.default.get(`${renderUrl}/health`, (res) => {
              logger.info(`🔄 Keep-alive ping sent to ${renderUrl}/health (Status: ${res.statusCode})`);
            }).on('error', (err) => {
              logger.warn(`Keep-alive ping note: ${err.message}`);
            });
          } catch (e) {
            // ignore
          }
        }, 10 * 60 * 1000);
      }
    });

    const bot = createBot();

    logger.info('🤖 Bot muvaffaqiyatli ishga tushirildi va xabarlarni tinglamoqda!');
    logger.info(`👑 Asosiy Ega (Owner): @${config.ownerUsername} (ID: ${config.ownerTelegramId || 'Not configured'})`);
    logger.info(`🛡 Adminlar: ${config.adminTelegramIds.map((id) => id.toString()).join(', ')}`);

    // Start bot polling
    bot.launch({ dropPendingUpdates: false }).catch((err) => {
      logger.error('Error in bot polling:', err);
    });

    // Graceful stop listeners
    const stopHandler = async (signal) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      try {
        server.close();
        bot.stop(signal);
        await disconnectDatabase();
      } catch (err) {
        logger.error('Error during shutdown:', err);
      } finally {
        process.exit(0);
      }
    };

    process.once('SIGINT', () => stopHandler('SIGINT'));
    process.once('SIGTERM', () => stopHandler('SIGTERM'));
  } catch (error) {
    logger.error('Fatal error starting bot:', error);
    process.exit(1);
  }
}

main();
