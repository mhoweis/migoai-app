import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, MapPressEvent } from 'react-native-maps';
import { colors, radius } from '../theme';
import { CITY_COORDINATES } from '../utils/cityCoordinates';

type Props = { latitude?: number; longitude?: number; city: string; onChange(coords: { latitude: number; longitude: number }): void; height?: number };

export default function LocationPicker({ latitude, longitude, city, onChange, height = 240 }: Props) {
  const pinned = latitude !== undefined && longitude !== undefined;
  const center = pinned ? { latitude: latitude!, longitude: longitude! } : CITY_COORDINATES[city.trim().toLowerCase()] || CITY_COORDINATES.dubai;
  return <View style={[styles.container, { height }]}>
    <MapView style={StyleSheet.absoluteFill} initialRegion={{ ...center, latitudeDelta: pinned ? 0.02 : 0.15, longitudeDelta: pinned ? 0.02 : 0.15 }}
      onPress={(event: MapPressEvent) => onChange((event as any).nativeEvent?.coordinate || (event as any).coordinate)}>
      {pinned ? <Marker coordinate={center} draggable onDragEnd={event => onChange((event as any).nativeEvent?.coordinate || (event as any).coordinate)} /> : null}
    </MapView>
    {!pinned ? <Text style={styles.hint}>Tap the map to pin this location</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  container: { overflow: 'hidden', borderRadius: radius.lg },
  hint: { position: 'absolute', top: 12, left: 12, right: 12, padding: 10, borderRadius: radius.pill, backgroundColor: colors.surface, color: colors.text, textAlign: 'center', fontSize: 12 },
});
