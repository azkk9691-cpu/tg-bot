/**
 * Text & Data Formatters
 */

// Enable BigInt serialization to string
BigInt.prototype.toJSON = function () {
  return this.toString();
};

/**
 * Formats a number or BigInt with spaces as thousand separators
 * Example: 20000 -> "20 000"
 */
export function formatNumber(value) {
  if (value === null || value === undefined) return '0';
  const numStr = value.toString();
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Formats amount into Uzbek So'm currency string
 * Example: 20000 -> "20 000 so'm"
 */
export function formatMoney(amount) {
  return `${formatNumber(amount)} so'm`;
}

/**
 * Formats 16-digit card number with spaces
 * Example: "6262910202797114" -> "6262 9102 0279 7114"
 */
export function formatCardNumber(cardNumber) {
  if (!cardNumber) return '';
  const cleaned = cardNumber.replace(/\D/g, '');
  return cleaned.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Formats date into DD.MM.YYYY HH:mm format (Uzbekistan Time UTC+5)
 */
export function formatDate(date) {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';

  // Offset for UTC+5 (Tashkent)
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const tashkentDate = new Date(utc + 3600000 * 5);

  const day = String(tashkentDate.getDate()).padStart(2, '0');
  const month = String(tashkentDate.getMonth() + 1).padStart(2, '0');
  const year = tashkentDate.getFullYear();
  const hours = String(tashkentDate.getHours()).padStart(2, '0');
  const minutes = String(tashkentDate.getMinutes()).padStart(2, '0');

  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

/**
 * Formats date into DD.MM.YYYY format only
 */
export function formatDateOnly(date) {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';

  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const tashkentDate = new Date(utc + 3600000 * 5);

  const day = String(tashkentDate.getDate()).padStart(2, '0');
  const month = String(tashkentDate.getMonth() + 1).padStart(2, '0');
  const year = tashkentDate.getFullYear();

  return `${day}.${month}.${year}`;
}

/**
 * Escapes HTML characters for Telegram HTML mode
 */
export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
