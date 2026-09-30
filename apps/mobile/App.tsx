import { colors } from './src/theme';
import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { navigationRef } from "./src/navigation/navigationRef";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Alert, Image, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useUserStore } from "./src/store/userStore";
import { authService } from "./src/services/auth.service";
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import Screens
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import InterestsScreen from "./src/screens/InterestsScreen";
import HomeScreen from "./src/screens/HomeScreen";
import EventsScreen from "./src/screens/EventsScreen";
import EventDetailScreen from "./src/screens/EventsDetailScreen";
import ChatScreen from "./src/screens/ChatScreen";
import AIEventsScreen from "./src/screens/AIEventsScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import ConnectionTestScreen from "./src/screens/ConnectionTestScreen";
import LoadingScreen from "./src/screens/LoadingScreen";
import WalletScreen from "./src/screens/WalletScreen";
import CreateEventScreen from "./src/screens/CreateEventScreen";
import MyEventsScreen from "./src/screens/MyEventsScreen";
import CheckInScreen from "./src/screens/CheckInScreen";
import FindFriendsScreen from "./src/screens/FindFriendsScreen";
import ClaimTicketScreen from "./src/screens/ClaimTicketScreen";
import WeekendDigestScreen from "./src/screens/WeekendDigestScreen";
import VerifyOrganizersScreen from "./src/screens/VerifyOrganizersScreen";
import CustomizeHomeScreen from "./src/screens/CustomizeHomeScreen";
import { inviteRef } from "./src/utils/inviteRef";
import { ticketsService } from "./src/services/tickets.service";
import { navigateToTab } from "./src/navigation/navigationRef";
import { setLocale, STORAGE_KEY, useLocale } from "./src/i18n";
import { shadow, radius } from "./src/theme";
import ChatFab from "./src/components/ChatFab";
import { useBreakpoint } from "./src/hooks/useBreakpoint";
import WebTopNav from "./src/components/WebTopNav";
import Container from "./src/components/Container";
import './src/web/globalStyles';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const CHECKOUT_SUCCESS_QUERY = 'checkout=success';
const CHECKOUT_CANCEL_QUERY = 'checkout=cancel';

// Custom Tab Icon Component
const CustomTabIcon = ({ routeName, focused }: { routeName: string, focused: boolean }) => {
  const { t } = useLocale();
  let iconName: keyof typeof Ionicons.glyphMap = 'home-outline';
  let label = 'home';
  switch (routeName) {
    case "HomeTab":
      iconName = focused ? 'home' : 'home-outline';
      label = 'home';
      break;
    case "EventsTab":
      iconName = focused ? 'compass' : 'compass-outline';
      label = 'events';
      break;
    case "WalletTab":
      iconName = focused ? 'wallet' : 'wallet-outline';
      label = 'wallet';
      break;
    case "ProfileTab":
      iconName = focused ? 'person' : 'person-outline';
      label = 'profile';
      break;
  }
  return (
    <View style={[styles.iconContainer, focused && styles.iconContainerFocused]}>
      <Ionicons name={iconName} size={22} color={focused ? colors.primary : colors.textMuted} />
      {focused ? <Text style={styles.activeTabLabel}>{t(label as any)}</Text> : null}
    </View>
  );
};

// Updated MainTabs with custom icons
function MainTabs() {
  const { t } = useLocale();
  const { isWebDesktop } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const tabBarStyle = isWebDesktop ? { display: 'none' as const } : {
    borderTopWidth: 0,
    backgroundColor: colors.surface,
    minHeight: 64 + insets.bottom,
    height: 64 + insets.bottom,
    paddingBottom: Math.max(8, insets.bottom),
    paddingTop: 4,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.float,
    maxWidth: '100%' as const,
  };
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => (
          <CustomTabIcon routeName={route.name} focused={focused} />
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarShowLabel: false,
        tabBarStyle,
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ title: t('home') }}
      />
      <Tab.Screen
        name="EventsTab"
        component={EventsScreen}
        options={{ title: t('events') }}
      />
      <Tab.Screen
        name="WalletTab"
        component={WalletScreen}
        options={{ title: t('wallet') }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ title: t('profile') }}
      />
    </Tab.Navigator>
  );
}

