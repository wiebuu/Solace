import { useEffect, useRef } from 'react';

// Tapping the tab you're already on refreshes that screen (and scrolls it to the top).
const listeners = new Map<string, Set<() => void>>();

export function emitTabReselect(route: string) {
  listeners.get(route)?.forEach((fn) => fn());
}

export function useTabReselect(route: string, fn: () => void) {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    const handler = () => latest.current();
    const set = listeners.get(route) ?? new Set();
    set.add(handler);
    listeners.set(route, set);
    return () => void set.delete(handler);
  }, [route]);
}
