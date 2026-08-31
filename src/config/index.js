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

function parseUsernames(val) {
  if (!val) return [];
  return val
    .toString()
    .split(',')
    .map((s) => s.trim().replace('@', '').toLowerCase())
    .filter(Boolean);
}

const ownerIdStr = process.env.OWNER_TELEGRAM_ID || '8868949254';
const ownerTelegramId = /^\d+$/.test(ownerIdStr) ? BigInt(ownerIdStr) : null;
const ownerUsername = (process.env.OWNER_USERNAME || 'yusupov_bulldrop')
  .replace('@', '')
  .toLowerCase();

const config = {
  botToken: process.env.BOT_TOKEN || '',
  databaseUrl: process.env.DATABASE_URL || '',
  ownerTelegramId,
  ownerUsername,
  adminTelegramIds: parseAdminIds(process.env.ADMIN_TELEGRAM_ID || '8868949254,7547343625'),
  adminUsernames: parseUsernames(process.env.ADMIN_USERNAME || 'yusupov_bulldrop,yusupov_bro'),
  adminTelegramId: ownerTelegramId || parseAdminIds(process.env.ADMIN_TELEGRAM_ID)[0] || null,
  adminUsername: ownerUsername,
  paymentCardNumber: process.env.PAYMENT_CARD_NUMBER || '6262910202797114',
  paymentCardHolder: process.env.PAYMENT_CARD_HOLDER || 'BULDROP PM',
  paymentExpireMinutes: parseInt(process.env.PAYMENT_EXPIRE_MINUTES || '5', 10),
  requireChannels: process.env.REQUIRE_CHANNELS === 'true', // Default: false (Adsiz / Reklamasiz)
  starsRate: parseInt(process.env.STARS_RATE || '250', 10), // 1 Star = 250 UZS
  cryptoBotToken: process.env.CRYPTO_BOT_TOKEN || '',
  cryptoBotNet: process.env.CRYPTO_BOT_NET || 'mainnet',
  clickProviderToken: process.env.CLICK_PROVIDER_TOKEN || '',
  paymeProviderToken: process.env.PAYME_PROVIDER_TOKEN || '',
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