// Profile Stack Navigator for nested navigation
export function ProfileStack() {
  const { t } = useLocale();
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ProfileMain"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Interests"
        component={InterestsScreen}
        options={{ title: t('update_interests') }}
      />
      <Stack.Screen
        name="ConnectionTest"
        component={ConnectionTestScreen}
        options={{ title: t('connection_test') }}
      />
      <Stack.Screen
        name="CreateEvent"
        component={CreateEventScreen}
        options={{ title: t('create_event'), headerBackTitle: t('back') }}
      />
      <Stack.Screen
        name="MyEvents"
        component={MyEventsScreen}
        options={{ title: t('my_events'), headerBackTitle: t('back') }}
      />
      <Stack.Screen
        name="CheckIn"
        component={CheckInScreen}
        options={{ title: t('check_in'), headerBackTitle: t('back') }}
      />
      <Stack.Screen
        name="FindFriends"
        component={FindFriendsScreen}
        options={{ title: t('find_friends'), headerBackTitle: t('back') }}
      />
      <Stack.Screen
        name="VerifyOrganizers"
        component={VerifyOrganizersScreen}
        options={{ title: t('verify_organizers'), headerBackTitle: t('back') }}
      />
    </Stack.Navigator>
  );
}

// Updated MainTabsWithProfileStack with custom icons
function MainTabsWithProfileStack() {
  const { t } = useLocale();
  const { isWebDesktop } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const tabBarStyle = isWebDesktop ? { display: 'none' as const } : {
    borderTopWidth: 0,
    backgroundColor: colors.surface,
    minHeight: 64 + insets.bottom,
    height: 64 + insets.bottom,
    paddingBottom: Math.max(8, insets.bottom),
    paddingTop: 4,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.float,
    maxWidth: '100%' as const,
  };
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => (
          <CustomTabIcon routeName={route.name} focused={focused} />
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarShowLabel: false,
        tabBarStyle,
        headerShown: false,
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ title: t('home') }}
      />
      <Tab.Screen
        name="EventsTab"
        component={EventsScreen}
        options={{ title: t('events') }}
      />
      <Tab.Screen
        name="WalletTab"
        component={WalletScreen}
        options={{ title: t('wallet') }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{ title: t('profile') }}
      />
    </Tab.Navigator>
  );
}

function getActiveTab(state: any = navigationRef.getRootState()): string | undefined {
  const routes = state?.routes ?? [];
  let nestedState: any;
  for (let index = Math.min(state?.index ?? routes.length - 1, routes.length - 1); index >= 0; index -= 1) {
    if (routes[index].name === 'Main') {
      nestedState = routes[index].state;
      break;
    }
  }
  const tabRoutes = ['HomeTab', 'EventsTab', 'WalletTab', 'ProfileTab'];

  while (nestedState?.routes?.length) {
    const focusedRoute: any = nestedState.routes[nestedState.index ?? 0];
    if (!focusedRoute) return undefined;
    if (tabRoutes.includes(focusedRoute.name)) return focusedRoute.name;
    nestedState = focusedRoute.state;
  }

  return undefined;
}

function AppFrame({ children, showChatFab, currentRoute, activeTab }: {
  children: React.ReactNode;
  showChatFab: boolean;
  currentRoute?: string;
  activeTab?: string;
}) {
  const { isWebDesktop } = useBreakpoint();
  const showFabOnRoute = ['Main', 'HomeTab', 'EventsTab', 'WalletTab', 'ProfileTab'].includes(currentRoute || 'Main');
  const centeredDesktopRoutes = new Set([
    'Interests',
    'ConnectionTest',
    'MyEvents',
    'CheckIn',
    'FindFriends',
    'VerifyOrganizers',
    'AIEvents',
    'ClaimTicket',
    'WeekendDigest',
    'CustomizeHome',
  ]);

  return (
    <View style={styles.frameBackdrop}>
      <View style={styles.frame}>
        {showChatFab && isWebDesktop ? <WebTopNav activeTab={activeTab} /> : null}
        {isWebDesktop && centeredDesktopRoutes.has(currentRoute || '')
          ? <Container style={styles.desktopSecondaryContent}>{children}</Container>
          : children}
        {showChatFab && showFabOnRoute ? <ChatFab /> : null}
      </View>
    </View>
  );
}

