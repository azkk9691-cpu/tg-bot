/**
 * Centralized Application Constants & Configuration
 * BULDROP PM Telegram Bot
 */

export const PROMO_CATEGORIES = {
  '24_PM': {
    key: '24_PM',
    name: '24 PM',
    price: 2000,
    label: '24 PM',
    badge: '⚡',
  },
  '49_PM': {
    key: '49_PM',
    name: '49 PM',
    price: 5000,
    label: '49 PM',
    badge: '⚡',
  },
  '99_PM': {
    key: '99_PM',
    name: '99 PM',
    price: 9000,
    label: '99 PM',
    badge: '⚡',
  },
  '149_PM': {
    key: '149_PM',
    name: '149 PM',
    price: 15000,
    label: '149 PM',
    badge: '⚡',
  },
  '199_PM': {
    key: '199_PM',
    name: '199 PM',
    price: 19000,
    label: '199 PM',
    badge: '⚡',
  },
};

export const PROMO_CATEGORY_KEYS = Object.keys(PROMO_CATEGORIES);

export const DEFAULT_CARD_NUMBER = '6262910202797114';
export const DEFAULT_CARD_HOLDER = 'BULDROP PM';
export const PAYMENT_EXPIRE_MINUTES = 5;
export const MIN_DEPOSIT_AMOUNT = 1000;
export const DEFAULT_STARS_RATE = 250; // 1 Telegram Star = 250 UZS
export const DEFAULT_USDT_RATE = 13000; // 1 USDT = 13,000 UZS

export const DEFAULT_REQUIRED_CHANNELS = [
  {
    channelUsername: 'BULXPM',
    channelTitle: 'BULXPM',
    channelUrl: 'https://t.me/BULXPM',
  },
  {
    channelUsername: 'yusupov_xalol',
    channelTitle: 'yusupov_xalol',
    channelUrl: 'https://t.me/yusupov_xalol',
  },
];

export const USER_STATES = {
  IDLE: 'IDLE',
  AWAITING_PAYMENT_AMOUNT: 'AWAITING_PAYMENT_AMOUNT',
  AWAITING_RECEIPT: 'AWAITING_RECEIPT',
  AWAITING_STARS_AMOUNT: 'AWAITING_STARS_AMOUNT',
  AWAITING_CRYPTO_AMOUNT: 'AWAITING_CRYPTO_AMOUNT',
  AWAITING_CLICK_AMOUNT: 'AWAITING_CLICK_AMOUNT',
  AWAITING_PAYME_AMOUNT: 'AWAITING_PAYME_AMOUNT',
  ADMIN_AWAITING_PROMO_CODES: 'ADMIN_AWAITING_PROMO_CODES',
  ADMIN_AWAITING_BROADCAST: 'ADMIN_AWAITING_BROADCAST',
  ADMIN_AWAITING_CARD_NUMBER: 'ADMIN_AWAITING_CARD_NUMBER',
  ADMIN_AWAITING_CHANNEL_ADD: 'ADMIN_AWAITING_CHANNEL_ADD',
  ADMIN_AWAITING_USER_ID_SEARCH: 'ADMIN_AWAITING_USER_ID_SEARCH',
  ADMIN_AWAITING_BALANCE_ADJUST: 'ADMIN_AWAITING_BALANCE_ADJUST',
};

export const BUTTONS = {
  BALANCE: '💰 Balans',
  DEPOSIT: '💳 Balans to\'ldirish',
  BUY_PROMO: '🛒 Promokod sotib olish',
  MY_PROMOS: '📦 Mening promokodlarim',
  PROFILE: '👤 Profil',
  ADMIN_PANEL: '👑 Admin Panel',
  BACK: '⬅️ Orqaga',
  MAIN_MENU: '🏠 Bosh menyu',
  CANCEL: '❌ Bekor qilish',
};
