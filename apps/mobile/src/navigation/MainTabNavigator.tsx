import { colors } from '../theme';
// src/navigation/MainTabNavigator.tsx - CUSTOM TAB BAR SOLUTION
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { setMainStackNavigation, setTabNavigation } from './navigationRef';

// Import screens
import HomeScreen from '../screens/HomeScreen';
import EventsScreen from '../screens/EventsScreen';
import EventDetailScreen from '../screens/EventsDetailScreen';
import ChatScreen from '../screens/ChatScreen';
import AIEventsScreen, { AIEventsParams } from '../screens/AIEventsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import InterestsScreen from '../screens/InterestsScreen';
import ConnectionTestScreen from '../screens/ConnectionTestScreen';
import WalletScreen from '../screens/WalletScreen';
import PlacesScreen from '../screens/PlacesScreen';
import PlaceDetailScreen, { PlaceDetailParams } from '../screens/PlaceDetailScreen';
import CreateEventScreen from '../screens/CreateEventScreen';
import MyEventsScreen from '../screens/MyEventsScreen';
import CheckInScreen from '../screens/CheckInScreen';
import PlansScreen from '../screens/PlansScreen';
import SupplierPortalScreen from '../screens/SupplierPortalScreen';
import SupplierPageScreen from '../screens/SupplierPageScreen';
import AdminModerationScreen from '../screens/AdminModerationScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import FollowListScreen from '../screens/FollowListScreen';
import FindFriendsScreen from '../screens/FindFriendsScreen';

// Param list types — exported so screens can type their navigation props
export type HomeStackParamList = {
  HomeMain: undefined;
  EventDetail: { eventId: string };
  UserProfile: { userId: string };
  FollowList: { userId: string; tab: 'followers' | 'following' };
  ConnectionTest: undefined;
  Interests: undefined;
};

export type EventsStackParamList = {
  EventsMain: { venueFilter?: string; dateFrom?: string; dateTo?: string } | undefined;
  EventDetail: { eventId: string };
  UserProfile: { userId: string };
  FollowList: { userId: string; tab: 'followers' | 'following' };
};

export type ChatStackParamList = {
  ChatMain: undefined;
  AIEvents: AIEventsParams;
  EventDetail: { eventId: string };
  Interests: undefined;
};

export type ProfileStackParamList = {
  MyProfile: undefined;
  ProfileMain: undefined;
  Interests: undefined;
  ConnectionTest: undefined;
  CreateEvent: undefined;
  MyEvents: undefined;
  CheckIn: { eventId?: string };
  FindFriends: undefined;
  UserProfile: { userId: string };
  FollowList: { userId: string; tab: 'followers' | 'following' | 'requests' };
  Plans: { selectedPlan?: 'HOST' | 'SUPPLIER' } | undefined;
  SupplierPortal: { supplierId?: string } | undefined;
  SupplierPage: { slug: string };
  AdminModeration: undefined;
};

export type WalletStackParamList = {
  WalletMain: undefined;
};

export type PlacesStackParamList = {
  PlacesMain: undefined;
  PlaceDetail: PlaceDetailParams;
  EventDetail: { eventId: string };
};

const Tab = createBottomTabNavigator();
const HomeStack    = createNativeStackNavigator<HomeStackParamList>();
const EventsStack  = createNativeStackNavigator<EventsStackParamList>();
const ChatStack    = createNativeStackNavigator<ChatStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const WalletStack  = createNativeStackNavigator<WalletStackParamList>();
const PlacesStack  = createNativeStackNavigator<PlacesStackParamList>();

// Home Stack Navigator
function HomeStackNavigator() {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <HomeStack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{
          title: 'Event Details',
          headerBackTitle: 'Back',
        }}
      />
      <HomeStack.Screen name="UserProfile" component={UserProfileScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="FollowList" component={FollowListScreen} options={{ headerShown: false }} />
      <HomeStack.Screen
        name="ConnectionTest"
        component={ConnectionTestScreen}
        options={{ title: 'Connection Test', headerBackTitle: 'Back' }}
      />
      <HomeStack.Screen
        name="Interests"
        component={InterestsScreen}
        options={{ title: 'Update Interests', headerBackTitle: 'Back' }}
      />
    </HomeStack.Navigator>
  );
}

// Events Stack Navigator
function EventsStackNavigator() {
  return (
    <EventsStack.Navigator>
      <EventsStack.Screen
        name="EventsMain"
        component={EventsScreen}
        options={{ headerShown: false }}
      />
      <EventsStack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{
          title: 'Event Details',
          headerBackTitle: 'Back',
        }}
      />
      <EventsStack.Screen name="UserProfile" component={UserProfileScreen} options={{ headerShown: false }} />
      <EventsStack.Screen name="FollowList" component={FollowListScreen} options={{ headerShown: false }} />
    </EventsStack.Navigator>
  );
}

// Chat Stack Navigator — gives ChatScreen a proper stack so it can navigate
// to AIEventsScreen (and EventDetail) without any cross-tab hacks.
function ChatStackNavigator() {
  return (
    <ChatStack.Navigator>
      <ChatStack.Screen
        name="ChatMain"
        component={ChatScreen}
        options={{ headerShown: false }}
      />
      <ChatStack.Screen
        name="AIEvents"
        component={AIEventsScreen}
        options={{ headerShown: false }}
      />
      <ChatStack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{ title: 'Event Details', headerBackTitle: 'Back' }}
      />
      <ChatStack.Screen
        name="Interests"
        component={InterestsScreen}
        options={{ title: 'Update Interests', headerBackTitle: 'Back' }}
      />
    </ChatStack.Navigator>
  );
}

