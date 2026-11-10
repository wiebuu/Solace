// Offline responder used when no Claude key is configured or the API is unreachable.
// It is intentionally modest: mood-aware, references the user's words, never preachy.
import type { SolReply, DailyContent } from './ai.js';
import type { UserContext } from './context.js';

type Turn = { role: 'user' | 'assistant'; content: string };

const CRISIS = /\b(suicid|kill myself|end it all|self[- ]?harm|hurt myself|want to die|disappear forever|no reason to live)/i;
type Theme = {
  re: RegExp;
  mood: SolReply['detected_mood'];
  title: string;
  replies: Array<(n: string) => string>;
  suggestions: SolReply['suggestions'];
};

// Order matters: the first matching theme wins.
const THEMES: Theme[] = [
  {
    re: /\b(reflect|reflection)\b/i,
    mood: 'unknown',
    title: 'A quiet reflection',
    replies: [
      (n) => `Let's slow down together, ${n}. Think of one moment from today that has stayed with you, big or small. What was it, and how did it feel in your body?`,
      () => `Gently now. If today had a single word, what would it be? Tell me the word, then tell me why.`,
    ],
    suggestions: [],
  },
  {
    re: /\b(hi|hello|hey|hii+|good (morning|evening|afternoon))\b/i,
    mood: 'unknown',
    title: 'Saying hello',
    replies: [
      (n) => `Hi ${n}, it's really good to see you. How is your heart doing today, honestly?`,
      (n) => `Hey ${n} 🌤️ I'm glad you stopped by. What's been taking up most of your thoughts lately?`,
    ],
    suggestions: [{ kind: 'checkin', label: 'Quick mood check-in' }],
  },
  {
    re: /\b(anxious|anxiety|panic|nervous|worried|worry|overthink|racing|scared|afraid)/i,
    mood: 'low',
    title: 'Easing anxiety',
    replies: [
      (n) => `That's a lot of worry to be sitting with, ${n}. When your mind races, slowing your breath can give it somewhere to land. Would you like to try a short breathing round, or tell me what's looping in your head?`,
      () => `Anxiety has a way of making everything feel urgent at once. Let's take just one worry. Which one feels loudest right now?`,
      () => `You're not overreacting. Your body is trying to protect you. What would feeling 10% calmer look like in the next hour?`,
    ],
    suggestions: [{ kind: 'breathing', label: '2-min calming breath' }],
  },
  {
    re: /\b(can'?t sleep|insomnia|sleep|awake|tired|exhausted|drained|fatigue)/i,
    mood: 'low',
    title: 'Rest and sleep',
    replies: [
      (n) => `You sound genuinely worn out, ${n}. Rest isn't something you have to earn. Is it more your body that's tired, or your mind that won't switch off?`,
      () => `When sleep won't come, it often helps to stop trying so hard. A slow 4-7-8 breath can tell your nervous system it's safe to power down. Want to try it with me?`,
      () => `What usually happens in the hour before bed for you? Sometimes a small change there makes nights a lot kinder.`,
    ],
    suggestions: [{ kind: 'breathing', label: '4-7-8 wind-down' }],
  },
  {
    re: /\b(stress|overwhelm|too much|deadline|exam|work|job|boss|pressure|burn ?out|study|studies)/i,
    mood: 'low',
    title: 'Under pressure',
    replies: [
      (n) => `You're carrying a heavy load right now, ${n}. You don't have to solve all of it at once. What's the one piece that feels most urgent right now?`,
      () => `Pressure shrinks our world down to the to-do list. Outside of that list, what's one small thing that would make today 5% easier?`,
      () => `You've been pushing hard. If a friend were in your shoes, what would you tell them they're allowed to let go of today?`,
    ],
    suggestions: [{ kind: 'grounding', label: '5-4-3-2-1 grounding' }],
  },
  {
    re: /\b(lonely|alone|no one|nobody|isolated|left out|miss (him|her|them|you))/i,
    mood: 'struggling',
    title: 'Feeling alone',
    replies: [
      (n) => `Feeling alone can hurt in a very quiet way, ${n}. I'm really glad you reached out, even to me. Who is someone you've felt close to before, even a little?`,
      () => `Thank you for trusting me with that. Loneliness doesn't mean something is wrong with you. It means you need connection, like everyone does. What kind of company would feel good right now?`,
    ],
    suggestions: [{ kind: 'affirmation', label: 'A kind word for you' }],
  },
  {
    re: /\b(sad|down|cry|crying|empty|hopeless|heartbroken|breakup|broke up|grief|lost)/i,
    mood: 'struggling',
    title: 'Holding sadness',
    replies: [
      (n) => `I'm really glad you told me, ${n}. Feeling this way is heavy, and you don't need to rush past it. What's been weighing on you the most?`,
      () => `It makes sense that this hurts. Sadness is often a sign of how much something mattered. Do you want to talk about it, or would some quiet help more right now?`,
      () => `I'm here, and there's no right way to feel this. What would being gentle with yourself look like tonight?`,
    ],
    suggestions: [{ kind: 'reflection', label: 'Write it out' }],
  },
  {
    re: /\b(angry|anger|furious|annoyed|frustrat|irritat|mad at|hate)/i,
    mood: 'low',
    title: 'Working through anger',
    replies: [
      (n) => `That frustration makes sense. Anger often shows up when something that matters to us gets crossed. What happened, ${n}?`,
      () => `Let's give that anger some room before deciding what to do with it. Where do you feel it in your body right now?`,
    ],
    suggestions: [{ kind: 'breathing', label: 'Cool-down breath' }],
  },
  {
    re: /\b(friend|family|mom|mum|dad|parents|partner|boyfriend|girlfriend|husband|wife|relationship|fight|argument)/i,
    mood: 'okay',
    title: 'People in my life',
    replies: [
      (n) => `Relationships can bring out our biggest feelings, ${n}. What part of this is sitting with you the most?`,
      () => `This person clearly matters to you. What do you wish they understood about how you feel?`,
    ],
    suggestions: [],
  },
  {
    re: /\b(thank|thanks|grateful|gratitude|appreciate)/i,
    mood: 'good',
    title: 'A grateful moment',
    replies: [
      (n) => `That's lovely, ${n}. Gratitude is like sunlight for the mind ☀️ What else, however small, are you glad about today?`,
      () => `I'm really glad I could be here. You did the hard part by showing up for yourself.`,
    ],
    suggestions: [],
  },
  {
    re: /\b(happy|great|amazing|excited|proud|good day|awesome|wonderful|better|calm)/i,
    mood: 'good',
    title: 'Celebrating a good day',
    replies: [
      (n) => `I love hearing this, ${n}! ✨ What do you think made today feel this good? It's worth noticing so you can find your way back to it.`,
      () => `That's wonderful. Let's soak it in for a second. Where in your body do you feel this good mood?`,
      () => `You deserve days like this. Is there someone you'd like to share this moment with?`,
    ],
    suggestions: [{ kind: 'reflection', label: 'Save this moment' }],
  },
];

const NEUTRAL: Array<(n: string) => string> = [
  (n) => `Thank you for sharing that with me, ${n}. I'm here and listening. How is that sitting with you right now?`,
  () => `I hear you. Tell me a little more. What feels most important about it to you?`,
  () => `That makes sense. If you had to name the feeling underneath all this, what would it be?`,
  (n) => `I'm glad you're putting this into words, ${n}. What would help most right now: talking it through, a calming exercise, or just being heard?`,
];

export function fallbackReply(ctx: UserContext, history: Turn[]): SolReply {
  const last = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
  const isFirst = history.filter((m) => m.role === 'user').length <= 1;

  if (CRISIS.test(last)) {
    return {
      reply: `${ctx.name}, I'm really glad you told me, and I'm taking this seriously. You deserve support from a real person right now. Please reach out to someone you trust or a crisis line (I've put some numbers just below). Are you safe at this moment?`,
      detected_mood: 'struggling',
      suggestions: [],
      new_memories: [],
      safety_concern: true,
      title: 'Reaching out',
    };
  }

  const turn = history.filter((m) => m.role === 'user').length;
  const theme = THEMES.find((t) => t.re.test(last));
  // Rotate through variations so follow-up messages don't repeat themselves.
  const pool = theme?.replies ?? NEUTRAL;
  let reply = pool[(turn - 1) % pool.length](ctx.name);
  if (isFirst && !theme && ctx.latestMood) {
    reply = `I saw you checked in feeling ${ctx.latestMood} recently, ${ctx.name}. ${pool[1](ctx.name)}`;
  }

  return {
    reply,
    detected_mood: theme?.mood ?? 'unknown',
    // Offer the activity on the first mention only; repeated chips feel pushy.
    suggestions: theme && turn <= 2 ? theme.suggestions : [],
    new_memories: [],
    safety_concern: false,
    title: theme?.title ?? 'A quiet chat',
  };
}

const AFFIRMATIONS = [
  'I am allowed to move at my own pace today.',
  'My feelings are information, not instructions.',
  'I can be gentle with myself and still grow.',
  'Small steps still carry me forward.',
  'I deserve the same kindness I give to others.',
  'I can hold space for hard things and good things at once.',
  'Rest is part of my progress, not a pause from it.',
];
const CHALLENGES = [
  'Drink a full glass of water before your next screen.',
  'Step outside for three minutes and notice the sky.',
  'Text someone you appreciate, just because.',
  'Unclench your jaw and drop your shoulders. Notice it.',
  'Write down one thing that went right today.',
  'Take a slow 5-minute walk without your phone.',
  'Stretch your arms overhead and take three deep breaths.',
];

export function fallbackDaily(ctx: UserContext): DailyContent {
  const seed = [...ctx.today].reduce((a, c) => a + c.charCodeAt(0), 0);
  const insight = ctx.latestMood
    ? `You've been checking in with yourself lately, ${ctx.name}. That kind of noticing is where change begins.`
    : `Welcome, ${ctx.name}. Start with a quick check-in and I'll get to know you a little better each day.`;
  return {
    affirmation: AFFIRMATIONS[seed % AFFIRMATIONS.length],
    challenge: CHALLENGES[(seed + 3) % CHALLENGES.length],
    insight,
  };
}
