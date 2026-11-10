import type { Flow, FlowOption, FlowValue, FlowValues } from './flows';
import { MOOD_TAGS } from './moods';
import { formatTime } from './notifications';
import { THEME_ORDER, THEMES } from './theme';
import { TONES } from './voice';

export const GOAL_OPTIONS: FlowOption[] = [
  { value: 'Feel less stressed', label: 'Feel less stressed', synonyms: ['stress', 'stressed', 'pressure', 'overwhelmed'] },
  { value: 'Sleep better', label: 'Sleep better', synonyms: ['sleep', 'rest', 'insomnia', 'tired'] },
  { value: 'Understand my emotions', label: 'Understand my emotions', synonyms: ['emotions', 'feelings', 'understand myself'] },
  { value: 'Build self-confidence', label: 'Build self-confidence', synonyms: ['confidence', 'self esteem', 'believe in myself'] },
  { value: 'Feel less alone', label: 'Feel less alone', synonyms: ['lonely', 'alone', 'loneliness', 'connection'] },
  { value: 'Build healthy habits', label: 'Build healthy habits', synonyms: ['habits', 'routine', 'healthy'] },
  { value: 'Handle anxiety', label: 'Handle anxiety', synonyms: ['anxiety', 'anxious', 'panic', 'worry', 'nervous'] },
  { value: 'Just someone to talk to', label: 'Just someone to talk to', synonyms: ['talk', 'someone', 'company', 'vent', 'listen'] },
];

export const GENDER_OPTIONS: FlowOption[] = [
  { value: 'female', label: 'Girl voice', synonyms: ['girl', 'woman', 'female', 'her', 'she', 'lady', 'feminine'] },
  { value: 'male', label: 'Guy voice', synonyms: ['guy', 'man', 'male', 'boy', 'him', 'he', 'masculine'] },
];

export const TONE_OPTIONS: FlowOption[] = TONES.map((t) => ({
  value: t.key,
  label: t.label,
  synonyms: { warm: ['warmer', 'cozy', 'kind'], soft: ['softer', 'gentle', 'quiet'], cheerful: ['happy', 'bright', 'fun', 'upbeat'], calm: ['calmer', 'grounded', 'steady', 'relaxed'] }[t.key],
}));

export const THEME_OPTIONS: FlowOption[] = THEME_ORDER.map((n) => ({
  value: n,
  label: THEMES[n].label,
  synonyms: { sunrise: ['peach', 'orange', 'default'], honey: ['gold', 'golden', 'yellow', 'amber'], clay: ['terracotta', 'earthy', 'brown', 'sand'], blush: ['pink', 'rose', 'rosy'], ember: ['dark', 'night', 'dark mode'] }[n],
}));

export const MOOD_OPTIONS: FlowOption[] = [
  { value: 'radiant', label: 'Radiant', synonyms: ['amazing', 'fantastic', 'great', 'wonderful', 'excellent', 'brilliant', 'on top of the world'] },
  { value: 'good', label: 'Good', synonyms: ['fine', 'well', 'happy', 'nice', 'pretty good', 'not bad', 'content'] },
  { value: 'okay', label: 'Okay', synonyms: ['ok', 'alright', 'meh', 'so so', 'average', 'neutral', 'normal'] },
  { value: 'low', label: 'Low', synonyms: ['down', 'sad', 'tired', 'meh', 'blue', 'not great', 'flat'] },
  { value: 'struggling', label: 'Struggling', synonyms: ['bad', 'terrible', 'awful', 'anxious', 'overwhelmed', 'horrible', 'really bad', 'not okay'] },
];

export const TAG_OPTIONS: FlowOption[] = MOOD_TAGS.map((t) => ({
  value: t,
  label: t,
  synonyms: {
    Work: ['job', 'office', 'boss', 'career'],
    Studies: ['school', 'college', 'exam', 'exams', 'study', 'class'],
    Sleep: ['sleeping', 'tired', 'rest'],
    Family: ['mom', 'mum', 'dad', 'parents', 'brother', 'sister', 'family'],
    Friends: ['friend', 'friends', 'mates'],
    Love: ['partner', 'boyfriend', 'girlfriend', 'relationship', 'dating', 'husband', 'wife'],
    Health: ['sick', 'ill', 'body', 'pain'],
    Money: ['finances', 'bills', 'rent', 'debt'],
    Exercise: ['gym', 'workout', 'run', 'walk', 'yoga'],
    Weather: ['rain', 'sunny', 'cold', 'hot'],
    'Alone time': ['me time', 'alone', 'solitude'],
    Food: ['eating', 'meal', 'dinner', 'lunch'],
  }[t],
}));

export const WELLBEING = [
  'calm and relaxed',
  'full of energy for things you care about',
  'rested after sleeping',
  'connected to people around you',
  'kind to yourself',
];

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const labelOf = (opts: FlowOption[], v: FlowValue) => opts.find((o) => o.value === v)?.label ?? String(v);

