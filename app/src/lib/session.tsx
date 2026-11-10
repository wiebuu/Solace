import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler } from 'react-native';
import { router, usePathname, type Href } from 'expo-router';
import { Easing, useSharedValue, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import type { OrbState } from '@/components/SolOrb';
import { api, type ChatMessage, type Conversation, type SuggestionKind, type User } from './api';
import { useAuth } from './auth';
import { askText, parseAnswer, parseTime, quickReplies, repromptText, type Flow, type FlowValues } from './flows';
import { reminderFlow, THEME_OPTIONS, themeFlow } from './flowDefs';
import { haptic } from './haptics';
import { moodByKey } from './moods';
import { formatTime } from './notifications';
import { THEMES, useTheme, type ThemeName } from './theme';
import { rememberedNow, type Memory } from './memories';
import { canListen, CHARACTERS, characterFor, finishListening, listenOnce, requestMic, speak, stopListening, stopSpeaking, type Character, type Tone, type VoiceGender } from './voice';

export interface Turn {
  id: string;
  role: 'user' | 'sol';
  text: string;
  suggestions?: ChatMessage['suggestions'];
  safety?: boolean;
}
export type SessionView = 'closed' | 'full' | 'mini';
export type SessionMode = 'voice' | 'text';

interface SessionCtx {
  view: SessionView;
  mode: SessionMode;
  orb: OrbState;
  turns: Turn[];
  partial: string;
  level: SharedValue<number>;
  kind: 'talk' | 'flow';
  flowTitle: string;
  progress: { index: number; total: number } | null;
  quick: string[];
  showTranscript: boolean;
  canListen: boolean;
  talk: (opts?: { mood?: string; reflection?: boolean; mode?: SessionMode; chat?: boolean; view?: 'full' | 'mini' }) => void;
  runFlow: (flow: Flow, opts?: { mode?: SessionMode }) => void;
  /** Run a page's questions through the live Sol (stays small and on); resolves when it's done. */
  guide: (flow: Flow) => Promise<void>;
  cancelFlow: () => void;
  /** Turn Sol on (small) if it's off. */
  ensureOn: () => void;
  /** Say something as Sol from a page, then keep listening. */
  speakHere: (text: string) => Promise<void>;
  /** Sol's current voice, for pages that prepare cues ahead of time. */
  voiceOptions: () => { gender: VoiceGender; tone: Tone; voice?: string };
  send: (text: string) => void;
  tapMic: () => void;
  setMode: (m: SessionMode) => void;
  openSuggestion: (kind: SuggestionKind) => void;
  setVoicePreview: (p: { gender?: VoiceGender; tone?: Tone; voice?: string }) => void;
  minimize: () => void;
  expand: () => void;
  /** The small orb: Sol full screen, in talking mode (not the text chat), listening. */
  openTalking: () => void;
  close: () => void;
  toggleTranscript: () => void;
  showChat: () => void;
  /** An exercise screen registers this so what the user says can press its buttons. */
  setCommandHandler: (fn: ((text: string) => boolean) | null) => void;
  /** Called when an activity screen closes; Sol (small again) picks the conversation back up. */
  activityClosed: () => void;
  /** A small ripple through Sol, e.g. while the user types or dictates. */
  nudge: () => void;
}

const Ctx = createContext<SessionCtx | null>(null);

export const SUGGESTION_ROUTES: Record<SuggestionKind, Href | null> = {
  breathing: '/breathe',
  grounding: '/grounding',
  selfcare: '/grounding',
  affirmation: '/affirmation',
  checkin: '/checkin',
  reflection: null,
};

const ESCAPE = /\b(cancel|never ?mind|stop (the )?(check-?in|exercise|questions)|(close|stop|turn off|shut) yourself|stop talking|stop listening|go quiet|close (this|the) (screen|page|exercise|check-?in)|go back|take me home)\b/;
const OFF_TOPIC = /\b(not (talking|asking) about|that'?s not what|forget (it|that)|never ?mind|something else|change (the )?subject|i don'?t want (a |any |to )?(reminder|that|this)|no,? (i mean|not that)|leave it)\b/;
const OPEN_CUES = [
  'Heyy, what’s good?',
  'Yo, I’m here. What’s up?',
  'Hey bestie, talk to me.',
  'Ayy, you’re back! What’s on your mind?',
  'Hii, I’m all ears.',
  'Hey hey, what’s the vibe today?',
  'Okay, I’m here. Spill.',
  'Hey you! How are we doing?',
  'Welcome back. What’s the tea?',
  'Hii, missed you. What’s up?',
] as const;
const pick = (lines: readonly string[]) => lines[Math.floor(Math.random() * lines.length)];

const TAB_PATHS = ['/', '/reminders', '/journey', '/profile'];

const ACTIVITY_ROUTES = ['/breathe', '/grounding', '/affirmation', '/checkin'];

type SolAction = { kind: string; value: string };
/** Screens Sol can open by name. */
const SCREENS: Record<string, Href> = {
  home: '/',
  journey: '/journey',
  profile: '/profile',
  breathe: '/breathe',
  grounding: '/grounding',
  affirmation: '/affirmation',
  checkin: '/checkin',
  reminders: '/reminders',
  memories: '/memories',
};

/** Activity screens call this so closing them returns to Sol when Sol opened them. */
export function useReturnToSol() {
  const { activityClosed } = useSession();
  const ref = useRef(activityClosed);
  useEffect(() => {
    ref.current = activityClosed;
  }, [activityClosed]);
  useEffect(() => () => ref.current(), []);
}

export function toTone(t: User['companionTone'] | undefined): Tone {
  if (t === 'gentle') return 'soft';
  if (t === 'grounded') return 'calm';
  return t ?? 'warm';
}

function greetingFor(name: string, mood?: string, reflection?: boolean) {
  if (reflection) return `Let’s take a quiet moment together, ${name}. What’s one moment from today that has stayed with you?`;
  const m = moodByKey(mood);
  if (m && (m.key === 'radiant' || m.key === 'good')) return `You checked in feeling ${m.label.toLowerCase()} today, and I love that. What’s been going well?`;
  if (m && m.key === 'okay') return 'Thanks for checking in. Okay can hold a lot of things. What’s been on your mind?';
  if (m) return `I saw today feels ${m.label.toLowerCase()}. I’m really glad you came to talk. What’s weighing on you?`;
  const h = new Date().getHours();
  const when = h < 12 ? 'this morning' : h < 18 ? 'this afternoon' : 'tonight';
  return `Hi ${name}, I’m here. How are you feeling ${when}?`;
}

let seq = 0;
const id = () => `t${++seq}`;

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user, update } = useAuth();
  const theme = useTheme();
  const [view, setView] = useState<SessionView>('closed');
  const [mode, setModeState] = useState<SessionMode>('voice');
  const [orb, setOrb] = useState<OrbState>('idle');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [partial, setPartial] = useState('');
  const [kind, setKind] = useState<'talk' | 'flow'>('talk');
  const [flowTitle, setFlowTitle] = useState('');
  const [progress, setProgress] = useState<{ index: number; total: number } | null>(null);
  const [quick, setQuick] = useState<string[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const level = useSharedValue(0);

  // Refs drive the async conversation loop without stale closures.
  const token = useRef(0);
  const modeRef = useRef<SessionMode>('voice');
  const flowRef = useRef<{ flow: Flow; values: FlowValues; index: number; onDone?: () => void; misses?: number } | null>(null);
  const convoRef = useRef<string | null>(null);
  const voiceRef = useRef<{ gender: VoiceGender; tone: Tone; voice?: string }>({ gender: 'female', tone: 'warm' });
  const pulse = useRef<ReturnType<typeof setInterval> | null>(null);
  const micAsked = useRef(false);
  const busy = useRef(false);
  // Sol appears as the Solace mark and unfolds into the sphere before its first words.
  const connecting = useRef(false);
  // True when the session exists only to run a form; flows started mid-talk return to talk.
  const flowOnly = useRef(false);

  useEffect(() => {
    const c = characterFor(user?.voiceName, user?.voiceGender);
    voiceRef.current = { gender: c.gender, tone: toTone(user?.companionTone ?? c.tone), voice: c.key };
  }, [user?.voiceGender, user?.companionTone, user?.voiceName]);

  const push = useCallback((t: Omit<Turn, 'id'>) => setTurns((all) => [...all, { ...t, id: id() }]), []);

  const stopPulse = useCallback(() => {
    if (pulse.current) clearInterval(pulse.current);
    pulse.current = null;
    level.set(0);
  }, [level]);

  /** Sol says a line: shown in the transcript and spoken aloud in voice mode. */
  // Which screen is open, so Sol knows what "this" means.
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  /** Leave the screen they're on: back to where they came from, or Home from a tab. */
  const closeScreen = useCallback(() => {
    const p = pathRef.current;
    setView((v) => (v === 'full' ? 'mini' : v));
    if (TAB_PATHS.includes(p) && p !== '/') router.navigate('/');
    else if (p !== '/' && router.canGoBack()) router.back();
    else router.navigate('/');
  }, []);

  // Set by an exercise screen while it's open, so spoken answers drive it.
  const commandRef = useRef<((text: string) => boolean) | null>(null);
  const listening = useRef(false);
  const micStopped = useRef(false);
  const listenRef = useRef<(retry?: boolean) => void>(() => {});

  const say = useCallback(
    async (text: string, extra: Partial<Turn> = {}) => {
      const my = token.current;
      if (connecting.current) {
        connecting.current = false;
        await new Promise((r) => setTimeout(r, 700));
        if (my !== token.current) return false;
      }
      push({ role: 'sol', text, ...extra });
      if (modeRef.current !== 'voice') {
        setOrb('idle');
        return my === token.current;
      }
      setOrb('speaking');
      // Each spoken word sends a soft pulse through the particles.
      const pulse = () => level.set(withSequence(withTiming(0.7, { duration: 70 }), withTiming(0, { duration: 380, easing: Easing.out(Easing.quad) })));
      await speak(text, { ...voiceRef.current, onWord: pulse });
      stopPulse();
      if (my !== token.current) return false;
      setOrb('idle');
      return true;
    },
    [push, stopPulse, level],
  );

  const handleRef = useRef<(text: string) => void>(() => {});

  /** Hands-free: after Sol speaks, listen for the reply (where speech recognition exists). */
  // Sol sent the user to an activity; bring Sol back when it closes.
  const returnToSol = useRef(false);
  /** `retry`: re-opening after silence, so no "your turn" buzz again. */
  const listen = useCallback(async (retry = false) => {
    if (modeRef.current !== 'voice' || !canListen || listening.current) return;
    const my = token.current;
    if (!micAsked.current) {
      micAsked.current = true;
      const ok = await requestMic().catch((e) => (console.warn('[voice] permission error:', (e as Error).message), false));
      console.log('[voice] mic permission:', ok);
      if (!ok) {
        setModeState('text');
        modeRef.current = 'text';
        return;
      }
    }
    setOrb('listening');
    setPartial('');
    listening.current = true;
    micStopped.current = false;
    let heard = '';
    try {
      heard = await listenOnce({
        onPartial: setPartial,
        onVolume: (v) => level.set(v),
        // Haptics mark the real moments: the mic is open, and Sol has your words.
        onReady: () => !retry && my === token.current && haptic.medium(),
        onTranscribing: () => {
          if (my !== token.current) return;
          haptic.soft();
          setOrb('thinking');
        },
      });
    } finally {
      listening.current = false;
    }
    level.set(0);
    setPartial('');
    if (my !== token.current) return;
    setOrb('idle');
    if (heard) return handleRef.current(heard);
    // Heard nothing usable: keep the mic open, unless they switched it off themselves.
    if (!micStopped.current) setTimeout(() => my === token.current && listenRef.current(true), 150);
  }, [level]);
  useEffect(() => {
    listenRef.current = listen;
  }, [listen]);

  const sayThenListen = useCallback(
    async (text: string, extra?: Partial<Turn>) => {
      if (await say(text, extra)) listen();
    },
    [say, listen],
  );

  const reset = useCallback(() => {
    token.current++;
    stopSpeaking();
    stopListening();
    stopPulse();
    busy.current = false;
    flowRef.current = null;
    convoRef.current = null;
    setTurns([]);
    setPartial('');
    setQuick([]);
    setProgress(null);
    setOrb('idle');
  }, [stopPulse]);

  /** A tiny vocal cue in Sol's own voice, so you hear it arrive and leave. */
  const cue = useCallback((lines: readonly string[]) => {
    speak(lines[Math.floor(Math.random() * lines.length)], { ...voiceRef.current }).catch(() => {});
  }, []);

  // Closing is quiet: no goodbye line.
  const close = useCallback(() => {
    reset();
    setView('closed');
    setShowTranscript(false);
  }, [reset]);

  // ---------- Guided flows ----------
  const nextStep = useCallback((flow: Flow, values: FlowValues, from: number) => {
    let i = from;
    while (i < flow.steps.length && (values[flow.steps[i].key] !== undefined || (flow.steps[i].when && !flow.steps[i].when!(values)))) i++;
    return i;
  }, []);

  const askCurrent = useCallback(
    (prefix = '') => {
      const f = flowRef.current;
      if (!f) return;
      const step = f.flow.steps[f.index];
      const asked = f.flow.steps.filter((s) => !s.when || s.when(f.values));
      setProgress({ index: asked.indexOf(step) + 1, total: asked.length });
      setQuick(quickReplies(step));
      sayThenListen(`${prefix ? `${prefix} ` : ''}${askText(step, f.values)}`.trim());
    },
    [sayThenListen],
  );

  const finishFlow = useCallback(
    async (prefix: string) => {
      const f = flowRef.current;
      if (!f) return;
      const my = token.current;
      setQuick([]);
      setOrb('thinking');
      let closing: string;
      try {
        closing = await f.flow.onComplete(f.values);
      } catch (e) {
        closing = `Hmm, I couldn’t save that: ${(e as Error).message}`;
      }
      flowRef.current = null;
      haptic.success();
      if (my !== token.current) return;
      setKind('talk');
      setFlowTitle('');
      setProgress(null);
      // Sol never closes by itself: it says how it went, the page can close, and it keeps listening.
      await say(`${prefix ? `${prefix} ` : ''}${closing}`.trim());
      f.onDone?.();
      if (my === token.current) listen();
    },
    [say, listen],
  );

  const answerFlow = useCallback(
    (text: string) => {
      const f = flowRef.current;
      if (!f) return;
      const step = f.flow.steps[f.index];
      const res = parseAnswer(step, text);
      if (!res.ok) {
        // Not an answer: if they've moved on ("I'm not talking about that") or it's the second
        // miss, drop the questions and just talk. Never ask the same thing over and over.
        if (OFF_TOPIC.test(text.toLowerCase()) || (f.misses ?? 0) >= 1) {
          flowRef.current = null;
          setKind('talk');
          setFlowTitle('');
          setProgress(null);
          setQuick([]);
          return 'talk' as const;
        }
        f.misses = (f.misses ?? 0) + 1;
        return void sayThenListen(repromptText(step));
      }
      f.misses = 0;
      f.values = { ...f.values, [step.key]: res.value };
      f.flow.onAnswer?.(step.key, res.value, f.values);
      haptic.tap();
      const ack = step.ack?.(res.value, f.values) ?? '';
      f.index = nextStep(f.flow, f.values, f.index + 1);
      if (f.index >= f.flow.steps.length) finishFlow(ack);
      else askCurrent(ack);
    },
    [sayThenListen, nextStep, finishFlow, askCurrent],
  );

  const open = useCallback(
    (m?: SessionMode, opts: { chat?: boolean; view?: 'full' | 'mini' } = {}) => {
      reset();
      const md = m ?? (user?.preferVoice === false ? 'text' : 'voice');
      modeRef.current = md;
      setModeState(md);
      setShowTranscript(md === 'text' || Boolean(opts.chat));
      connecting.current = true;
      setOrb('connecting');
      setView(opts.view ?? 'full');
    },
    [reset, user?.preferVoice],
  );

  /** Load the one continuous chat into the transcript; returns what Sol should say, if anything. */
  const openChat = useCallback(async (opener?: string) => {
    const name = user?.name.split(' ')[0] ?? 'friend';
    const { conversation, spoken } = await api.post<{ conversation: Conversation; spoken: string | null }>('/conversations/current', {
      opener,
      greeting: greetingFor(name),
    });
    convoRef.current = conversation._id;
    // The last message is the one Sol is about to say; it's added as Sol speaks.
    const msgs = spoken ? conversation.messages.slice(0, -1) : conversation.messages;
    setTurns(msgs.map((m) => ({ id: id(), role: m.role === 'user' ? 'user' : 'sol', text: m.content, suggestions: m.suggestions, safety: m.safety })));
    return spoken;
  }, [user?.name]);

  /** Make sure Sol is on (small, listening) without restarting a conversation that's already going. */
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const ensureOn = useCallback(() => {
    if (viewRef.current !== 'closed') return;
    reset();
    modeRef.current = 'voice';
    setModeState('voice');
    setShowTranscript(false);
    setKind('talk');
    setFlowTitle('');
    flowOnly.current = false;
    connecting.current = false;
    viewRef.current = 'mini';
    setView('mini');
    openChat().catch(() => {});
  }, [reset, openChat]);

  /**
   * A page speaks through Sol (one voice for the whole app); Sol listens again afterwards. Only
   * while Sol is on: a page never switches Sol on by itself, so with Sol off this stays silent.
   */
  const speakHere = useCallback(
    async (text: string) => {
      if (viewRef.current === 'closed') return;
      await sayThenListen(text);
    },
    [sayThenListen],
  );

  /**
   * A page asks its questions through the live Sol: each answer fills the page (onAnswer), the
   * flow's onComplete saves and returns Sol's closing words. Resolves once those words are said,
   * so the page can close itself; Sol stays on.
   */
  const guide = useCallback(
    (flow: Flow) =>
      new Promise<void>((resolve) => {
        // Sol is off: the page is used by hand; it starts guiding only once Sol is switched on.
        if (viewRef.current === 'closed') return;
        setKind('flow');
        setFlowTitle(flow.title);
        const values = { ...(flow.initial ?? {}) };
        flowRef.current = { flow, values, index: nextStep(flow, values, 0), onDone: resolve };
        if (flowRef.current.index >= flow.steps.length) return void finishFlow('');
        askCurrent(flow.intro ?? '');
      }),
    [nextStep, askCurrent, finishFlow],
  );

  /** Stop a guided flow (e.g. the page was finished by hand). */
  const cancelFlow = useCallback(() => {
    if (!flowRef.current) return;
    flowRef.current = null;
    setKind('talk');
    setFlowTitle('');
    setProgress(null);
    setQuick([]);
  }, []);

  const runFlow = useCallback(
    (flow: Flow, opts?: { mode?: SessionMode }) => {
      open(opts?.mode);
      flowOnly.current = true;
      setKind('flow');
      setFlowTitle(flow.title);
      const values = { ...(flow.initial ?? {}) };
      flowRef.current = { flow, values, index: nextStep(flow, values, 0) };
      if (flowRef.current.index >= flow.steps.length) return void finishFlow('');
      askCurrent(flow.intro ?? '');
    },
    [open, nextStep, askCurrent, finishFlow],
  );

  /** Switch Sol to one of the characters (voice + its natural tone). */
  const pickCharacter = useCallback(
    (c: Character) => {
      voiceRef.current = { gender: c.gender, tone: c.tone, voice: c.key };
      update({ voiceGender: c.gender, voiceName: c.key, companionTone: c.tone }).catch(() => {});
    },
    [update],
  );

  // ---------- "Do anything" commands while talking ----------
  const tryIntent = useCallback(
    async (text: string): Promise<boolean> => {
      const t = text.toLowerCase();
      const words = t.split(/\s+/).length;
      const commandy = words <= 6 || /^(please |can you |could you |let'?s |let me |i want to |i'?d like to |open |start |show |take me |go to |set |change |switch |make |remind )/.test(t);
      // Ending and pausing must always work, however it's phrased, so check before the command gate.
      if (/\b(bye|goodbye|good night|that'?s all|(end|close|exit|quit|stop) (the |this )?(chat|conversation|session)|(close|stop|turn off|switch off|shut) yourself|go quiet|stop talking to me|don'?t listen to me|turn (yourself|it|sol) off|turn off(?! (your |the )?(memory|remembering|reminders?|notifications?|dark|light|mode))|switch (yourself )?off|shut (yourself )?(down|off)|go to sleep|go away|leave me alone)\b/.test(t)) {
        // Closing is quiet: no goodbye line.
        close();
        return true;
      }
      if (/\b(close|exit|leave|shut) (this|the|that) (screen|page|tab|exercise)\b|\bgo back\b/.test(t)) {
        closeScreen();
        await sayThenListen('Done.');
        return true;
      }
      if (/\b(take me|go|back) (back )?(to )?home\b|\bhome (screen|page)\b/.test(t)) {
        setView((v) => (v === 'full' ? 'mini' : v));
        router.navigate('/');
        await sayThenListen('Here’s home.');
        return true;
      }
      if (/\b(stop|pause|quit) listening\b|\bmute (yourself|the mic)\b|\b(mic|microphone) off\b|\bdon'?t listen\b/.test(t)) {
        micStopped.current = true;
        await say('Okay, I’ll stop listening. Tap me when you want to talk.');
        return true;
      }
      // Theme requests often come inside longer sentences, so check them before the command gate.
      const aboutLook = /\b(theme|dark mode|light mode|colou?r scheme|colou?rs? of the app|app colou?rs?|look of the app|appearance)\b/.test(t);
      const shade = /\b(lighter|brighter|darker|dark|light)\b/.test(t) && /\b(app|screen|theme|mode|colou?rs?|look)\b/.test(t);
      if (aboutLook || shade) {
        const hit = THEME_OPTIONS.find((o) => [o.label, ...(o.synonyms ?? [])].some((w) => new RegExp(`\\b${w.toLowerCase()}\\b`).test(t)));
        let name = hit?.value as ThemeName | undefined;
        if (!name && /\b(darker|dark)\b/.test(t)) name = 'ember';
        if (!name && /\b(lighter|brighter|light)\b/.test(t)) name = theme.name === 'sunrise' ? 'honey' : 'sunrise';
        if (name) {
          theme.setTheme(name);
          await sayThenListen(name === 'ember' ? 'Switched to Ember, the dark theme. How does it feel?' : `Switched to ${THEMES[name].label}. How does it feel?`);
          return true;
        }
        // No particular look named: let them pick, previewing each as they answer.
        const before = theme.name;
        setKind('flow');
        setFlowTitle('Theme');
        const flow = themeFlow({
          onAnswer: (_k, v) => theme.setTheme(v as ThemeName),
          onComplete: async (v) => {
            const chosen = v.theme as ThemeName;
            if (!chosen) theme.setTheme(before);
            return `${THEMES[chosen]?.label ?? 'Done'}, lovely.`;
          },
        });
        flowRef.current = { flow, values: {}, index: 0 };
        askCurrent('Sure.');
        return true;
      }
      if (!commandy) return false;
      // Sol shrinks into the floating helper, takes the user there, and keeps listening.
      const goTo = async (href: Href, line: string) => {
        const activity = ACTIVITY_ROUTES.includes(String(href));
        returnToSol.current = activity;
        setView('mini');
        router.navigate(href);
        // Exercises introduce themselves through Sol; a second line would talk over them.
        if (!activity) await sayThenListen(line);
      };

      // Only an actual request (not just mentioning reminders, or saying it isn't about them).
      if ((/\bremind me\b|\b(set|add|create|make|new|need) (a |an |another )?reminder\b/.test(t)) && !OFF_TOPIC.test(t) && !/\b(not|don'?t|no)\b.*\breminder/.test(t)) {
        const title = text.match(/remind me (?:to |about )?(.+?)(?: at | every | in the | tonight| tomorrow|$)/i)?.[1]?.trim();
        const time = parseTime(t.replace(/.*?\b(at|every day at)\b/, ''));
        const save = async (v: FlowValues) => {
          const tm = v.time as { hour: number; minute: number };
          const reminder = { id: `custom-${Date.now()}`, kind: 'custom' as const, title: String(v.title), body: 'A gentle nudge from Sol', hour: tm.hour, minute: tm.minute, enabled: true };
          await update({ reminders: [...(user?.reminders ?? []), reminder] });
          return `Done. I’ll remind you to ${String(v.title).replace(/^to /, '')} at ${formatTime(tm.hour, tm.minute)} every day.`;
        };
        if (title && time && /\d|noon|morning|evening|night/.test(t)) {
          setOrb('thinking');
          await say(await save({ title, time }));
          listen();
        } else {
          setKind('flow');
          setFlowTitle('New reminder');
          const flow = reminderFlow({ initial: title ? { title } : undefined, onComplete: save });
          flowRef.current = { flow, values: { ...(flow.initial ?? {}) }, index: nextStep(flow, flow.initial ?? {}, 0) };
          askCurrent('Sure.');
        }
        return true;
      }
      if (/\b(check ?in|log (my )?mood|track (my )?mood|mood check)\b/.test(t)) return goTo('/checkin', ''), true;
      if (/\b(what can you do|what can i do|help me use|how does (this|the) app work|what('?s| is) in (this|the) app|show me around|features)\b/.test(t) || t === 'help') {
        await sayThenListen(
          'Quite a lot. I can log a check-in with you, set reminders, guide breathing or grounding, read your affirmation, show your journey, and change my voice or the app’s colours. Just tell me, like “remind me to drink water at 4” or “open breathing”. Or simply talk to me about your day.',
        );
        return true;
      }
      const toggleMemory = /\b(turn|switch) (off|on) (your )?memory\b|\b(stop|start) remembering\b|\bforget (everything|me)\b/.exec(t);
      if (toggleMemory) {
        const on = /\bon\b|start/.test(toggleMemory[0]);
        await update({ memoryEnabled: on });
        await sayThenListen(on ? 'Okay, I’ll remember the little things you share.' : 'Done. I won’t keep new notes from our talks.');
        return true;
      }
      if (/\b(what do you (know|remember)|my memories|what sol knows)\b/.test(t)) return goTo('/memories', 'Here’s what I remember. You can erase anything.'), true;
      if (/\b(my )?reminders\b/.test(t) && !/\bremind me\b/.test(t)) return goTo('/reminders', 'Here are your reminders.'), true;
      if (/\b(settings|profile|preferences|account|you tab)\b/.test(t)) return goTo('/profile', 'Here are your settings.'), true;
      if (/\b(past|old|previous) (chats?|conversations?|talks?)\b|\b(chat|conversation) history\b|\bour chat\b/.test(t)) {
        // There's one ongoing chat: show it in Sol's page.
        setShowTranscript(true);
        setView('full');
        await sayThenListen('Here’s our chat.');
        return true;
      }
      if (/\b(go )?(home|today)( (tab|screen|page))?$/.test(t) && /\b(go|open|show|take)\b/.test(t)) return goTo('/', 'Back to today.'), true;
      if (/\bbreath|breathing\b/.test(t)) return goTo('/breathe', 'Let’s breathe together. I’ll be right here.'), true;
      if (/\bground(ing)?\b|5 4 3 2 1/.test(t)) return goTo('/grounding', 'Let’s ground you, one sense at a time.'), true;
      if (/\baffirmation\b/.test(t)) return goTo('/affirmation', 'Here’s your affirmation for today.'), true;
      if (/\b(journey|progress|streak|stats|insights|my moods?)\b/.test(t)) return goTo('/journey', 'Here’s how your journey is looking.'), true;
      // A voice by name ("use Troy's voice") or by kind ("a guy's voice").
      const named = CHARACTERS.find((v) => new RegExp(`\\b${v.key}('?s)?\\b`).test(t));
      if (named && /\b(voice|sound|talk|speak|switch|use|change|be)\b/.test(t)) {
        pickCharacter(named);
        await sayThenListen(`Hi, I'm ${named.label}. How does this sound?`);
        return true;
      }
      const gender: VoiceGender | null = /\b(guy|man|male|boy)('?s)?\b/.test(t) ? 'male' : /\b(girl|woman|female|lady)('?s)?\b/.test(t) ? 'female' : null;
      const tone = (['warm', 'soft', 'cheerful', 'calm'] as Tone[]).find((x) => new RegExp(`\\b${x}(er)?\\b`).test(t));
      if ((gender || tone) && /\b(voice|sound|tone|talk|speak|be)\b/.test(t)) {
        if (gender && gender !== voiceRef.current.gender) pickCharacter(characterFor(undefined, gender));
        if (tone) {
          voiceRef.current = { ...voiceRef.current, tone };
          update({ companionTone: tone }).catch(() => {});
        }
        await sayThenListen('Okay, how’s this? I can change it again anytime.');
        return true;
      }
      return false;
    },
    [say, sayThenListen, listen, close, update, user?.reminders, nextStep, askCurrent, theme, pickCharacter, closeScreen],
  );

  // ---------- Actions the AI asks for ----------
  /** Carry out an action from Sol's reply; returns what to do after speaking. */
  const runAction = useCallback(
    (a: SolAction): 'listen' | 'quiet' | 'close' | 'page' => {
      const v = a.value;
      switch (a.kind) {
        case 'set_theme':
          if (v in THEMES) theme.setTheme(v as ThemeName);
          return 'listen';
        case 'set_voice': {
          const c = CHARACTERS.find((x) => x.key === v) ?? (v === 'male' || v === 'female' ? characterFor(undefined, v) : undefined);
          if (c) pickCharacter(c);
          return 'listen';
        }
        case 'set_tone':
          if (['warm', 'soft', 'cheerful', 'calm'].includes(v)) {
            voiceRef.current = { ...voiceRef.current, tone: v as Tone };
            update({ companionTone: v as Tone }).catch(() => {});
          }
          return 'listen';
        case 'set_memory':
          update({ memoryEnabled: v !== 'off' }).catch(() => {});
          return 'listen';
        case 'open_screen': {
          const href = SCREENS[v];
          if (!href) return 'listen';
          const activity = ACTIVITY_ROUTES.includes(String(href));
          returnToSol.current = activity;
          setView('mini');
          router.navigate(href);
          // Exercises speak for themselves through Sol, so Sol's own reply stays in the chat only.
          return activity ? 'page' : 'listen';
        }
        case 'close_screen':
          closeScreen();
          return 'listen';
        case 'end_chat':
          return 'close';
        case 'stop_listening':
          return 'quiet';
        default:
          return 'listen';
      }
    },
    [theme, update, pickCharacter, closeScreen],
  );

  // ---------- Free conversation ----------
  const answerTalk = useCallback(
    async (text: string) => {
      if (await tryIntent(text)) return;
      const my = token.current;
      setOrb('thinking');
      try {
        if (!convoRef.current) {
          const { conversation } = await api.post<{ conversation: Conversation }>('/conversations/current', {});
          convoRef.current = conversation._id;
        }
        const res = await api.post<{ message: ChatMessage; action?: SolAction; memories?: Memory[] }>(`/conversations/${convoRef.current}/messages`, { content: text, screen: pathRef.current });
        // Whatever Sol just learned shows in the app right away.
        rememberedNow(res.memories ?? []);
        if (my !== token.current) return;
        const extra = { suggestions: res.message.suggestions, safety: res.message.safety };
        // The AI may also ask the app to do something (it understands any phrasing).
        const next = res.action ? runAction(res.action) : 'listen';
        if (next === 'close') return close();
        if (next === 'page') {
          push({ role: 'sol', text: res.message.content, ...extra });
          return;
        }
        if (next === 'quiet') {
          micStopped.current = true;
          return void (await say(res.message.content, extra));
        }
        await sayThenListen(res.message.content, extra);
      } catch (e) {
        if (my === token.current) await say((e as Error).message);
      }
    },
    [tryIntent, say, sayThenListen, runAction, close, push],
  );

  const handle = useCallback(
    (text: string) => {
      const body = text.trim();
      if (!body || busy.current) return;
      // An open exercise gets first say ("I see one", "start", "next"); it answers in its own way.
      if (commandRef.current?.(body)) {
        haptic.soft();
        if (modeRef.current === 'voice') setTimeout(() => listenRef.current(true), 250);
        return;
      }
      busy.current = true;
      stopSpeaking();
      push({ role: 'user', text: body });
      setQuick([]);
      // Mid-questions, "cancel", "close yourself", "close this page" etc. still work as commands.
      if (flowRef.current && ESCAPE.test(body.toLowerCase())) {
        flowRef.current = null;
        setKind('talk');
        setFlowTitle('');
        setProgress(null);
      }
      const run = flowRef.current
        ? Promise.resolve(answerFlow(body)).then((r) => (r === 'talk' ? answerTalk(body) : undefined))
        : answerTalk(body);
      Promise.resolve(run).finally(() => (busy.current = false));
    },
    [push, answerFlow, answerTalk],
  );
  useEffect(() => {
    handleRef.current = handle;
  }, [handle]);

  const talk = useCallback<SessionCtx['talk']>(
    async (opts = {}) => {
      open(opts.mode, { chat: opts.chat, view: opts.view });
      flowOnly.current = false;
      setKind('talk');
      setFlowTitle('');
      const my = token.current;
      // Plain open (Sol was off, e.g. the small orb or a fresh app start): a quick hello, then the mic.
      // The chat loads alongside, so nothing waits on the network.
      if (!opts.mood && !opts.reflection && modeRef.current === 'voice') {
        connecting.current = false;
        openChat()
          .catch(() => null)
          .then(() => {
            if (my === token.current) sayThenListen(pick(OPEN_CUES));
          });
        return;
      }
      const name = user?.name.split(' ')[0] ?? 'friend';
      // Same chat every time: Sol only speaks first for a reason (a check-in, a reflection) or the very first chat.
      const opener = opts.mood || opts.reflection ? greetingFor(name, opts.mood, opts.reflection) : undefined;
      let spoken: string | null = null;
      try {
        spoken = await openChat(opener);
      } catch {
        spoken = opener ?? null;
      }
      if (my !== token.current) return;
      if (spoken) return sayThenListen(spoken);
      // A little "Mm?" as the orb unfolds, then straight to listening (which waits for it to finish).
      connecting.current = false;
      cue(OPEN_CUES);
      await new Promise((r) => setTimeout(r, 400));
      if (my !== token.current) return;
      setOrb('idle');
      listen();
    },
    [open, user?.name, sayThenListen, openChat, listen, cue],
  );

  const tapMic = useCallback(() => {
    haptic.soft();
    if (orb === 'speaking') {
      // Interrupt Sol and hand the floor to the user.
      token.current++;
      stopSpeaking();
      stopPulse();
      setOrb('idle');
      listen();
    } else if (orb === 'listening') {
      // Tapping while Sol listens means "I'm done, go ahead" (it replies to what it heard).
      finishListening();
    } else if (modeRef.current === 'text') {
      modeRef.current = 'voice';
      setModeState('voice');
      listen();
    } else {
      listen();
    }
  }, [orb, listen, stopPulse]);

  const setMode = useCallback(
    (m: SessionMode) => {
      modeRef.current = m;
      setModeState(m);
      if (m === 'voice') {
        setShowTranscript(false);
        if (orb === 'idle') listen();
      } else {
        stopSpeaking();
        stopListening();
        stopPulse();
        setOrb('idle');
        setShowTranscript(true);
      }
    },
    [stopPulse, orb, listen],
  );

  const nudge = useCallback(() => level.set(withSequence(withTiming(0.45, { duration: 60 }), withTiming(0, { duration: 420, easing: Easing.out(Easing.quad) }))), [level]);

  const openSuggestion = useCallback(
    (k: SuggestionKind) => {
      const href = SUGGESTION_ROUTES[k];
      if (href) {
        returnToSol.current = true;
        setView('mini');
        router.push(href);
      } else handle('Can you guide me through a short reflection?');
    },
    [handle],
  );

  const setCommandHandler = useCallback((fn: ((text: string) => boolean) | null) => {
    commandRef.current = fn;
  }, []);

  // Android back gesture minimises Sol instead of leaving the screen.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (view !== 'full') return false;
      setView('mini');
      return true;
    });
    return () => sub.remove();
  }, [view]);

  const openTalking = useCallback(() => {
    if (viewRef.current === 'closed') return void talk({ mode: 'voice' });
    setView('full');
    setShowTranscript(false);
    if (modeRef.current !== 'voice') return setMode('voice');
    if (orb === 'idle') listen();
  }, [talk, setMode, orb, listen]);

  const value = useMemo<SessionCtx>(
    () => ({
      view, mode, orb, turns, partial, level, kind, flowTitle, progress, quick, showTranscript, canListen,
      talk, runFlow, send: handle, tapMic, setMode, openSuggestion,
      setVoicePreview: (p) => (voiceRef.current = { ...voiceRef.current, ...p }),
      minimize: () => setView((v) => (v === 'full' ? 'mini' : v)),
      expand: () => setView((v) => (v === 'mini' ? 'full' : v)),
      openTalking,
      close,
      toggleTranscript: () => setShowTranscript((s) => !s),
      showChat: () => setShowTranscript(true),
      setCommandHandler,
      guide,
      cancelFlow,
      ensureOn,
      speakHere,
      voiceOptions: () => voiceRef.current,
      activityClosed: () => {
        if (!returnToSol.current) return;
        returnToSol.current = false;
        if (modeRef.current === 'voice') setTimeout(() => listenRef.current(), 600);
      },
      nudge,
    }),
    [view, mode, orb, turns, partial, level, kind, flowTitle, progress, quick, showTranscript, openTalking, talk, runFlow, handle, tapMic, setMode, openSuggestion, close, nudge, setCommandHandler, guide, cancelFlow, ensureOn, speakHere],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession must be used inside SessionProvider');
  return s;
}
