import { MIN_DEPOSIT_AMOUNT } from '../config/constants.js';

/**
 * Validates and parses user-entered amount
 * Handles formats like: "20000", "20 000", "20,000", "20.000", "20000 som"
 */
export function parseDepositAmount(text) {
  if (!text || typeof text !== 'string') {
    return { isValid: false, amount: 0, error: 'Summa noto\'g\'ri kiritildi.' };
  }

  // Remove spaces, letters, currency symbols
  const cleaned = text.replace(/[^\d]/g, '');

  if (!cleaned) {
    return {
      isValid: false,
      amount: 0,
      error: 'Iltimos, faqat raqam shaklida summa kiriting. Masalan: 20000',
    };
  }

  const num = parseInt(cleaned, 10);

  if (isNaN(num) || num <= 0) {
    return {
      isValid: false,
      amount: 0,
      error: 'Iltimos, to\'g\'ri summa kiriting.',
    };
  }

  if (num < MIN_DEPOSIT_AMOUNT) {
    return {
      isValid: false,
      amount: num,
      error: `Minimal to'ldirish summasi: ${MIN_DEPOSIT_AMOUNT.toLocaleString()} so'm.`,
    };
  }

  if (num > 100_000_000) {
    return {
      isValid: false,
      amount: num,
      error: 'Maksimal to\'ldirish summasi: 100 000 000 so\'m.',
    };
  }

  return {
    isValid: true,
    amount: num,
    amountBigInt: BigInt(num),
    error: null,
  };
}

/**
 * Validates Telegram numeric ID
 */
export function parseTelegramId(input) {
  if (!input) return null;
  const cleaned = input.toString().replace(/[^\d]/g, '');
  if (!cleaned) return null;
  try {
    return BigInt(cleaned);
  } catch {
    return null;
  }
}
