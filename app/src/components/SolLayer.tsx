import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { usePathname, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Canvas, Circle, Group, Points, RadialGradient, vec, type SkPoint } from '@shopify/react-native-skia';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { lattice, STRIDE, type OrbState } from './SolOrb';
import { useAuth } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { solDrag, solSpots, useSolHidden } from '@/lib/solLayer';
import { shadow, useTheme } from '@/lib/theme';
import { Tap } from './ui';

const N = 560;
const CODE: Record<OrbState, number> = { idle: 0, listening: 1, thinking: 2, speaking: 3, connecting: 4 };
const TAB_ROUTES = ['/', '/reminders', '/journey', '/profile'];
// Screens with their own orb (which becomes Sol there), or where Sol isn't part of the flow yet.
const OWN_ORB = ['/affirmation', '/breathe', '/grounding', '/checkin', '/onboarding', '/setup', '/sign-in', '/sign-up'];

/**
 * The one Sol of the app, drawn on a full-screen layer above everything. When Sol
 * changes place or size (voice page, chat header, tab bar), every particle travels on
 * its own curved path at its own pace, like being pulled in by gravity, and the dots
 * shrink or grow with the orb, instead of the whole thing zooming.
 */
export function SolLayer() {
  const theme = useTheme();
  const session = useSession();
  const pathname = usePathname();
  // The launch screen is also "/", like Home; it's told apart by having no route group.
  const segments = useSegments() as string[];
  const hidden = useSolHidden();
  const onSplash = segments.length === 0 || hidden;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const spots = solSpots(width, height, insets);

  const full = session.view === 'full';
  // Everywhere else Sol sits in the corner, so it's on hand on every screen.
  const inCorner = !TAB_ROUTES.includes(pathname) && !OWN_ORB.includes(pathname);
  const rest = inCorner ? spots.corner : spots.dock;
  const spot = full ? (session.showTranscript ? spots.chat : spots.voice) : rest;
  const visible = Boolean(user?.onboarded) && !onSplash && (full || !OWN_ORB.includes(pathname));

  const base = useMemo(() => lattice(N), []);
  // Per particle: spring stiffness (arrival pace) and swirl (how much its path curves).
  const [phys] = useState(() =>
    Array.from({ length: N }, () => {
      const k = 45 + Math.random() * 75;
      return [k, (Math.random() < 0.5 ? -1 : 1) * k * (0.15 + Math.random() * 0.35)];
    }).flat(),
  );
  const [phase] = useState(() => Math.random() * 100);

  const target = useSharedValue({ x: spot.x, y: spot.y, r: spot.size * 0.34 });
  const dock = useSharedValue({ x: rest.x, y: rest.y, r: rest.size * 0.34 });
  const awake = useSharedValue(session.view !== 'closed' ? 1 : 0);
  const prev = useSharedValue({ x: spot.x, y: spot.y, r: spot.size * 0.34 });
  const disp = useSharedValue({ x: spot.x, y: spot.y, r: spot.size * 0.34 });
  const sim = useSharedValue<number[]>(new Array(N * 4).fill(0));
  const show = useSharedValue(visible ? 1 : 0);
  const opacity = useSharedValue(visible ? 1 : 0);
  const mode = useSharedValue(CODE[session.orb]);
  const t = useSharedValue(0);
  const clock = useSharedValue(phase);
  const speed = useSharedValue(0.6);
  const energy = useSharedValue(0);
  const energyVel = useSharedValue(0);
  const contract = useSharedValue(1);
  const form = useSharedValue(1);
  const layers = useSharedValue<{ back: SkPoint[]; mid: SkPoint[]; front: SkPoint[]; accent: SkPoint[] }>({ back: [], mid: [], front: [], accent: [] });

  useEffect(() => {
    target.value = { x: spot.x, y: spot.y, r: spot.size * 0.34 };
    dock.value = { x: rest.x, y: rest.y, r: rest.size * 0.34 };
    show.value = visible ? 1 : 0;
  }, [spot.x, spot.y, spot.size, rest.x, rest.y, rest.size, visible, target, dock, show]);
  useEffect(() => {
    awake.value = session.view !== 'closed' ? 1 : 0;
  }, [session.view, awake]);
  useEffect(() => {
    mode.value = CODE[session.orb];
  }, [session.orb, mode]);
  useEffect(() => {
    if (!full) solDrag.set(0);
  }, [full]);

  const level = session.level;
  useFrameCallback((frame) => {
    const dt = Math.min((frame.timeSincePreviousFrame ?? 16) / 1000, 0.05);
    const ease = (k: number) => 1 - Math.exp(-dt * k);
    const m = mode.value;

    // ---- Sol's inner life (same rhythm as the standalone orb) ----
    clock.value += dt;
    speed.value += ((m === 4 ? 1.5 : m === 2 ? 1.6 : m === 3 ? 1.25 : m === 1 ? 0.9 : 0.55) - speed.value) * ease(1.5);
    t.value += dt * speed.value;
    contract.value += ((m === 2 ? 0.92 : 1) - contract.value) * ease(2);
    // Resting, Sol is the Solace mark; it opens into the sphere when talking or listening.
    // Off, Sol is the Solace mark; on, it's the particle sphere (after unfolding while connecting).
    form.value += ((awake.value && m !== 4 ? 1 : 0) - form.value) * ease(2.4);
    opacity.value += (show.value - opacity.value) * ease(5);
    const c = clock.value;
    const voice = level.value;
    let goal: number;
    if (m === 3) {
      const syll = 0.5 + 0.5 * Math.sin(c * 8.3) * Math.cos(c * 3.7 + 0.6);
      const phrase = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(c * 1.15)) * (0.5 + 0.5 * Math.sin(c * 0.53 + 2));
      goal = 0.16 + 0.62 * phrase * (0.3 + 0.7 * syll) + voice * 0.45;
    } else if (m === 1) goal = 0.02 + voice * 0.6;
    else if (m === 2) goal = 0.2 + voice * 0.4;
    else goal = 0.03 + voice * 0.6;
    // A soft spring: louder speech pushes the particles out, and they settle back with one
    // small, gentle bounce. The motion comes only from the voice, never from noise.
    const stiff = 40;
    energyVel.value += (stiff * (goal - energy.value) - 2 * 0.9 * Math.sqrt(stiff) * energyVel.value) * dt;
    energy.value = Math.max(0, energy.value + energyVel.value * dt);

    // ---- Where Sol is heading (dragging the page pulls it toward the dock) ----
    const tg = target.value;
    const dk = dock.value;
    const pull = solDrag.value;
    const tx = tg.x + (dk.x - tg.x) * pull;
    const ty = tg.y + (dk.y - tg.y) * pull;
    const tr = tg.r + (dk.r - tg.r) * pull;
    const pv = prev.value;
    const dcx = pv.x - tx;
    const dcy = pv.y - ty;
    const dr = pv.r - tr;
    prev.value = { x: tx, y: ty, r: tr };
    const d0 = disp.value;
    const de = ease(6);
    disp.value = { x: d0.x + (tx - d0.x) * de, y: d0.y + (ty - d0.y) * de, r: d0.r + (tr - d0.r) * de };

    const time = t.value;
    const e = energy.value;
    const kc = contract.value;
    const f = form.value;
    const ay = time * 0.35;
    const ax = 0.4 + Math.sin(time * 0.27) * 0.12;
    const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
    const spin = time * 0.5;
    const cs = Math.cos(spin), ss = Math.sin(spin);
    // The resting logo is drawn larger than the sphere so the mark reads clearly; larger still
    // in the tab bar, where Sol is off and the mark has to hold its own.
    const breathe = (1.32 + Math.max(0, Math.min(1, (80 - tr) / 50)) * 0.05) * (1 + 0.03 * Math.sin(time * 2.2));
    // Small orbs show the same motion exaggerated, so voice is visible at tab-bar size too.
    const boost = 1 + Math.max(0, (80 - tr) / 80) * 1.4;
    const back: SkPoint[] = [];
    const mid: SkPoint[] = [];
    const front: SkPoint[] = [];
    const accent: SkPoint[] = [];

    sim.modify((s) => {
      'worklet';
      for (let n = 0; n < N; n++) {
        const i = n * STRIDE;
        const x0 = base[i], y0 = base[i + 1], z0 = base[i + 2];
        const ddx = base[i + 4], ddy = base[i + 5], frac = base[i + 6];
        // Home on the sphere (unit radius), rotating and rippling.
        const x1 = x0 * cy + z0 * sy;
        const z1 = -x0 * sy + z0 * cy;
        const y2 = y0 * cx - z1 * sx;
        const z2 = y0 * sx + z1 * cx;
        const wave =
          Math.sin(3.1 * x0 + time * 1.7) * Math.cos(2.6 * y0 - time * 1.25) +
          0.55 * Math.sin(5.3 * z0 + time * 2.4) +
          0.25 * e * Math.sin(6.5 * y0 + 4.2 * x0 - time * 3.2);
        // Calm when quiet; the ripple and swell grow only with the voice.
        const rr = kc * (1 + (0.008 + 0.07 * e * boost) * wave + 0.12 * e * boost + 0.012 * Math.sin(time * 0.9));
        const persp = 1 + z2 * 0.16;
        const lx = (ddx * cs - ddy * ss) * breathe;
        const ly = (ddx * ss + ddy * cs) * breathe;
        const ux = lx + (x1 * rr * persp - lx) * f;
        const uy = ly + (y2 * rr * persp - ly) * f;

        // When the destination moves, the particle stays where it was and travels there.
        const j = n * 4;
        let ox = s[j] + dcx + ux * dr;
        let oy = s[j + 1] + dcy + uy * dr;
        let vx = s[j + 2];
        let vy = s[j + 3];
        const ks = phys[n * 2];
        const sw = phys[n * 2 + 1];
        const damp = 2 * Math.sqrt(ks);
        vx += (-ks * ox - damp * vx - sw * oy) * dt;
        vy += (-ks * oy - damp * vy + sw * ox) * dt;
        ox += vx * dt;
        oy += vy * dt;
        if (Math.abs(ox) + Math.abs(oy) < 0.05 && Math.abs(vx) + Math.abs(vy) < 0.05) ox = oy = vx = vy = 0;
        s[j] = ox;
        s[j + 1] = oy;
        s[j + 2] = vx;
        s[j + 3] = vy;

        const p = vec(tx + ux * tr + ox, ty + uy * tr + oy);
        const depth = (1 - 2 * frac) * (1 - f) + z2 * f;
        if (depth < -0.3) back.push(p);
        else if (depth < 0.35) mid.push(p);
        else if (n % 9 === 0) accent.push(p);
        else front.push(p);
      }
      return s;
    });
    layers.value = { back, mid, front, accent };
  });

  const back = useDerivedValue(() => layers.value.back);
  const mid = useDerivedValue(() => layers.value.mid);
  const front = useDerivedValue(() => layers.value.front);
  const accent = useDerivedValue(() => layers.value.accent);
  // Dots shrink and grow with the orb.
  const dot = useDerivedValue(() => Math.max(0.9, disp.value.r * 0.031));
  const dBack = useDerivedValue(() => dot.value * 0.8);
  const dFront = useDerivedValue(() => dot.value * 1.2);
  const dAccent = useDerivedValue(() => dot.value * 1.5);
  const gx = useDerivedValue(() => disp.value.x);
  const gy = useDerivedValue(() => disp.value.y);
  const gc = useDerivedValue(() => vec(disp.value.x, disp.value.y));
  const gr = useDerivedValue(() => disp.value.r * (1.2 + energy.value * 0.45) * (0.6 + 0.4 * form.value));
  const gr2 = useDerivedValue(() => disp.value.r * 1.6);

  const [p0, p1, p2, p3] = theme.orb.particles;
  const seat = spots.corner.size + 6;
  return (
    <>
      {/* Off the tab bar, Sol's seat in the corner: tap to talk (or open), long-press to end. */}
      {inCorner && !full && visible && (
        <Tap
          onPress={session.openTalking}
          onLongPress={session.view === 'closed' ? () => session.talk() : session.close}
          delayLongPress={380}
          scaleTo={0.94}
          feedback="medium"
          accessibilityLabel={session.view === 'mini' ? 'Open Sol' : 'Talk to Sol'}
          style={{
            position: 'absolute',
            zIndex: 60,
            left: spots.corner.x - seat / 2,
            top: spots.corner.y - seat / 2,
            width: seat,
            height: seat,
            borderRadius: seat / 2,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.line,
            ...shadow,
            shadowOpacity: 0.16,
          }}
        />
      )}
      <Canvas style={[StyleSheet.absoluteFill, { zIndex: 70 }]} pointerEvents="none">
      <Group opacity={opacity}>
      <Circle cx={gx} cy={gy} r={gr} opacity={theme.dark ? 0.3 : 0.45}>
        <RadialGradient c={gc} r={gr2} colors={[`${theme.orb.glow}88`, `${theme.orb.glow}00`]} />
      </Circle>
      <Points points={back} mode="points" color={p3} strokeWidth={dBack} strokeCap="round" opacity={0.4} />
      <Points points={mid} mode="points" color={p1} strokeWidth={dot} strokeCap="round" opacity={0.65} />
      <Points points={front} mode="points" color={p0} strokeWidth={dFront} strokeCap="round" opacity={0.85} />
      <Points points={accent} mode="points" color={p2} strokeWidth={dAccent} strokeCap="round" opacity={0.9} />
      </Group>
      </Canvas>
    </>
  );
}
