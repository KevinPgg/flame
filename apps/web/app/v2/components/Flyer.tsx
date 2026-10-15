export function Flyer({ src, size, className = "" }: { src?: string | null; size: number; className?: string }) {
  return (
    <span
      className={`block shrink-0 overflow-hidden rounded-v2-sm bg-v2-ink4 ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- thumbnails; storage host differs per env
        <img src={src} alt="" width={size} height={size} loading="lazy" className="h-full w-full object-cover" />
      ) : null}
    </span>
  );
}
