import { colors } from '../theme';
export type TrustSource = {
  label: string;
  labelAr?: string;
  kind: 'official' | 'venue' | 'ticketing' | 'community' | 'organizer' | 'demo' | string;
};

export type EventTrust = {
  source?: TrustSource;
  organizer?: {
    id: string;
    name: string;
    avatar?: string | null;
    isVerified: boolean;
    eventsHosted: number;
  };
  refundKey?: string;
  isOfficial?: boolean;
};

export function sourceBadge(trust?: EventTrust, locale: 'en' | 'ar' = 'en'): {
  text: string;
  kind: string;
  color: string;
  backgroundColor: string;
} | null {
  if (!trust?.source) return null;
  const { kind } = trust.source;
  const kindText: Record<string, string> = {
    official: locale === 'ar' ? 'رسمي' : 'Official',
    venue: locale === 'ar' ? 'مكان' : 'Venue',
    ticketing: locale === 'ar' ? 'تذاكر' : 'Ticketing',
    community: locale === 'ar' ? 'مجتمع' : 'Community',
    organizer: locale === 'ar' ? 'مستضاف على Migo' : 'Hosted on Migo',
    demo: locale === 'ar' ? 'تجريبي' : 'Demo',
  };
  const text = kind === 'organizer'
    ? kindText.organizer
    : `${kindText[kind] || kind} · ${locale === 'ar' ? (trust.source.labelAr || trust.source.label) : trust.source.label}`;
  const colors: Record<string, [string, string]> = {
    official: [colors.success, colors.successSoft],
    venue: [colors.success, colors.successSoft],
    ticketing: [colors.primaryDark, colors.primarySoft],
    community: [colors.textSecondary, colors.surfaceAlt],
    organizer: [colors.primary, colors.primarySoft],
    demo: [colors.textMuted, colors.surfaceAlt],
  };
  const [color, backgroundColor] = colors[kind] || colors.community;
  return { text, kind, color, backgroundColor };
}
