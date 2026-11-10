import { Router, type Request } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { Memory } from '../models/Memory.js';
import { Mood } from '../models/Mood.js';
import { Conversation } from '../models/Conversation.js';
import { Activity } from '../models/Activity.js';
import { Assessment } from '../models/Assessment.js';
import { Daily } from '../models/Daily.js';
import { uid } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';

export const meRouter = Router();

export function publicUser(u: InstanceType<typeof User>) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    goals: u.goals,
    companionTone: u.companionTone,
    voiceGender: u.voiceGender,
    voiceName: u.voiceName,
    preferVoice: u.preferVoice,
    memoryEnabled: u.memoryEnabled,
    reminders: u.reminders,
    onboarded: u.onboarded,
    location: u.location,
    createdAt: u.get('createdAt'),
  };
}

async function load(req: Request) {
  const user = await User.findById(uid(req));
  if (!user) throw new HttpError(404, 'User not found');
  return user;
}

meRouter.get('/', async (req, res) => {
  res.json({ user: publicUser(await load(req)) });
});

const reminderSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['checkin', 'affirmation', 'breathing', 'selfcare', 'custom']),
  title: z.string().trim().min(1).max(60),
  body: z.string().max(140).default(''),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  enabled: z.boolean(),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  goals: z.array(z.string().max(40)).max(8).optional(),
  companionTone: z.enum(['warm', 'soft', 'cheerful', 'calm', 'gentle', 'grounded']).optional(),
  voiceGender: z.enum(['female', 'male']).optional(),
  voiceName: z.enum(['', 'autumn', 'diana', 'hannah', 'iris', 'daniel', 'austin', 'troy', 'leo']).optional(),
  preferVoice: z.boolean().optional(),
  memoryEnabled: z.boolean().optional(),
  reminders: z.array(reminderSchema).max(20).optional(),
  onboarded: z.boolean().optional(),
  location: z.string().trim().max(120).optional(),
});

meRouter.patch('/', async (req, res) => {
  const user = await load(req);
  const body = patchSchema.parse(req.body);
  user.set(body);
  await user.save();
  // Turning memory off also forgets what Sol already learned.
  if (body.memoryEnabled === false) await Memory.deleteMany({ user: user._id });
  res.json({ user: publicUser(user) });
});

meRouter.delete('/', async (req, res) => {
  const userId = uid(req);
  await Promise.all([
    Memory.deleteMany({ user: userId }),
    Mood.deleteMany({ user: userId }),
    Conversation.deleteMany({ user: userId }),
    Activity.deleteMany({ user: userId }),
    Assessment.deleteMany({ user: userId }),
    Daily.deleteMany({ user: userId }),
  ]);
  await User.findByIdAndDelete(userId);
  res.status(204).end();
});
