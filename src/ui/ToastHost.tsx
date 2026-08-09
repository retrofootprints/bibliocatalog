import { dismissToast, toasts } from './toast';

export function ToastHost() {
  if (toasts.value.length === 0) return null;
  return (
    <div class="toast-host" role="status" aria-live="polite">
      {toasts.value.map((toast) => (
        <div key={toast.id} class="toast">
          <span>{toast.text}</span>
          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              class="toast__action"
              onClick={() => {
                toast.onAction?.();
                dismissToast(toast.id);
              }}
            >
              {toast.actionLabel}
            </button>
          )}
          <button type="button" class="toast__close" aria-label="Close" onClick={() => dismissToast(toast.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
