import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { prefs } from './storage';

// Solace themes: four warm light palettes and one warm dark one. Screens read tokens
// through useTheme()/makeStyles(), so switching applies instantly everywhere.
type G2 = readonly [string, string];
type G3 = readonly [string, string, string];

export interface Palette {
  bg: string; surface: string; surfaceSoft: string; overlay: string;
  ink: string; inkSoft: string; inkMuted: string; line: string;
  primary: string; primarySoft: string; onPrimary: string; onButton: string; danger: string;
  sun: string; sage: string; sky: string; lavender: string; peach: string; rose: string;
  sunSoft: string; sageSoft: string; skySoft: string; lavenderSoft: string; peachSoft: string; roseSoft: string;
  onDeep: string; onDeepSoft: string; white: string;
}
export interface Theme {
  name: ThemeName;
  label: string;
  dark: boolean;
  colors: Palette;
  gradients: { backdrop: G3; hero: G2; deep: G3; button: G2; warm: G2; calm: G2; mint: G2; rose: G2 };
  orb: { particles: readonly [string, string, string, string]; glow: string };
}
export type ThemeName = 'sunrise' | 'honey' | 'clay' | 'blush' | 'ember';

const lightAccents = {
  sun: '#F2BE5C', sage: '#9CBF92', sky: '#97B4D6', lavender: '#B49AD6', peach: '#EFA27C', rose: '#E2918F',
  sunSoft: '#FCEFD2', sageSoft: '#E4F0DE', skySoft: '#E3ECF7', lavenderSoft: '#EEE6F7', peachSoft: '#FCE4D6', roseSoft: '#FADFDD',
  onPrimary: '#FFFFFF', onButton: '#FFFFFF', danger: '#D2604F', white: '#FFFFFF', surface: '#FFFFFF',
  onDeep: '#FFF6EE', onDeepSoft: '#F3D9C6',
};

export const THEMES: Record<ThemeName, Theme> = {
  sunrise: {
    name: 'sunrise', label: 'Sunrise', dark: false,
    colors: { ...lightAccents, bg: '#FBF5EE', surfaceSoft: '#F7EEE5', overlay: 'rgba(251,245,238,0.95)', ink: '#3B2A22', inkSoft: '#6F5B50', inkMuted: '#A8958A', line: '#EFE2D6', primary: '#E2875A', primarySoft: '#FBE1D2' },
    gradients: { backdrop: ['#FBF5EE', '#FCEDE1', '#F9E2D2'], hero: ['#FFE7D1', '#FCEFE4'], deep: ['#3B2A22', '#7A4A37', '#D9895E'], button: ['#4A3429', '#3B2A22'], warm: ['#FCE4D6', '#FCEFD2'], calm: ['#EEE6F7', '#FCE4D6'], mint: ['#E4F0DE', '#FCEFD2'], rose: ['#FADFDD', '#FCEFD2'] },
    orb: { particles: ['#E58A5E', '#F2BE76', '#D27A68', '#F3D2B6'], glow: '#F6C9A4' },
  },
  honey: {
    name: 'honey', label: 'Honey', dark: false,
    colors: { ...lightAccents, bg: '#FBF6EA', surfaceSoft: '#F6EEDC', overlay: 'rgba(251,246,234,0.95)', ink: '#3A2E1E', inkSoft: '#6E5E46', inkMuted: '#A89A82', line: '#EFE4CC', primary: '#D8962E', primarySoft: '#F9EACB' },
    gradients: { backdrop: ['#FBF6EA', '#FBF0D8', '#F7E6C6'], hero: ['#FCEBC5', '#FBF4E4'], deep: ['#3A2E1E', '#7A5A2A', '#D9A048'], button: ['#4A3B26', '#3A2E1E'], warm: ['#F9EACB', '#FCEFD2'], calm: ['#F6EEDC', '#F9E3C4'], mint: ['#E8EED6', '#FBF0D8'], rose: ['#F8E1D2', '#FBF0D8'] },
    orb: { particles: ['#D3923A', '#EFC46A', '#DDA062', '#F4E0B4'], glow: '#F4D08A' },
  },
  clay: {
    name: 'clay', label: 'Clay', dark: false,
    colors: { ...lightAccents, bg: '#F8F1EB', surfaceSoft: '#F2E7DE', overlay: 'rgba(248,241,235,0.95)', ink: '#3A2620', inkSoft: '#6E544B', inkMuted: '#A6908A', line: '#EBDDD2', primary: '#C46F55', primarySoft: '#F5DDD3' },
    gradients: { backdrop: ['#F8F1EB', '#F4E5DA', '#EFD9CA'], hero: ['#F3D9CB', '#F8EEE7'], deep: ['#3A2620', '#7D4434', '#C97A5C'], button: ['#4B3129', '#3A2620'], warm: ['#F5DDD3', '#F4EADC'], calm: ['#EDE2DA', '#F5DDD3'], mint: ['#E6EBDD', '#F4EADC'], rose: ['#F3D6D0', '#F4EADC'] },
    orb: { particles: ['#C2705A', '#E0A27E', '#B4604C', '#EBD0BF'], glow: '#E8B39A' },
  },
  blush: {
    name: 'blush', label: 'Blush', dark: false,
    colors: { ...lightAccents, bg: '#FCF4F2', surfaceSoft: '#F8EAE7', overlay: 'rgba(252,244,242,0.95)', ink: '#3D2830', inkSoft: '#6F5560', inkMuted: '#AC949C', line: '#F1E0DE', primary: '#D9778A', primarySoft: '#FADDE2' },
    gradients: { backdrop: ['#FCF4F2', '#FBE7E4', '#FADCD6'], hero: ['#FBDCDD', '#FDF0EC'], deep: ['#3D2830', '#7E4656', '#D88A8F'], button: ['#4C333C', '#3D2830'], warm: ['#FADDE2', '#FCEBDD'], calm: ['#F1E4F0', '#FADDE2'], mint: ['#E6EFE3', '#FCEBDD'], rose: ['#FAD6D6', '#FCEBDD'] },
    orb: { particles: ['#DB8495', '#F1B097', '#CB7383', '#F6D6D2'], glow: '#F2B9BE' },
  },
  ember: {
    name: 'ember', label: 'Ember', dark: true,
    colors: {
      bg: '#1E1713', surface: '#2A201B', surfaceSoft: '#342822', overlay: 'rgba(30,23,19,0.95)',
      ink: '#F7EADF', inkSoft: '#CDB7A8', inkMuted: '#8F7B6E', line: '#3D3029',
      primary: '#F0A06A', primarySoft: '#4A3326', onPrimary: '#2A1A10', onButton: '#2A1A10', danger: '#EE7B6B',
      sun: '#F2C46A', sage: '#A6C79B', sky: '#9DB9DA', lavender: '#BDA5DD', peach: '#F2A985', rose: '#E89C9A',
      sunSoft: '#3F3320', sageSoft: '#2C3527', skySoft: '#28303B', lavenderSoft: '#352C3D', peachSoft: '#45302A', roseSoft: '#432C2C',
      onDeep: '#FFF1E6', onDeepSoft: '#E2C6B2', white: '#FFFFFF',
    },
    gradients: { backdrop: ['#1E1713', '#261C17', '#33231B'], hero: ['#3E2B20', '#2A201B'], deep: ['#140F0C', '#3A251A', '#8A5236'], button: ['#F3AE7C', '#E08A55'], warm: ['#45302A', '#3F3320'], calm: ['#352C3D', '#45302A'], mint: ['#2C3527', '#3F3320'], rose: ['#432C2C', '#3F3320'] },
    orb: { particles: ['#F0A06A', '#F5C27F', '#DE856C', '#FFE2C4'], glow: '#F0A06A' },
  },
};

