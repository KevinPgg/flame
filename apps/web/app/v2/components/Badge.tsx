export function Badge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-v2-pill bg-v2-flame px-1.5 text-[11px] font-v2-ui-bold text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}
