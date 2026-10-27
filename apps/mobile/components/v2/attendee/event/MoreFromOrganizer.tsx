/** "More from {organizer}" under the purchase block (fase 2.4), app: from the Home's events. */
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useI18n } from "../../../../lib/i18n";
import { useAppEvents } from "../../../../hooks/useAppEvents";
import type { FeedEvent } from "../home/EventFeedCard";
import { EventTile } from "../EventTile";

export function useOrganizerFromFeed(eventId: string | undefined) {
  const { data } = useAppEvents();
  const raw = ((data as { rawEvents?: FeedEvent[] } | undefined)?.rawEvents ?? []) as FeedEvent[];
  return useMemo(() => raw.find((e) => e.id === eventId)?.organizations ?? null, [raw, eventId]);
}

export function MoreFromOrganizer({ eventId, organizerSlug, organizerName }: { eventId: string; organizerSlug: string | null | undefined; organizerName: string }) {
  const { t } = useI18n();
  const { data } = useAppEvents();
  const events = useMemo(() => {
    const raw = ((data as { rawEvents?: FeedEvent[] } | undefined)?.rawEvents ?? []) as FeedEvent[];
    return organizerSlug ? raw.filter((e) => e.organizations?.slug === organizerSlug && e.id !== eventId).slice(0, 8) : [];
  }, [data, organizerSlug, eventId]);
  if (events.length === 0) return null;
  return (
    <View className="mt-6">
      <Text accessibilityRole="header" className="mb-3 px-4 font-v2-display-bold text-[22px] tracking-[-0.6px] text-v2-cream">
        {t("event.moreFromOrganizer", { organizer: organizerName })}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
        {events.map((e) => (
          <EventTile key={e.id} event={e} width={150} />
        ))}
      </ScrollView>
    </View>
  );
}
