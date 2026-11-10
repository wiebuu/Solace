import { useEffect, useSyncExternalStore } from 'react';

export interface Memory {
  _id: string;
  text: string;
  createdAt: string;
}

// What Sol has just learned, shared app-wide the moment a reply comes back: the memories page
// adds it to its list, and a small note pops up wherever you are.
type Listener = (added: Memory[]) => void;
const listeners = new Set<Listener>();
let latest: Memory[] = [];
const latestListeners = new Set<() => void>();

export function rememberedNow(added: Memory[]) {
  if (!added.length) return;
  latest = added;
  listeners.forEach((fn) => fn(added));
  latestListeners.forEach((fn) => fn());
}

/** Call `fn` with each batch of memories Sol saves while the caller is mounted. */
export function useOnRemembered(fn: Listener) {
  useEffect(() => {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, [fn]);
}

/** The most recent batch Sol remembered (for the pop-up note). */
export function useLatestRemembered(): Memory[] {
  return useSyncExternalStore(
    (fn) => {
      latestListeners.add(fn);
      return () => latestListeners.delete(fn);
    },
    () => latest,
  );
}
