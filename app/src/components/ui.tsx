import { Children, Fragment, type ComponentRef, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, makeStyles, radius, shadow, space, useTheme, type Palette } from '@/lib/theme';
import { haptic } from '@/lib/haptics';

// ---------- Typography ----------
type Variant = 'hero' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'caption' | 'label' | 'quote';
const variants = (c: Palette): Record<Variant, TextStyle> => ({
  hero: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.6, color: c.ink },
  title: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, letterSpacing: -0.4, color: c.ink },
  heading: { fontFamily: fonts.bold, fontSize: 16.5, lineHeight: 22, color: c.ink },
  body: { fontFamily: fonts.body, fontSize: 15.5, lineHeight: 23, color: c.inkSoft },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 15.5, lineHeight: 22, color: c.ink },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  label: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase', color: c.inkMuted },
  quote: { fontFamily: fonts.displayItalic, fontSize: 22, lineHeight: 31, color: c.ink },
});

export function T({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  const { colors } = useTheme();
  return <Text {...rest} style={[variants(colors)[variant], style]} />;
}

// ---------- Pressable: quick, eased press feedback (no spring overshoot) ----------
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const PRESS = { duration: 120, easing: Easing.out(Easing.quad) };

export function Tap({
  children,
  style,
  onPress,
  scaleTo = 0.97,
  feedback = 'tap',
  ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number; feedback?: keyof typeof haptic | 'none' }) {
  const s = useSharedValue(1);
  const o = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: o.value }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={() => {
        s.set(withTiming(scaleTo, PRESS));
        o.set(withTiming(0.85, PRESS));
      }}
      onPressOut={() => {
        s.set(withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }));
        o.set(withTiming(1, { duration: 180 }));
      }}
      onPress={(e) => {
        if (feedback !== 'none') haptic[feedback]();
        onPress?.(e);
      }}
      style={[style, anim]}>
      {children as ReactNode}
    </AnimatedPressable>
  );
}

// ---------- Buttons: four clear levels of emphasis ----------
type IconName = keyof typeof Ionicons.glyphMap;
export type ButtonKind = 'primary' | 'soft' | 'outline' | 'ghost';

export function Button({
  title,
  onPress,
  kind = 'primary',
  size = 'md',
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress?: () => void;
  /** primary: the one main action · soft: secondary · outline: alternative · ghost: low-key text action */
  kind?: ButtonKind;
  size?: 'md' | 'sm';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, gradients } = useTheme();
  const s = useStyles();
  const inactive = disabled || loading;
  const fg = kind === 'primary' ? colors.onButton : kind === 'ghost' ? colors.primary : colors.ink;
  const h = size === 'md' ? 54 : 40;
  const content = loading ? (
    <ActivityIndicator color={fg} />
  ) : (
    <View style={s.btnInner}>
      {icon ? <Ionicons name={icon} size={size === 'md' ? 18 : 16} color={fg} /> : null}
      <Text style={[s.btnText, { color: fg, fontSize: size === 'md' ? 16 : 14 }]}>{title}</Text>
    </View>
  );
  const box: ViewStyle = { height: h, borderRadius: h / 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: size === 'md' ? 24 : 16 };
  return (
    <Tap onPress={inactive ? undefined : onPress} feedback={inactive ? 'none' : 'soft'} accessibilityRole="button" accessibilityState={{ disabled: !!inactive }} style={[{ opacity: disabled ? 0.4 : 1 }, style]}>
      {kind === 'primary' ? (
        <LinearGradient colors={gradients.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[box, s.primaryShadow]}>
          {content}
        </LinearGradient>
      ) : (
        <View style={[box, kind === 'soft' && { backgroundColor: colors.primarySoft }, kind === 'outline' && s.outline, kind === 'ghost' && { paddingHorizontal: 8 }]}>{content}</View>
      )}
    </Tap>
  );
}

/** Icon-only button. plain: bare icon · soft: tinted circle · solid: filled circle · outline: ring. */
export function IconButton({
  icon,
  onPress,
  label,
  variant = 'soft',
  size = 44,
  color,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  variant?: 'plain' | 'soft' | 'solid' | 'outline';
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const s = useStyles();
  const fg = color ?? (variant === 'solid' ? colors.onButton : colors.ink);
  return (
    <Tap
      onPress={onPress}
      hitSlop={variant === 'plain' ? 10 : 4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' },
        variant === 'soft' && { backgroundColor: colors.surfaceSoft },
        variant === 'solid' && [{ backgroundColor: colors.ink }, s.primaryShadow],
        variant === 'outline' && s.outline,
        style,
      ]}>
      <Ionicons name={icon} size={Math.round(size * 0.45)} color={fg} />
    </Tap>
  );
}

// ---------- Selection: clean fills, no borders or glows ----------
export function Chip({ label, selected, onPress, color, icon }: { label: string; selected?: boolean; onPress?: () => void; color?: string; icon?: ReactNode }) {
  const { colors } = useTheme();
  const s = useStyles();
  const fill = color ?? colors.primary;
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[s.chip, { backgroundColor: selected ? fill : colors.surfaceSoft }]}>
      {selected ? <Ionicons name="checkmark" size={14} color={colors.onPrimary} /> : icon}
      <Text style={[s.chipText, selected && { color: colors.onPrimary, fontFamily: fonts.bold }]}>{label}</Text>
    </Tap>
  );
}

