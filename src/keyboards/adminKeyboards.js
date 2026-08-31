import { Markup } from 'telegraf';
import { PROMO_CATEGORIES } from '../config/constants.js';
import { formatNumber } from '../utils/formatters.js';

/**
 * Admin Panel Main Reply Keyboard
 */
export function getAdminMenuKeyboard() {
  return Markup.keyboard([
    ['➕ Promokod qo\'shish', '📋 Promokodlar'],
    ['⏳ Kutilayotgan to\'lovlar', '📊 Statistika'],
    ['👥 Foydalanuvchilar', '📢 Hammaga xabar yuborish'],
    ['⚙️ Sozlamalar', '🏠 Bosh menyu'],
  ]).resize();
}

/**
 * Admin Category Selection for Adding Promos
 */
export function getAdminPromoCategorySelectKeyboard() {
  const buttons = [];

  for (const [key, meta] of Object.entries(PROMO_CATEGORIES)) {
    const label = `${meta.badge} ${meta.name} — ${formatNumber(meta.price)} so'm`;
    buttons.push([Markup.button.callback(label, `admin_add_cat:${key}`)]);
  }

  buttons.push([Markup.button.callback('❌ Bekor qilish', 'admin_cancel')]);

  return Markup.inlineKeyboard(buttons);
}

/**
 * Admin Payment Approval/Rejection Inline Keyboard
 */
export function getAdminPaymentApprovalKeyboard(paymentId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Tasdiqlash', `admin_approve_pay:${paymentId}`),
      Markup.button.callback('❌ Rad qilish', `admin_reject_pay:${paymentId}`),
    ],
  ]);
}

/**
 * Admin Settings Keyboard
 */
export function getAdminSettingsKeyboard(isChannelsEnabled = false) {
  const adsStatusEmoji = isChannelsEnabled ? '🟢 YOQILGAN' : '🔴 O\'CHIRILGAN (ADSIZ)';
  return Markup.inlineKeyboard([
    [Markup.button.callback('💳 Karta raqamini o\'zgartirish', 'admin_set_card')],
    [Markup.button.callback(`📢 Majburiy obuna (Reklama): ${adsStatusEmoji}`, 'admin_toggle_ads')],
    [Markup.button.callback('📋 Reklama kanallarini boshqarish', 'admin_manage_channels')],
    [Markup.button.callback('⬅️ Orqaga', 'admin_main')],
  ]);
}

/**
 * Admin Channel Management Keyboard
 */
export function getAdminChannelManageKeyboard(channels = []) {
  const buttons = [];

  channels.forEach((ch) => {
    const statusEmoji = ch.isActive ? '🟢' : '🔴';
    buttons.push([
      Markup.button.callback(
        `${statusEmoji} ${ch.channelTitle} (@${ch.channelUsername})`,
        `admin_toggle_channel:${ch.id}`
      ),
      Markup.button.callback('🗑', `admin_delete_channel:${ch.id}`),
    ]);
  });

  buttons.push([Markup.button.callback('➕ Yangi kanal qo\'shish', 'admin_add_channel')]);
  buttons.push([Markup.button.callback('⬅️ Orqaga', 'admin_settings')]);

  return Markup.inlineKeyboard(buttons);
}
