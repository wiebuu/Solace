# Solace — AI wellness companion

A voice-first mental wellness app built with React Native (Expo SDK 58) and a Node.js + MongoDB API. At its heart is **Sol**, an AI companion you can simply talk to. It listens, answers in a natural voice, remembers what matters to you, and can guide you through exercises hands-free.

```
app/      Expo Router app (TypeScript)
server/   Express + Mongoose API (TypeScript)
```

## Tech stack

| Layer | Tools |
|---|---|
| App | React Native, Expo SDK 58, Expo Router, TypeScript, Reanimated 4, Skia, expo-audio, expo-notifications, expo-location, SecureStore |
| API | Node.js, Express, TypeScript, Zod, JWT + bcrypt |
| Database | MongoDB with Mongoose |
| AI replies | Groq-hosted open models (`gpt-oss-20b`, `gpt-oss-120b`, Qwen as fallback), or Claude when `ANTHROPIC_API_KEY` is set |
| Speech to text | Whisper large-v3 on Groq, with Whisper running locally (`@huggingface/transformers`) as a fallback |
| Voice | Kokoro neural text-to-speech on the server (8 voices), shaped per tone with ffmpeg |

## Features

| Area | What it does |
|---|---|
| Sol, by voice | Tap the orb and talk. Sol stops listening when you pause, replies in your chosen voice, and keeps listening until you close it. Captions follow its speech, highlighting each word as it's spoken |
| Sol, by text | The same conversation as a chat, with suggestions you can tap |
| Do things by voice | "Open breathing", "change the theme", "remind me at 9", "use a guy's voice", "close this screen": Sol acts on the app, and knows which screen you're on |
| Voices | 8 characters (4 girls, 4 guys) in warm, soft, cheerful or calm tones |
| Memory | With your consent, Sol keeps short notes ("has a dog named Bruno") and summaries of past chats. New notes pop up as Sol learns them; you can view and delete any of them, and turning memory off erases them all |
| Check-in | One page: tap your mood, tags and a note, or let Sol ask and fill it in as you answer |
| Exercises | Breathing (Calm, Box, 4-7-8) with cues on the beat, 5-4-3-2-1 grounding where you just say what you notice, and a daily affirmation Sol hears you say. Sol only guides you here if you switch it on with the small Sol button |
| Journey | 7-day mood chart, 30-day breakdown, patterns from your tags, streaks and milestones |
| Reminders | Daily local notifications (check-in, affirmation, breathing, wind-down, plus your own), editable by hand or by asking Sol |
| Personal | Five themes (including a dark one), your city (with permission) for local context, onboarding and a short wellbeing check |
| Safety | Crisis language brings up a support card with helplines (Tele MANAS 14416, 988 in the US, findahelpline.com) |

### How Sol works
- **Listening:** the phone records while you talk and notices when you've stopped. It does this by watching how loud and how changeable the sound is, compared with the room. The clip goes to Whisper, which turns it into text.
- **Thinking:** `server/src/services/ai.ts` sends the conversation (the last few messages plus a rolling summary) together with your context. That context covers your name, tone, goals, recent moods, saved memories, city, the screen you're on and the time of day. One structured reply returns the message, detected mood, activity suggestions, new memories, a safety flag, a chat title and an optional app action, such as opening a screen or changing the voice.
- **Speaking:** replies are split into short pieces and voiced one after another, so Sol starts talking quickly. The orb's particles move with Sol's voice and with yours.

## Run it locally

You need Node 20+, ffmpeg, and MongoDB (local, or a MongoDB Atlas URI).

```bash
cd server && cp .env.example .env
```

In `server/.env`, set `JWT_SECRET` and add a free `GROQ_API_KEY` (console.groq.com) for fast replies and accurate transcription. Without any key, Sol falls back to a free keyless model, and then to a built-in offline responder.

```bash
cd server && npm install && npm run dev
```

```bash
cd app && npm install && npx expo start
```

In development, the app reaches the API on port 4000 of the machine running Metro, so a phone on the same Wi-Fi works with no extra setup. To use a different server, set `EXPO_PUBLIC_API_URL`.

End-to-end API check (signs up, checks in, chats, lists history, deletes the account):

```bash
cd server && node scripts/smoke.mjs http://localhost:4000
```

## Build the APK

1. Deploy the API (any Node host with ffmpeg and about 1 GB of memory for the voice model), with `MONGODB_URI`, `JWT_SECRET` and `GROQ_API_KEY` set.
2. Put its URL in `app/eas.json` as `EXPO_PUBLIC_API_URL`.
3. Build:

```bash
cd app && npx eas-cli@latest build -p android --profile preview
```

## Safety note
Sol isn't a therapist and never diagnoses. Crisis language brings up a support card with helplines, and this disclaimer also appears in the You tab.
