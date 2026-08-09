import { signal } from '@preact/signals';

/** Set before navigating to /add from an unresolved scan, so the manual entry
 *  form can prefill the ISBN (SPEC §5.1: "unresolved -> offer manual entry
 *  prefilled with the ISBN"). Consumed (and cleared) on mount. */
export const pendingManualIsbn = signal<string | undefined>(undefined);
