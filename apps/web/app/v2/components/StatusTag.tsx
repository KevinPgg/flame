import type { ReactNode } from "react";

/**
 * Status label for Flame 2.0 (2026-11-02, Kevin: the tinted pills looked generic).
 * Ticket-stub tag: square corners, a colored notch on the left that carries the state, and
 * small uppercase Inter Tight in cream. Color lives only in the notch, so a row full of states
 * stays calm and the eye goes to the color. Same look in the app (`StatusTag` in components/v2/ui.tsx).
 */
export type StatusTone = "good" | "warn" | "danger" | "flame" | "neutral";

const NOTCH: Record<StatusTone, string> = {
  good: "bg-v2-good",
  warn: "bg-v2-warn",
  danger: "bg-v2-errorText",
  flame: "bg-v2-flame",
  neutral: "bg-v2-c30",
};

export function StatusTag({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex h-[22px] shrink-0 items-stretch overflow-hidden rounded-[4px] bg-v2-c06 ${className}`}>
      <span aria-hidden className={`w-[3px] shrink-0 ${NOTCH[tone]}`} />
      <span className="flex items-center whitespace-nowrap px-2 font-v2-display-bold text-[10.5px] uppercase leading-none tracking-[0.09em] text-v2-c90">
        {children}
      </span>
    </span>
  );
}
