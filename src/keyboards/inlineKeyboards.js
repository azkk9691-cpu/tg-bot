import { Markup } from 'telegraf';
import { PROMO_CATEGORIES } from '../config/constants.js';
import { formatNumber } from '../utils/formatters.js';

/**
 * Mandatory Subscription Inline Keyboard
 */
export function getSubscriptionKeyboard(channels) {
  const buttons = [];

  channels.forEach((channel) => {
    const url = channel.channelUrl.startsWith('http')
      ? channel.channelUrl
      : `https://t.me/${channel.channelUsername.replace('@', '')}`;

    buttons.push([Markup.button.url(`📢 ${channel.channelTitle} kanaliga o'tish`, url)]);
  });

  buttons.push([Markup.button.callback('🔄 Obunani tekshirish', 'check_subscription')]);

  return Markup.inlineKeyboard(buttons);
}

/**
 * Promo Categories List Keyboard
 */
export function getPromoCategoriesKeyboard(stockCounts = {}) {
  const buttons = [];

  for (const [key, meta] of Object.entries(PROMO_CATEGORIES)) {
    const count = stockCounts[key] || 0;
    const formattedPrice = formatNumber(meta.price);
    const label = `${meta.badge} ${meta.name} — ${formattedPrice} so'm (${count} ta bor)`;

    buttons.push([Markup.button.callback(label, `select_promo:${key}`)]);
  }

  buttons.push([Markup.button.callback('🏠 Bosh menyu', 'nav_main_menu')]);

  return Markup.inlineKeyboard(buttons);
}

/**
 * Promo Purchase Confirmation Keyboard
 */
export function getPromoConfirmKeyboard(categoryKey) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Sotib olish', `confirm_buy:${categoryKey}`)],
    [Markup.button.callback('⬅️ Orqaga', 'nav_promo_list')],
  ]);
}

/**
 * Insufficient Balance Keyboard
 */
export function getInsufficientBalanceKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💳 Balansni to\'ldirish', 'nav_deposit')],
    [Markup.button.callback('⬅️ Orqaga', 'nav_promo_list')],
  ]);
}

/**
 * Main Deposit Screen Quick Amounts Keyboard (Card Auto + Stars + Crypto)
 */
export function getMainDepositAmountsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💳 10 000 so\'m', 'card_pack:10000'),
      Markup.button.callback('💳 20 000 so\'m', 'card_pack:20000'),
    ],
    [
      Markup.button.callback('💳 50 000 so\'m', 'card_pack:50000'),
      Markup.button.callback('💳 100 000 so\'m', 'card_pack:100000'),
    ],
    [
      Markup.button.callback('💳 200 000 so\'m', 'card_pack:200000'),
      Markup.button.callback('💳 500 000 so\'m', 'card_pack:500000'),
    ],
    [Markup.button.callback('✍️ Boshqa summa kiritish', 'card_custom_amount')],
    [
      Markup.button.callback('⭐ Telegram Stars', 'pay_method:stars'),
      Markup.button.callback('🤖 CryptoBot', 'pay_method:crypto'),
    ],
    [Markup.button.callback('🏠 Bosh menyu', 'nav_main_menu')],
  ]);
}

/**
 * Payment Methods Selection Keyboard
 */
export function getPaymentMethodsKeyboard(config = {}) {
  const buttons = [
    [Markup.button.callback('⭐ Telegram Stars (Avtomatik ⚡️)', 'pay_method:stars')],
    [Markup.button.callback('🤖 CryptoBot (USDT / TON ⚡️)', 'pay_method:crypto')],
  ];

  // If Click provider token is configured
  if (config.clickProviderToken) {
    buttons.push([Markup.button.callback('🔹 Click (Avtomatik ⚡️)', 'pay_method:click')]);
  }

  // If Payme provider token is configured
  if (config.paymeProviderToken) {
    buttons.push([Markup.button.callback('🔹 Payme (Avtomatik ⚡️)', 'pay_method:payme')]);
  }

  // Card Deposit
  buttons.push([Markup.button.callback('💳 Karta orqali to\'lov (Avtomatik ⚡️)', 'pay_method:card')]);
  buttons.push([Markup.button.callback('🏠 Bosh menyu', 'nav_main_menu')]);

  return Markup.inlineKeyboard(buttons);
}

/**
 * Telegram Stars Quick Amounts Keyboard
 */
export function getStarsDepositAmountsKeyboard(starsRate = 250) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(`⭐ 20 Stars (${formatNumber(20 * starsRate)} so'm)`, 'stars_pack:20'),
      Markup.button.callback(`⭐ 40 Stars (${formatNumber(40 * starsRate)} so'm)`, 'stars_pack:40'),
    ],
    [
      Markup.button.callback(`⭐ 100 Stars (${formatNumber(100 * starsRate)} so'm)`, 'stars_pack:100'),
      Markup.button.callback(`⭐ 200 Stars (${formatNumber(200 * starsRate)} so'm)`, 'stars_pack:200'),
    ],
    [
      Markup.button.callback(`⭐ 400 Stars (${formatNumber(400 * starsRate)} so'm)`, 'stars_pack:400'),
      Markup.button.callback(`⭐ 1000 Stars (${formatNumber(1000 * starsRate)} so'm)`, 'stars_pack:1000'),
    ],
    [Markup.button.callback('✍️ Boshqa miqdor kiritish', 'stars_custom')],
    [
      Markup.button.callback('⬅️ To\'lov usullari', 'nav_deposit'),
      Markup.button.callback('🏠 Bosh menyu', 'nav_main_menu'),
    ],
  ]);
}

/**
 * CryptoBot Quick Amounts Keyboard
 */