// ---------- Surfaces ----------
export function Card({
  children,
  style,
  tint,
  active,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tint?: readonly [string, string, ...string[]];
  /** Warm gradient-lit state for the active card. */
  active?: boolean;
  padded?: boolean;
}) {
  const { gradients } = useTheme();
  const s = useStyles();
  const pad = padded ? s.cardPad : null;
  if (tint || active) {
    return (
      <View style={[s.cardRadius, s.softShadow]}>
        <LinearGradient colors={tint ?? gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.cardRadius, pad, style]}>
          {children}
        </LinearGradient>
      </View>
    );
  }
  return <View style={[s.cardRadius, s.cardPlain, pad, style]}>{children}</View>;
}

/** A titled block on a screen: small caps label, optional action, then content. */
export function Section({ title, action, onAction, children, style }: { title: string; action?: string; onAction?: () => void; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[{ gap: space(3) }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <T variant="label">{title}</T>
        {action ? (
          <Tap onPress={onAction} hitSlop={10}>
            <T style={{ color: colors.primary, fontFamily: fonts.bold, fontSize: 13 }}>{action}</T>
          </Tap>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** iOS-settings style group: one card, rows separated by hairlines. */
export function ListGroup({ children }: { children: ReactNode }) {
  const s = useStyles();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[s.cardRadius, s.cardPlain, { overflow: 'hidden' }]}>
      {items.map((child, i) => (
        <Fragment key={i}>
          {i > 0 && <View style={s.divider} />}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

export function ListRow({ icon, label, detail, onPress, danger, right }: { icon: IconName; label: string; detail?: string; onPress?: () => void; danger?: boolean; right?: ReactNode }) {
  const { colors } = useTheme();
  const s = useStyles();
  const body = (
    <View style={s.row}>
      <View style={[s.rowIcon, { backgroundColor: danger ? colors.roseSoft : colors.primarySoft }]}>
        <Ionicons name={icon} size={17} color={danger ? colors.danger : colors.primary} />
      </View>
      <T variant="bodyStrong" style={[{ flex: 1 }, danger && { color: colors.danger }]}>{label}</T>
      {detail ? <T variant="caption">{detail}</T> : null}
      {right ?? (onPress && !danger ? <Ionicons name="chevron-forward" size={16} color={colors.inkMuted} /> : null)}
    </View>
  );
  return onPress ? (
    <Tap onPress={onPress} scaleTo={0.99}>
      {body}
    </Tap>
  ) : (
    body
  );
}

export type TextInputHandle = ComponentRef<typeof TextInput>;

export function Input({ label, error, style, ref, ...rest }: TextInputProps & { label?: string; error?: string; ref?: Ref<TextInputHandle> }) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <View style={{ gap: 6 }}>
      {label ? <T variant="label" style={{ paddingHorizontal: 4 }}>{label}</T> : null}
      <TextInput ref={ref} placeholderTextColor={colors.inkMuted} {...rest} style={[s.input, error ? { borderColor: colors.danger } : null, style]} />
      {error ? <T style={{ color: colors.danger, fontSize: 13 }}>{error}</T> : null}
    </View>
  );
}

// ---------- Screen scaffolding ----------
export function Backdrop({ colors: c }: { colors?: readonly [string, string, ...string[]] }) {
  const { gradients } = useTheme();
  return <LinearGradient colors={c ?? gradients.backdrop} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} />;
}

export function Screen({ children, bottomInset = 0, contentStyle }: { children: ReactNode; bottomInset?: number; contentStyle?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Backdrop />
      <ScrollView
        contentContainerStyle={[{ paddingTop: insets.top + space(3), paddingBottom: insets.bottom + space(8) + bottomInset, paddingHorizontal: space(5), gap: space(6) }, contentStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

/** "Talk to Sol, or fill it in yourself" banner shown on every form. */
export function AiFormBar({ onTalk, active }: { onTalk: () => void; active?: boolean }) {
  const { colors } = useTheme();
  return (
    <Card active={active} tint={active ? undefined : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
      <Ionicons name="mic-outline" size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <T variant="bodyStrong">{active ? 'Sol is filling this in with you' : 'Answer by talking to Sol'}</T>
      </View>
      <Button title={active ? 'Open' : 'Talk'} kind="soft" size="sm" onPress={onTalk} />
    </Card>
  );
}

const useStyles = makeStyles((c) => ({
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { fontFamily: fonts.bold, letterSpacing: 0.2 },
  primaryShadow: { ...shadow, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  outline: { borderWidth: 1.2, borderColor: c.line, backgroundColor: 'transparent' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 15, paddingVertical: 9, borderRadius: radius.pill },
  chipText: { fontFamily: fonts.medium, fontSize: 14, color: c.ink },
  cardRadius: { borderRadius: 22 },
  cardPad: { padding: 18 },
  cardPlain: { backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, ...shadow, shadowOpacity: 0.04, shadowRadius: 12 },
  softShadow: { ...shadow, shadowOpacity: 0.06 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: 62 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 16 },
  rowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  input: { height: 54, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, paddingHorizontal: 18, fontFamily: fonts.body, fontSize: 16, color: c.ink },
}));