export const THEME_ORDER: ThemeName[] = ['sunrise', 'honey', 'clay', 'blush', 'ember'];
const THEME_KEY = 'solace.theme';

type ThemeCtx = Theme & { setTheme: (name: ThemeName) => void };
const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<ThemeName | null>(null);
  useEffect(() => {
    prefs.get(THEME_KEY).then((v) => setName(v && v in THEMES ? (v as ThemeName) : 'sunrise')).catch(() => setName('sunrise'));
  }, []);
  const value = useMemo<ThemeCtx | null>(
    () =>
      name
        ? {
            ...THEMES[name],
            setTheme: (n) => {
              setName(n);
              prefs.set(THEME_KEY, n).catch(() => {});
            },
          }
        : null,
    [name],
  );
  if (!value) return null; // resolved in a few ms, while fonts are still loading
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const t = useContext(Ctx);
  if (!t) throw new Error('useTheme must be used inside ThemeProvider');
  return t;
}

/** Theme-aware StyleSheet: `const useStyles = makeStyles((c) => ({...}))`, then `const s = useStyles()`. */
type StyleInput = Parameters<typeof StyleSheet.create>[0];
export function makeStyles<T extends StyleInput>(fn: (c: Palette, t: Theme) => T & StyleInput) {
  return function useStyles(): Readonly<T> {
    const t = useTheme();
    return useMemo(() => StyleSheet.create(fn(t.colors, t)), [t]);
  };
}

/** Soft background for an accent colour that works on light and dark themes. */
export function tint(hex: string, dark: boolean, alpha = dark ? 0.22 : 0.2) {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayItalic: 'Fraunces_400Regular_Italic',
  displayLight: 'Fraunces_400Regular',
  body: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  bold: 'DMSans_700Bold',
} as const;

export const radius = { sm: 12, md: 18, lg: 26, xl: 34, pill: 999 } as const;
export const space = (n: number) => n * 4;
export const shadow = {
  shadowColor: '#7A4A30',
  shadowOpacity: 0.1,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
} as const;
