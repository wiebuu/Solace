// Guided flows: any form in the app can be filled by talking to Sol. A flow is a
// list of questions; each answer is parsed from natural speech (or a tapped chip)
// and written straight into the screen's form state, which stays editable by hand.

export type FlowValue = string | string[] | number | boolean | { hour: number; minute: number } | null;
export type FlowValues = Record<string, FlowValue>;

export interface FlowOption {
  value: string;
  label: string;
  synonyms?: string[];
}

export interface FlowStep {
  key: string;
  ask: string | ((v: FlowValues) => string);
  kind: 'choice' | 'multi' | 'scale' | 'text' | 'time' | 'yesno';
  options?: FlowOption[];
  optional?: boolean;
  /** Only ask when this returns true (e.g. follow-up questions). */
  when?: (v: FlowValues) => boolean;
  /** Short acknowledgement before the next question. */
  ack?: (value: FlowValue, v: FlowValues) => string;
}

export interface Flow {
  id: string;
  title: string;
  intro?: string;
  steps: FlowStep[];
  initial?: FlowValues;
  /** Called after every answer, so the screen behind Sol fills in live. */
  onAnswer?: (key: string, value: FlowValue, all: FlowValues) => void;
  /** Persist the result. Returns Sol's closing line. */
  onComplete: (values: FlowValues) => Promise<string>;
}

// ---------- Parsing ----------
const SKIP = /\b(skip|pass|not now|next|nothing|none|no thanks|nah|rather not)\b/i;
const YES = /\b(yes|yeah|yep|yup|sure|ok|okay|please|of course|definitely|absolutely|sounds good|go ahead|do it|i do|why not)\b/i;
const NO = /\b(no|nope|not really|don'?t|do not|never mind|nah|skip|later)\b/i;
const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty five': 45, fifty: 50,
};
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
const SCALE_WORDS: [RegExp, number][] = [
  [/\b(always|all the time|every day|constantly)\b/i, 5],
  [/\b(mostly|most of the time|usually|a lot)\b/i, 4],
  [/\b(often|quite a bit|pretty often)\b/i, 3],
  [/\b(sometimes|some days|now and then|occasionally|half)\b/i, 2],
  [/\b(rarely|not much|hardly|barely|not really)\b/i, 1],
  [/\b(never|not at all|no)\b/i, 0],
];

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9: ]/g, ' ').replace(/\s+/g, ' ')} `;

function matchOptions(text: string, options: FlowOption[]): FlowOption[] {
  const t = norm(text);
  const hits = options.filter((o) =>
    [o.label, o.value, ...(o.synonyms ?? [])].some((w) => t.includes(` ${w.toLowerCase()} `) || t.includes(` ${w.toLowerCase()}`)),
  );
  if (hits.length) return hits;
  const ord = ORDINALS.findIndex((w) => t.includes(` ${w} `));
  if (ord >= 0 && options[ord]) return [options[ord]];
  const num = t.match(/ (\d) /);
  if (num && options[Number(num[1]) - 1]) return [options[Number(num[1]) - 1]];
  return [];
}

export function parseTime(text: string): { hour: number; minute: number } | null {
  let t = norm(text);
  if (/\bnoon\b/.test(t)) return { hour: 12, minute: 0 };
  if (/\bmidnight\b/.test(t)) return { hour: 0, minute: 0 };
  for (const [w, n] of Object.entries(NUMBER_WORDS).sort((a, b) => b[0].length - a[0].length)) {
    t = t.replace(new RegExp(` ${w} `, 'g'), ` ${n} `);
  }
  t = t.replace(/ (\d{1,2}) (\d{2}) /, ' $1:$2 ').replace(/half past (\d{1,2})/, '$1:30').replace(/quarter past (\d{1,2})/, '$1:15');
  const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|a m|pm|p m|in the morning|in the evening|at night|in the afternoon|tonight)?/);
  if (!m) {
    if (/\bmorning\b/.test(t)) return { hour: 8, minute: 0 };
    if (/\bafternoon\b/.test(t)) return { hour: 15, minute: 0 };
    if (/\bevening\b/.test(t)) return { hour: 19, minute: 0 };
    if (/\bnight\b|\bbed ?time\b/.test(t)) return { hour: 21, minute: 30 };
    return null;
  }
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const mer = m[3] ?? '';
  if (hour > 23 || minute > 59) return null;
  if (/pm|p m|evening|night|afternoon|tonight/.test(mer) && hour < 12) hour += 12;
  if (/am|a m|morning/.test(mer) && hour === 12) hour = 0;
  return { hour, minute };
}

export type ParseResult = { ok: true; value: FlowValue } | { ok: false };

export function parseAnswer(step: FlowStep, text: string): ParseResult {
  const answer = text.trim();
  if (!answer) return { ok: false };
  if (step.optional && SKIP.test(answer) && step.kind !== 'yesno') {
    return { ok: true, value: step.kind === 'multi' ? [] : step.kind === 'text' ? '' : null };
  }
  switch (step.kind) {
    case 'choice': {
      const hit = matchOptions(answer, step.options ?? [])[0];
      return hit ? { ok: true, value: hit.value } : { ok: false };
    }
    case 'multi': {
      const hits = matchOptions(answer, step.options ?? []);
      return hits.length ? { ok: true, value: hits.map((h) => h.value) } : { ok: false };
    }
    case 'scale': {
      const digit = norm(answer).match(/ ([0-5]) /);
      if (digit) return { ok: true, value: Number(digit[1]) };
      const word = SCALE_WORDS.find(([re]) => re.test(answer));
      return word ? { ok: true, value: word[1] } : { ok: false };
    }
    case 'yesno':
      if (YES.test(answer)) return { ok: true, value: true };
      if (NO.test(answer)) return { ok: true, value: false };
      return { ok: false };
    case 'time': {
      const time = parseTime(answer);
      return time ? { ok: true, value: time } : { ok: false };
    }
    case 'text':
      return { ok: true, value: answer };
  }
}

export function askText(step: FlowStep, values: FlowValues) {
  return typeof step.ask === 'function' ? step.ask(values) : step.ask;
}

/** What Sol says when it didn't understand, listing the choices. */
export function repromptText(step: FlowStep) {
  const opts = step.options?.map((o) => o.label) ?? [];
  if (step.kind === 'scale') return 'Sorry, I didn’t quite catch that. You can say never, rarely, sometimes, often, mostly or always.';
  if (step.kind === 'yesno') return 'Sorry, was that a yes or a no?';
  if (step.kind === 'time') return 'What time works? You can say something like “8 in the morning” or “9:30 pm”.';
  if (opts.length) return `Sorry, I didn’t catch that. You can say ${opts.slice(0, -1).join(', ')}${opts.length > 1 ? ' or ' : ''}${opts[opts.length - 1]}.`;
  return 'Sorry, could you say that again?';
}

/** Chips shown under the question so answers can be tapped too. */
export function quickReplies(step: FlowStep): string[] {
  if (step.kind === 'yesno') return ['Yes', 'No'];
  if (step.kind === 'scale') return ['Never', 'Rarely', 'Sometimes', 'Often', 'Mostly', 'Always'];
  if (step.kind === 'time') return ['8 am', '1 pm', '6 pm', '9:30 pm'];
  const opts = step.options?.map((o) => o.label) ?? [];
  return step.optional ? [...opts, 'Skip'] : opts;
}

export const SCALE_LABELS = ['Never', 'Rarely', 'Sometimes', 'Often', 'Mostly', 'Always'];
