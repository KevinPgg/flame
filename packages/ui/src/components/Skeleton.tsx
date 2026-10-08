/**
 * Skeleton placeholder for loading states.
 *
 * Renders a `bg-white-5` block whose opacity gently pulses between 0.5 and 1.0
 * on a 1.2s loop. Sized via `className` so the consumer matches the final
 * content shape (e.g. `size-[52px] rounded-card` for an org logo).
 *
 * Industry-standard pattern (Instagram, X, LinkedIn, Stripe) — preferred over
 * a spinner for content that has a known shape.
 */
import { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      className={`bg-white-5 ${className ?? ""}`}
      style={{ opacity }}
    />
  );
}
