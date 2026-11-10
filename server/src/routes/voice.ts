import { Router } from 'express';
import { z } from 'zod';
import { transcribe } from '../services/stt.js';
import { synthesize } from '../services/tts.js';

export const voiceRouter = Router();

const Body = z.object({ audio: z.string().min(1) });

/** Recorded speech (base64) → text. Used where the phone has no on-device recognizer (Expo Go). */
voiceRouter.post('/transcribe', async (req, res) => {
  const { audio } = Body.parse(req.body);
  const clip = Buffer.from(audio, 'base64');
  const { text, language } = await transcribe(clip);
  console.log(`[stt] ${Math.round(clip.length / 1024)} KB → (${language}) "${text}"`);
  res.json({ text, language });
});

const SpeakBody = z.object({
  text: z.string().min(1).max(1000),
  gender: z.enum(['female', 'male']).default('female'),
  tone: z.string().default('warm'),
  voice: z.string().max(20).optional(),
});

/** Text → Sol's neural voice (MP3, base64). The app falls back to the phone's voice if this fails. */
voiceRouter.post('/speak', async (req, res) => {
  const { text, gender, tone, voice } = SpeakBody.parse(req.body);
  const mp3 = await synthesize(text, gender, tone, voice);
  res.json({ audio: mp3.toString('base64') });
});