/** Profile setup, asked by Sol right after sign-up. */
export function setupFlow(name: string, cb: Pick<Flow, 'onAnswer' | 'onComplete'>): Flow {
  return {
    id: 'setup',
    title: 'Getting to know you',
    intro: `Hi ${name}, I’m Sol. Let’s set this space up together. It’ll only take a minute.`,
    steps: [
      {
        key: 'goals',
        kind: 'multi',
        options: GOAL_OPTIONS,
        ask: 'First, what brings you here? Maybe stress, sleep, anxiety, or just someone to talk to?',
        ack: (v) => `${list((v as string[]).map((g) => g.toLowerCase()))}. I can definitely help with that.`,
      },
      {
        key: 'voiceGender',
        kind: 'choice',
        options: GENDER_OPTIONS,
        ask: 'Would you like me to sound like a girl or a guy?',
        ack: () => 'How’s this?',
      },
      {
        key: 'tone',
        kind: 'choice',
        options: TONE_OPTIONS,
        ask: 'And how should I talk with you: warm, soft, cheerful, or calm?',
        ack: (v) => `${labelOf(TONE_OPTIONS, v)} it is.`,
      },
      {
        key: 'theme',
        kind: 'choice',
        options: THEME_OPTIONS,
        ask: 'Pick a look for your space: Sunrise, Honey, Clay, Blush, or Ember, the dark one.',
        ack: (v) => `${labelOf(THEME_OPTIONS, v)}. Lovely choice.`,
      },
      {
        key: 'doCheck',
        kind: 'yesno',
        ask: 'Can I ask five quick questions about the last two weeks? It helps me understand where you’re starting from.',
        ack: (v) => (v ? 'Thank you. Just answer with never, rarely, sometimes, often, mostly or always.' : 'No problem, we can do it another time.'),
      },
      ...WELLBEING.map((w, i) => ({
        key: `wb${i}`,
        kind: 'scale' as const,
        when: (v: FlowValues) => v.doCheck === true,
        ask: `How often have you felt ${w}?`,
      })),
      {
        key: 'reminders',
        kind: 'yesno',
        ask: 'Should I send you gentle reminders, like a morning affirmation and an afternoon breathing break?',
        ack: (v) => (v ? 'I’ll keep them gentle.' : 'Okay, no reminders for now.'),
      },
      {
        key: 'memory',
        kind: 'yesno',
        ask: 'Last one. Can I remember small things you tell me, so you never have to repeat yourself? You can see or erase them anytime.',
      },
    ],
    ...cb,
  };
}

/** Mood check-in. */
export function checkinFlow(cb: Pick<Flow, 'onAnswer' | 'onComplete'> & { initial?: FlowValues }): Flow {
  return {
    id: 'checkin',
    title: 'Check-in',
    intro: cb.initial?.mood ? undefined : 'Let’s check in.',
    initial: cb.initial,
    steps: [
      { key: 'mood', kind: 'choice', options: MOOD_OPTIONS, ask: 'How are you feeling right now, honestly?' },
      {
        key: 'tags',
        kind: 'multi',
        optional: true,
        options: TAG_OPTIONS,
        ask: (v) => `${v.mood === 'low' || v.mood === 'struggling' ? 'I’m sorry it’s a hard one.' : 'Got it.'} What’s connected to it? Work, sleep, family, friends… or say skip.`,
        ack: (v) => ((v as string[]).length ? `${list(v as string[])}, noted.` : ''),
      },
      { key: 'note', kind: 'text', optional: true, ask: 'Anything you’d like to add in your own words? Or say skip.' },
    ],
    onAnswer: cb.onAnswer,
    onComplete: cb.onComplete,
  };
}

/** New custom reminder. */
export function reminderFlow(cb: Pick<Flow, 'onAnswer' | 'onComplete'> & { initial?: FlowValues }): Flow {
  return {
    id: 'reminder',
    title: 'New reminder',
    initial: cb.initial,
    steps: [
      { key: 'title', kind: 'text', ask: 'What should I remind you about?' },
      {
        key: 'time',
        kind: 'time',
        ask: 'And what time each day?',
        ack: (v) => {
          const t = v as { hour: number; minute: number };
          return `${formatTime(t.hour, t.minute)}, every day.`;
        },
      },
    ],
    onAnswer: cb.onAnswer,
    onComplete: cb.onComplete,
  };
}

/** Pick a theme by voice: each answer previews instantly. */
export function themeFlow(cb: Pick<Flow, 'onAnswer' | 'onComplete'>): Flow {
  return {
    id: 'theme',
    title: 'Theme',
    steps: [
      {
        key: 'theme',
        kind: 'choice',
        options: THEME_OPTIONS,
        ask: 'Which look would you like? Sunrise, Honey, Clay, Blush, or Ember, the dark one.',
      },
    ],
    onAnswer: cb.onAnswer,
    onComplete: cb.onComplete,
  };
}
