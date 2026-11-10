# Solace — AI wellness companion

A React Native (Expo SDK 58) app with a Node.js + MongoDB API, plus **Sol**, an animated AI companion powered by Claude.

```
app/      Expo Router app (TypeScript)
server/   Express + Mongoose API (TypeScript)
```

## What's inside

| Area | What it does |
|---|---|
| Splash | Night-to-dawn sunrise as Sol rises, then routes you to onboarding, sign-in, setup or home |
| Onboarding | Three swipeable slides that introduce Sol, insights and rituals |
| Auth | Email sign-up and sign-in (bcrypt + JWT, token kept in SecureStore). Sol reacts as you type and looks away while you enter your password |
| Setup | Pick goals → pick Sol's tone (gentle / cheerful / grounded) → 5-question wellbeing check → reminders and memory consent |
| Today | Time-aware greeting, one-tap mood check-in, AI daily insight, a personalised affirmation and tiny challenge, rituals ordered by today's mood, weekly streak |
| Sol (AI) | Conversations with context, mood detection, activity suggestions you can tap, crisis-safety card with helplines, history (continue, start new, delete) |
| Memory | With your consent Sol saves short notes about you ("sister Priya", "exam on Friday") and summaries of past chats. You can view and delete any note, and turning memory off erases all of them |
| Journey | 7-day mood chart, 30-day breakdown, "Sol noticed" patterns from your tags, streaks, milestones |
| Activities | Breathing (Calm, Box, 4-7-8) with an animated orb and haptics, 5-4-3-2-1 grounding, and a press-and-hold affirmation |
| Reminders | Daily local notifications (check-in, affirmation, breathing, wind-down, plus your own). They fire with the app closed, and tapping one opens the matching screen. Times are editable and you can preview any reminder |

### How the AI works
`server/src/services/ai.ts`
- Each message goes to Claude (`claude-opus-5-5`, low effort, for quick chat replies) with a fixed persona prompt and a per-user context block: name, tone, goals, recent check-ins, wellbeing band, saved memories and summaries of earlier conversations.
- **Structured output** (a JSON schema) returns `reply`, `detected_mood`, `suggestions[]`, `new_memories[]`, `safety_concern` and `title`. That one call drives the chat bubble, Sol's facial expression, the activity chips, memory saving, the crisis card and the conversation title.
- The daily affirmation, challenge and insight are generated once per user per day and cached in MongoDB.
- Server-side refusal fallback (`fallbacks: "default"`) is enabled.
- **Fast and free (recommended):** add a free `GROQ_API_KEY` (console.groq.com, no card) to `server/.env`. Sol then replies with `openai/gpt-oss-120b` in under a second and transcribes speech with Whisper large-v3-turbo in about 0.4 s.
- **No key at all?** Sol uses a free, keyless model (pollinations.ai, OpenAI-compatible) out of the box: nothing to sign up for or rotate. If that service is unreachable, a built-in offline responder still detects the mood, replies with empathy and suggests activities. Set `FREE_AI=off` to use only the offline responder.
- **Voice input everywhere:** the installed app uses on-device speech recognition. In Expo Go, the phone records the user (stopping automatically when they go quiet) and the server transcribes it with Whisper running locally (`@huggingface/transformers` + `ffmpeg`): free and private, no key. Whisper small (~250 MB) downloads once on first start.
- **Sol's voice:** a warm neural voice (Kokoro, open source) generated on the server, sentence by sentence so speech starts within about a second. Female: `af_heart`, male: `am_michael`; tone sets the pace. If the server can't, the phone's built-in voice is used.

## Run it locally

You need Node 20+ and MongoDB running locally (or a MongoDB Atlas URI).

```bash
cd server && cp .env.example .env   # optional: add ANTHROPIC_API_KEY to use Claude
```

```bash
cd server && npm install && npm run dev
```

```bash
cd app && npm install && npx expo start
```

When you run in development, the app reaches the API on port 4000 of the machine running Metro, so a phone on the same Wi-Fi works with no extra config. To point it somewhere else, set `EXPO_PUBLIC_API_URL`.

Run the end-to-end API check (it signs up, checks in, chats, lists history, deletes):

```bash
cd server && node scripts/smoke.mjs http://localhost:4000
```

## Build the APK

1. Deploy the API. On Render or Railway: root `server`, build with `npm install && npm run build`, start with `npm start`. Set the env vars `MONGODB_URI` (Atlas), `JWT_SECRET` and `ANTHROPIC_API_KEY`.
2. Put the deployed URL in `app/eas.json` → `EXPO_PUBLIC_API_URL`.
3. Build:

```bash
cd app && npx eas-cli@latest build -p android --profile preview
```

Notifications use native modules, so test reminders in a dev build or the APK. Expo Go supports local notifications, but a real build gives the true experience.

## Safety note
Sol isn't a therapist. Crisis language triggers a support card with helplines (Tele MANAS 14416, 988 in the US, findahelpline.com), and this disclaimer also appears in the You tab.
