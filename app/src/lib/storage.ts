import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Auth token goes to the keychain/keystore; non-sensitive flags go to AsyncStorage.
export const secure = {
  get: (k: string) => (Platform.OS === 'web' ? AsyncStorage.getItem(k) : SecureStore.getItemAsync(k)),
  set: (k: string, v: string) => (Platform.OS === 'web' ? AsyncStorage.setItem(k, v) : SecureStore.setItemAsync(k, v)),
  del: (k: string) => (Platform.OS === 'web' ? AsyncStorage.removeItem(k) : SecureStore.deleteItemAsync(k)),
};

export const prefs = {
  get: (k: string) => AsyncStorage.getItem(k),
  set: (k: string, v: string) => AsyncStorage.setItem(k, v),
};

export const KEYS = { onboardingSeen: 'solace.onboardingSeen' } as const;
