import { Assessment } from '../models/Assessment.js';
import { Conversation } from '../models/Conversation.js';
import { Memory } from '../models/Memory.js';
import { Mood } from '../models/Mood.js';
import { User } from '../models/User.js';
import { HttpError } from '../middleware/errors.js';

export interface UserContext {
  userId: string;
  name: string;
  tone: string;
  goals: string[];
  today: string;
  weekday: string;
  timeOfDay: string;
  moodSummary: string;
  latestMood: string | null;
  assessment: string;
  memories: string[];
  memoryEnabled: boolean;
  location: string;
  /** Sol's voice: 'female' or 'male' (from the chosen character), so it speaks as that person. */
  solGender: 'female' | 'male';
  pastConversations: string[];
}

function timeOfDay(hour: number) {
  if (hour < 5) return 'late night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

/** Everything Sol is allowed to know about the user, assembled for a single request. */
export async function buildContext(
  userId: string,
  today: string,
  opts: { hour?: number; excludeConversation?: string } = {},
): Promise<UserContext> {
  const user = await User.findById(userId).lean();
  if (!user) throw new HttpError(404, 'User not found');

  const [moods, assessment, memories, convos] = await Promise.all([
    Mood.find({ user: userId }).sort({ createdAt: -1 }).limit(4).lean(),
    Assessment.findOne({ user: userId }).sort({ createdAt: -1 }).lean(),
    user.memoryEnabled ? Memory.find({ user: userId }).sort({ createdAt: -1 }).limit(10).lean() : [],
    user.memoryEnabled
      ? Conversation.find({ user: userId, summary: { $ne: '' }, ...(opts.excludeConversation ? { _id: { $ne: opts.excludeConversation } } : {}) })
          .sort({ updatedAt: -1 })
          .limit(1)
          .select('summary updatedAt')
          .lean()
      : [],
  ]);

  const moodSummary = moods
    .map((m) => `${m.day}: ${m.mood}${m.tags.length ? ` (${m.tags.join(', ')})` : ''}${m.note ? ` "${m.note}"` : ''}`)
    .join('; ');

  return {
    userId,
    name: user.name.split(' ')[0],
    location: user.location ?? '',
    solGender: ['autumn', 'diana', 'hannah', 'iris'].includes(user.voiceName ?? '') ? 'female' : ['daniel', 'austin', 'troy', 'leo'].includes(user.voiceName ?? '') ? 'male' : user.voiceGender === 'male' ? 'male' : 'female',
    tone: user.companionTone,
    goals: user.goals,
    today,
    weekday: new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    timeOfDay: timeOfDay(opts.hour ?? new Date().getHours()),
    moodSummary,
    latestMood: moods[0]?.mood ?? null,
    assessment: assessment ? `${assessment.band} (${assessment.score}/100)` : '',
    memories: memories.map((m) => m.text),
    memoryEnabled: user.memoryEnabled,
    pastConversations: convos.map((c) => `${c.updatedAt.toISOString().slice(0, 10)}: ${c.summary}`),
  };
}