export function getCryptoDepositAmountsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🤖 10 000 so\'m', 'crypto_pack:10000'),
      Markup.button.callback('🤖 25 000 so\'m', 'crypto_pack:25000'),
    ],
    [
      Markup.button.callback('🤖 50 000 so\'m', 'crypto_pack:50000'),
      Markup.button.callback('🤖 100 000 so\'m', 'crypto_pack:100000'),
    ],
    [
      Markup.button.callback('🤖 200 000 so\'m', 'crypto_pack:200000'),
      Markup.button.callback('🤖 500 000 so\'m', 'crypto_pack:500000'),
    ],
    [Markup.button.callback('✍️ Boshqa summa kiritish', 'crypto_custom')],
    [
      Markup.button.callback('⬅️ To\'lov usullari', 'nav_deposit'),
      Markup.button.callback('🏠 Bosh menyu', 'nav_main_menu'),
    ],
  ]);
}

/**
 * CryptoBot Invoice Action Keyboard (Pay URL + Verify button)
 */
export function getCryptoPaymentActionKeyboard(payUrl, invoiceId, amountUzs) {
  return Markup.inlineKeyboard([
    [Markup.button.url('💳 To\'lash (@CryptoBot)', payUrl)],
    [Markup.button.callback('🔄 To\'lovni tekshirish', `check_crypto:${invoiceId}:${amountUzs}`)],
    [
      Markup.button.callback('⬅️ Orqaga', 'pay_method:crypto'),
      Markup.button.callback('🏠 Bosh menyu', 'nav_main_menu'),
    ],
  ]);
}

/**
 * Click Quick Amounts Keyboard
 */
export function getClickDepositAmountsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔹 10 000 so\'m', 'click_pack:10000'),
      Markup.button.callback('🔹 20 000 so\'m', 'click_pack:20000'),
    ],
    [
      Markup.button.callback('🔹 50 000 so\'m', 'click_pack:50000'),
      Markup.button.callback('🔹 100 000 so\'m', 'click_pack:100000'),
    ],
    [
      Markup.button.callback('🔹 200 000 so\'m', 'click_pack:200000'),
      Markup.button.callback('🔹 500 000 so\'m', 'click_pack:500000'),
    ],
    [Markup.button.callback('✍️ Boshqa summa kiritish', 'click_custom')],
    [
      Markup.button.callback('⬅️ To\'lov usullari', 'nav_deposit'),
      Markup.button.callback('🏠 Bosh menyu', 'nav_main_menu'),
    ],
  ]);
}

/**
 * Payme Quick Amounts Keyboard
 */
export function getPaymeDepositAmountsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔹 10 000 so\'m', 'payme_pack:10000'),
      Markup.button.callback('🔹 20 000 so\'m', 'payme_pack:20000'),
    ],
    [
      Markup.button.callback('🔹 50 000 so\'m', 'payme_pack:50000'),
      Markup.button.callback('🔹 100 000 so\'m', 'payme_pack:100000'),
    ],
    [
      Markup.button.callback('🔹 200 000 so\'m', 'payme_pack:200000'),
      Markup.button.callback('🔹 500 000 so\'m', 'payme_pack:500000'),
    ],
    [Markup.button.callback('✍️ Boshqa summa kiritish', 'payme_custom')],
    [
      Markup.button.callback('⬅️ To\'lov usullari', 'nav_deposit'),
      Markup.button.callback('🏠 Bosh menyu', 'nav_main_menu'),
    ],
  ]);
}

/**
 * Card Deposit Quick Amounts Keyboard
 */
export function getCardDepositAmountsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💳 10 000 so\'m', 'card_pack:10000'),
      Markup.button.callback('💳 20 000 so\'m', 'card_pack:20000'),
    ],
    [
      Markup.button.callback('💳 50 000 so\'m', 'card_pack:50000'),
      Markup.button.callback('💳 100 000 so\'m', 'card_pack:100000'),
    ],
    [
      Markup.button.callback('💳 200 000 so\'m', 'card_pack:200000'),
      Markup.button.callback('💳 500 000 so\'m', 'card_pack:500000'),
    ],
    [Markup.button.callback('✍️ Boshqa summa kiritish', 'card_custom_amount')],
    [
      Markup.button.callback('⬅️ To\'lov usullari', 'nav_deposit'),
      Markup.button.callback('🏠 Bosh menyu', 'nav_main_menu'),
    ],
  ]);
}

/**
 * Payment Request Action Keyboard (Chek yuborish)
 */
export function getPaymentActionKeyboard(paymentRequestId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🧾 Chek yuborish', `send_receipt:${paymentRequestId}`)],
    [Markup.button.callback('⬅️ To\'lov usullari', 'nav_deposit'), Markup.button.callback('🏠 Bosh menyu', 'nav_main_menu')],
  ]);
}

/**
 * Auto Card Payment Action Keyboard (Check, Click, Payme, Receipt)
 */
export function getAutoCardPaymentKeyboard(paymentRequestId, cardNumber, amount) {
  const cleanCard = cardNumber ? cardNumber.replace(/\s+/g, '') : '';
  const clickUrl = `https://my.click.uz/services/pay?service_id=53888&card_num=${cleanCard}&amount=${amount}`;
  const paymeUrl = `https://payme.uz/`;

  return Markup.inlineKeyboard([
    [Markup.button.callback('🔄 To\'lovni tekshirish', `check_card_payment:${paymentRequestId}`)],
    [
      Markup.button.url('📲 Click orqali', clickUrl),
      Markup.button.url('📲 Payme orqali', paymeUrl),
    ],
    [Markup.button.callback('🧾 Chek yuborish (Muammo bo\'lsa)', `send_receipt:${paymentRequestId}`)],
    [Markup.button.callback('❌ Bekor qilish', 'nav_deposit')],
  ]);
}
