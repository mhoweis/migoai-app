import { Platform } from 'react-native';

export const isProductionApp = process.env.EXPO_PUBLIC_APP_ENV === 'production';

// Paid plans (Host / Supplier) are switched off for this release: no payments
// are collected yet. To turn them back on later, set EXPO_PUBLIC_PLANS_ENABLED=true
// for the build (Vercel and EAS).
export const plansEnabled = process.env.EXPO_PUBLIC_PLANS_ENABLED === 'true';

export const canPurchasePlansInApp = plansEnabled && !(isProductionApp && Platform.OS !== 'web');
