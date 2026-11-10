import { useEffect, useRef } from 'react';
import { useSession } from './session';

/**
 * Let a page be driven by voice ("I see one", "start", "next") through the one, app-wide Sol:
 * Sol hands the page anything said that's
 * meant for it (only while Sol is on: a page never turns Sol on by itself). The handler returns
 * true when it used the words; otherwise Sol answers as usual.
 */
export function useVoiceCommands(handler: (text: string) => boolean) {
  const { setCommandHandler } = useSession();
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    // Words meant for Sol ("close yourself", "stop listening") stay with Sol, not the page.
    setCommandHandler((text) => !ABOUT_SOL.test(text.toLowerCase()) && latest.current(text));
    return () => setCommandHandler(null);
  }, [setCommandHandler]);
}

const ABOUT_SOL = /\b(yourself|sol|the chat|conversation|stop listening|don'?t listen|stop talking|go quiet|mic)\b/;

const NUMBERS: Record<string, number> = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, couple: 2, few: 3 };

/** How many things someone named: "I see two", "a lamp and a chair", "5", "I see one". */
export function countMentioned(text: string): number {
  const t = text.toLowerCase();
  const digit = t.match(/\b([1-5])\b/);
  if (digit) return Number(digit[1]);
  const word = t.match(/\b(one|two|three|four|five|couple|few)\b/);
  if (word) return NUMBERS[word[1]];
  // Listing things ("a lamp, a chair and the window") counts each.
  const items = t.split(/,| and /).filter((x) => x.trim().length > 1);
  return Math.max(1, Math.min(5, items.length));
}
