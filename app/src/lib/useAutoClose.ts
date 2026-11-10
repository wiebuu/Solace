import { useEffect, useRef } from 'react';
import { router } from 'expo-router';

/**
 * Close an exercise once it's complete: waits for Sol's closing words (the promise), then a
 * short beat so the finish is seen, then goes back. Does nothing if the screen already closed.
 */
export function useAutoClose() {
  const open = useRef(true);
  useEffect(
    () => () => {
      open.current = false;
    },
    [],
  );
  return (closingWords: Promise<unknown>) => {
    const shownAt = Date.now();
    closingWords
      .catch(() => {})
      .then(() => new Promise((r) => setTimeout(r, Math.max(1200, 2500 - (Date.now() - shownAt)))))
      .then(() => {
        if (!open.current) return;
        if (router.canGoBack()) router.back();
        else router.replace('/');
      });
  };
}
