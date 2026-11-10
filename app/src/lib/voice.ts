import { useEffect, useState, useSyncExternalStore } from 'react';
import * as Speech from 'expo-speech';
import { makeMutable, withSequence, withTiming } from 'react-native-reanimated';
import { requireOptionalNativeModule } from 'expo';
import type { ExpoSpeechRecognitionModule as STTModule } from 'expo-speech-recognition';
import { AudioModule, createAudioPlayer, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { createRecordingOptions } from 'expo-audio/build/utils/options';
import { api } from './api';

export type VoiceGender = 'female' | 'male';
export type Tone = 'warm' | 'soft' | 'cheerful' | 'calm';

/**
 * Sol's characters: each has its own neural voice (on the server) and way of speaking,
 * so every one sounds like a different person. Picked by girl/guy, then by name.
 */
export interface Character {
  key: string;
  label: string;
  gender: VoiceGender;
  /** Its natural delivery and wording style. */
  tone: Tone;
  trait: string;
}

export const CHARACTERS: Character[] = [
  { key: 'autumn', label: 'Autumn', gender: 'female', tone: 'warm', trait: 'Warm and caring, like a close friend' },
  { key: 'diana', label: 'Diana', gender: 'female', tone: 'cheerful', trait: 'Bright, playful and full of energy' },
  { key: 'hannah', label: 'Hannah', gender: 'female', tone: 'soft', trait: 'Soft-spoken and gentle' },
  { key: 'iris', label: 'Iris', gender: 'female', tone: 'calm', trait: 'Slow, calm and grounding' },
  { key: 'daniel', label: 'Daniel', gender: 'male', tone: 'calm', trait: 'Calm and reassuring' },
  { key: 'austin', label: 'Austin', gender: 'male', tone: 'cheerful', trait: 'Easygoing and upbeat' },
  { key: 'troy', label: 'Troy', gender: 'male', tone: 'warm', trait: 'Deep, warm and steady' },
  { key: 'leo', label: 'Leo', gender: 'male', tone: 'soft', trait: 'Quiet, kind and unhurried' },
];

/** The saved character, or the default one for the chosen gender. */
export function characterFor(key: string | undefined, gender: VoiceGender = 'female'): Character {
  return CHARACTERS.find((c) => c.key === key) ?? CHARACTERS.find((c) => c.key === (gender === 'male' ? 'daniel' : 'autumn'))!;
}

export const TONES: { key: Tone; label: string; sample: string }[] = [
  { key: 'warm', label: 'Warm', sample: 'I’m really glad you’re here. Tell me how today has been.' },
  { key: 'soft', label: 'Soft', sample: 'Take your time. There’s no rush at all.' },
  { key: 'cheerful', label: 'Cheerful', sample: 'Hey you! Let’s make today a little lighter together.' },
  { key: 'calm', label: 'Calm', sample: 'Let’s slow down and look at this together, one step at a time.' },
];

// Tone shapes the voice: a slightly slower, lower delivery feels softer and more grounded.
const DELIVERY: Record<Tone, { pitch: number; rate: number }> = {
  warm: { pitch: 1.0, rate: 1.02 },
  soft: { pitch: 1.04, rate: 0.94 },
  cheerful: { pitch: 1.12, rate: 1.1 },
  calm: { pitch: 0.95, rate: 0.96 },
};

const FEMALE = /samantha|ava|allison|susan|victoria|karen|moira|tessa|fiona|martha|catherine|nicky|kate|serena|veena|zoe|joelle|evelyn|female|-iob|-iog|-tpc|-tpf|-sfg/i;
const MALE = /daniel|alex|aaron|fred|tom|oliver|arthur|rishi|gordon|evan|nathan|reed|lee|male|-iol|-iom|-tpd|-sfh/i;

let voiceCache: Speech.Voice[] | null = null;
async function pickVoice(gender: VoiceGender): Promise<string | undefined> {
  voiceCache ??= (await Speech.getAvailableVoicesAsync().catch(() => [])).filter((v) => v.language?.toLowerCase().startsWith('en'));
  const re = gender === 'female' ? FEMALE : MALE;
  const avoid = gender === 'female' ? MALE : FEMALE;
  const candidates = voiceCache.filter((v) => re.test(`${v.name} ${v.identifier}`) && !(gender === 'female' && avoid.test(v.name)));
  const best = candidates.find((v) => v.quality === Speech.VoiceQuality.Enhanced) ?? candidates[0];
  return best?.identifier;
}

export interface SpeakOptions {
  gender: VoiceGender;
  tone: Tone;
  /** Character key (see CHARACTERS); otherwise the default voice for `gender`. */
  voice?: string;
  onStart?: () => void;
  onWord?: () => void;
}

// ---------- Speaking ----------
// Sol speaks with a neural voice generated on our server (Kokoro, free and local),
// sentence by sentence so it starts quickly. If the server can't, the phone's voice takes over.
let speakToken = 0;
let stopPlayback: (() => void) | null = null;

/** Split into sentences, folding tiny fragments into their neighbour. */
function sentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && (out[out.length - 1].length < 28 || p.length < 12)) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  // Start talking sooner: a long opening sentence is voiced in two halves, split at a comma.
  const first = out[0] ?? '';
  // (The voice takes time in proportion to length, so a short first piece means Sol starts sooner.)
  const cut = first.slice(12).search(/, |\s?[—–]\s?/);
  if (first.length > 40 && cut >= 0 && cut + 12 < first.length - 12) {
    const at = cut + 12;
    const rest = first.slice(at).replace(/^(, |\s?[—–]\s?)/, '');
    out.splice(0, 1, `${first.slice(0, at)},`, rest);
  }
  return out;
}

