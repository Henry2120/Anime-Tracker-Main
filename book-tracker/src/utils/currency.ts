import type { CurrencyCode } from '../types/domain';

export const CURRENCY_OPTIONS: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: 'VND', label: 'Vietnamese Dong (VND)', symbol: '₫' },
  { code: 'USD', label: 'US Dollar (USD)', symbol: '$' },
  { code: 'JPY', label: 'Japanese Yen (JPY)', symbol: '¥' },
  { code: 'EUR', label: 'Euro (EUR)', symbol: '€' },
  { code: 'GBP', label: 'British Pound (GBP)', symbol: '£' },
  { code: 'KRW', label: 'South Korean Won (KRW)', symbol: '₩' },
  { code: 'CNY', label: 'Chinese Yuan (CNY)', symbol: '¥' },
];

export function formatCurrency(
  amount: number | null | undefined,
  currency: CurrencyCode = 'VND',
  locale = 'vi-VN'
): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  const zeroDecimal = currency === 'VND' || currency === 'JPY' || currency === 'KRW';
  try {
    return new Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: zeroDecimal ? 0 : 2,
      maximumFractionDigits: zeroDecimal ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency}`;
  }
}
