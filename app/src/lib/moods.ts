export type MoodLevel = 'radiant' | 'good' | 'okay' | 'low' | 'struggling';
export type SolExpression = 'happy' | 'calm' | 'curious' | 'concerned' | 'sleepy' | 'thinking';

export const MOODS: {
  key: MoodLevel;
  label: string;
  color: string;
  expression: SolExpression;
  prompt: string;
}[] = [
  { key: 'radiant', label: 'Radiant', color: '#F2BE5C', expression: 'happy', prompt: "What's lighting you up?" },
  { key: 'good', label: 'Good', color: '#9CBF92', expression: 'happy', prompt: 'What made today feel good?' },
  { key: 'okay', label: 'Okay', color: '#97B4D6', expression: 'calm', prompt: "What's on your mind?" },
  { key: 'low', label: 'Low', color: '#B49AD6', expression: 'concerned', prompt: 'What feels heavy right now?' },
  { key: 'struggling', label: 'Struggling', color: '#E2918F', expression: 'concerned', prompt: "I'm here. What's going on?" },
];

export const moodByKey = (k?: string | null) => MOODS.find((m) => m.key === k);

export const MOOD_TAGS = ['Work', 'Studies', 'Sleep', 'Family', 'Friends', 'Love', 'Health', 'Money', 'Exercise', 'Weather', 'Alone time', 'Food'];

export function greeting(name: string, hour = new Date().getHours()) {
  if (hour < 5) return `Still up, ${name}?`;
  if (hour < 12) return `Good morning, ${name}`;
  if (hour < 17) return `Good afternoon, ${name}`;
  if (hour < 21) return `Good evening, ${name}`;
  return `Winding down, ${name}?`;
}
