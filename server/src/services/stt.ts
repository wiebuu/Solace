import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

// Speech-to-text runs locally with Whisper (transformers.js): free, private, no API key.
// The model (~150 MB) downloads once on first start and is cached afterwards.
const MODEL = process.env.WHISPER_MODEL ?? 'onnx-community/whisper-base.en';
let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

export function warmSpeech() {
  // Cast through unknown: the pipeline() overloads are too large for TypeScript to infer here.
  const load = pipeline as unknown as (task: string, model: string, o: object) => Promise<AutomaticSpeechRecognitionPipeline>;
  if (!asr) {
    asr = load('automatic-speech-recognition', MODEL, { dtype: 'q8' });
    asr.then(() => console.log(`[stt] ${MODEL} ready`)).catch((e) => console.warn('[stt] unavailable:', (e as Error).message));
  }
  return asr;
}

/** Decode any recorded format (m4a, wav, 3gp…) to 16 kHz mono float PCM with ffmpeg. */
function decode(audio: Buffer): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-i', 'pipe:0', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-loglevel', 'error', 'pipe:1']);
    const out: Buffer[] = [];
    ff.stdout.on('data', (d: Buffer) => out.push(d));
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error('could not decode audio'));
      const pcm = Buffer.concat(out);
      resolve(new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4)));
    });
    ff.stdin.end(audio);
  });
}

// Whisper hallucinates these on silence; treat them as "heard nothing".
const NOISE = /^\s*(\[.*\]|\(.*\)|you\.?|thank you\.?|(thank you|thanks) (so much )?for watching[.!]?|please subscribe[.!]?|the\.?|a\.?|uh+\.?|um+\.?|hmm+\.?|\.+)\s*$/i;

export interface Heard {
  text: string;
  /** Language code, e.g. "en", "hi". */
  language: string;
}

/** Groq's hosted Whisper large-v3: far more accurate than running locally, and still fast. */
async function transcribeGroq(audio: Buffer): Promise<Heard> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/m4a' }), 'speech.m4a');
  form.append('model', 'whisper-large-v3');
  // English only for now (other languages are understood and turned into English).
  form.append('language', 'en');
  form.append('response_format', 'json');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.groqKey}` },
    body: form,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`groq stt ${res.status}`);
  const text = ((await res.json()) as { text?: string }).text?.trim() ?? '';
  return { text, language: 'en' };
}

export async function transcribe(audio: Buffer): Promise<Heard> {
  if (config.groqKey) {
    try {
      const { text, language } = await transcribeGroq(audio);
      return { text: NOISE.test(text) ? '' : text, language };
    } catch (e) {
      console.warn('[stt] groq failed, using local Whisper:', (e as Error).message);
    }
  }
  const pcm = await decode(audio);
  if (pcm.length < 16000 * 0.3) return { text: '', language: 'en' };
  const model = await warmSpeech();
  const out = (await model(pcm)) as { text: string };
  const text = out.text.trim();
  return { text: NOISE.test(text) ? '' : text, language: 'en' };
}
