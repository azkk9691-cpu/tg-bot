import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function parseAdminIds(val) {
  if (!val) return [];
  const ids = val.toString().split(',').map((s) => s.trim());
  const parsed = [];
  for (const id of ids) {
    if (/^\d+$/.test(id)) {
      try {
        parsed.push(BigInt(id));
      } catch {}
    }
  }
  return parsed;
}

const config = {
  botToken: process.env.BOT_TOKEN || '',
  databaseUrl: process.env.DATABASE_URL || '',
  adminTelegramIds: parseAdminIds(process.env.ADMIN_TELEGRAM_ID),
  adminTelegramId: parseAdminIds(process.env.ADMIN_TELEGRAM_ID)[0] || null,
  adminUsername: process.env.ADMIN_USERNAME || 'yusupov_bro',
  paymentCardNumber: process.env.PAYMENT_CARD_NUMBER || '6262910202797114',
  paymentCardHolder: process.env.PAYMENT_CARD_HOLDER || 'BULDROP PM',
  paymentExpireMinutes: parseInt(process.env.PAYMENT_EXPIRE_MINUTES || '5', 10),
  nodeEnv: process.env.NODE_ENV || 'production',
  logLevel: process.env.LOG_LEVEL || 'info',
};

export function validateConfig() {
  const missing = [];
  if (!config.botToken || config.botToken === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
    missing.push('BOT_TOKEN');
  }
  if (config.adminTelegramIds.length === 0) {
    missing.push('ADMIN_TELEGRAM_ID');
  }

  if (missing.length > 0) {
    console.warn('\n⚠️ [Config Warning] Missing:', missing.join(', '));
  }
}

export default config;
