import { api } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tokenStorage } from './tokenStorage';
import { HomeLayout } from '../config/homeSections';

export interface User {
  id: string;
  email: string | null;
  name: string;
  phone?: string | null;
  avatar?: string | null;
  coverImage?: string | null;
  bio?: string | null;
  role: 'USER' | 'ORGANIZER' | 'SUPPLIER' | 'ADMIN';
  status?: 'ACTIVE' | 'PAUSED' | 'DELETED';
  authMethod?: string | null;
  supplierId?: string | null;
  isPrivate?: boolean;
  interests: string[];
  preferences?: {
    notifications?: boolean;
    location?: string;
    theme?: 'light' | 'dark';
    locale?: 'en' | 'ar';
    homeLayout?: HomeLayout;
    reminders?: {
      email?: boolean;
      whatsapp?: boolean;
      saved?: boolean;
    };
  };
  createdAt: string;
  updatedAt: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
}

export const isHost = (user?: Pick<User, 'role'> | null): boolean =>
  user?.role === 'ORGANIZER' || user?.role === 'SUPPLIER' || user?.role === 'ADMIN';

export const isSupplier = (user?: Pick<User, 'role'> | null): boolean =>
  user?.role === 'SUPPLIER';

export const isAdmin = (user?: Pick<User, 'role'> | null): boolean =>
  user?.role === 'ADMIN';

export interface AuthResponse {
  user: User;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
  isFirstLogin: boolean;
}

export interface LoginCredentials {
  identifier: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export const authService = {
  async sendPhoneSignupOtp(data: { phone: string; name?: string }): Promise<void> {
    try {
      await api.post('/auth/phone-signup/send-otp', data);
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error || error.message || 'Failed to send verification code'
      );
    }
  },

