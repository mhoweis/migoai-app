import { Platform } from 'react-native';

export const isProductionApp = process.env.EXPO_PUBLIC_APP_ENV === 'production';
export const canPurchasePlansInApp = !(isProductionApp && Platform.OS !== 'web');
