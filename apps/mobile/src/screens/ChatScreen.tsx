import { colors } from '../theme';
// migo-mobile/src/screens/ChatScreen.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useUserStore } from '../store/userStore';
import { chatService } from '../services/chat.service';
import { api } from '../services/api';
import { eventService } from '../services/event.service';
import { useLocale } from '../i18n';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  isError?: boolean;
  showUpdateInterestsButton?: boolean;
}

interface SuggestedEvent {
  id: string;
  title: string;
  category: string;
  description: string;
  startDate: string;
  venue: string;
  city: string;
  priceRange: string;
  imageUrl?: string;
}

const ChatScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useUserStore();
  const { t } = useLocale();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: t('chat_greeting', { name: user?.name ? ` ${user.name.split(' ')[0]}` : '' }),
      sender: 'ai',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedEvents, setSuggestedEvents] = useState<SuggestedEvent[]>([]);
  const [eventsExpanded, setEventsExpanded] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  // Date range for "View All" — set when query is weekend-related
  const [viewAllDates, setViewAllDates] = useState<{ from: string; to: string } | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Returns UAE Friday-to-Sunday date range for the current/next weekend
  const getWeekendDates = (): { from: string; to: string } => {
    const today = new Date();
    const day = today.getDay(); // 0=Sun,1=Mon,...,5=Fri,6=Sat
    // Days offset to reach Friday
    let daysToFri: number;
    if (day === 5) daysToFri = 0;
    else if (day === 6) daysToFri = -1; // already past Friday
    else if (day === 0) daysToFri = -2; // still weekend (Sunday)
    else daysToFri = 5 - day;           // days until next Friday
    const fri = new Date(today);
    fri.setDate(today.getDate() + daysToFri);
    fri.setHours(0, 0, 0, 0);
    const sun = new Date(fri);
    sun.setDate(fri.getDate() + 2);
    sun.setHours(23, 59, 59, 999);
    return { from: fri.toISOString(), to: sun.toISOString() };
  };

  const isWeekendQuery = (msg: string): boolean =>
    /\b(weekend|friday|saturday|sunday|fri|sat|sun)\b/i.test(msg);

  // Detect "who are you / tell me about yourself" type questions
  const isSelfIntroductionQuery = (msg: string): boolean =>
    /\b(who are you|tell me about yourself|what are you|about you|introduce yourself|what is migo|what can you do|how do you work|describe yourself)\b/i.test(msg);

  // Detect "what are my interests / show my interests" type questions
  const isInterestsQuery = (msg: string): boolean =>
    /\b(my interests|my interest|my preferences|my preference|what do i like|what i like|my hobbies|show.*interest|tell.*my interest|what.*my interest)\b/i.test(msg);

  // Build a local AI reply without hitting the backend
  const buildLocalReply = (type: 'self' | 'interests'): Message => {
    if (type === 'self') {
      return {
        id: Date.now().toString(),
        text: t('chat_self_reply'),
        sender: 'ai',
        timestamp: new Date(),
      };
    }
    // interests
    const interests = user?.interests ?? [];
    const text = interests.length > 0
      ? t('chat_interests_reply', { interests: interests.join(', ') })
      : t('chat_no_interests_reply');
    return {
      id: Date.now().toString(),
      text,
      sender: 'ai',
      timestamp: new Date(),
      showUpdateInterestsButton: true,
    };
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  // Initialize with user's interests if available
  useEffect(() => {
    if (user?.interests && user.interests.length > 0) {
      const interestsMessage: Message = {
        id: 'interests-info',
        text: t('chat_interest_notice', { interests: user.interests.join(', ') }),
        sender: 'ai',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, interestsMessage]);
    }
  }, [user?.interests]);

  const handleSendMessage = async (presetText?: string) => {
    const textToSend = (presetText ?? inputText).trim();
    if (!textToSend || isLoading) return;

    const userMessage = textToSend;
    setInputText('');

    // Add user message
    const newUserMessage: Message = {
      id: Date.now().toString(),
      text: userMessage,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, newUserMessage]);

    // Handle self-introduction and interests queries locally without calling the AI backend
    if (isSelfIntroductionQuery(userMessage)) {
      setMessages(prev => [...prev, buildLocalReply('self')]);
      return;
    }
    if (isInterestsQuery(userMessage)) {
      setMessages(prev => [...prev, buildLocalReply('interests')]);
      return;
    }

    setIsLoading(true);
    setIsTyping(true);

    try {
      // Send message to AI service
      const response = await chatService.sendMessage(userMessage);
      
      // Simulate typing delay for better UX
      setTimeout(async () => {
        setIsTyping(false);
        
        // Add AI response
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: response.message,
          sender: 'ai',
          timestamp: new Date(),
        };
        
        setMessages(prev => [...prev, aiMessage]);

        // Quick-reply chips: the backend suggests follow-ups the user can tap
        // to send immediately.
        const chips = [
          ...(response.suggestions || []),
          ...(response.nextQuestions || []),
        ];
        setQuickReplies([...new Set(chips)].slice(0, 4));

        // Show suggested events if available
        if (response.suggestedEvents && response.suggestedEvents.length > 0) {
          setSuggestedEvents(response.suggestedEvents);

          // Derive date range from the actual event dates so "View All" always
          // filters EventsScreen to the dates relevant to this query.
          const timestamps = response.suggestedEvents
            .map((e: SuggestedEvent) => e.startDate ? new Date(e.startDate).getTime() : NaN)
            .filter((t: number) => !isNaN(t));

          if (timestamps.length > 0) {
            const from = new Date(Math.min(...timestamps));
            const to   = new Date(Math.max(...timestamps));
            from.setHours(0, 0, 0, 0);
            to.setHours(23, 59, 59, 999);
            setViewAllDates({ from: from.toISOString(), to: to.toISOString() });
          } else if (isWeekendQuery(userMessage)) {
            // Fallback: if events have no dates but message mentions weekend
            setViewAllDates(getWeekendDates());
          } else {
            setViewAllDates(null);
          }
        } else {
          setViewAllDates(null);
        }
        
        setIsLoading(false);
      }, 1500);
      
    } catch (error: any) {
      setIsTyping(false);
      setIsLoading(false);
      
      // Add error message
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        text: t('chat_offline'),
        sender: 'ai',
        timestamp: new Date(),
        isError: true,
      };
      
      setMessages(prev => [...prev, errorMessage]);
      
      Alert.alert(
        t('chat_connection_error'),
        t('chat_connection_help'),
        [{ text: t('ok') }]
      );
    }
  };

  const handleQuickAction = (action: string) => {
    let quickMessage = '';
    
    switch (action) {
      case 'events-nearby':
        quickMessage = t('this_week_for_you');
        break;
      case 'by-interests':
        quickMessage = t('home_subtitle');
        break;
      case 'free-events':
        quickMessage = t('free');
        break;
      case 'popular':
        quickMessage = t('top_upcoming_events');
        break;
      default:
        quickMessage = action;
    }
    
    setInputText(quickMessage);
  };

  const handleEventPress = (eventId: string) => {
    navigation.navigate('EventDetail', { eventId });
  };

  const handleSaveEvent = async (eventId: string) => {
    try {
      await eventService.bookmarkEvent(eventId);
      Alert.alert(t('chat_saved'), t('chat_saved_help'));
    } catch {
      Alert.alert(t('chat_save_failed'), t('chat_save_failed_help'));
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';

    return (
      <View style={[styles.messageContainer, isUser ? styles.userMessageContainer : styles.aiMessageContainer]}>
        {!isUser && (
          <View style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={16} color={colors.primary} />
          </View>
        )}

        {isUser ? (
          <View style={[styles.messageBubble, styles.userBubble]}>
            <Text style={[styles.messageText, styles.userMessageText]}>{item.text}</Text>
            <Text style={[styles.timestamp, styles.userTimestamp]}>
              {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        ) : (
          <View style={styles.aiMessageWrapper}>
            <View style={[styles.messageBubble, styles.aiBubble]}>
              <Text style={[styles.messageText, styles.aiMessageText]}>{item.text}</Text>
              <Text style={[styles.timestamp, styles.aiTimestamp]}>
                {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            {item.showUpdateInterestsButton && (
              <TouchableOpacity
                style={styles.updateInterestsButton}
                onPress={() => (navigation as any).push('Interests')}
              >
                <Ionicons name="heart-outline" size={16} color={colors.textInverse} />
          <Text style={styles.updateInterestsButtonText}>{t('update_interests')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {isUser && (
          <View style={styles.userAvatar}>
            <Ionicons name="person" size={16} color={colors.textInverse} />
          </View>
        )}
      </View>
    );
  };

  const renderSuggestedEvent = ({ item }: { item: SuggestedEvent }) => (
    <TouchableOpacity
      style={styles.eventCard}
      onPress={() => handleEventPress(item.id)}
    >
      {item.imageUrl ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.eventImage}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.eventImagePlaceholder}>
          <Ionicons name="image-outline" size={32} color={colors.border} />
        </View>
      )}
      <View style={styles.eventCardBody}>
        <View style={styles.eventHeader}>
          <Text style={styles.eventCategory}>{item.category}</Text>
          <Text style={styles.eventPrice}>{item.priceRange}</Text>
        </View>
        <Text style={styles.eventTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.eventDetails}>
          <View style={styles.eventDetail}>
            <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
            <Text style={styles.eventDetailText}>
              {new Date(item.startDate).toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.eventDetail}>
            <Ionicons name="location-outline" size={12} color={colors.textMuted} />
            <Text style={styles.eventDetailText}>
              {item.venue}, {item.city}
            </Text>
          </View>
        </View>
        <Text style={styles.eventDescription} numberOfLines={2}>
          {item.description}
        </Text>
        <View style={styles.eventCardActions}>
          <TouchableOpacity
            style={styles.eventCardActionPrimary}
            onPress={() => handleEventPress(item.id)}
          >
            <Ionicons name="ticket-outline" size={14} color={colors.textInverse} />
            <Text style={styles.eventCardActionPrimaryText}>{t('view_details')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.eventCardActionSecondary}
            onPress={() => handleSaveEvent(item.id)}
          >
            <Ionicons name="bookmark-outline" size={14} color={colors.primary} />
            <Text style={styles.eventCardActionSecondaryText}>{t('save')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderQuickReplies = () => {
    if (quickReplies.length === 0 || isTyping) return null;
    return (
      <View style={styles.quickRepliesContainer}>
        {quickReplies.map((text, idx) => (
          <TouchableOpacity
            key={idx}
            style={styles.quickReplyChip}
            onPress={() => {
              setQuickReplies([]);
              void handleSendMessage(text);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.quickReplyChipText} numberOfLines={1}>{text}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderQuickActions = () => (
    <View style={styles.quickActionsContainer}>
      <Text style={styles.quickActionsTitle}>{t('more')}</Text>
      <View style={styles.quickActionsGrid}>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => handleQuickAction('events-nearby')}
        >
          <Ionicons name="navigate" size={20} color={colors.primary} />
          <Text style={styles.quickActionText}>{t('location_tba')}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => handleQuickAction('by-interests')}
        >
          <Ionicons name="heart" size={20} color={colors.primary} />
          <Text style={styles.quickActionText}>{t('home_subtitle')}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => handleQuickAction('free-events')}
        >
          <Ionicons name="wallet" size={20} color={colors.primary} />
          <Text style={styles.quickActionText}>{t('free')}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => handleQuickAction('popular')}
        >
          <Ionicons name="trending-up" size={20} color={colors.primary} />
          <Text style={styles.quickActionText}>{t('featured')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.aiHeaderIcon}>
              <Ionicons name="sparkles" size={24} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.headerTitle}>{t('chat_title')}</Text>
              <Text style={styles.headerSubtitle}>
                {isTyping ? t('loading') : t('chat_subtitle')}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.infoButton}
            onPress={() => Alert.alert(
              t('chat_title'),
              t('chat_subtitle'),
              [{ text: t('ok') }]
            )}
          >
            <Ionicons name="information-circle-outline" size={24} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Messages List */}
        <View style={styles.messagesContainer}>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={styles.welcomeSection}>
                <Text style={styles.welcomeTitle}>{t('welcome')}</Text>
                <Text style={styles.welcomeText}>
                  {t('chat_subtitle')}
                </Text>
                {renderQuickActions()}
              </View>
            }
            ListFooterComponent={
              <>
                {isTyping && (
                  <View style={styles.typingIndicator}>
                    <View style={styles.typingDots}>
                      <View style={styles.typingDot} />
                      <View style={styles.typingDot} />
                      <View style={styles.typingDot} />
                    </View>
                    <Text style={styles.typingText}>{t('loading')}</Text>
                  </View>
                )}
                
                {suggestedEvents.length > 0 && (
                  <View style={styles.suggestedEventsSection}>
                    <TouchableOpacity
                      style={styles.suggestedEventsHeader}
                      onPress={() => setEventsExpanded(prev => !prev)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.suggestedEventsTitle}>
                        {t('top_upcoming_events')} ({suggestedEvents.length})
                      </Text>
                      <Ionicons
                        name={eventsExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.textMuted}
                      />
                    </TouchableOpacity>
                    {eventsExpanded && (
                      <>
                        <FlatList
                          horizontal
                          data={suggestedEvents}
                          renderItem={renderSuggestedEvent}
                          keyExtractor={(item) => item.id}
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.suggestedEventsList}
                        />
                        <TouchableOpacity
                          style={styles.viewAllButton}
                          onPress={() => {
                            navigation.navigate('AIEvents', {
                              dateFrom:   viewAllDates?.from,
                              dateTo:     viewAllDates?.to,
                              queryLabel: viewAllDates
                                ? undefined   // AIEventsScreen will format from dates
                                : 'All upcoming events',
                            });
                          }}
                        >
                          <Text style={styles.viewAllButtonText}>{t('events')}</Text>
                          <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </>
            }
          />
        </View>

        {/* Quick-reply chips */}
        {renderQuickReplies()}

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder={t('chat_placeholder')}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
              editable={!isLoading}
              autoCapitalize="sentences"
              autoCorrect={true}
              returnKeyType="send"
              textContentType="none"
              blurOnSubmit={false}
              onSubmitEditing={() => void handleSendMessage()}
              onKeyPress={(e) => {
                const native = e.nativeEvent as { key: string; shiftKey?: boolean };
                if (Platform.OS === 'web' && native.key === 'Enter' && !native.shiftKey) {
                  e.preventDefault();
                  void handleSendMessage();
                }
              }}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
              onPress={() => void handleSendMessage()}
              disabled={!inputText.trim() || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Ionicons name="send" size={20} color={colors.textInverse} />
              )}
            </TouchableOpacity>
          </View>
          
          {/* Character count */}
          <Text style={styles.charCount}>
            {inputText.length}/500
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.textInverse,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aiHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  infoButton: {
    padding: 4,
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  welcomeSection: {
    backgroundColor: colors.textInverse,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  aiMessageContainer: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 18,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
    marginLeft: 8,
  },
  aiBubble: {
    backgroundColor: colors.textInverse,
    borderBottomLeftRadius: 4,
    marginRight: 8,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userMessageText: {
    color: colors.textInverse,
  },
  aiMessageText: {
    color: colors.text,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    opacity: 0.7,
  },
  userTimestamp: {
    color: colors.textInverse,
    textAlign: 'right',
  },
  aiTimestamp: {
    color: colors.textMuted,
    textAlign: 'left',
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  quickActionsContainer: {
    marginTop: 20,
  },
  quickActionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 12,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: colors.surfaceAlt,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    gap: 6,
  },
  quickActionText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  quickRepliesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 6,
    gap: 8,
  },
  quickReplyChip: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.primarySoft,
    maxWidth: '90%',
  },
  quickReplyChipText: {
    fontSize: 13,
    color: colors.primaryDark,
  },
  eventCardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  eventCardActionPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  eventCardActionPrimaryText: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '600',
  },
  eventCardActionSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  eventCardActionSecondaryText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.textInverse,
    padding: 12,
    borderRadius: 18,
    alignSelf: 'flex-start',
    marginBottom: 16,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  typingDots: {
    flexDirection: 'row',
    marginRight: 8,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginHorizontal: 2,
  },
  typingText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  suggestedEventsSection: {
    marginTop: 20,
    marginBottom: 16,
  },
  suggestedEventsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  suggestedEventsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  suggestedEventsList: {
    gap: 12,
  },
  eventCard: {
    width: 260,
    backgroundColor: colors.textInverse,
    borderRadius: 12,
    marginRight: 12,
    overflow: 'hidden',
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  eventImage: {
    width: '100%',
    height: 130,
  },
  eventImagePlaceholder: {
    width: '100%',
    height: 130,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventCardBody: {
    padding: 12,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventCategory: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  eventPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.primary,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
    lineHeight: 22,
  },
  eventDetails: {
    marginBottom: 8,
  },
  eventDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventDetailText: {
    fontSize: 12,
    color: colors.textMuted,
    marginLeft: 6,
  },
  eventDescription: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  viewAllButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  inputContainer: {
    backgroundColor: colors.textInverse,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  sendButtonDisabled: {
    backgroundColor: colors.primarySoft,
  },
  charCount: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  aiMessageWrapper: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginRight: 8,
  },
  updateInterestsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.primary,
    borderRadius: 20,
  },
  updateInterestsButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textInverse,
  },
});

export default ChatScreen;