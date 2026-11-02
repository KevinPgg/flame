/**
 * Flame 2.0 notification row (fase 2.6), app. Prototype `SCREENS.inbox`: the event's flyer as a
 * thumbnail when the notification is about an event we have loaded (the Home's events), else an
 * icon; title, text, how long ago; a dot when unread. Same actions as v1 (the overlay handles
 * opening, swiping and clearing).
 */
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useQueryClient } from "@tanstack/react-query";
import { flameV2Colors as c } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import type { NotificationRecord } from "../../../hooks/useNotifications";
import { Icon, type IconName } from "../ui";

const ICON: Record<string, IconName> = {
  rsvp_pending: "clock",
  rsvp_approved: "check",
  rsvp_rejected: "close",
  event_date_changed: "cal",
  event_reminder: "bell",
  new_rsvp_request: "rsvp",
  ticket_sold: "ticket",
  auth_expiry_warning: "alert",
  organization_approved: "check",
  team_invitation: "user",
  organization_rejected: "close",
};

/** "Just now", "5 min ago", "3 h ago", "Yesterday", "3 days ago", or a date. */
export function useTimeAgo() {
  const { t, locale } = useI18n();
  return (iso: string, now = Date.now()) => {
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return "";
    const min = Math.floor(Math.max(0, now - then) / 60000);
    if (min < 1) return t("inbox.justNow");
    if (min < 60) return t("inbox.minutesAgo", { count: min });
    const h = Math.floor(min / 60);
    if (h < 24) return t("inbox.hoursAgo", { count: h });
    const d = Math.floor(h / 24);
    if (d < 7) return t("inbox.daysAgo", { count: d });
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(then));
  };
}

export function InboxCard({ item, image, onPress }: { item: NotificationRecord; image?: string | null; onPress?: () => void }) {
  const ago = useTimeAgo();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[item.title, item.body].filter(Boolean).join(". ")}
      style={{ backgroundColor: item.read ? c.ink2 : "#161616" }}
      className="flex-row items-start gap-3.5 px-4 py-3.5 active:opacity-80"
    >
      {!item.read ? <View style={{ position: "absolute", left: 6, top: 32, width: 6, height: 6, borderRadius: 3, backgroundColor: c.dot }} /> : null}
      {image ? (
        <Image source={{ uri: image }} style={{ width: 48, height: 60, borderRadius: 8, backgroundColor: c.ink3 }} contentFit="cover" testID="inbox-flyer" />
      ) : (
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.ink3 }} className="items-center justify-center">
          <Icon name={ICON[item.type] ?? "bell"} size={20} color={c.c90} />
        </View>
      )}
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className={`text-[14.5px] text-v2-cream ${item.read ? "font-v2-ui-medium" : "font-v2-ui-semibold"}`}>
          {item.title}
        </Text>
        <Text numberOfLines={item.type === "organization_rejected" ? undefined : 2} className="mt-0.5 font-v2-ui text-[13px] leading-[18px] text-v2-c70">
          {item.body}
        </Text>
        <Text className="mt-1 font-v2-ui text-[12px] text-v2-c50">{ago(item.created_at)}</Text>
      </View>
    </Pressable>
  );
}

/**
 * The flyer of the notification's event, if the Home's events are already in memory (read from
 * the query cache only: opening the inbox never fetches events).
 */
export function useInboxImage(item: NotificationRecord): string | null {
  const client = useQueryClient();
  const eventId = item.data?.eventId;
  if (!eventId) return null;
  const data = client.getQueryData<{ rawEvents?: Array<{ id: string; image_url?: string | null }> }>(["events", "all"]);
  return data?.rawEvents?.find((e) => e.id === eventId)?.image_url ?? null;
}

export function InboxRow({ item, onPress }: { item: NotificationRecord; onPress?: () => void }) {
  return <InboxCard item={item} image={useInboxImage(item)} onPress={onPress} />;
}
