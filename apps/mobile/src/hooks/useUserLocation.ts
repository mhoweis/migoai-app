// src/hooks/useUserLocation.ts
//
// Foreground location with a deliberate fallback chain, because iOS denial
// rates are high and "events near me" must still work when someone says no:
//
//   precise GPS  →  last known position  →  manually picked city
//
// The caller is expected to show an explainer screen BEFORE calling
// `request()`, so the OS prompt is never the first thing a user sees.
//
// Coordinates are kept in memory for the session only. Nothing is persisted
// unless the user explicitly picks a city, which is stored as a name, not a
// coordinate trail.

import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type LocationStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'manual';

const CITY_KEY = '@migo/preferred_city';

/** Fallback cities, matching the backend's geocode table. */
export const UAE_CITIES: Array<{ label: string; coords: Coordinates }> = [
  { label: 'Dubai', coords: { latitude: 25.2048, longitude: 55.2708 } },
  { label: 'Abu Dhabi', coords: { latitude: 24.4539, longitude: 54.3773 } },
  { label: 'Sharjah', coords: { latitude: 25.3463, longitude: 55.4209 } },
  { label: 'Ajman', coords: { latitude: 25.4052, longitude: 55.5136 } },
  { label: 'Ras Al Khaimah', coords: { latitude: 25.7895, longitude: 55.9432 } },
  { label: 'Fujairah', coords: { latitude: 25.1288, longitude: 56.3265 } },
  { label: 'Al Ain', coords: { latitude: 24.1302, longitude: 55.8023 } },
];

export function useUserLocation() {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [cityLabel, setCityLabel] = useState<string | null>(null);

  // Restore a previously chosen city so returning users skip the prompt.
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(CITY_KEY);
        if (!saved) return;
        const match = UAE_CITIES.find((c) => c.label === saved);
        if (match) {
          setCoords(match.coords);
          setCityLabel(match.label);
          setStatus('manual');
        }
      } catch {
        // Storage is a convenience here; failing to read it is not an error.
      }
    })();
  }, []);

  /** Call this only AFTER showing the explainer. */
  const request = useCallback(async (): Promise<Coordinates | null> => {
    setStatus('requesting');

    try {
      const services = await Location.hasServicesEnabledAsync();
      if (!services) {
        setStatus('unavailable');
        return null;
      }

      const { status: permission } = await Location.requestForegroundPermissionsAsync();

      if (permission !== 'granted') {
        setStatus('denied');
        return null;
      }

      // Balanced accuracy is plenty for "what's near me" and much faster and
      // cheaper on battery than High.
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => Location.getLastKnownPositionAsync());

      if (!position) {
        setStatus('unavailable');
        return null;
      }

      const next = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      setCoords(next);
      setCityLabel(null);
      setStatus('granted');
      return next;
    } catch {
      setStatus('unavailable');
      return null;
    }
  }, []);

  /** Final fallback: the user picks a city by hand. */
  const setManualCity = useCallback(async (label: string) => {
    const match = UAE_CITIES.find((c) => c.label === label);
    if (!match) return;

    setCoords(match.coords);
    setCityLabel(match.label);
    setStatus('manual');

    try {
      await AsyncStorage.setItem(CITY_KEY, label);
    } catch {
      // Non-fatal.
    }
  }, []);

  const clear = useCallback(async () => {
    setCoords(null);
    setCityLabel(null);
    setStatus('idle');
    try {
      await AsyncStorage.removeItem(CITY_KEY);
    } catch {
      // Non-fatal.
    }
  }, []);

  return {
    status,
    coords,
    cityLabel,
    hasLocation: coords != null,
    request,
    setManualCity,
    clear,
  };
}
