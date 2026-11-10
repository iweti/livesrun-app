import React from 'react';
import MapView, { Polyline, Marker } from 'react-native-maps';
import { View, Text } from 'react-native';
import { routeSegments, type TrackPoint } from '@livesrun/core';
export default function RouteMap({ points }: { points: TrackPoint[] }) {
  const segments = routeSegments(points),
    valid = segments.flat();
  if (!valid.length)
    return (
      <View style={{ padding: 30 }}>
        <Text style={{ color: '#a9b4b8' }}>Sem pontos GPS válidos.</Text>
      </View>
    );
  const latitude = valid.reduce((s, p) => s + p.latitude, 0) / valid.length,
    longitude = valid.reduce((s, p) => s + p.longitude, 0) / valid.length;
  return (
    <MapView
      style={{ height: 250, borderRadius: 20 }}
      initialRegion={{
        latitude,
        longitude,
        latitudeDelta:
          Math.max(
            0.008,
            Math.max(...valid.map((p) => p.latitude)) - Math.min(...valid.map((p) => p.latitude)),
          ) * 1.4,
        longitudeDelta:
          Math.max(
            0.008,
            Math.max(...valid.map((p) => p.longitude)) - Math.min(...valid.map((p) => p.longitude)),
          ) * 1.4,
      }}
    >
      {segments.map((segment, i) => (
        <Polyline key={i} coordinates={segment} strokeColor="#ff692b" strokeWidth={5} />
      ))}
      <Marker coordinate={valid[0]} title="Início" />
      <Marker coordinate={valid.at(-1)!} title="Fim" pinColor="#ff692b" />
    </MapView>
  );
}
