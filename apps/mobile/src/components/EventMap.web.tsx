import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius } from '../theme';
import { useLocale } from '../i18n';
import { CITY_COORDINATES } from '../utils/cityCoordinates';

interface EventMapProps {
  latitude?: number;
  longitude?: number;
  title: string;
  description?: string;
  query?: string;
  city?: string;
}

export default function EventMap({
  latitude,
  longitude,
  title,
  description,
  query,
}: EventMapProps) {
  const { locale } = useLocale();
  const hasCoordinates = latitude !== undefined && longitude !== undefined;
  const cityCenter = CITY_COORDINATES.dubai;
  const embedUrl = hasCoordinates
    ? `https://www.google.com/maps?q=${latitude},${longitude}&z=15&output=embed&hl=${locale}`
    : `https://www.google.com/maps?q=${encodeURIComponent(query || `${cityCenter.latitude},${cityCenter.longitude}` || title)}&z=14&output=embed`;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${
    hasCoordinates ? `${latitude},${longitude}` : encodeURIComponent(query || title)
  }`;

  return (
    <View style={styles.container}>
      {React.createElement('iframe', {
        src: embedUrl,
        title,
        loading: 'lazy',
        referrerPolicy: 'no-referrer-when-downgrade',
        style: {
          width: '100%',
          height: 240,
          border: 0,
          borderRadius: radius.lg,
          display: 'block',
        },
      })}
      <View style={styles.metaRow}>
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {description ? <Text style={styles.description} numberOfLines={2}>{description}</Text> : null}
        </View>
        <TouchableOpacity style={styles.linkPill} onPress={() => Linking.openURL(mapUrl)}>
          <Text style={styles.link}>Open in Google Maps</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  description: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 12,
  },
  linkPill: {
    flexShrink: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  link: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
});