import http from 'http';
import https from 'https';
import config, { validateConfig } from './config/index.js';
import { connectDatabase, disconnectDatabase } from './database/prisma.js';
import { ChannelService } from './services/channelService.js';
import { createBot } from './bot/bot.js';
import { logger } from './utils/logger.js';
import { SmsParserService } from './services/smsParserService.js';

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

  // Create bot
  try {
    const bot = createBot();

    // Determine deployment environment
    const renderHost =
      process.env.RENDER_EXTERNAL_HOSTNAME ||
      process.env.RENDER_EXTERNAL_URL ||
      process.env.APP_URL;

    const renderUrl = renderHost
      ? (renderHost.startsWith('http') ? renderHost : `https://${renderHost}`)
      : 'https://buldrop-tg-bot.onrender.com';

    // On Render, Render sets RENDER=true, RENDER_EXTERNAL_HOSTNAME, etc.
    const isRender = Boolean(
      process.env.RENDER === 'true' ||
      process.env.RENDER === true ||
      process.env.RENDER_EXTERNAL_HOSTNAME ||
      process.env.RENDER_EXTERNAL_URL ||
      process.env.IS_RENDER === 'true'
    );

    const telegramWebhookPath = '/api/telegram-webhook';
    const webhookCallback = bot.webhookCallback(telegramWebhookPath);

    // Start lightweight HTTP server for Webhooks & Health-check
    const port = process.env.PORT || 3000;
    const startTime = new Date();
    const server = http.createServer(async (req, res) => {
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = urlObj.pathname;

      // 1. Health check endpoint
      if (pathname === '/health' || pathname === '/' || pathname === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            status: 'online',
            service: 'BULDROP PM Telegram Bot',
            mode: isRender ? 'webhook' : 'polling',
            uptimeSeconds: Math.floor(process.uptime()),
            startedAt: startTime.toISOString(),
          })
        );
      }

      // 2. Telegram Webhook Endpoint (Render production)
      if (pathname === telegramWebhookPath || pathname === '/webhook' || pathname === '/webhook/telegram') {
        return webhookCallback(req, res);
      }

      // 3. SMS / Bank Webhook Endpoint for Automatic Card Deposits
      if (pathname === '/api/sms-webhook' || pathname === '/webhook/sms') {
        try {
          const webhookKey = process.env.SMS_WEBHOOK_KEY;
          const providedKey = urlObj.searchParams.get('key') || req.headers['x-webhook-key'] || req.headers['authorization'];

          if (webhookKey && providedKey !== webhookKey && providedKey !== `Bearer ${webhookKey}`) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'UNAUTHORIZED' }));
          }

          let body = '';
          if (req.method === 'POST') {
            for await (const chunk of req) {
              body += chunk;
            }
          }

          let sender = urlObj.searchParams.get('sender') || urlObj.searchParams.get('from') || 'BANK';
          let message = urlObj.searchParams.get('message') || urlObj.searchParams.get('text') || urlObj.searchParams.get('body') || '';

          if (body) {
            try {
              const jsonBody = JSON.parse(body);
              sender = jsonBody.sender || jsonBody.from || jsonBody.phone || sender;
              message = jsonBody.message || jsonBody.text || jsonBody.body || jsonBody.msg || message;
            } catch {
              if (!message) {
                message = body;
              }
            }
          }

          if (!message || message.trim().length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'EMPTY_MESSAGE' }));
          }

          const result = await SmsParserService.processIncomingSms({
            sender,
            message: message.trim(),
            bot,
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, ...result }));
        } catch (webhookErr) {
          logger.error('Error handling SMS webhook:', webhookErr);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: webhookErr.message }));
        }
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    server.listen(port, '0.0.0.0', async () => {
      logger.info(`🌐 Webhook & Health server listening on port ${port}`);
      logger.info(`📲 SMS Webhook URL: http://localhost:${port}/api/sms-webhook`);

      if (isRender) {
        // 24/7 Auto Keep-Alive ping for Render
        logger.info(`🔄 Keep-alive monitor enabled for: ${renderUrl}/health (every 3 mins)`);
        setInterval(() => {
          try {
            const client = renderUrl.startsWith('https') ? https : http;
            const req = client.get(
              `${renderUrl}/health`,
              {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; BULDROP-Bot-KeepAlive/2.0)',
                  Accept: 'application/json',
                },
                timeout: 10000,
              },
              (res) => {
                res.resume(); // free socket memory
                logger.debug(`⚡️ [Keep-Alive] Ping sent to ${renderUrl}/health (Status: ${res.statusCode})`);
              }
            );
            req.on('error', (err) => {
              logger.debug(`Keep-alive ping info: ${err.message}`);
            });
            req.on('timeout', () => {
              req.destroy();
            });
          } catch (e) {
            // ignore
          }
        }, 3 * 60 * 1000);
      }
    });

    logger.info(`👑 Asosiy Ega (Owner): @${config.ownerUsername} (ID: ${config.ownerTelegramId || 'Not configured'})`);
    logger.info(`🛡 Adminlar: ${config.adminTelegramIds.map((id) => id.toString()).join(', ')}`);

    // Bot launch strategy: Webhook on Render / Polling on Local PC
    if (isRender) {
      const fullWebhookUrl = `${renderUrl}${telegramWebhookPath}`;
      logger.info(`☁️ Render muhiti aniqlandi. Telegram Webhook o'rnatilmoqda...`);
      logger.info(`🔗 Webhook URL: ${fullWebhookUrl}`);

      try {
        await bot.telegram.setWebhook(fullWebhookUrl, {
          drop_pending_updates: false,
        });
        logger.info('🤖 Bot Webhook orqali 24/7 rejimda muvaffaqiyatli ishga tushirildi!');
      } catch (whErr) {
        logger.error('Webhook o\'rnatishda xatolik:', whErr);
        logger.info('Polling rejimiga zaxira sifatida o\'tilmoqda...');
        bot.launch({ dropPendingUpdates: false }).catch((err) => {
          logger.error('Polling zaxira xatoligi:', err);
        });
      }
    } else {
      logger.info('💻 Lokal muhit (Windows) aniqlandi. Polling rejimida ishga tushirilmoqda...');
      try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: false });
        logger.info('Eski webhook o\'chirildi.');
      } catch (delErr) {
        logger.debug('Webhook delete info:', delErr.message);
      }

      bot.launch({ dropPendingUpdates: false }).then(() => {
        logger.info('🤖 Bot muvaffaqiyatli ishga tushirildi va xabarlarni tinglamoqda (Polling)!');
      }).catch((err) => {
        logger.error('Fatal error in bot polling:', err);
      });
    }

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
