// migo-mobile/src/store/userStore.ts - UPDATED
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tokenStorage } from '../services/tokenStorage';
import { authService, User } from '../services/auth.service';
import { HomeLayout } from '../config/homeSections';
import { registerAccountPausedHandler } from '../services/accountPause';

interface UserStore {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  firstLogin: boolean;
  accountPaused: boolean;
  userLocation: string | null; // User's preferred city for filtering events

  // Actions
  setUser: (user: User | null) => Promise<void>;
  setFirstLogin: (value: boolean) => Promise<void>;
  updateInterests: (interests: string[]) => Promise<void>;
  updateHomeLayout: (homeLayout: HomeLayout) => Promise<void>;
  updateReminders: (phone: string | null, reminders: { email: boolean; whatsapp: boolean; saved: boolean }) => Promise<void>;
  setUserLocation: (city: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUserFromStorage: () => Promise<void>;
  clearError: () => void;
  clearAccountPaused: () => void;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

export const useUserStore = create<UserStore>((set, get) => ({
  user: null,
  isLoading: false,
  error: null,
  firstLogin: false,
  accountPaused: false,
  userLocation: null, // Will be set from storage or default to 'New York'
  
  setUser: async (user) => {
    const currentUser = get().user;
    const nextUser = user && currentUser?.id === user.id
      ? {
          ...currentUser,
          ...user,
          interests: user.interests ?? currentUser.interests,
          preferences: { ...currentUser.preferences, ...user.preferences },
        }
      : user;
    set({ user: nextUser, error: null, ...(nextUser ? { accountPaused: false } : {}) });
    if (nextUser) {
      await AsyncStorage.setItem('user', JSON.stringify(nextUser));
    } else {
      await AsyncStorage.removeItem('user');
    }
  },
  
  setFirstLogin: async (value: boolean) => {
    set({ firstLogin: value });
    await AsyncStorage.setItem('firstLogin', JSON.stringify(value));
  },
  
  updateInterests: async (interests) => {
    try {
      set({ isLoading: true, error: null });
      const updatedUser = await authService.updateInterests(interests);

      // Always merge locally-selected interests into the returned user object.
      // Some API responses may omit the interests field; this guarantees they are preserved.
      const userWithInterests: User = { ...updatedUser, interests };

      set({
        user: userWithInterests,
        firstLogin: false,
        isLoading: false,
      });

      await AsyncStorage.setItem('user', JSON.stringify(userWithInterests));
      await AsyncStorage.setItem('firstLogin', JSON.stringify(false));

    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  updateHomeLayout: async (homeLayout) => {
    const previousUser = get().user;
    if (!previousUser) return;
    const optimisticUser: User = {
      ...previousUser,
      preferences: {
        ...previousUser.preferences,
        homeLayout,
      },
    };
    set({ user: optimisticUser, isLoading: true, error: null });
    try {
      const updatedUser = await authService.updateHomeLayout(homeLayout);
      const mergedUser = {
        ...previousUser,
        ...updatedUser,
        interests: updatedUser.interests ?? previousUser.interests,
        preferences: { ...previousUser.preferences, ...updatedUser.preferences },
      };
      set({ user: mergedUser, isLoading: false });
      await AsyncStorage.setItem('user', JSON.stringify(mergedUser));
    } catch (error: any) {
      set({ user: previousUser, isLoading: false, error: error.message });
      throw error;
    }
  },

  updateReminders: async (phone, reminders) => {
    const previousUser = get().user;
    if (!previousUser) return;
    set({ isLoading: true, error: null });
    try {
      const updatedUser = await authService.updateReminders(phone, reminders);
      const mergedUser: User = {
        ...previousUser,
        ...updatedUser,
        phone: updatedUser.phone === undefined ? previousUser.phone : updatedUser.phone,
        interests: updatedUser.interests ?? previousUser.interests,
        preferences: {
          ...previousUser.preferences,
          ...updatedUser.preferences,
          reminders: {
            ...previousUser.preferences?.reminders,
            ...updatedUser.preferences?.reminders,
          },
        },
      };
      set({ user: mergedUser, isLoading: false });
      await AsyncStorage.setItem('user', JSON.stringify(mergedUser));
    } catch (error: any) {
      set({ isLoading: false, error: error.message });
      throw error;
    }
  },

  setUserLocation: async (city: string) => {
    set({ userLocation: city });
    await AsyncStorage.setItem('userLocation', city);
  },
  
  logout: async () => {
    try {
      set({ isLoading: true });
      await authService.logout();
      
      // Clear all state in one operation
      set({ 
        user: null, 
        firstLogin: false, 
        error: null, 
        isLoading: false 
      });
      
      // Clear all storage
      await Promise.all([
        tokenStorage.clear(),
        AsyncStorage.multiRemove(['user', 'firstLogin']),
      ]);
      
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },
  
  loadUserFromStorage: async () => {
    try {
      set({ isLoading: true });

      // Load all data atomically — localProfileAvatar / localProfileName survive logout
      const [userString, firstLoginString, accessToken, userLocation, localAvatar, localName] = await Promise.all([
        AsyncStorage.getItem('user'),
        AsyncStorage.getItem('firstLogin'),
        tokenStorage.get('accessToken'),
        AsyncStorage.getItem('userLocation'),
        AsyncStorage.getItem('localProfileAvatar'),
        AsyncStorage.getItem('localProfileName'),
      ]);

      const updates: Partial<UserStore> = { isLoading: false };

      if (userString) {
        updates.user = JSON.parse(userString);
      }

      if (firstLoginString) {
        updates.firstLogin = JSON.parse(firstLoginString);
      }

      // Set user location or default to Dubai
      updates.userLocation = userLocation || 'Dubai';

      // If we have a token but no user, try to fetch user from API
      // Only do this if we actually have a valid token (not null/undefined)
      if (accessToken && accessToken.trim() !== '' && !updates.user) {
        try {
          const user = await authService.getCurrentUser();
          updates.user = user;
          await AsyncStorage.setItem('user', JSON.stringify(user));
        } catch (error) {
          if ((error as any)?.response?.data?.code === 'ACCOUNT_PAUSED') {
            await tokenStorage.clear();
            await AsyncStorage.multiRemove(['user', 'firstLogin']);
            set({ user: null, firstLogin: false, isLoading: false, accountPaused: true });
            return;
          }
          console.warn('Failed to fetch user with token:', error);
          // Clear invalid token
          await tokenStorage.clear();
        }
      }

      // Merge local profile overrides that survive logout/re-login.
      // localProfileAvatar: always local (no server upload in MVP).
      // localProfileName: set only when the API update failed.
      if (updates.user) {
        if (localAvatar) updates.user = { ...updates.user, avatar: localAvatar };
        if (localName)  updates.user = { ...updates.user, name: localName };
      }

      set(updates);

    } catch (error) {
      console.error('Failed to load user from storage:', error);
      set({ isLoading: false });
    }
  },
  
  clearError: () => set({ error: null }),
  clearAccountPaused: () => set({ accountPaused: false }),
  
  updateProfile: async (data) => {
    try {
      set({ isLoading: true, error: null });
      const updatedUser = await authService.updateProfile(data);
      set({ user: updatedUser, isLoading: false });
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
    } catch {
      // API unavailable or endpoint not implemented — fall back to local-only update
      set({ isLoading: false, error: null });
      const currentUser = get().user;
      if (currentUser) {
        const updated = { ...currentUser, ...data };
        set({ user: updated });
        await AsyncStorage.setItem('user', JSON.stringify(updated));
      }
      // Do not re-throw — local update is sufficient for MVP
    }
  },
}));

registerAccountPausedHandler(async () => {
  await Promise.all([
    tokenStorage.clear(),
    AsyncStorage.multiRemove(['user', 'firstLogin']),
  ]);
  useUserStore.setState({
    user: null,
    firstLogin: false,
    isLoading: false,
    error: null,
    accountPaused: true,
  });
});