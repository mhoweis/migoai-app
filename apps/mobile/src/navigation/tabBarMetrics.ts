import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface TabBarMetrics {
  height: number;
  paddingTop: number;
  paddingBottom: number;
}

export function useTabBarMetrics(): TabBarMetrics {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const barHeight = height >= 880 ? 68 : height >= 720 ? 62 : 56;
  const verticalPadding = height >= 880 ? 8 : 6;
  return {
    height: barHeight + insets.bottom,
    paddingTop: verticalPadding,
    paddingBottom: verticalPadding + insets.bottom,
  };
}
