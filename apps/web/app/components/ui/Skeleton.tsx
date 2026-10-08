interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={`bg-white-5 animate-pulse ${className ?? ""}`} />
  );
}
