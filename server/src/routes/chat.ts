import { Router } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { z } from 'zod';
import { Conversation } from '../models/Conversation.js';
import { Memory } from '../models/Memory.js';
import { Activity } from '../models/Activity.js';
import { User } from '../models/User.js';
import { uid } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { buildContext } from '../services/context.js';
import { companionReply, summarise } from '../services/ai.js';
import { localDay } from '../services/days.js';

export const chatRouter = Router();

async function findOwned(userId: string, id: string) {
  if (!isValidObjectId(id)) throw new HttpError(404, 'Conversation not found');
  const convo = await Conversation.findOne({ _id: id, user: userId });
  if (!convo) throw new HttpError(404, 'Conversation not found');
  return convo;
}

chatRouter.get('/', async (req, res) => {
  const userId = uid(req);
  const conversations = await Conversation.aggregate([
    { $match: { user: new Types.ObjectId(userId) } },
    { $sort: { updatedAt: -1 } },
    {
      $project: {
        title: 1,
        lastMood: 1,
        updatedAt: 1,
        createdAt: 1,
        count: { $size: '$messages' },
        preview: { $arrayElemAt: ['$messages.content', -1] },
      },
    },
  ]);
  res.json({ conversations });
});

chatRouter.post('/', async (req, res) => {
  const userId = uid(req);
  const user = await User.findById(userId).lean();
  const name = user?.name.split(' ')[0] ?? 'friend';
  // Sol opens every new conversation so the screen never starts empty.
  const opener = z.object({ opener: z.string().max(400).optional() }).parse(req.body ?? {}).opener;
  const convo = await Conversation.create({
    user: userId,
    messages: [{ role: 'assistant', content: opener ?? `Hi ${name}, I'm here. What's on your mind today?` }],
  });
  res.status(201).json({ conversation: convo });
});

// Each person has one continuous chat with Sol; only the most recent messages are kept.
export const KEEP_MESSAGES = 16;

function latest(userId: string) {
  return Conversation.findOne({ user: userId }).sort({ updatedAt: -1 });
}

chatRouter.get('/current', async (req, res) => {
  res.json({ conversation: await latest(uid(req)) });
});

/**
 * Open the chat. A brand-new chat starts with Sol's greeting; an existing one only gets
 * a new line when there's a reason (e.g. a mood check-in). Returns what Sol should say, if anything.
 */
chatRouter.post('/current', async (req, res) => {
  const userId = uid(req);
  const { opener, greeting } = z.object({ opener: z.string().max(400).optional(), greeting: z.string().max(400).optional() }).parse(req.body ?? {});
  let convo = await latest(userId);
  let spoken: string | null = null;
  if (!convo) {
    spoken = opener ?? greeting ?? "Hi, I'm here. What's on your mind today?";
    convo = await Conversation.create({ user: userId, title: 'Sol', messages: [{ role: 'assistant', content: spoken }] });
  } else if (opener) {
    spoken = opener;
    convo.messages.push({ role: 'assistant', content: opener });
    convo.messages.splice(0, Math.max(0, convo.messages.length - KEEP_MESSAGES));
    await convo.save();
  }
  res.json({ conversation: convo, spoken });
});

chatRouter.get('/:id', async (req, res) => {
  const userId = uid(req);
  res.json({ conversation: await findOwned(userId, req.params.id as string) });
});

chatRouter.delete('/:id', async (req, res) => {
  const userId = uid(req);
  const convo = await findOwned(userId, req.params.id as string);
  await Memory.deleteMany({ user: userId, source: convo._id });
  await convo.deleteOne();
  res.status(204).end();
});

const messageSchema = z.object({ content: z.string().trim().min(1).max(4000), screen: z.string().max(40).optional() });

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Remove the user's name from a reply when Sol already said it in the last few messages. */
function limitName(text: string, name: string, recent: string) {
  if (!name || !new RegExp(`\\b${esc(name)}\\b`, 'i').test(recent)) return text;
  const n = esc(name);
  return text
    .replace(new RegExp(`,\\s*${n}\\b(?=\\s*[.!?,])`, 'gi'), '') // "That's great, Vishwas!" → "That's great!"
    .replace(new RegExp(`^(hey|hi|oh|okay|ok|aw+|yes|so)?\\s*,?\\s*${n}\\s*[,.!]\\s*`, 'i'), (_, w) => (w ? `${w[0].toUpperCase()}${w.slice(1)}, ` : '')) // "Vishwas, I…" → "I…"
    .replace(/^\s*([a-z])/, (c) => c.toUpperCase());
}

chatRouter.post('/:id/messages', async (req, res) => {
  const userId = uid(req);
  const { content, screen } = messageSchema.parse(req.body);
  const convo = await findOwned(userId, req.params.id as string);
  const today = localDay(req);

  convo.messages.push({ role: 'user', content });
  const history = convo.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  // The Claude API requires the first message to be from the user, so drop Sol's opener(s).
  const firstUser = history.findIndex((m) => m.role === 'user');
  const ctx = await buildContext(userId, today, {
    hour: Number(req.header('x-local-hour') ?? new Date().getHours()),
  });
  const reply = await companionReply(ctx, history.slice(firstUser), screen);
  // People say a friend's name now and then, not in every message: drop it if Sol used it lately.
  const recentSol = convo.messages.filter((m) => m.role === 'assistant').slice(-5).map((m) => m.content).join(' ');
  reply.reply = limitName(reply.reply, ctx.name, recentSol);

  convo.messages.push({
    role: 'assistant',
    content: reply.reply,
    suggestions: reply.suggestions,
    detectedMood: reply.detected_mood === 'unknown' ? null : reply.detected_mood,
    safety: reply.safety_concern,
  });
  if (reply.title && convo.messages.filter((m) => m.role === 'user').length <= 3) convo.title = reply.title;
  if (reply.detected_mood !== 'unknown') convo.lastMood = reply.detected_mood;
  // Older context lives on in the rolling summary and memories.
  const trimmed = Math.max(0, convo.messages.length - KEEP_MESSAGES);
  convo.messages.splice(0, trimmed);
  await convo.save();

  // Returned with the reply, so the app can show what Sol just learned straight away.
  const remembered =
    ctx.memoryEnabled && reply.new_memories.length
      ? await Memory.insertMany(reply.new_memories.map((text) => ({ user: userId, text, source: convo._id })))
      : [];
  await Activity.create({ user: userId, kind: 'chat', day: today });

  // Refresh the rolling summary every few turns so future chats can recall this one.
  const userTurns = convo.messages.filter((m) => m.role === 'user').length;
  // Every few turns is plenty, and it spares the free AI's per-minute allowance.
  if (userTurns % 4 === 0) {
    // Fold the previous summary in so the long-term picture survives trimming.
    const earlier = convo.summary ? [{ role: 'assistant' as const, content: `(Earlier: ${convo.summary})` }] : [];
    summarise([...earlier, ...history.slice(firstUser)]).then((summary) => {
      if (summary) Conversation.updateOne({ _id: convo._id }, { summary }).catch(() => {});
    });
  }

  res.json({
    message: convo.messages[convo.messages.length - 1],
    title: convo.title,
    memoriesAdded: remembered.length,
    memories: remembered.map((m) => ({ _id: m._id, text: m.text, createdAt: m.get('createdAt') })),
    action: reply.action?.kind === 'none' ? undefined : reply.action,
  });
});
