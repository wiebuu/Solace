import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { connectDb } from './db.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import { aiProvider } from './services/ai.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { moodsRouter } from './routes/moods.js';
import { homeRouter } from './routes/home.js';
import { chatRouter } from './routes/chat.js';
import { activitiesRouter } from './routes/activities.js';
import { memoriesRouter } from './routes/memories.js';
import { assessmentsRouter } from './routes/assessments.js';
import { voiceRouter } from './routes/voice.js';
import { warmSpeech } from './services/stt.js';
import { warmVoice } from './services/tts.js';

const app = express();
app.use(cors());
// Voice clips are larger than normal JSON bodies, so they get their own parser first.
app.use('/voice', requireAuth, express.json({ limit: '12mb' }), voiceRouter);
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => res.json({ ok: true, ai: aiProvider }));
app.use('/auth', authRouter);
app.use('/me', requireAuth, meRouter);
app.use('/moods', requireAuth, moodsRouter);
app.use('/home', requireAuth, homeRouter);
app.use('/conversations', requireAuth, chatRouter);
app.use('/activities', requireAuth, activitiesRouter);
app.use('/memories', requireAuth, memoriesRouter);
app.use('/assessments', requireAuth, assessmentsRouter);
app.use(errorHandler);

await connectDb();
if (!config.groqKey) warmSpeech();
warmVoice();
app.listen(config.port, '0.0.0.0', () => {
  console.log(`[api] Solace listening on :${config.port} (AI: ${aiProvider === 'claude' ? config.model : aiProvider === 'free' ? (config.groqKey ? 'groq' : 'pollinations (rate-limited; add GROQ_API_KEY)') : 'offline'})`);
});
