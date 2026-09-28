import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type TokenKey = 'accessToken' | 'refreshToken';

const TOKEN_KEYS: TokenKey[] = ['accessToken', 'refreshToken'];

// SecureStore (Keychain / Keystore) is unavailable on web, so the web build
// keeps using AsyncStorage (localStorage).
const useSecureStore = Platform.OS !== 'web';

export const tokenStorage = {
  async get(key: TokenKey): Promise<string | null> {
    if (!useSecureStore) {
      return AsyncStorage.getItem(key);
    }

    const value = await SecureStore.getItemAsync(key);
    if (value !== null) {
      return value;
    }

    // Move tokens saved in plain AsyncStorage by older app versions.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy !== null) {
      await SecureStore.setItemAsync(key, legacy);
      await AsyncStorage.removeItem(key);
    }
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
    await AsyncStorage.multiRemove(TOKEN_KEYS);
    if (useSecureStore) {
      await Promise.all(TOKEN_KEYS.map((key) => SecureStore.deleteItemAsync(key)));
    }
  },
};
