import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';
import { CITY_COORDINATES } from '../utils/cityCoordinates';

type Props = { latitude?: number; longitude?: number; city: string; onChange(coords: { latitude: number; longitude: number }): void; height?: number };
let leafletPromise: Promise<any> | null = null;
function loadLeaflet() {
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if ((window as any).L) return resolve((window as any).L);
    if (!document.querySelector('link[data-migo-leaflet]')) {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; link.dataset.migoLeaflet = 'true'; document.head.appendChild(link);
    }
    const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.onload = () => resolve((window as any).L); script.onerror = reject; document.head.appendChild(script);
  });
  return leafletPromise;
}
export default function LocationPicker({ latitude, longitude, city, onChange, height = 240 }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null); const map = useRef<any>(null); const marker = useRef<any>(null);
  const pinned = latitude !== undefined && longitude !== undefined;
  const cityCenter = CITY_COORDINATES[city.trim().toLowerCase()] || CITY_COORDINATES.dubai;
  const center = pinned ? [latitude!, longitude!] : [cityCenter.latitude, cityCenter.longitude];
  useEffect(() => {
    let disposed = false;
    void loadLeaflet().then(L => {
      if (disposed || !mapRef.current || map.current) return;
      map.current = L.map(mapRef.current).setView(center, pinned ? 15 : 11);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map.current);
      map.current.on('click', (event: any) => onChange({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
      if (pinned) addMarker(L, center);
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, []);
  const addMarker = (L: any, coords: number[]) => {
    marker.current = L.marker(coords, { draggable: true }).addTo(map.current);
    marker.current.on('dragend', () => { const position = marker.current.getLatLng(); onChange({ latitude: position.lat, longitude: position.lng }); });
  };
  useEffect(() => {
    if (!map.current) return;
    map.current.setView(center, pinned ? 15 : 11);
    const L = (window as any).L;
    if (pinned && !marker.current) addMarker(L, center);
    if (pinned && marker.current) marker.current.setLatLng(center);
  }, [latitude, longitude, city, pinned]);
  return <View>{React.createElement('div', { ref: mapRef, style: { height, width: '100%', borderRadius: radius.lg, overflow: 'hidden' } })}{!pinned ? <Text style={styles.hint}>Tap the map to pin this location</Text> : null}</View>;
}
const styles = StyleSheet.create({ hint: { marginTop: 6, color: colors.textMuted, fontSize: 12 } });
