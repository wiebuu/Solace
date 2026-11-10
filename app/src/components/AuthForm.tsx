import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SolOrb } from './SolOrb';
import { Backdrop, Button, Input, T, Tap, type TextInputHandle } from './ui';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { fonts, useTheme } from '@/lib/theme';

/** Shared sign-in / sign-up form. Typed by hand on purpose: passwords should never be spoken aloud. */
export function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { signIn, signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<TextInputHandle>(null);
  const passRef = useRef<TextInputHandle>(null);
  const isSignup = mode === 'signup';

  const submit = async () => {
    setError('');
    if (isSignup && !name.trim()) return setError('What should Sol call you?');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('That email doesn’t look quite right.');
    if (password.length < (isSignup ? 8 : 1)) return setError('Your password needs at least 8 characters.');
    setLoading(true);
    try {
      const user = isSignup ? await signUp(name.trim(), email.trim(), password) : await signIn(email.trim(), password);
      haptic.success();
      router.replace(user.onboarded ? '/(tabs)' : '/setup');
    } catch (e) {
      haptic.warn();
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const focus = { onFocus: () => setFocused(true), onBlur: () => setFocused(false) };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Backdrop />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <SolOrb size={focused ? 120 : 170} state={loading ? 'thinking' : focused ? 'listening' : 'idle'} tint={error ? colors.danger : undefined} />
          <Animated.View entering={FadeInDown.duration(500)} style={{ alignItems: 'center', gap: 6 }}>
            <T variant="title" style={{ textAlign: 'center' }}>{isSignup ? 'Let’s make this space yours' : 'Welcome back'}</T>
            <T style={{ textAlign: 'center' }}>{isSignup ? 'It takes less than a minute. Everything stays private.' : 'Sol missed you. Pick up right where you left off.'}</T>
          </Animated.View>
        </View>
        <Animated.View entering={FadeInDown.delay(120).duration(500)} style={{ gap: 14 }}>
          {isSignup && (
            <Input label="Your name" placeholder="What should Sol call you?" value={name} onChangeText={setName} autoCapitalize="words" returnKeyType="next" {...focus} onSubmitEditing={() => emailRef.current?.focus()} />
          )}
          <Input ref={emailRef} label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" returnKeyType="next" {...focus} onSubmitEditing={() => passRef.current?.focus()} />
          <Input ref={passRef} label="Password" placeholder={isSignup ? 'At least 8 characters' : 'Your password'} value={password} onChangeText={setPassword} secureTextEntry autoComplete={isSignup ? 'new-password' : 'current-password'} returnKeyType="go" {...focus} onSubmitEditing={submit} />
          {error ? <T style={{ color: colors.danger, textAlign: 'center', fontFamily: fonts.medium }}>{error}</T> : null}
          <Button title={isSignup ? 'Create my space' : 'Sign in'} onPress={submit} loading={loading} style={{ marginTop: 6 }} />
        </Animated.View>
        <Tap onPress={() => router.replace(isSignup ? '/sign-in' : '/sign-up')} style={{ alignSelf: 'center' }} hitSlop={10}>
          <T>
            {isSignup ? 'Already have an account? ' : 'New to Solace? '}
            <T style={{ fontFamily: fonts.bold, color: colors.primary }}>{isSignup ? 'Sign in' : 'Create an account'}</T>
          </T>
        </Tap>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ content: { paddingHorizontal: 24, gap: 24, flexGrow: 1, justifyContent: 'center' } });
