import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Polyline, Circle, Line } from 'react-native-svg';
import { routeSegments, type TrackPoint } from '@livesrun/core';
export default function RouteMap({ points }: { points: TrackPoint[] }) {
  const segments = routeSegments(points);
  const all = segments.flat();
  if (!all.length)
    return (
      <View
        style={{
          height: 220,
          backgroundColor: '#151d20',
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#a9b4b8' }}>Nenhum ponto GPS disponível.</Text>
      </View>
    );
  const minX = Math.min(...all.map((p) => p.longitude)),
    maxX = Math.max(...all.map((p) => p.longitude));
  const minY = Math.min(...all.map((p) => p.latitude)),
    maxY = Math.max(...all.map((p) => p.latitude));
  const scale = Math.max(maxX - minX, maxY - minY, 0.0001);
  const x = (p: TrackPoint) => 25 + ((p.longitude - minX) / scale) * 270;
  const y = (p: TrackPoint) => 205 - ((p.latitude - minY) / scale) * 180;
  return (
    <View
      accessibilityLabel="Percurso privado do treino"
      style={{ backgroundColor: '#151d20', borderRadius: 20, overflow: 'hidden' }}
    >
      <Svg viewBox="0 0 320 230" height={230} width="100%">
        {[40, 80, 120, 160, 200, 240, 280].map((n) => (
          <Line key={n} x1={n} y1={0} x2={n} y2={230} stroke="#233035" />
        ))}
        {segments.map((segment, i) => (
          <Polyline
            key={i}
            points={segment.map((p) => `${x(p)},${y(p)}`).join(' ')}
            fill="none"
            stroke="#ff692b"
            strokeWidth={4}
            strokeLinejoin="round"
          />
        ))}
        <Circle cx={x(all[0])} cy={y(all[0])} r={6} fill="#fff" />
        <Circle cx={x(all.at(-1)!)} cy={y(all.at(-1)!)} r={6} fill="#ff692b" />
      </Svg>
      <Text style={{ color: '#a9b4b8', padding: 12, fontSize: 12 }}>
        Percurso privado · representação do trajeto
      </Text>
    </View>
  );
}