  async verifyPhoneSignupOtp(data: {
    phone: string;
    code: string;
    name?: string;
  }): Promise<AuthResponse> {
    try {
      const response = await api.post<ApiResponse<AuthResponse>>(
        '/auth/phone-signup/verify-otp',
        data
      );
      const { user, tokens, isFirstLogin } = response.data.data;

      await tokenStorage.setTokens(tokens);
      await AsyncStorage.setItem('user', JSON.stringify(user));
      await AsyncStorage.setItem('firstLogin', JSON.stringify(isFirstLogin));
      api.defaults.headers.common.Authorization = `Bearer ${tokens.accessToken}`;

      return response.data.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error || error.message || 'Verification failed'
      );
    }
  },

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await api.post<ApiResponse<AuthResponse>>('/auth/login', credentials);
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Login failed');
      }
      
      const { user, tokens, isFirstLogin } = response.data.data;
      
      // Store tokens and user data
      await tokenStorage.setTokens(tokens);
      await AsyncStorage.setItem('user', JSON.stringify(user));
      await AsyncStorage.setItem('firstLogin', JSON.stringify(isFirstLogin));
      
      // Update API default headers with new token
      api.defaults.headers.common['Authorization'] = `Bearer ${tokens.accessToken}`;
      
      return response.data.data;
    } catch (error: any) {
      console.error('Login error:', error.response?.data || error.message);
      const loginError = new Error(
        error.response?.data?.error || 
        error.response?.data?.message || 
        error.message || 
        'Login failed'
      );
      (loginError as Error & { code?: string }).code = error.response?.data?.code;
      throw loginError;
    }
  },

  async register(data: RegisterData): Promise<AuthResponse> {
    try {
      const response = await api.post<ApiResponse<AuthResponse>>('/auth/register', data);
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Registration failed');
      }
      
      const { user, tokens, isFirstLogin } = response.data.data;
      
      await tokenStorage.setTokens(tokens);
      await AsyncStorage.setItem('user', JSON.stringify(user));
      await AsyncStorage.setItem('firstLogin', JSON.stringify(isFirstLogin));
      
      // Update API default headers
      api.defaults.headers.common['Authorization'] = `Bearer ${tokens.accessToken}`;
      
      return response.data.data;
    } catch (error: any) {
      console.error('Registration error:', error.response?.data || error.message);
      throw new Error(
        error.response?.data?.error || 
        error.response?.data?.message || 
        error.message || 
        'Registration failed'
      );
    }
  },

  async requestPasswordReset(email: string): Promise<void> {
    try {
      await api.post('/auth/forgot-password', { email });
    } catch (error: any) {
      throw new Error(error.response?.data?.error || error.message || 'Could not send the reset link');
    }
  },

  async resetPassword(token: string, password: string): Promise<void> {
    try {
      await api.post('/auth/reset-password', { token, password });
    } catch (error: any) {
      throw new Error(error.response?.data?.error || error.message || 'Could not reset the password');
    }
  },

  async deleteAccount(password?: string): Promise<void> {
    try {
      await api.delete('/users/me', { data: { password } });
    } catch (error: any) {
      const deletionError = new Error(
        error.response?.data?.error || error.message || 'Failed to delete account'
      ) as Error & { code?: string };
      deletionError.code = error.response?.data?.code;
      throw deletionError;
    }
  },

  async logout(): Promise<void> {
    try {
      const refreshToken = await tokenStorage.get('refreshToken');
      
      if (refreshToken) {
        await api.post<ApiResponse<{ message: string }>>('/auth/logout', { 
          refreshToken 
        });
      }
      
      // Clear all stored data
      await Promise.all([
        tokenStorage.clear(),
        AsyncStorage.multiRemove(['user', 'firstLogin']),
      ]);
      
      // Remove authorization header
      delete api.defaults.headers.common['Authorization'];
      
    } catch (error: any) {
      console.error('Logout error:', error);
      // Even if API call fails, clear local storage
      await Promise.all([
        tokenStorage.clear(),
        AsyncStorage.multiRemove(['user', 'firstLogin']),
      ]);
      delete api.defaults.headers.common['Authorization'];
    }
  },

  async getCurrentUser(): Promise<User> {
    try {
      const response = await api.get<ApiResponse<User>>('/auth/me');
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to fetch user');
      }
      
      return response.data.data;
    } catch (error: any) {
      console.error('Get user error:', error);
      throw error;
    }
  },

  async updateInterests(interests: string[]): Promise<User> {
    try {
      const response = await api.put<ApiResponse<User>>('/auth/interests', { interests });
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to update interests');
      }
      
      const updatedUser = response.data.data;
      
      // Update stored user and set firstLogin to false
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
      await AsyncStorage.setItem('firstLogin', JSON.stringify(false));
      
      return updatedUser;
    } catch (error: any) {
      console.error('Update interests error:', error);
      throw new Error(
        error.response?.data?.error || 
        error.response?.data?.message || 
        error.message || 
        'Failed to update interests'
      );
    }
  },

  async updateProfile(data: Partial<User>): Promise<User> {
    try {
      const response = await api.put<ApiResponse<User>>('/users/me', data);
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to update profile');
      }
      
      const updatedUser = response.data.data;
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
      
      return updatedUser;
    } catch (error: any) {
      console.error('Update profile error:', error);
      throw new Error(
        error.response?.data?.error || 
        error.response?.data?.message || 
        error.message || 
        'Failed to update profile'
      );
    }
  },

  async updateLocale(locale: 'en' | 'ar'): Promise<User> {
    const response = await api.put<ApiResponse<User>>('/users/me', {
      preferences: { locale },
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update language');
    }
    await AsyncStorage.setItem('user', JSON.stringify(response.data.data));
    return response.data.data;
  },

  async updateHomeLayout(homeLayout: HomeLayout): Promise<User> {
    const response = await api.put<ApiResponse<User>>('/users/me', {
      preferences: { homeLayout },
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update Home layout');
    }
    await AsyncStorage.setItem('user', JSON.stringify(response.data.data));
    return response.data.data;
  },

  async updateReminders(
    phone: string | null,
    reminders: { email: boolean; whatsapp: boolean; saved: boolean },
  ): Promise<User> {
    const response = await api.put<ApiResponse<User>>('/users/me', {
      phone,
      preferences: { reminders },
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to update reminders');
    }
    await AsyncStorage.setItem('user', JSON.stringify(response.data.data));
    return response.data.data;
  },

  async refreshAccessToken(): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    try {
      const refreshToken = await tokenStorage.get('refreshToken');
      
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }
      
      const response = await api.post<ApiResponse<{ accessToken: string; refreshToken: string; expiresIn: number }>>(
        '/auth/refresh-token',
        { refreshToken }
      );
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Token refresh failed');
      }
      
      const { accessToken, refreshToken: newRefreshToken, expiresIn } = response.data.data;
      
      await tokenStorage.setTokens({ accessToken, refreshToken: newRefreshToken });
      
      // Update API default headers
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
      
      return { accessToken, refreshToken: newRefreshToken, expiresIn };
    } catch (error: any) {
      console.error('Token refresh error:', error);
      throw error;
    }
  },

  async socialLogin(idToken: string, provider: 'google' | 'apple' | 'facebook'): Promise<AuthResponse> {
    try {
      const response = await api.post<ApiResponse<AuthResponse>>('/auth/social-login', {
        idToken,
        provider,
      });
      
      if (!response.data.success) {
        throw new Error(response.data.error || 'Social login failed');
      }
      
      const { user, tokens, isFirstLogin } = response.data.data;
      
      await tokenStorage.setTokens(tokens);
      await AsyncStorage.setItem('user', JSON.stringify(user));
      await AsyncStorage.setItem('firstLogin', JSON.stringify(isFirstLogin));
      
      // Update API default headers
      api.defaults.headers.common['Authorization'] = `Bearer ${tokens.accessToken}`;
      
      return response.data.data;
    } catch (error: any) {
      console.error('Social login error:', error.response?.data || error.message);
      throw new Error(
        error.response?.data?.error || 
        error.response?.data?.message || 
        error.message || 
        'Social login failed'
      );
    }
  },

  // Initialize API with stored token
  async initializeApiToken(): Promise<void> {
    try {
      const accessToken = await tokenStorage.get('accessToken');
      
      if (accessToken) {
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
      }
    } catch (error) {
      console.error('Failed to initialize API token:', error);
    }
  },

  // Check if user is authenticated
  async isAuthenticated(): Promise<boolean> {
    try {
      const accessToken = await tokenStorage.get('accessToken');
      const refreshToken = await tokenStorage.get('refreshToken');
      
      return !!(accessToken && refreshToken);
    } catch (error) {
      console.error('Auth check error:', error);
      return false;
    }
  },

  // Get stored tokens
  async getStoredTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
    try {
      const [accessToken, refreshToken] = await Promise.all([
        tokenStorage.get('accessToken'),
        tokenStorage.get('refreshToken'),
      ]);
      
      return { accessToken, refreshToken };
    } catch (error) {
      console.error('Failed to get stored tokens:', error);
      return { accessToken: null, refreshToken: null };
    }
  },
};