import config from '../config/index.js';
import { logger } from '../utils/logger.js';
import { PaymentService } from './paymentService.js';
import { DEFAULT_USDT_RATE } from '../config/constants.js';

export class CryptoPayService {
  static getBaseUrl() {
    return config.cryptoBotNet === 'testnet'
      ? 'https://testnet-pay.crypt.bot/api'
      : 'https://pay.crypt.bot/api';
  }

  static isConfigured() {
    return Boolean(config.cryptoBotToken && config.cryptoBotToken.trim().length > 0);
  }

  /**
   * Convert UZS amount to USDT
   */
  static uzsToUsdt(amountUzs) {
    const rate = DEFAULT_USDT_RATE;
    const usdt = (amountUzs / rate).toFixed(2);
    return Math.max(0.1, parseFloat(usdt));
  }

  /**
   * Create an invoice on CryptoBot
   */
  static async createInvoice({ amountUzs, userId, description = 'BULDROP PM Balans to\'ldirish' }) {
    if (!this.isConfigured()) {
      throw new Error('CRYPTO_BOT_TOKEN sozlanmagan.');
    }

    const usdtAmount = this.uzsToUsdt(amountUzs);
    const payload = JSON.stringify({ userId, amountUzs });

    const response = await fetch(`${this.getBaseUrl()}/createInvoice`, {
      method: 'POST',
      headers: {
        'Crypto-Pay-API-Token': config.cryptoBotToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        currency_type: 'crypto',
        asset: 'USDT',
        amount: usdtAmount.toString(),
        description,
        payload,
        expires_in: 1800, // 30 mins
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      logger.error('CryptoBot API createInvoice error:', data);
      throw new Error(data.error?.name || 'Crypto invoice yaratishda xatolik.');
    }

    return {
      invoiceId: data.result.invoice_id,
      payUrl: data.result.bot_invoice_url || data.result.mini_app_invoice_url || data.result.pay_url,
      amountUsdt: usdtAmount,
      amountUzs,
      status: data.result.status,
    };
  }

  /**
   * Check status of invoice
   */
  static async getInvoiceStatus(invoiceId) {
    if (!this.isConfigured()) {
      throw new Error('CRYPTO_BOT_TOKEN sozlanmagan.');
    }

    const response = await fetch(`${this.getBaseUrl()}/getInvoices?invoice_ids=${invoiceId}`, {
      method: 'GET',
      headers: {
        'Crypto-Pay-API-Token': config.cryptoBotToken,
      },
    });

    const data = await response.json();
    if (!data.ok || !data.result?.items?.length) {
      return null;
    }

    return data.result.items[0];
  }

  /**
   * Check and auto-credit payment if invoice is paid
   */
  static async checkAndProcessInvoice(invoiceId, userId, expectedAmountUzs) {
    const invoice = await this.getInvoiceStatus(invoiceId);
    if (!invoice) {
      return { success: false, status: 'NOT_FOUND', message: 'To\'lov topilmadi.' };
    }

    if (invoice.status === 'paid') {
      const result = await PaymentService.processAutoPayment({
        userId,
        amount: expectedAmountUzs,
        provider: 'CRYPTOBOT',
        externalId: `crypto_${invoiceId}`,
        currency: 'USDT',
        description: `CryptoBot orqali avtomatik to'lov (${invoice.amount} ${invoice.asset})`,
      });

      return {
        success: true,
        status: 'PAID',
        paymentResult: result,
      };
    }

    if (invoice.status === 'expired') {
      return { success: false, status: 'EXPIRED', message: 'To\'lov vaqti tugagan.' };
    }

    return { success: false, status: 'PENDING', message: 'To\'lov hali amalga oshirilmagan.' };
  }
}
