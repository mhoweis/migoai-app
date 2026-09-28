export const colors = {
  primary: '#6D5DFC',
  primaryDark: '#4C3FE0',
  primarySoft: '#EEEBFF',
  accent: '#FF6B5B',
  accentSoft: '#FFEDEA',
  success: '#12B76A',
  successSoft: '#E6F8EF',
  warning: '#F79009',
  warningSoft: '#FFF4E5',
  danger: '#E5484D',
  dangerSoft: '#FDECEC',
  bg: '#F7F7FB',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F0FA',
  text: '#0F1222',
  textSecondary: '#4A4D66',
  textMuted: '#8B8FA8',
  textInverse: '#FFFFFF',
  border: '#E8E8F0',
  borderStrong: '#D6D6E4',
  overlay: 'rgba(15,18,34,0.55)',
  whatsapp: '#25D366',
} as const;

export const gradients = {
  primary: ['#6D5DFC', '#8B5CF6', '#FF6B5B'] as const,
  primaryButton: ['#6D5DFC', '#5B4BE8'] as const,
  dark: ['rgba(15,18,34,0)', 'rgba(15,18,34,0.85)'] as const,
};

export const radius = {
  sm: 10,
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
    shadowColor: '#1B1F3B',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  float: {
    shadowColor: '#1B1F3B',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const;

export const type = {
  h1: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5, color: colors.text },
  h2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3, color: colors.text },
  h3: { fontSize: 17, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.textSecondary, lineHeight: 22 },
  caption: { fontSize: 12, fontWeight: '500' as const, color: colors.textMuted },
  label: { fontSize: 13, fontWeight: '600' as const, color: colors.textSecondary },
} as const;