// Profile Stack Navigator
function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator initialRouteName="MyProfile">
      <ProfileStack.Screen
        name="MyProfile"
        component={UserProfileScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="ProfileMain"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
      <ProfileStack.Screen
        name="Interests"
        component={InterestsScreen}
        options={{
          title: 'Select Interests',
          headerBackTitle: 'Back',
        }}
      />
      <ProfileStack.Screen
        name="ConnectionTest"
        component={ConnectionTestScreen}
        options={{ title: 'Connection Test', headerBackTitle: 'Back' }}
      />
      <ProfileStack.Screen
        name="CreateEvent"
        component={CreateEventScreen}
        options={{ title: 'Create an event', headerBackTitle: 'Back' }}
      />
      <ProfileStack.Screen
        name="MyEvents"
        component={MyEventsScreen}
        options={{ title: 'My events', headerBackTitle: 'Back' }}
      />
      <ProfileStack.Screen
        name="CheckIn"
        component={CheckInScreen}
        options={{ title: 'Check in', headerBackTitle: 'Back' }}
      />
      <ProfileStack.Screen
        name="FindFriends"
        component={FindFriendsScreen}
        options={{ title: 'Find friends', headerBackTitle: 'Back' }}
      />
      <ProfileStack.Screen name="Plans" component={PlansScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="SupplierPortal" component={SupplierPortalScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="SupplierPage" component={SupplierPageScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="AdminModeration" component={AdminModerationScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="UserProfile" component={UserProfileScreen} options={{ headerShown: false }} />
      <ProfileStack.Screen name="FollowList" component={FollowListScreen} options={{ headerShown: false }} />
    </ProfileStack.Navigator>
  );
}

// Wallet Stack Navigator
function WalletStackNavigator() {
  return (
    <WalletStack.Navigator screenOptions={{ headerShown: false }}>
      <WalletStack.Screen name="WalletMain" component={WalletScreen} />
    </WalletStack.Navigator>
  );
}

// CUSTOM TAB BAR COMPONENT
function CustomTabBar({ state, descriptors, navigation }: any) {
  // Keep the legacy ref in sync (used by navigateToMainStack elsewhere).
  setTabNavigation(navigation);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBar, { height: 62 + insets.bottom, paddingBottom: 8 + insets.bottom }]}>
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const label = options.tabBarLabel || options.title || route.name;
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        // Get icon based on route name
        const iconColor = isFocused ? colors.primary : colors.textMuted;
        let iconSource: any = null;
        let walletIcon = false;
        // Tabs without a bundled PNG fall back to an Ionicon.
        let ioniconName: string | null = null;
        switch (route.name) {
          case 'Home':
            iconSource = require('../../assets/icons/home.png');
            break;
          case 'Events':
            iconSource = require('../../assets/icons/events.png');
            break;
          case 'Chat':
            iconSource = require('../../assets/icons/AIchat.png');
            break;
          case 'Places':
            ioniconName = isFocused ? 'compass' : 'compass-outline';
            break;
          case 'Wallet':
            walletIcon = true;
            break;
          case 'Profile':
            iconSource = require('../../assets/icons/profile.png');
            break;
          default:
            iconSource = require('../../assets/icons/home.png');
        }

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={options.tabBarTestID}
            onPress={onPress}
            style={styles.tabItem}
          >
            {walletIcon || ioniconName ? (
              <Ionicons
                name={(ioniconName ?? (isFocused ? 'wallet' : 'wallet-outline')) as any}
                size={28}
                color={iconColor}
                style={{ marginBottom: 4 }}
              />
            ) : (
              <Image
                source={iconSource}
                style={[styles.tabIcon, { tintColor: iconColor }]}
                resizeMode="contain"
              />
            )}
            <Text style={[styles.tabLabel, { color: iconColor }]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Places Stack Navigator
function PlacesStackNavigator() {
  return (
    <PlacesStack.Navigator>
      <PlacesStack.Screen
        name="PlacesMain"
        component={PlacesScreen}
        options={{ headerShown: false }}
      />
      <PlacesStack.Screen
        name="PlaceDetail"
        component={PlaceDetailScreen}
        options={{ title: 'Place' }}
      />
      <PlacesStack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{ title: 'Event Details' }}
      />
    </PlacesStack.Navigator>
  );
}

// Main Tab Navigator with Custom Tab Bar
// Receives the MainStack navigation as a prop (rendered as MainStack.Screen "Tabs")
function MainTabNavigator({ navigation }: { navigation: any }) {
  setMainStackNavigation(navigation);

  return (
    <Tab.Navigator
      id="MainTab"
      tabBar={(props) => {
        setTabNavigation(props.navigation);
        return <CustomTabBar {...props} />;
      }}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home"    component={HomeStackNavigator}    options={{ title: 'Home' }} />
      <Tab.Screen name="Events"  component={EventsStackNavigator}  options={{ title: 'Events' }} />
      <Tab.Screen name="Places"  component={PlacesStackNavigator}  options={{ title: 'Places' }} />
      <Tab.Screen name="Chat"    component={ChatStackNavigator}    options={{ title: 'AI Chat' }} />
      <Tab.Screen name="Wallet"  component={WalletStackNavigator}  options={{ title: 'Wallet' }} />
      <Tab.Screen name="Profile" component={ProfileStackNavigator} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.textInverse,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabIcon: {
    width: 28,
    height: 28,
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default MainTabNavigator;
