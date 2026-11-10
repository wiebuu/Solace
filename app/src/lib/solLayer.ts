import { useEffect, useSyncExternalStore } from 'react';
import { makeMutable } from 'react-native-reanimated';
import type { EdgeInsets } from 'react-native-safe-area-context';

export const SMALL_ORB = 92;
export const DOCK_ORB = 78;
export const CORNER_ORB = 64;

export interface Spot {
  x: number;
  y: number;
  /** Diameter of the orb at this spot. */
  size: number;
}

/** Where Sol sits: big in the voice page, small atop the chat, or docked in the tab bar. */
export function solSpots(width: number, height: number, insets: EdgeInsets) {
  const top = insets.top + 52;
  const gap = height * 0.04;
  const big = Math.min(width * 0.78, 330);
  return {
    top,
    gap,
    voice: { x: width / 2, y: top + gap + big / 2, size: big },
    chat: { x: width / 2, y: top + SMALL_ORB / 2, size: SMALL_ORB },
    dock: { x: width / 2, y: height - (Math.max(insets.bottom, 12) + 54), size: DOCK_ORB },
    // Screens without the tab bar: Sol waits in the bottom-right corner.
    corner: { x: width - 22 - CORNER_ORB / 2, y: height - insets.bottom - 24 - CORNER_ORB / 2, size: CORNER_ORB },
  };
}

/** 0..1 while the user drags the full page down: pulls Sol toward the dock. */
export const solDrag = makeMutable(0);

// Screens that must never show Sol (the launch screen) say so while they're mounted.
let hiddenBy = 0;
const hiddenListeners = new Set<() => void>();
function setHidden(delta: number) {
  hiddenBy += delta;
  hiddenListeners.forEach((fn) => fn());
}
/** Hide the floating Sol while the calling screen is on screen. */
export function useHideSol() {
  useEffect(() => {
    setHidden(1);
    return () => setHidden(-1);
  }, []);
}
export function useSolHidden(): boolean {
  return useSyncExternalStore(
    (fn) => {
      hiddenListeners.add(fn);
      return () => hiddenListeners.delete(fn);
    },
    () => hiddenBy > 0,
  );
}
