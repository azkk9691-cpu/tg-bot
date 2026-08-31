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
 * Payment Request Action Keyboard
 */
export function getPaymentActionKeyboard(paymentRequestId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🧾 Chek yuborish', `send_receipt:${paymentRequestId}`)],
    [Markup.button.callback('🏠 Bosh menyu', 'nav_main_menu')],
  ]);
}
