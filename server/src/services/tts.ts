import { spawn } from 'node:child_process';
import { KokoroTTS } from 'kokoro-js';
import { config } from '../config.js';

// Sol's voice: Kokoro, an open neural TTS model running locally. Free, no key,
// and far warmer than the phone's built-in voices. Downloads once on first start.
let engine: Promise<KokoroTTS> | null = null;

export function warmVoice() {
  if (!engine) {
    engine = KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });
    engine.then(() => console.log('[tts] Kokoro ready')).catch((e) => console.warn('[tts] unavailable:', (e as Error).message));
  }
  return engine;
}

const VOICES = { female: 'af_heart', male: 'am_michael' } as const;
/** Each character has its own Kokoro voice, so all eight sound like different people. */
const CHARACTER_VOICES: Record<string, string> = {
  autumn: 'af_heart',
  diana: 'af_bella',
  hannah: 'af_nicole',
  iris: 'bf_emma',
  daniel: 'am_michael',
  austin: 'am_puck',
  troy: 'am_onyx',
  leo: 'bm_george',
};

/**
 * How each tone sounds. The voice models have no tone setting, so the delivery is shaped
 * here: pace, pitch and a touch of EQ (fuller and rounder for warm/calm, airy for cheerful,
 * hushed for soft).
 */
const DELIVERY: Record<string, { pitch: number; tempo: number; eq: string }> = {
  warm: { pitch: 0.99, tempo: 1.04, eq: 'bass=g=4,treble=g=-1' },
  soft: { pitch: 0.98, tempo: 0.95, eq: 'lowpass=f=5000,volume=0.85' },
  cheerful: { pitch: 1.04, tempo: 1.18, eq: 'treble=g=4' },
  calm: { pitch: 0.97, tempo: 0.97, eq: 'bass=g=3,lowpass=f=7000' },
};

function deliveryFilter(tone: string, rate: number) {
  const d = DELIVERY[tone] ?? DELIVERY.warm;
  // asetrate shifts pitch (and speed); atempo then sets the pace we actually want.
  return `asetrate=${Math.round(rate * d.pitch)},aresample=${rate},atempo=${(d.tempo / d.pitch).toFixed(3)},${d.eq}`;
}

/** Any input → small MP3 for the phone, with the tone's delivery applied. */
function encode(inputArgs: string[], input: Buffer, tone: string, rate: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [...inputArgs, '-i', 'pipe:0', '-af', deliveryFilter(tone, rate), '-b:a', '64k', '-f', 'mp3', '-loglevel', 'error', 'pipe:1']);
    const out: Buffer[] = [];
    ff.stdout.on('data', (d: Buffer) => out.push(d));
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error('could not encode audio'))));
    ff.stdin.end(input);
  });
}

// Preferred when a Groq key is set: Orpheus, a warm, expressive hosted voice.
const ORPHEUS = { female: process.env.ORPHEUS_FEMALE ?? 'autumn', male: process.env.ORPHEUS_MALE ?? 'daniel' } as const;
/** Orpheus voice per character (Groq's free tier allows ~100 clips a day, so it's opt-in). */
const ORPHEUS_FOR: Record<string, string> = { autumn: 'autumn', diana: 'diana', hannah: 'hannah', iris: 'diana', daniel: 'daniel', austin: 'austin', troy: 'troy', leo: 'austin' };
const useOrpheus = process.env.TTS_ENGINE === 'orpheus';
let orpheusOffUntil = 0;

async function orpheus(text: string, voice: string): Promise<Buffer> {
  const res = await fetch('https://api.groq.com/openai/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.groqKey}` },
    body: JSON.stringify({ model: 'canopylabs/orpheus-v1-english', voice, input: text, response_format: 'wav' }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`orpheus ${res.status} ${(await res.text()).slice(0, 160)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** `voice` is a character key (autumn, diana, …); without one, the default voice for `gender`. */
export async function synthesize(text: string, gender: 'female' | 'male', tone: string, voice?: string): Promise<Buffer> {
  if (useOrpheus && config.groqKey && Date.now() > orpheusOffUntil) {
    try {
      const wav = await orpheus(text, (voice && ORPHEUS_FOR[voice]) ?? ORPHEUS[gender]);
      // Sample rate lives at byte 24 of a WAV header.
      return await encode([], wav, tone, wav.readUInt32LE(24));
    } catch (e) {
      // Don't retry on every sentence while it's unavailable (e.g. terms not accepted yet).
      orpheusOffUntil = Date.now() + 5 * 60 * 1000;
      console.warn('[tts] Orpheus unavailable for now, using Kokoro:', (e as Error).message);
    }
  }
  const tts = await warmVoice();
  const audio = await tts.generate(text, { voice: ((voice && CHARACTER_VOICES[voice]) ?? VOICES[gender]) as 'af_heart' });
  const pcm = audio.audio as Float32Array;
  const rate = audio.sampling_rate;
  return encode(['-f', 'f32le', '-ar', String(rate), '-ac', '1'], Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength), tone, rate);
}
