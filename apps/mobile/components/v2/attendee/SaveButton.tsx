/**
 * Heart (prototype `x-save` / `save-btn`), fase 4.1. "overlay": small dark circle on a flyer;
 * "circle": the 40px button of the event screen's top bar. Saved = white disc with the crimson
 * heart (the crimson alone is too dark on black).
 */
import { Pressable } from "react-native";
import { flameV2Colors as c } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { useSavedEvents } from "../../../hooks/useSavedEvents";
import type { FeedEvent } from "./home/EventFeedCard";
import { Icon } from "../ui";

export function SaveButton({
  event,
  variant = "overlay",
}: {
  event: { id: string; name: string } & Partial<FeedEvent>;
  variant?: "overlay" | "circle";
}) {
  const { t } = useI18n();
  const { isSaved, toggle } = useSavedEvents();
  const on = isSaved(event.id);
  const size = variant === "circle" ? 40 : 34;
  const bg = on ? c.cream : variant === "circle" ? "rgba(28,28,28,0.82)" : "rgba(0,0,0,0.55)";
  return (
    <Pressable
      onPress={() => void toggle(event, !on)}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={on ? t("saved.unsave", { name: event.name }) : t("saved.save", { name: event.name })}
      hitSlop={6}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg }}
      className="items-center justify-center active:opacity-80"
    >
      <Icon name={on ? "heartFill" : "heart"} size={variant === "circle" ? 19 : 17} color={on ? c.flame : c.cream} />
    </Pressable>
  );
}
