import { useCallback } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

export function useBreakpoint() {
  const { width } = useWindowDimensions();
  const isPhone = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isDesktop = width >= 1024;
  const gutter = isPhone ? 20 : isTablet ? 32 : 48;
  const columns = useCallback((minItemWidth: number, gap: number) => {
    const available = Math.min(width, 1240) - gutter * 2;
    return Math.max(1, Math.floor((available + gap) / (minItemWidth + gap)));
  }, [width, gutter]);
  return {
    width,
    isPhone,
    isTablet,
    isDesktop,
    isWebDesktop: Platform.OS === 'web' && isDesktop,
    gutter,
    contentMaxWidth: 1240,
    columns,
  };
}
