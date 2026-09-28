import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { navigationRef } from "./src/navigation/navigationRef";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Alert, Image, Linking, Platform, StyleSheet, View } from "react-native";
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
import { inviteRef } from "./src/utils/inviteRef";
import { ticketsService } from "./src/services/tickets.service";
import { navigateToTab } from "./src/navigation/navigationRef";
import { setLocale, STORAGE_KEY, useLocale } from "./src/i18n";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const CHECKOUT_SUCCESS_QUERY = 'checkout=success';
const CHECKOUT_CANCEL_QUERY = 'checkout=cancel';

// Custom Tab Icon Component
const CustomTabIcon = ({ routeName, focused }: { routeName: string, focused: boolean }) => {
  if (routeName === "WalletTab") {
    return (
      <View style={styles.iconContainer}>
        <Ionicons
          name={focused ? "wallet" : "wallet-outline"}
          size={24}
          color={focused ? "#3b82f6" : "#9ca3af"}
        />
      </View>
    );
  }

  let iconSource;
  
  switch (routeName) {
    case "HomeTab":
      iconSource = require('./assets/icons/home.png');
      break;
    case "EventsTab":
      iconSource = require('./assets/icons/events.png');
      break;
    case "ChatTab":
      iconSource = require('./assets/icons/AIchat.png');
      break;
    case "ProfileTab":
      iconSource = require('./assets/icons/profile.png');
      break;
    default:
      iconSource = require('./assets/icons/home.png');
  }
  
  return (
    <View style={styles.iconContainer}>
      <Image 
        source={iconSource} 
        style={[
          styles.tabIcon,
          { tintColor: focused ? "#3b82f6" : "#9ca3af" }
        ]}
        resizeMode="contain"
      />
    </View>
  );
};

// Updated MainTabs with custom icons
function MainTabs() {
  const { t } = useLocale();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => (
          <CustomTabIcon routeName={route.name} focused={focused} />
        ),
        tabBarActiveTintColor: "#3b82f6",
        tabBarInactiveTintColor: "#9ca3af",
        tabBarLabelStyle: { fontSize: 11 },
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: "#e5e7eb",
          minHeight: 60,
          maxWidth: '100%',
        },
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
        name="ChatTab"
        component={ChatScreen}
        options={{ title: t('chat') }}
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
    </Stack.Navigator>
  );
}

// Updated MainTabsWithProfileStack with custom icons
function MainTabsWithProfileStack() {
  const { t } = useLocale();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => (
          <CustomTabIcon routeName={route.name} focused={focused} />
        ),
        tabBarActiveTintColor: "#3b82f6",
        tabBarInactiveTintColor: "#9ca3af",
        tabBarLabelStyle: { fontSize: 11 },
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: "#e5e7eb",
          minHeight: 60,
          maxWidth: '100%',
        },
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
        name="ChatTab"
        component={ChatScreen}
        options={{ title: t('chat') }}
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

export default function App() {
  const { user, firstLogin, loadUserFromStorage, setUser, setFirstLogin } = useUserStore();
  const [appLoading, setAppLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
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
      <NavigationContainer ref={navigationRef}>
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
                  title: "Event Details",
                  headerBackTitle: "Back",
                }}
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
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabIcon: {
    width: 24,
    height: 24,
  },
});