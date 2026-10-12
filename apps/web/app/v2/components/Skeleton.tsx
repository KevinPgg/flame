export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-v2-sm bg-v2-c10 ${className}`} />;
}