let clip = 0;
async function fetchVoice(text: string, o: SpeakOptions): Promise<File | null> {
  try {
    const { audio } = await api.post<{ audio: string }>('/voice/speak', { text, gender: o.gender, tone: o.tone, voice: o.voice || undefined });
    const file = new File(Paths.cache, `sol-${++clip}.mp3`);
    await file.write(audio, { encoding: 'base64' });
    return file;
  } catch {
    return null;
  }
}

// ---------- The line being spoken right now (for captions) ----------
export interface SpokenLine {
  /** Same for the whole piece, even when its timing is corrected (so captions don't redraw). */
  id: number;
  text: string;
  /** When playback started (ms, Date.now()) and how long the clip lasts. */
  startedAt: number;
  duration: number;
}
let spoken: SpokenLine | null = null;
const spokenListeners = new Set<() => void>();
let lineId = 0;
/** The pieces Sol speaks `text` in, one caption each. */
export function spokenPieces(text: string): string[] {
  const parts = sentences(text.replace(/\p{Extended_Pictographic}|\uFE0F/gu, '').trim());
  return parts.length ? parts : [text];
}
/** Index of the word Sol is saying right now in `line` (spread across the clip by word length). */
export function useSpokenWord(line: SpokenLine | null): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!line) return;
    const tick = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(tick);
  }, [line]);
  if (!line) return -1;
  const words = line.text.split(/\s+/);
  const f = Math.max(0, Math.min(1, (now - line.startedAt) / line.duration));
  const ends = words.reduce<number[]>((acc, w) => [...acc, (acc[acc.length - 1] ?? 0) + w.length + 1], []);
  const total = ends[ends.length - 1] ?? 1;
  const at = ends.findIndex((e) => e / total >= f);
  return at === -1 ? words.length - 1 : at;
}
function setSpoken(line: SpokenLine | null) {
  spoken = line;
  spokenListeners.forEach((fn) => fn());
}
export function useSpokenLine(): SpokenLine | null {
  return useSyncExternalStore(
    (fn) => {
      spokenListeners.add(fn);
      return () => spokenListeners.delete(fn);
    },
    () => spoken,
  );
}

function play(file: File, text: string, onWord?: () => void, keep = false): Promise<void> {
  return new Promise((resolve) => {
    const player = createAudioPlayer(file.uri);
    // Estimate first; replaced by the real length as soon as the player knows it.
    const startedAt = Date.now();
    let timed = false;
    const id = ++lineId;
    setSpoken({ id, text, startedAt, duration: (text.length / 14) * 1000 });
    // Neural audio has no word events, so pulse the orb at a speech-like pace.
    let beat: ReturnType<typeof setTimeout> | null = null;
    const pulse = () => {
      onWord?.();
      voiceLevel.value = withSequence(withTiming(0.7, { duration: 70 }), withTiming(0, { duration: 380 }));
      beat = setTimeout(pulse, 200 + Math.random() * 180);
    };
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      if (beat) clearTimeout(beat);
      sub.remove();
      stopPlayback = null;
      player.release();
      if (!keep) file.delete();
      resolve();
    };
    const sub = player.addListener('playbackStatusUpdate', (st) => {
      if (!timed && st.duration > 0) {
        timed = true;
        setSpoken({ id, text, startedAt: Date.now() - st.currentTime * 1000, duration: st.duration * 1000 });
      }
      if (st.didJustFinish) done();
    });
    stopPlayback = () => {
      player.pause();
      done();
    };
    player.play();
    pulse();
  });
}

