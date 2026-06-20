import Svg, { Defs, LinearGradient, Stop, Rect, Line, Polyline, Circle, Text as SvgText, G } from 'react-native-svg';
import { Colors } from '@/constants/colors';

export interface RoutePoint {
  x: number; // 0-100
  y: number; // 0-100
}

interface RouteMapProps {
  points: RoutePoint[];
  height?: number;
  borderRadius?: number;
}

const W = 100;
const H = 62;

export default function RouteMap({ points, height = 96, borderRadius = 12 }: RouteMapProps) {
  const coords = points.map((p) => [p.x, p.y * 0.62] as [number, number]);

  const gridLines = [];
  for (let i = 0; i < 7; i++) {
    gridLines.push(
      <Line key={`h${i}`} x1="0" y1={i * 9} x2="100" y2={i * 9} stroke="#fff" strokeWidth={0.5} opacity={0.55} />
    );
  }
  for (let i = 0; i < 12; i++) {
    gridLines.push(
      <Line key={`v${i}`} x1={i * 9} y1="0" x2={i * 9} y2="62" stroke="#fff" strokeWidth={0.5} opacity={0.55} />
    );
  }

  const polylinePoints = coords.map((p) => p.join(',')).join(' ');

  return (
    <Svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={height}
      style={{ borderRadius, overflow: 'hidden' }}
      preserveAspectRatio="xMidYMid slice"
    >
      <Defs>
        <LinearGradient id="mapBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FCEAE2" />
          <Stop offset="1" stopColor="#E5EDF2" />
        </LinearGradient>
      </Defs>

      {/* background */}
      <Rect width={W} height={H} fill="url(#mapBg)" />
      {gridLines}

      {/* city block shapes */}
      <Rect x={8} y={6} width={20} height={13} rx={3} fill="#fff" opacity={0.4} />
      <Rect x={62} y={30} width={26} height={16} rx={3} fill="#CDE3D4" opacity={0.7} />
      <Rect x={40} y={44} width={14} height={12} rx={3} fill="#fff" opacity={0.4} />

      {/* route — black line */}
      {coords.length > 1 && (
        <Polyline
          points={polylinePoints}
          fill="none"
          stroke={Colors.ink}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.95}
        />
      )}

      {/* stop pins — orange circles, numbered */}
      {coords.map(([x, y], i) => (
        <G key={i}>
          <Circle cx={x} cy={y} r={4} fill={Colors.coral} />
          <SvgText
            x={x}
            y={y + 1.4}
            fontSize={4.4}
            fontWeight="700"
            fill="#fff"
            textAnchor="middle"
          >
            {i + 1}
          </SvgText>
        </G>
      ))}
    </Svg>
  );
}