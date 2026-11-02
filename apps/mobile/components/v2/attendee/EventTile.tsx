/**
 * Small event card (fase 2.4–2.5), app: flyer 4:5, title, date · time, venue and price. Used by
 * "More from {organizer}", the organizer profile grid, Explore and You → Saved. Heart on the flyer
 * (fase 4.1), not on past events unless asked (Saved).
 */
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { feedWhen, flameV2Colors as c } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { usePriceLine, type FeedEvent } from "./home/EventFeedCard";
import { SaveButton } from "./SaveButton";

export function EventTile({ event, width, past, save = !past }: { event: FeedEvent; width: number; past?: boolean; save?: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const price = usePriceLine()(event);
  const when = feedWhen(event.starts_at, event.timezone, locale);
  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}` as Href)}
      accessibilityRole="link"
      accessibilityLabel={[event.name, when].join(", ")}
      style={{ width }}
      className="active:opacity-80"
    >
      <View style={{ width, height: width * 1.25, borderRadius: 14, overflow: "hidden", backgroundColor: c.ink3, opacity: past ? 0.7 : 1 }}>
        {event.image_url ? <Image source={{ uri: event.image_url }} style={{ width, height: width * 1.25 }} contentFit="cover" /> : null}
        {event.requires_rsvp && !past ? (
          <View className="absolute right-2 top-2 rounded-v2-pill bg-v2-flame px-2 py-0.5">
            <Text className="font-v2-ui-bold text-[10.5px] text-v2-cream">{t("home.rsvp")}</Text>
          </View>
        ) : null}
      </View>
      {save ? (
        <View style={{ position: "absolute", top: width * 1.25 - 42, right: 8 }}>
          <SaveButton event={event} />
        </View>
      ) : null}
      <Text numberOfLines={2} className="mt-2 font-v2-display-bold text-[15px] leading-[18px] text-v2-cream">
        {event.name}
      </Text>
      <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c70">{when}</Text>
      {event.venue ? <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c50">{event.venue}</Text> : null}
      {!past && price ? <Text className="mt-0.5 font-v2-ui-semibold text-[12.5px] text-v2-c90">{price}</Text> : null}
    </Pressable>
  );
}