function speakDevice(text: string, o: SpeakOptions, voice: string | undefined): Promise<void> {
  const d = DELIVERY[o.tone];
  // When no matching voice exists on the device, a pitch shift still separates the two.
  const pitch = voice ? d.pitch : d.pitch * (o.gender === 'male' ? 0.82 : 1.08);
  return new Promise<void>((resolve) => {
    Speech.speak(text, {
      voice,
      pitch,
      rate: d.rate,
      language: 'en-US',
      onBoundary: o.onWord,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

// Once the mic is allowed, the audio session stays in play-and-record (still through the
// speaker), so there's no slow switch between Sol talking and the mic opening.
let micReady = false;
let modeKey = '';
async function audioMode(recording: boolean) {
  const key = String(recording);
  if (key === modeKey) return;
  modeKey = key;
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: recording, shouldRouteThroughEarpiece: false }).catch(() => {
    modeKey = '';
  });
}

type Recorder = InstanceType<typeof AudioModule.AudioRecorder>;
// When Sol last stopped talking: the speaker needs a moment to let go before the mic opens.
let spokeAt = 0;

// ---------- What Sol's voice is doing right now ----------
// One shared signal, so whichever orb is on screen (the tab bar's, or an exercise's own) moves
// with Sol's speech and the person's voice.
export type VoiceActivity = 'idle' | 'speaking' | 'listening';
let activity: VoiceActivity = 'idle';
const activityListeners = new Set<() => void>();
function setActivity(a: VoiceActivity) {
  if (a === activity) return;
  activity = a;
  activityListeners.forEach((fn) => fn());
}
/** 0..1: word pulses while Sol speaks, loudness while listening. */
export const voiceLevel = makeMutable(0);

export function useVoiceActivity(): VoiceActivity {
  return useSyncExternalStore(
    (fn) => {
      activityListeners.add(fn);
      return () => activityListeners.delete(fn);
    },
    () => activity,
  );
}

let speaking = 0;
/** True while Sol is talking (listening waits for it, so Sol never hears itself). */
export const isSpeaking = () => speaking > 0;

/** Speak a line as Sol. Resolves when finished (or stopped). */
export async function speak(text: string, o: SpeakOptions): Promise<void> {
  const my = ++speakToken;
  // Emoji read aloud sound odd ("sparkles"), so speak only the words.
  const parts = sentences(text.replace(/\p{Extended_Pictographic}|\uFE0F/gu, '').trim());
  if (!parts.length) return;
  // Close the mic before Sol speaks so it never records itself.
  cancelListening();
  speaking++;
  setActivity('speaking');
  try {
    await audioMode(micReady);
    await speakParts(parts, o, my);
  } finally {
    speaking--;
    spokeAt = Date.now();
    if (!speaking) {
      setActivity('idle');
      setSpoken(null);
    }
    voiceLevel.value = withTiming(0, { duration: 300 });
  }
}

async function speakParts(parts: string[], o: SpeakOptions, my: number): Promise<void> {
  let next = fetchVoice(parts[0], o);
  for (let i = 0; i < parts.length; i++) {
    const file = await next;
    if (my !== speakToken) return void file?.delete();
    if (i + 1 < parts.length) next = fetchVoice(parts[i + 1], o);
    if (!file) {
      if (i === 0) o.onStart?.();
      return speakDevice(parts.slice(i).join(' '), o, await pickVoice(o.gender));
    }
    if (i === 0) o.onStart?.();
    await play(file, parts[i], o.onWord);
    if (my !== speakToken) return;
  }
}

// ---------- Short cues, prepared ahead so they play exactly on time ----------
const cues = new Map<string, Promise<File | null>>();
const cueKey = (text: string, o: SpeakOptions) => `${o.voice ?? o.gender}|${o.tone}|${text}`;

/** Fetch cue lines now (e.g. "Breathe in"), so playCue can start them without any delay. */
export function prepareCues(texts: string[], o: SpeakOptions) {
  for (const t of texts) if (!cues.has(cueKey(t, o))) cues.set(cueKey(t, o), fetchVoice(t, o));
}

/** Play a prepared cue right now (falls back to normal speech if it isn't ready). */
export async function playCue(text: string, o: SpeakOptions): Promise<void> {
  const file = await (cues.get(cueKey(text, o)) ?? Promise.resolve(null));
  if (!file?.exists) return speak(text, o);
  cancelListening();
  speakToken++;
  stopPlayback?.();
  speaking++;
  setActivity('speaking');
  try {
    await audioMode(micReady);
    await play(file, text, o.onWord, true);
  } finally {
    speaking--;
    spokeAt = Date.now();
    if (!speaking) {
      setActivity('idle');
      setSpoken(null);
    }
  }
}

export function stopSpeaking() {
  speakToken++;
  stopPlayback?.();
  Speech.stop();
}

// ---------- Speech recognition ----------
// Two ways to hear the user:
// 1. expo-speech-recognition (on-device, live partials): installed app / dev build only.
// 2. Everywhere else (e.g. Expo Go): record with expo-audio, detect when they stop
//    talking from the mic level, and transcribe on our server with local Whisper.
const stt: typeof STTModule | null = requireOptionalNativeModule('ExpoSpeechRecognition')
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('expo-speech-recognition').ExpoSpeechRecognitionModule
  : null;

export const canListen = true;

export async function requestMic(): Promise<boolean> {
  if (stt) return (await stt.requestPermissionsAsync()).granted;
  micReady = (await requestRecordingPermissionsAsync()).granted;
  return micReady;
}

export interface ListenHandlers {
  onPartial?: (t: string) => void;
  /** 0..1 loudness, for the orb. */
  onVolume?: (v: number) => void;
  /** The mic is actually open and capturing (not just requested). */
  onReady?: () => void;
  /** Recording finished and the clip is being transcribed. */
  onTranscribing?: () => void;
}

/** Listen for one utterance; resolves with the transcript ('' if nothing was heard). */
export function listenOnce(handlers: ListenHandlers): Promise<string> {
  return stt ? listenNative(stt, handlers) : listenRecorded(handlers);
}

function listenNative(engine: typeof STTModule, handlers: ListenHandlers): Promise<string> {
  return new Promise((resolve) => {
    let latest = '';
    let done = false;
    const subs = [
      engine.addListener('result', (e) => {
        latest = e.results[0]?.transcript ?? latest;
        handlers.onPartial?.(latest);
        if (e.isFinal) {
          handlers.onTranscribing?.();
          finish();
        }
      }),
      engine.addListener('start', () => handlers.onReady?.()),
      engine.addListener('volumechange', (e) => handlers.onVolume?.(Math.max(0, Math.min(1, (e.value + 2) / 12)))),
      engine.addListener('end', () => finish()),
      engine.addListener('error', () => finish()),
    ];
    function finish() {
      if (done) return;
      done = true;
      subs.forEach((x) => x.remove());
      resolve(latest.trim());
    }
    engine.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
      addsPunctuation: true,
      volumeChangeEventOptions: { enabled: true, intervalMillis: 80 },
    });
  });
}

// The stock preset iOS and Android both accept (custom low sample rates fail to prepare on iOS);
// the server downsamples to 16 kHz for Whisper.
const recordOptions = createRecordingOptions({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });

/** Log which mic iOS chose (headphones you're wearing are used as they are: switching mid-way breaks the recording). */
async function logMic(rec: Recorder) {
  try {
    const current = await Promise.resolve(rec.getCurrentInput()).catch(() => null);
    console.log('[voice] mic:', current?.name ?? '?');
  } catch {
    // Diagnostics only.
  }
}

let stopRecording: (() => void) | null = null;
/**
 * End the current recording now, because Sol is about to speak. Recording never runs while Sol
 * talks, so anything already captured is the person's own words and is still used.
 */
export function cancelListening() {
  stopRecording?.();
}
/** How long they must be quiet before Sol replies. */
const PAUSE_MS = 1000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timed out')), ms))]);
}

