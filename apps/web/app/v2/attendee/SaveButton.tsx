"use client";

/**
 * Heart (prototype `x-save` / `save-btn`), fase 4.1. "overlay": small dark circle on a flyer;
 * "circle": the 40px button of the event page's top bar. Works inside a <Link>: the tap doesn't
 * open the event.
 */
import { useI18n } from "../../lib/i18n";
import { Icon } from "../components/Icon";
import { useSavedEvents, type SavedEvent } from "./useSavedEvents";

export function SaveButton({
  event,
  variant = "overlay",
  className = "",
}: {
  event: { id: string; name: string } & Partial<SavedEvent>;
  variant?: "overlay" | "circle";
  className?: string;
}) {
  const { t } = useI18n();
  const { isSaved, toggle } = useSavedEvents();
  const on = isSaved(event.id);
  // Saved = cream disc with the crimson heart (prototype `save-btn.on`); the crimson alone is too
  // dark to read on a black circle.
  const size = variant === "circle" ? "pointer-events-auto h-10 w-10" : "h-[34px] w-[34px]";
  const box = on
    ? "bg-v2-cream text-v2-flame"
    : variant === "circle"
      ? "bg-[rgba(28,28,28,0.82)] text-v2-cream backdrop-blur-md hover:bg-v2-ink4"
      : "bg-[rgba(0,0,0,0.55)] text-white backdrop-blur-[10px] hover:bg-[rgba(0,0,0,0.7)]";
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? t("saved.unsave", { name: event.name }) : t("saved.save", { name: event.name })}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle(event, !on);
      }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-90 ${size} ${box} ${className}`}
    >
      <Icon name={on ? "heartFill" : "heart"} size={variant === "circle" ? 19 : 17} />
    </button>
  );
}
