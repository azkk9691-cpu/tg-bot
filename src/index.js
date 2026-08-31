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
    const bot = createBot();

    // Start bot polling
    await bot.launch(() => {
      logger.info('🤖 Bot successfully launched and listening for updates!');
      logger.info(`👑 Main Admin Telegram ID: ${config.adminTelegramId || 'Not configured'}`);
    });

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
