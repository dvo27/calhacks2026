import Svg, { Defs, LinearGradient, Stop, Rect, Polyline, Circle, Text as SvgText } from 'react-native-svg';
import { View } from 'react-native';

interface Props {
  points: [number, number][];
  height?: number;
  showRoute?: boolean;
}

export default function RouteMap({ points, height = 120, showRoute = false }: Props) {
  const W = 280;
  const H = height;
  const polyPts = points.map(([x, y]) => `${x},${y}`).join(' ');

  return (
    <View style={{ width: '100%', height, borderRadius: 14, overflow: 'hidden' }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FCEAE2" />
            <Stop offset="1" stopColor="#E5EDF2" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={W} height={H} fill="url(#bg)" />

        {/* grid lines */}
        {[0.25, 0.5, 0.75].map((f) => (
          <Polyline key={`v${f}`} points={`${W * f},0 ${W * f},${H}`} stroke="#ECEDE8" strokeWidth="1" />
        ))}
        {[0.33, 0.66].map((f) => (
          <Polyline key={`h${f}`} points={`0,${H * f} ${W},${H * f}`} stroke="#ECEDE8" strokeWidth="1" />
        ))}

        {showRoute && points.length > 1 && (
          <Polyline points={polyPts} fill="none" stroke="#FF5A36" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {points.map(([x, y], i) => (
          <React.Fragment key={i}>
            <Circle cx={x} cy={y} r="10" fill="#FF5A36" />
            <SvgText x={x} y={y + 4} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#fff">
              {i + 1}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}

import React from 'react';
