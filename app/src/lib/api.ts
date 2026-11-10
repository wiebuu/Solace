import Constants from 'expo-constants';
import { Platform } from 'react-native';

// EXPO_PUBLIC_API_URL wins (set it for APK builds). In development, reuse the
// Metro host's IP so a physical phone on the same Wi-Fi reaches the local server.
function resolveBaseUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:4000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

export const API_URL = resolveBaseUrl();

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setToken(t: string | null) {
  token = t;
}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function localDay(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Local-Day': localDay(),
        'X-Local-Hour': String(new Date().getHours()),
        // Lets requests through ngrok's free-tier interstitial when the API is tunnelled.
        'ngrok-skip-browser-warning': '1',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach Solace right now. Check your connection.");
  }
  if (res.status === 401 && token) onUnauthorized?.();
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? 'Something went wrong');
  return json as T;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  patch: <T>(p: string, b: unknown) => request<T>('PATCH', p, b),
  del: (p: string) => request<void>('DELETE', p),
};

// ---- Shared types (mirror the server's JSON) ----
export type ReminderKind = 'checkin' | 'affirmation' | 'breathing' | 'selfcare' | 'custom';
export interface Reminder {
  id: string;
  kind: ReminderKind;
  title: string;
  body: string;
  hour: number;
  minute: number;
  enabled: boolean;
}
export interface User {
  id: string;
  name: string;
  email: string;
  goals: string[];
  companionTone: 'warm' | 'soft' | 'cheerful' | 'calm' | 'gentle' | 'grounded';
  voiceGender: 'female' | 'male';
  voiceName?: string;
  preferVoice: boolean;
  memoryEnabled: boolean;
  reminders: Reminder[];
  onboarded: boolean;
  /** City, region, country (with permission). */
  location?: string;
  createdAt: string;
}
export type SuggestionKind = 'breathing' | 'grounding' | 'reflection' | 'affirmation' | 'checkin' | 'selfcare';
export interface ChatMessage {
  _id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestions: { kind: SuggestionKind; label: string }[];
  detectedMood: string | null;
  safety: boolean;
  createdAt: string;
}
export interface Conversation {
  _id: string;
  title: string;
  lastMood: string | null;
  messages: ChatMessage[];
  updatedAt: string;
}
export interface ConversationSummary {
  _id: string;
  title: string;
  lastMood: string | null;
  updatedAt: string;
  count: number;
  preview: string;
}
export interface HomeData {
  today: string;
  daily: { affirmation: string; challenge: string; challengeDone: boolean; insight: string };
  todayMood: { mood: string; tags: string[]; note: string } | null;
  streak: number;
  week: { day: string; active: boolean }[];
  totals: { mindfulMinutes: number; checkins: number; sessions: number };
  lastConversation: { _id: string; title: string; updatedAt: string } | null;
}
export interface Insights {
  week: { day: string; score: number | null }[];
  distribution: Record<string, number>;
  tags: { tag: string; count: number; avg: number }[];
  total: number;
  average: number | null;
}
