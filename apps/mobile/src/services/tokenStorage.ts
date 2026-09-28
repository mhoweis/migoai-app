import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type TokenKey = 'accessToken' | 'refreshToken';

const TOKEN_KEYS: TokenKey[] = ['accessToken', 'refreshToken'];

// SecureStore (Keychain / Keystore) is unavailable on web, so the web build
// keeps using AsyncStorage (localStorage).
const useSecureStore = Platform.OS !== 'web';

// Set by clear(): a get() that read a legacy token before the clear began must
// not write it back into SecureStore afterwards.
let clearedAt = 0;

export const tokenStorage = {
  async get(key: TokenKey): Promise<string | null> {
    if (!useSecureStore) {
      return AsyncStorage.getItem(key);
    }

    const value = await SecureStore.getItemAsync(key);
    if (value !== null) {
      return value;
    }

    // Move tokens saved in plain AsyncStorage by older app versions. The
    // clearedAt checks keep a mid-flight read from resurrecting a token that
    // clear() is in the middle of deleting.
    const snapshot = clearedAt;
    const legacy = await AsyncStorage.getItem(key);
    if (legacy === null || snapshot !== clearedAt) {
      return snapshot !== clearedAt ? null : legacy;
    }
    await AsyncStorage.removeItem(key);
    if (snapshot !== clearedAt) {
      return null;
    }
    await SecureStore.setItemAsync(key, legacy);
    return legacy;
  },

  async set(key: TokenKey, value: string): Promise<void> {
    if (!useSecureStore) {
      await AsyncStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async setTokens(tokens: { accessToken: string; refreshToken: string }): Promise<void> {
    await Promise.all([
      tokenStorage.set('accessToken', tokens.accessToken),
      tokenStorage.set('refreshToken', tokens.refreshToken),
    ]);
  },

  async clear(): Promise<void> {
    clearedAt = Date.now();
    await AsyncStorage.multiRemove(TOKEN_KEYS);
    if (useSecureStore) {
      await Promise.all(TOKEN_KEYS.map((key) => SecureStore.deleteItemAsync(key)));
    }
  },
};
