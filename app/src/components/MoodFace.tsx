import Svg, { Circle, Path } from 'react-native-svg';
import type { MoodLevel } from '@/lib/moods';
import { moodByKey } from '@/lib/moods';

const MOUTHS: Record<MoodLevel, string> = {
  radiant: 'M14 23 Q 20 31 26 23',
  good: 'M14.5 24 Q 20 28.5 25.5 24',
  okay: 'M15 25.5 L 25 25.5',
  low: 'M15 27 Q 20 23.5 25 27',
  struggling: 'M14.5 28 Q 20 22 25.5 28',
};

/** Small, friendly face in the mood's colour, used for pickers and charts. */
export function MoodFace({ mood, size = 40 }: { mood: MoodLevel; size?: number }) {
  const m = moodByKey(mood)!;
  const happyEyes = mood === 'radiant';
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Circle cx="20" cy="20" r="19" fill={m.color} />
      <Circle cx="20" cy="20" r="19" fill="#FFFFFF" opacity="0.18" />
      {happyEyes ? (
        <>
          <Path d="M11.5 17 Q 14 13.5 16.5 17" stroke="#2A2440" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          <Path d="M23.5 17 Q 26 13.5 28.5 17" stroke="#2A2440" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <Circle cx="14" cy="17" r="2.2" fill="#2A2440" />
          <Circle cx="26" cy="17" r="2.2" fill="#2A2440" />
        </>
      )}
      <Path d={MOUTHS[mood]} stroke="#2A2440" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </Svg>
  );
}
