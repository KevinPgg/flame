import { View } from "react-native";
import { Canvas, Circle, RadialGradient, vec } from "@shopify/react-native-skia";

interface GlowBlobProps {
  top: number;
  left: number;
  width: number;
  height: number;
  color?: string;
  className?: string;
}

function toRgbaComponents(color: string): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  const rgbaMatch = color.match(
    /rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/i,
  );

  if (rgbaMatch) {
    return {
      r: Number(rgbaMatch[1]),
      g: Number(rgbaMatch[2]),
      b: Number(rgbaMatch[3]),
      a: rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) : 1,
    };
  }

  return { r: 255, g: 0, b: 0, a: 0.07 };
}

function toTransparent(color: string): string {
  const { r, g, b } = toRgbaComponents(color);
  return `rgba(${r}, ${g}, ${b}, 0)`;
}

export function GlowBlob({
  top,
  left,
  width,
  height,
  color = "rgba(255, 0, 0, 0.07)",
  className,
}: GlowBlobProps) {
  const transparentColor = toTransparent(color);
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2;

  return (
    <View
      className={className}
      pointerEvents="none"
      style={{ position: "absolute", top, left, width, height }}
    >
    <Canvas
      pointerEvents="none"
      style={{ width, height }}
    >
      <Circle cx={cx} cy={cy} r={r}>
        <RadialGradient
          c={vec(cx, cy)}
          r={r}
          colors={[color, transparentColor]}
        />
      </Circle>
    </Canvas>
    </View>
  );
}