export default function App() {
  const { user, firstLogin, loadUserFromStorage, setUser, setFirstLogin } = useUserStore();
  const [appLoading, setAppLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<string | undefined>();
  const { t } = useLocale();

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    if (appLoading) return undefined;
    let active = true;

    const processCheckoutUrl = async (url: string) => {
      try {
        const parsed = new URL(url);
        const transferCode = parsed.searchParams.get('transfer')
          || (parsed.protocol === 'migo:' && parsed.hostname === 'transfer' ? parsed.pathname.split('/').filter(Boolean)[1] : null);
        if (transferCode) {
          if (!user) {
            inviteRef.setTransfer(transferCode);
            return;
          }
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.replaceState({}, '', `${parsed.pathname}${parsed.hash}`);
          }
          inviteRef.setTransfer(null);
          navigationRef.current?.navigate('ClaimTicket', { code: transferCode });
          return;
        }
        const eventId = parsed.searchParams.get('event')
          || (parsed.protocol === 'migo:' && parsed.hostname === 'event' ? parsed.pathname.slice(1) : null);
        const ref = parsed.searchParams.get('ref');
        const tab = parsed.searchParams.get('tab');
        if (eventId) {
          inviteRef.set(ref);
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.replaceState({}, '', `${parsed.pathname}${parsed.hash}`);
          }
          navigationRef.current?.navigate('EventDetail', { eventId });
          return;
        }
        if (tab?.toLowerCase() === 'wallet') {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.history.replaceState({}, '', `${parsed.pathname}${parsed.hash}`);
          }
          navigateToTab('Wallet');
        }
        const checkout = parsed.searchParams.get('checkout');
        const bookingId = parsed.searchParams.get('bookingId');
        if (!checkout) return;

        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.history.replaceState({}, '', `${parsed.pathname}${parsed.hash}`);
        }
        if (checkout === CHECKOUT_CANCEL_QUERY.split('=')[1]) {
          Alert.alert(t('payment_cancelled'));
          return;
        }
        if (checkout !== CHECKOUT_SUCCESS_QUERY.split('=')[1] || !bookingId) return;

        for (let attempt = 0; attempt < 5 && active; attempt += 1) {
          const result = await ticketsService.confirm(bookingId);
          if (result.status === 'CONFIRMED') {
            navigateToTab('Wallet');
            Alert.alert(t('payment_received'));
            return;
          }
          if (attempt < 4) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        Alert.alert(t('payment_processing'), t('payment_processing_help'));
      } catch (error) {
        console.error('Checkout return handling failed:', error);
        Alert.alert(t('payment_failed'), t('payment_failed_help'));
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      void processCheckoutUrl(window.location.href);
      if (!user) return undefined;
      return undefined;
    }

    let subscription: { remove: () => void } | undefined;
    void Linking.getInitialURL().then(url => {
      if (url) void processCheckoutUrl(url);
    });
    const pendingTransfer = inviteRef.getTransfer();
    if (user && pendingTransfer) {
      inviteRef.setTransfer(null);
      navigationRef.current?.navigate('ClaimTicket', { code: pendingTransfer });
    }
    subscription = Linking.addEventListener('url', event => {
      void processCheckoutUrl(event.url);
    });
    return () => {
      subscription?.remove();
      active = false;
    };
  }, [appLoading, user]);

  const initializeApp = async () => {
    try {
      console.log('🔍 Starting app initialization...');
      
      // Load stored data first
      await loadUserFromStorage();
      
      // Check if we have a stored token and validate it
      const accessToken = await AsyncStorage.getItem('accessToken');
      const refreshToken = await AsyncStorage.getItem('refreshToken');
      const storedUser = await AsyncStorage.getItem('user');
      
      console.log('📦 Stored data:', {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        hasStoredUser: !!storedUser,
        userFromStore: user,
        firstLoginFromStore: firstLogin,
      });
      
      if (accessToken && refreshToken && storedUser) {
        try {
          // Initialize API with stored token
          await authService.initializeApiToken();
          
          // Try to get current user to validate token
          const currentUser = await authService.getCurrentUser();
          const localLocale = await AsyncStorage.getItem(STORAGE_KEY);
          const serverLocale = currentUser.preferences?.locale;
          if (!localLocale && (serverLocale === 'en' || serverLocale === 'ar')) {
            await setLocale(serverLocale);
          }
          console.log('✅ Valid token, user:', currentUser.email);
          
          // Check if user has interests for first login logic
          const parsedUser = JSON.parse(storedUser);
          const hasInterests = parsedUser.interests && parsedUser.interests.length > 0;
          
          setUser(parsedUser);
          setFirstLogin(!hasInterests);
          
        } catch (error) {
          console.log(
            '❌ Token validation failed:',
            error instanceof Error ? error.message : String(error)
          );
          // Clear invalid tokens
          await authService.logout();
          setUser(null);
          setFirstLogin(false);
        }
      } else {
        console.log('📭 No stored tokens found, showing login screen');
        setUser(null);
        setFirstLogin(false);
      }
      
    } catch (error) {
      console.error('🚨 Failed to initialize app:', error);
      // Clear everything on error
      await authService.logout();
      setUser(null);
      setFirstLogin(false);
    } finally {
      setAppLoading(false);
      setAuthChecked(true);
    }
  };

  if (appLoading) {
    return <LoadingScreen message={t('initializing_app')} />;
  }

  console.log('📍 Navigation state:', {
    user: user ? user.email : 'No user',
    firstLogin,
    showingAuth: !user,
    showingInterests: user && firstLogin,
    showingMain: user && !firstLogin,
  });

  return (
    <SafeAreaProvider>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          setCurrentRoute(navigationRef.current?.getCurrentRoute()?.name);
          setActiveTab(getActiveTab());
        }}
        onStateChange={state => {
          setCurrentRoute(navigationRef.current?.getCurrentRoute()?.name);
          setActiveTab(getActiveTab(state));
        }}
      >
        <AppFrame showChatFab={Boolean(user && !firstLogin)} currentRoute={currentRoute} activeTab={activeTab}>
          <Stack.Navigator initialRouteName={!user ? "Register" : undefined}>
            {!user ? (
              // Auth Screens
              <>
                <Stack.Screen
                  name="Register"
                  component={RegisterScreen}
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="Login"
                  component={LoginScreen}
                  options={{ headerShown: false }}
                />

              </>
            ) : firstLogin ? (
              // First Login - Interests Selection
              <Stack.Screen
                name="Interests"
                component={InterestsScreen}
                options={{ headerShown: false }}
              />
            ) : (
              // Main App
              <>
                <Stack.Screen
                  name="Main"
                  component={MainTabsWithProfileStack}
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="EventDetail"
                  component={EventDetailScreen}
                  options={{
                    headerShown: false,
                  }}
                />
                <Stack.Screen
                  name="Chat"
                  component={ChatScreen}
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="AIEvents"
                  component={AIEventsScreen}
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="ClaimTicket"
                  component={ClaimTicketScreen}
                  options={{ title: t('claim_ticket'), headerBackTitle: t('back') }}
                />
                <Stack.Screen
                  name="WeekendDigest"
                  component={WeekendDigestScreen}
                  options={{ title: t('weekend_digest'), headerBackTitle: t('back') }}
                />
                <Stack.Screen
                  name="CustomizeHome"
                  component={CustomizeHomeScreen}
                  options={{ title: t('customize_home'), headerBackTitle: t('back') }}
                />
              </>
            )}
          </Stack.Navigator>
        </AppFrame>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  frameBackdrop: { flex: 1, backgroundColor: colors.bg },
  desktopSecondaryContent: { flex: 1 },
  frame: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.bg,
  },
  iconContainer: {
    minWidth: 34,
    height: 36,
    paddingHorizontal: 6,
    flexDirection: 'row',
    gap: 4,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainerFocused: { backgroundColor: colors.primarySoft },
  activeTabLabel: { color: colors.primary, fontSize: 10, fontWeight: '700' },
});