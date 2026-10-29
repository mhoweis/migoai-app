import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DateBadge from './DateBadge';
import { colors, radius, shadow } from '../theme';

type DeckEvent = {
  id: string;
  title: string;
  startDate?: string | Date;
  venueName?: string | null;
  city?: string | null;
  coverImage?: string | null;
  thumbnail?: string | null;
};

interface Props {
  events: DeckEvent[];
  onOpen: (event: DeckEvent) => void;
}

const useNativeDriver = Platform.OS !== 'web';
const SWIPE_DISTANCE = 110;
const FLY_DISTANCE = 520;
const AUTOPLAY_MS = 3200;
const RESUME_AFTER_MS = 6000;
const SHUFFLE_EVERY = 4;

const deg = (value: Animated.AnimatedInterpolation<number> | Animated.Value) =>
  value.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] });

/**
 * A stack of event "flash cards" that plays by itself: every few seconds the
 * top card flies to the back, and every few rounds the whole deck riffles into
 * a new order. People can also shuffle by hand — drag/swipe the top card away
 * (mouse or touch) — and tap it to open the event. Auto-play pauses while
 * someone is dragging and for a few seconds after.
 */
export default function EventCardDeck({ events, onOpen }: Props) {
  const count = events.length;
  const [order, setOrder] = useState<number[]>(() => events.map((_, i) => i));
  const [reduceMotion, setReduceMotion] = useState(false);
  const busy = useRef(false);
  const dragging = useRef(false);
  const lastInteraction = useRef(0);

  // Per-card depth (0 = top) and the drag offset of whichever card is on top.
  const depth = useMemo(() => events.map((_, i) => new Animated.Value(i)), [events]);
  const drag = useRef(new Animated.ValueXY()).current;
  const spread = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;

  // New event list (e.g. city change): reset the stack.
  useEffect(() => {
    setOrder(events.map((_, i) => i));
    drag.setValue({ x: 0, y: 0 });
  }, [events, drag]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  // Gentle idle bob of the whole deck.
  useEffect(() => {
    if (reduceMotion || count < 2) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver }),
        Animated.timing(float, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float, reduceMotion, count]);

  // Spring every card to its new depth whenever the order changes, staggered
  // from the top so the stack settles like a real deck.
  useEffect(() => {
    Animated.stagger(
      45,
      order.map((cardIndex, position) =>
        Animated.spring(depth[cardIndex], {
          toValue: position,
          friction: 7,
          tension: 70,
          useNativeDriver,
        }),
      ),
    ).start();
    if (!reduceMotion) {
      shine.setValue(0);
      Animated.timing(shine, { toValue: 1, duration: 900, delay: 220, easing: Easing.out(Easing.quad), useNativeDriver }).start();
    }
  }, [order, depth, shine, reduceMotion]);

  const sendTopToBack = useCallback((direction: 1 | -1) => {
    if (busy.current || count < 2) return;
    busy.current = true;
    Animated.timing(drag, {
      toValue: { x: direction * FLY_DISTANCE, y: -40 },
      duration: 260,
      easing: Easing.in(Easing.quad),
      useNativeDriver,
    }).start(() => {
      drag.setValue({ x: 0, y: 0 });
      setOrder(prev => [...prev.slice(1), prev[0]]);
      busy.current = false;
    });
  }, [drag, count]);

  const bringBackToTop = useCallback(() => {
    if (busy.current || count < 2) return;
    setOrder(prev => [prev[prev.length - 1], ...prev.slice(0, -1)]);
  }, [count]);

  const shuffle = useCallback(() => {
    if (busy.current || count < 2) return;
    busy.current = true;
    const fanOut = Animated.spring(spread, { toValue: 1, friction: 6, tension: 60, useNativeDriver });
    fanOut.start(() => {
      setOrder(prev => {
        const next = [...prev];
        for (let i = next.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [next[i], next[j]] = [next[j], next[i]];
        }
        // Always change the top card so the shuffle is visible.
        if (next[0] === prev[0]) next.push(next.shift() as number);
        return next;
      });
      setTimeout(() => {
        Animated.spring(spread, { toValue: 0, friction: 7, tension: 55, useNativeDriver }).start(() => {
          busy.current = false;
        });
      }, 140);
    });
  }, [spread, count]);

  // Auto-play: alternate the fly-out direction, riffle every few rounds.
  useEffect(() => {
    if (reduceMotion || count < 2) return;
    let tick = 0;
    const timer = setInterval(() => {
      if (busy.current || dragging.current || Date.now() - lastInteraction.current < RESUME_AFTER_MS) return;
      tick += 1;
      if (tick % SHUFFLE_EVERY === 0) shuffle();
      else sendTopToBack(tick % 2 ? 1 : -1);
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [reduceMotion, count, shuffle, sendTopToBack]);

  const topIndex = order[0];
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          dragging.current = true;
          lastInteraction.current = Date.now();
        },
        onPanResponderMove: Animated.event([null, { dx: drag.x, dy: drag.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => {
          dragging.current = false;
          lastInteraction.current = Date.now();
          const moved = Math.abs(g.dx) + Math.abs(g.dy);
          if (moved < 6) {
            drag.setValue({ x: 0, y: 0 });
            if (topIndex !== undefined) onOpen(events[topIndex]);
            return;
          }
          if (Math.abs(g.dx) > SWIPE_DISTANCE || Math.abs(g.vx) > 0.8) {
            sendTopToBack(g.dx > 0 ? 1 : -1);
          } else {
            Animated.spring(drag, { toValue: { x: 0, y: 0 }, friction: 5, useNativeDriver }).start();
          }
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
          lastInteraction.current = Date.now();
          Animated.spring(drag, { toValue: { x: 0, y: 0 }, friction: 5, useNativeDriver }).start();
        },
      }),
    [drag, events, onOpen, sendTopToBack, topIndex],
  );

  if (!count) return null;

  const mid = (count - 1) / 2;
  const floatY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const dragRotate = drag.x.interpolate({ inputRange: [-300, 0, 300], outputRange: [-18, 0, 18] });
  const shineX = shine.interpolate({ inputRange: [0, 1], outputRange: [-260, 320] });

  return (
    <View style={styles.wrapper} testID="event-card-deck">
      <Animated.View style={[styles.stage, { transform: [{ translateY: floatY }] }]}>
        {events.map((event, i) => {
          const position = order.indexOf(i);
          const isTop = position === 0;
          const d = depth[i];
          // Resting stack: cards step down/right and fan slightly. While
          // shuffling, `spread` swings them out into a wide arc.
          const fromMid = Animated.add(d, -mid);
          const translateX = Animated.add(
            Animated.multiply(d, 14),
            Animated.multiply(spread, Animated.multiply(fromMid, 92)),
          );
          const translateY = Animated.add(
            Animated.multiply(d, 9),
            Animated.multiply(spread, Animated.add(Animated.multiply(Animated.multiply(fromMid, fromMid), 9), -34)),
          );
          const rotateNum = Animated.add(
            Animated.multiply(d, 3.2),
            Animated.multiply(spread, Animated.multiply(fromMid, 11)),
          );
          const scale = d.interpolate({ inputRange: [0, count], outputRange: [1, 1 - count * 0.045], extrapolate: 'clamp' });
          const opacity = d.interpolate({ inputRange: [0, 3.5, count], outputRange: [1, 1, 0.55], extrapolate: 'clamp' });

          const transform: any[] = [
            { translateX },
            { translateY },
            { rotate: deg(rotateNum) },
            { scale },
          ];
          if (isTop) {
            transform.unshift({ translateX: drag.x }, { translateY: drag.y }, { rotate: deg(dragRotate) });
          }
          const cover = event.coverImage || event.thumbnail || undefined;

          return (
            <Animated.View
              key={event.id}
              {...(isTop ? pan.panHandlers : {})}
              // Web: public/index.html gives [data-deck-card] touch-action: pan-y
              // so horizontal swipes reach the deck instead of the browser.
              {...({ dataSet: { deckCard: 'true' } } as object)}
              accessible={isTop}
              accessibilityRole={isTop ? 'button' : undefined}
              accessibilityLabel={isTop ? event.title : undefined}
              accessibilityElementsHidden={!isTop}
              importantForAccessibility={isTop ? 'yes' : 'no-hide-descendants'}
              style={[
                styles.card,
                { zIndex: count - position, opacity, transform },
                isTop && Platform.OS === 'web' ? (styles.grab as object) : null,
              ]}
            >
              {cover ? <Image source={{ uri: cover }} style={styles.cover} /> : <View style={[styles.cover, styles.coverFallback]} />}
              <LinearGradient colors={['rgba(20,15,46,0)', 'rgba(20,15,46,0.88)']} style={styles.caption}>
                <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
                {event.venueName || event.city ? (
                  <Text style={styles.venue} numberOfLines={1}>{event.venueName || event.city}</Text>
                ) : null}
              </LinearGradient>
              {event.startDate ? (
                <View style={styles.badge}><DateBadge date={event.startDate as any} /></View>
              ) : null}
              {isTop && !reduceMotion ? (
                <Animated.View pointerEvents="none" style={[styles.shine, { transform: [{ translateX: shineX }, { rotate: '18deg' }] }]}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.38)', 'rgba(255,255,255,0)']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
              ) : null}
            </Animated.View>
          );
        })}
      </Animated.View>

    </View>
  );
}

const CARD_WIDTH = 230;
const CARD_HEIGHT = 280;

const styles = StyleSheet.create({
  wrapper: { flex: 1, minWidth: 300, alignItems: 'center', justifyContent: 'center' },
  stage: { width: CARD_WIDTH + 80, height: CARD_HEIGHT + 60, alignItems: 'center', justifyContent: 'center' },
  card: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.surface,
    overflow: 'hidden',
    backgroundColor: colors.ink,
    ...shadow.float,
  },
  grab: { cursor: 'grab', userSelect: 'none' } as any,
  cover: { width: '100%', height: '100%' },
  coverFallback: { backgroundColor: colors.primary },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 36, paddingHorizontal: 14, paddingBottom: 14 },
  title: { color: colors.textInverse, fontSize: 16, fontWeight: '800', lineHeight: 20 },
  venue: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4 },
  badge: { position: 'absolute', top: 12, left: 12 },
  shine: { position: 'absolute', top: -60, bottom: -60, width: 90 },
});
