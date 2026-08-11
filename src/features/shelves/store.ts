// Shared in-memory reflection of the shelves table, mirroring features/library/store.ts.
import { signal } from '@preact/signals';
import { listShelves } from '../../db/queries';
import type { Shelf } from '../../db/types';

export const shelves = signal<Shelf[]>([]);
export const shelvesLoading = signal(true);

export async function refreshShelves(): Promise<void> {
  shelves.value = await listShelves();
  shelvesLoading.value = false;
}

export function shelfName(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return shelves.value.find((s) => s.id === id)?.name;
}
