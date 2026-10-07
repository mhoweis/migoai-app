import { Platform } from 'react-native';

const display = Platform.select({
  web: "'Bricolage Grotesque', 'Plus Jakarta Sans', system-ui, sans-serif",
  default: undefined,
});

export const colors = {
  primary: '#D61F63',
  primaryDark: '#A8134B',
  primarySoft: '#FDE7EF',
  accent: '#FFB020',
  accentSoft: '#FFF4DC',
  info: '#0E7C86',
  infoSoft: '#E1F4F5',
  success: '#12B76A',
  successSoft: '#E6F8EF',
  warning: '#F79009',
  warningSoft: '#FFF4E5',
  danger: '#E5484D',
  dangerSoft: '#FDECEC',
  ink: '#140F2E',
  bg: '#F7F5FB',
  surface: '#FFFFFF',
  surfaceAlt: '#F0EDF7',
  text: '#140F2E',
  textSecondary: '#4B4666',
  textMuted: '#6E6A86',
  textInverse: '#FFFFFF',
  border: '#E7E3F0',
  borderStrong: '#D3CDE3',
  overlay: 'rgba(20,15,46,0.55)',
  whatsapp: '#25D366',
} as const;

export const gradients = {
  dusk: ['#241654', '#7A1E6C', '#D61F63', '#FF8A3D'] as const,
  primary: ['#241654', '#7A1E6C', '#D61F63', '#FF8A3D'] as const,
  primaryButton: ['#E0266B', '#B8155A'] as const,
  cta: ['#E0266B', '#B8155A'] as const,
  dark: ['rgba(20,15,46,0)', 'rgba(20,15,46,0.88)'] as const,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const shadow = {
  card: {
    shadowColor: '#2A1B5E',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  float: {
    shadowColor: '#2A1B5E',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  hover: {
    shadowColor: '#2A1B5E',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
} as const;

export const type = {
  display: { fontSize: 40, lineHeight: 44, fontWeight: '800' as const, letterSpacing: -1, color: colors.text, fontFamily: display },
  h1: { fontSize: 30, lineHeight: 36, fontWeight: '800' as const, letterSpacing: -0.6, color: colors.text, fontFamily: display },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.3, color: colors.text, fontFamily: display },
  h3: { fontSize: 17, lineHeight: 22, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 16, fontWeight: '400' as const, color: colors.textSecondary, lineHeight: 24 },
  caption: { fontSize: 13, fontWeight: '500' as const, color: colors.textMuted },
  label: { fontSize: 13, fontWeight: '600' as const, color: colors.textSecondary },
} as const;

export const fonts = { display } as const;
export const motion = { press: 120, fast: 160, base: 220 } as const;