async function listenRecorded(handlers: ListenHandlers): Promise<string> {
  // Wait for Sol to finish talking first.
  for (let waited = 0; isSpeaking() && waited < 30000; waited += 150) await new Promise((r) => setTimeout(r, 150));
  micReady = true;
  manualSend = false;
  // A recorder opened while (or right as) Sol's audio is still playing records almost nothing, so
  // always start a fresh one, on a freshly set session, once the speaker has let go.
  const sinceSpoke = Date.now() - spokeAt;
  if (sinceSpoke < 300) await new Promise((r) => setTimeout(r, 300 - sinceSpoke));
  modeKey = '';
  await audioMode(true);
  // AudioModule is a native object, so the lint rule can't see its members.
  // eslint-disable-next-line import/namespace
  const rec = new AudioModule.AudioRecorder(recordOptions);
  try {
    try {
      await withTimeout(rec.prepareToRecordAsync(), 3000);
    } catch {
      // The audio session can still be settling; give it a moment and retry.
      await new Promise((r) => setTimeout(r, 350));
      modeKey = '';
      await audioMode(true);
      await withTimeout(rec.prepareToRecordAsync(), 3000);
    }
    await logMic(rec);
    rec.record();
    setActivity('listening');
    console.log('[voice] recording');
    handlers.onReady?.();
    const spoke = await new Promise<boolean>((resolve) => {
      const started = Date.now();
      // Speech rises and falls with every syllable; the phone's mic boost turns the room into a
      // steady hum that can be just as loud. So speech = clearly above the room AND fluctuating.
      const recent: number[] = [];
      let level = NaN; // smoothed mic level (dB)
      let floor = NaN; // the room, including any steady hum
      let heard = false;
      let voicedRun = 0;
      let lastVoiced = started;
      let lastLog = started;
      const tick = setInterval(() => {
        const db = rec.getStatus().metering ?? -160;
        const now = Date.now();
        // Timeouts come first, so a mic that delivers nothing can never leave us waiting forever.
        const reason =
          heard && now - lastVoiced > PAUSE_MS ? 'pause' : !heard && now - started > 20000 ? 'silence' : now - started > 40000 ? 'limit' : '';
        if (reason) {
          console.log(`[voice] end (${reason}) after ${((now - started) / 1000).toFixed(1)}s`);
          return end(heard);
        }
        // The first few hundred ms (and dropouts) read as near-silence; they aren't the room.
        if (db < -100 || now - started < 120) return void handlers.onVolume?.(0);
        recent.push(db);
        if (recent.length > 8) recent.shift();
        const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
        const spread = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);
        level = Number.isNaN(level) ? db : level + (db - level) * 0.35;
        if (Number.isNaN(floor)) floor = level;
        // Thresholds sized for the phone's automatic mic boost, which squeezes a voice to just a
        // few dB above the (boosted) room.
        const voiced = recent.length >= 4 && spread > 2.2 && level > floor + 4.5;
        // Once they've started, anything clearly above the room still counts: long vowels and
        // soft words don't wobble like syllables do, and must not end the turn mid-sentence.
        const talking = voiced || (heard && level > floor + 5);
        // The room follows anything that isn't speech, so a rising hum is absorbed rather than
        // mistaken for talk; slowly while it might still be them, quickly once it clearly isn't.
        if (!voiced) floor += (level - floor) * (level < floor ? 0.4 : talking ? 0.05 : 0.12);
        voicedRun = voiced ? voicedRun + 1 : 0;
        if (voicedRun >= 3) heard = true;
        if (talking) lastVoiced = now;
        const v = Math.max(0, Math.min(1, (level - floor - 3) / 18));
        handlers.onVolume?.(v);
        voiceLevel.value = v;
        if (now - lastLog > 1000) {
          lastLog = now;
          console.log(`[voice] level ${Math.round(level)} room ${Math.round(floor)} spread ${spread.toFixed(1)} heard ${heard}`);
        }
      }, 80);
      function end(result: boolean) {
        clearInterval(tick);
        stopRecording = null;
        resolve(result);
      }
      // Stopped by hand (the "I'm done" tap): keep whatever was said.
      stopRecording = () => end(heard || manualSend);
    });
    await rec.stop();
    if (activity === 'listening') setActivity('idle');
    voiceLevel.value = 0;
    console.log('[voice] stopped; heard speech:', spoke, 'file:', rec.uri);
    handlers.onVolume?.(0);
    if (!spoke || !rec.uri) return '';
    handlers.onTranscribing?.();
    const audio = await new File(rec.uri).base64();
    const { text } = await api.post<{ text: string }>('/voice/transcribe', { audio });
    console.log('[voice] transcript:', text);
    return text.trim();
  } catch (e) {
    console.warn('[voice] failed:', (e as Error).message);
    return '';
  } finally {
    rec.release();
    if (activity === 'listening') setActivity('idle');
  }
}

let manualSend = false;
/** "I'm done talking": end the recording now and transcribe it, even if it sounded quiet. */
export function finishListening() {
  manualSend = true;
  stopRecording?.();
}

export function stopListening() {
  stt?.stop();
  stopRecording?.();
}
