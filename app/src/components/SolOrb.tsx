import { useEffect, useMemo, useState } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Canvas, Circle, Points, RadialGradient, vec, type SkPoint } from '@shopify/react-native-skia';
import { useDerivedValue, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';

/** connecting: Sol shows as the Solace spiral mark, then inflates into the sphere. */
export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'connecting';
const STATE_CODE: Record<OrbState, number> = { idle: 0, listening: 1, thinking: 2, speaking: 3, connecting: 4 };
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

interface Props {
  size?: number;
  state?: OrbState;
  /** 0..1 energy from voice (word pulses while Sol speaks, mic loudness while listening). */
  level?: SharedValue<number>;
  /** Optional accent (e.g. a mood colour) blended into the particles. */
  tint?: string;
  style?: ViewStyle;
}

/**
 * Each particle has two homes that share the golden-angle ordering: a point on a
 * sphere (Sol) and a point on the flat spiral (the Solace mark). `form` blends between
 * them, so the logo visibly unfolds into the living sphere.
 */
export function lattice(n: number) {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = GOLDEN * i;
    const frac = Math.sqrt((i + 0.5) / n);
    pts.push(Math.cos(th) * r, y, Math.sin(th) * r, Math.random() * 6.283, Math.cos(th) * frac, Math.sin(th) * frac, frac);
  }
  return pts;
}
export const STRIDE = 7;

/**
 * Sol: a sphere of dry, slightly faded particles. It drifts while idle, swirls inward
 * while thinking, and ripples with a speech-like rhythm while talking.
 */
