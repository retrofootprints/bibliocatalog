import { signal } from '@preact/signals';

export interface ToastMessage {
  id: number;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const toasts = signal<ToastMessage[]>([]);
let nextId = 1;

export function showToast(text: string, opts?: { actionLabel?: string; onAction?: () => void; durationMs?: number }): void {
  const id = nextId++;
  toasts.value = [...toasts.value, { id, text, actionLabel: opts?.actionLabel, onAction: opts?.onAction }];
  window.setTimeout(() => dismissToast(id), opts?.durationMs ?? 4000);
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}
