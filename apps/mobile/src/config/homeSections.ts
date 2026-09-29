import { Ionicons } from '@expo/vector-icons';

export type HomeSectionId =
  | 'interests'
  | 'weekend'
  | 'featured'
  | 'thisWeek'
  | 'friends'
  | 'venues'
  | 'today'
  | 'tickets'
  | 'saved'
  | 'assistant';

export const DEFAULT_HOME_SECTIONS: HomeSectionId[] = [
  'interests',
  'weekend',
  'featured',
  'thisWeek',
  'friends',
  'venues',
  'today',
  'tickets',
  'saved',
  'assistant',
];

export interface HomeLayout {
  order: HomeSectionId[];
  hidden: HomeSectionId[];
}

export const DEFAULT_HOME_LAYOUT: HomeLayout = {
  order: [...DEFAULT_HOME_SECTIONS],
  hidden: [],
};

const SECTION_IDS = new Set<HomeSectionId>(DEFAULT_HOME_SECTIONS);

export function normalizeHomeLayout(raw: unknown): HomeLayout {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { order: [...DEFAULT_HOME_SECTIONS], hidden: [] };
  }

  const candidate = raw as { order?: unknown; hidden?: unknown };
  if (!Array.isArray(candidate.order) || !Array.isArray(candidate.hidden)) {
    return { order: [...DEFAULT_HOME_SECTIONS], hidden: [] };
  }

  const order = candidate.order.filter(
    (id): id is HomeSectionId => typeof id === 'string' && SECTION_IDS.has(id as HomeSectionId),
  );
  const dedupedOrder = [...new Set(order)];
  DEFAULT_HOME_SECTIONS.forEach((id, index) => {
    if (dedupedOrder.includes(id)) return;
    const previous = DEFAULT_HOME_SECTIONS[index - 1];
    const anchor = previous ? dedupedOrder.indexOf(previous) : -1;
    dedupedOrder.splice(anchor + 1, 0, id);
  });

  const hidden = [...new Set(candidate.hidden.filter(
    (id): id is HomeSectionId => typeof id === 'string' && SECTION_IDS.has(id as HomeSectionId),
  ))];

  return { order: dedupedOrder, hidden };
}

export const HOME_SECTION_META: Record<HomeSectionId, {
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: string;
}> = {
  interests: { icon: 'heart-outline', labelKey: 'your_interests' },
  weekend: { icon: 'calendar-outline', labelKey: 'this_weekend' },
  featured: { icon: 'sparkles-outline', labelKey: 'top_upcoming_events' },
  thisWeek: { icon: 'calendar-number-outline', labelKey: 'this_week_for_you' },
  friends: { icon: 'people-outline', labelKey: 'friends_are_going' },
  venues: { icon: 'business-outline', labelKey: 'top_venues' },
  today: { icon: 'flash-outline', labelKey: 'todays_picks' },
  tickets: { icon: 'ticket-outline', labelKey: 'your_tickets' },
  saved: { icon: 'bookmark-outline', labelKey: 'your_saved_events' },
  assistant: { icon: 'chatbubble-ellipses-outline', labelKey: 'need_help' },
};