export function SolOrb({ size = 220, state = 'idle', level, tint, style }: Props) {
  const theme = useTheme();
  const count = size >= 180 ? 620 : size >= 90 ? 340 : 150;
  const base = useMemo(() => lattice(count), [count]);

  const t = useSharedValue(0); // surface time; its speed eases between states
  // Each orb starts its speech rhythm at a different phase so they never move in lockstep.
  const [phase] = useState(() => Math.random() * 100);
  const clock = useSharedValue(phase);
  const speed = useSharedValue(0.6);
  const energy = useSharedValue(0);
  const contract = useSharedValue(1);
  const form = useSharedValue(state === 'connecting' ? 0 : 1);
  const mode = useSharedValue(STATE_CODE[state]);
  useEffect(() => {
    mode.value = STATE_CODE[state];
  }, [state, mode]);

  useFrameCallback((frame) => {
    const dt = Math.min((frame.timeSincePreviousFrame ?? 16) / 1000, 0.05);
    const m = mode.value;
    const ease = (k: number) => 1 - Math.exp(-dt * k);
    clock.value += dt;
    speed.value += ((m === 4 ? 1.5 : m === 2 ? 1.6 : m === 3 ? 1.25 : m === 1 ? 0.9 : 0.55) - speed.value) * ease(1.5);
    t.value += dt * speed.value;
    contract.value += ((m === 2 ? 0.92 : 1) - contract.value) * ease(2);
    form.value += ((m === 4 ? 0 : 1) - form.value) * ease(2.4);

    const c = clock.value;
    const voice = level ? level.value : 0;
    let target: number;
    if (m === 3) {
      // Speech rhythm: quick syllables riding on slower phrase swells, plus word pulses.
      const syll = 0.5 + 0.5 * Math.sin(c * 8.3) * Math.cos(c * 3.7 + 0.6);
      const phrase = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(c * 1.15)) * (0.5 + 0.5 * Math.sin(c * 0.53 + 2));
      target = 0.16 + 0.62 * phrase * (0.3 + 0.7 * syll) + voice * 0.45;
    } else if (m === 1) target = 0.12 + voice * 0.95;
    else if (m === 2) target = 0.2 + voice * 0.4;
    else target = 0.05 + voice * 0.6;
    // Quick to rise; while speaking it also falls quickly between syllables, but once
    // speech ends it settles slowly so there is no jolt.
    const k = target > energy.value ? 10 : m === 3 ? 6 : m === 1 ? 4 : 1.2;
    energy.value += (target - energy.value) * ease(k);
  });

  const R = size * 0.34;
  const c = size / 2;

  const layers = useDerivedValue(() => {
    const time = t.value;
    const e = energy.value;
    const k = contract.value;
    const f = form.value;
    const ay = time * 0.35;
    const ax = 0.4 + Math.sin(time * 0.27) * 0.12;
    const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
    // The spiral mark slowly turns and breathes while connecting.
    const spin = time * 0.5;
    const cs = Math.cos(spin), ss = Math.sin(spin);
    const Rd = R * 1.1 * (1 + 0.03 * Math.sin(time * 2.2));
    const back: SkPoint[] = [];
    const mid: SkPoint[] = [];
    const front: SkPoint[] = [];
    const accent: SkPoint[] = [];
    for (let i = 0; i < base.length; i += STRIDE) {
      const x0 = base[i], y0 = base[i + 1], z0 = base[i + 2], seed = base[i + 3];
      const dx = base[i + 4], dy = base[i + 5], frac = base[i + 6];
      // Sphere position (rotate around Y, then X).
      const x1 = x0 * cy + z0 * sy;
      const z1 = -x0 * sy + z0 * cy;
      const y2 = y0 * cx - z1 * sx;
      const z2 = y0 * sx + z1 * cx;
      const wave =
        Math.sin(3.1 * x0 + time * 1.7 + seed * 0.15) * Math.cos(2.6 * y0 - time * 1.25) +
        0.55 * Math.sin(5.3 * z0 + time * 2.4) +
        0.6 * e * Math.sin(6.5 * y0 + 4.2 * x0 - time * 3.2);
      const drift = 0.018 * Math.sin(time * 0.8 + seed * 9.0);
      const r = R * k * (1 + (0.03 + 0.22 * e) * wave + drift + 0.02 * Math.sin(time * 0.9));
      const persp = 1 + z2 * 0.16;
      const sxp = x1 * r * persp;
      const syp = y2 * r * persp;
      // Spiral (logo) position.
      const lx = (dx * cs - dy * ss) * Rd;
      const ly = (dx * ss + dy * cs) * Rd;
      const px = c + lx + (sxp - lx) * f;
      const py = c + ly + (syp - ly) * f;
      // Depth for shading: the spiral is brightest at its heart.
      const depth = (1 - 2 * frac) * (1 - f) + z2 * f;
      const p = vec(px, py);
      if (depth < -0.3) back.push(p);
      else if (depth < 0.35) mid.push(p);
      else if ((i / STRIDE) % 9 === 0) accent.push(p);
      else front.push(p);
    }
    return { back, mid, front, accent };
  });

  const back = useDerivedValue(() => layers.value.back);
  const mid = useDerivedValue(() => layers.value.mid);
  const front = useDerivedValue(() => layers.value.front);
  const accent = useDerivedValue(() => layers.value.accent);
  const glowR = useDerivedValue(() => R * (1.2 + energy.value * 0.45) * (0.6 + 0.4 * form.value));

  const [p0, p1, p2, p3] = theme.orb.particles;
  const dot = Math.max(1.1, size * 0.0105);

  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      <Canvas style={{ width: size, height: size }}>
        <Circle cx={c} cy={c} r={glowR} opacity={theme.dark ? 0.3 : 0.45}>
          <RadialGradient c={vec(c, c)} r={R * 1.6} colors={[`${tint ?? theme.orb.glow}88`, `${theme.orb.glow}00`]} />
        </Circle>
        <Points points={back} mode="points" color={p3} strokeWidth={dot * 0.8} strokeCap="round" opacity={0.4} />
        <Points points={mid} mode="points" color={p1} strokeWidth={dot} strokeCap="round" opacity={0.65} />
        <Points points={front} mode="points" color={p0} strokeWidth={dot * 1.2} strokeCap="round" opacity={0.85} />
        <Points points={accent} mode="points" color={tint ?? p2} strokeWidth={dot * 1.5} strokeCap="round" opacity={0.9} />
      </Canvas>
    </View>
  );
}
