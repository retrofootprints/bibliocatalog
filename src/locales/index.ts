import { signal } from '@preact/signals';
import type { UiLocale } from '../db/types';
import { en } from './en';
import type { TranslationKeys } from './keys';
import { ptPT } from './pt-PT';

const dictionaries: Record<UiLocale, TranslationKeys> = {
  'pt-PT': ptPT,
  en,
};

/** Reactive current locale. Set at boot from settings; updatable from Settings view. */
export const locale = signal<UiLocale>('pt-PT');

export function detectLocale(): UiLocale {
  const lang = typeof navigator !== 'undefined' ? navigator.language : 'pt-PT';
  return lang.toLowerCase().startsWith('pt') ? 'pt-PT' : 'en';
}

/** Translate a key, interpolating `{{param}}` placeholders. */
export function t(key: keyof TranslationKeys, params?: Record<string, string | number>): string {
  const template = dictionaries[locale.value][key];
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(params[name] ?? ''));
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(d);
}

export function formatNumber(n: number | undefined): string {
  if (n === undefined) return '';
  return new Intl.NumberFormat(locale.value).format(n);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(value)} ${units[unitIndex]}`;
}
