import { Skeleton } from "./Skeleton";

export function Kpi({ label, loading, children }: { label: string; loading?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-[88px]">
      <div className="text-[12px] uppercase tracking-[0.04em] text-v2-c50">{label}</div>
      <div className="mt-1 font-v2-display-bold text-[24px] leading-tight tracking-[-0.02em] tabular-nums lg:text-[28px]">
        {loading ? <Skeleton className="mt-1 h-7 w-20" /> : children}
      </div>
    </div>
  );
}
