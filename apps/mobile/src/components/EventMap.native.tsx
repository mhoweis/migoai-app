import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { colors, radius } from '../theme';
import { useLocale } from '../i18n';

interface EventMapProps {
  latitude?: number;
  longitude?: number;
  title: string;
  description?: string;
  query?: string;
  city?: string;
}

const CITY_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  dubai: { latitude: 25.2048, longitude: 55.2708 },
  'abu dhabi': { latitude: 24.4539, longitude: 54.3773 },
  sharjah: { latitude: 25.3463, longitude: 55.4209 },
  'al ain': { latitude: 24.1302, longitude: 55.8023 },
  'ras al khaimah': { latitude: 25.7895, longitude: 55.9432 },
  fujairah: { latitude: 25.1288, longitude: 56.3265 },
  ajman: { latitude: 25.4052, longitude: 55.5136 },
};

export default function EventMap({
  latitude,
  longitude,
  title,
  description,
  query,
  city,
}: EventMapProps) {
  const { t } = useLocale();
  const hasCoordinates = latitude !== undefined && longitude !== undefined;
  const center = hasCoordinates
    ? { latitude, longitude }
    : CITY_COORDINATES[(city || 'Dubai').trim().toLowerCase()] || CITY_COORDINATES.dubai;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${
    hasCoordinates ? `${latitude},${longitude}` : encodeURIComponent(query || title)
  }`;

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          ...center,
          latitudeDelta: hasCoordinates ? 0.01 : 0.15,
          longitudeDelta: hasCoordinates ? 0.01 : 0.15,
        }}
      >
        {hasCoordinates ? (
          <Marker
            coordinate={center}
            title={title}
            description={description}
          />
        ) : null}
      </MapView>
      {!hasCoordinates ? (
        <TouchableOpacity style={styles.approximateChip} onPress={() => Linking.openURL(mapUrl)}>
          <Text style={styles.approximateText}>{t('approximate_location')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: radius.lg,
  },
  map: {
    height: 240,
    width: '100%',
  },
  approximateChip: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    alignItems: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: colors.text,
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 3,
  },
  approximateText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
});