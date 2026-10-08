import { Image, type ImageProps } from "expo-image";
import { cssInterop } from "nativewind";

cssInterop(Image, { className: "style" });

export type FlameImageProps = ImageProps & {
  /** Per-image blurhash string for a blurry preview while loading */
  blurhash?: string;
  /** NativeWind class overrides */
  className?: string;
};

/**
 * Drop-in replacement for RN Image backed by expo-image.
 * Provides: 300ms cross-fade transition, aggressive memory+disk caching,
 * and optional blurhash placeholder support.
 */
export function FlameImage({
  transition = 300,
  placeholder,
  blurhash,
  cachePolicy = "memory-disk",
  ...props
}: FlameImageProps) {
  return (
    <Image
      placeholder={placeholder ?? (blurhash ? { blurhash } : undefined)}
      transition={transition}
      cachePolicy={cachePolicy}
      {...props}
    />
  );
}
