/**
 * Home card, "full flyer" (fase 2.2; Kevin chose it over square on 2026-10-27). Prototype `bCard`:
 * organizer + share on top; the flyer at 4:5 with a dark fade, and title, date · time and price
 * written on it; "RSVP" tag when the event asks for a request. Saving (heart) is fase 4.
 */
import { Pressable, Share, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, type Href } from "expo-router";
import { feedWhen, flameV2Colors as c, formatCentsAsPrice, priceSummary, type PriceableTier } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { Icon, OrgAvatar } from "../../ui";

export type FeedEvent = {
  id: string;
  slug: string;
  name: string;
  image_url?: string | null;
  starts_at: string;
  ends_at: string;
  timezone?: string | null;
  city?: string | null;
  venue?: string | null;
  organization_id?: string | null;
  requires_rsvp?: boolean | null;
  currency?: string | null;
  organizations?: { name: string; slug: string; logo_url?: string | null } | null;
  ticket_tiers?: PriceableTier[];
};

/** Public link of an event (same as the v1 event screen). */
export const eventShareUrl = (slug: string) => `https://flme.co/events/${slug}`;

export function usePriceLine() {
  const { t } = useI18n();
  return (e: Pick<FeedEvent, "ticket_tiers" | "currency">): string | null => {
    const p = priceSummary(e.ticket_tiers);
    if (!p) return null;
    const money = (cents: number) => formatCentsAsPrice(cents, e.currency ?? "USD");
    switch (p.kind) {
      case "free":
        return t("common.free");
      case "price":
        return money(p.cents);
      case "from":
        return t("common.from", { price: money(p.cents) });
      case "soldOut":
        return t("home.soldOut");
      case "notYet":
        return t("home.notYet");
    }
  };
}

export function EventFeedCard({ event }: { event: FeedEvent }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const priceLine = usePriceLine()(event);
  const org = event.organizations;
  const when = feedWhen(event.starts_at, event.timezone, locale);

  const share = async () => {
    try {
      await Share.share({ message: eventShareUrl(event.slug) });
    } catch {
      /* closed or not available — nothing to tell */
    }
  };

  return (
    <View className="mb-[30px] px-4">
      <View className="mb-2.5 flex-row items-center justify-between">
        {org ? (
          <Pressable
            onPress={() => router.push(`/organizer/${org.slug}` as Href)}
            accessibilityRole="link"
            className="min-w-0 flex-1 flex-row items-center gap-2 active:opacity-70"
          >
            <OrgAvatar name={org.name} logoUrl={org.logo_url ?? null} size={30} />
            <Text numberOfLines={1} className="flex-shrink font-v2-ui-semibold text-[14px] text-v2-cream">
              {org.name}
            </Text>
          </Pressable>
        ) : (
          <View className="flex-1" />
        )}
        <Pressable
          onPress={() => void share()}
          accessibilityRole="button"
          accessibilityLabel={t("home.shareEvent", { name: event.name })}
          hitSlop={6}
          className="h-[34px] w-[34px] items-center justify-center rounded-full active:bg-v2-ink3"
        >
          <Icon name="send" size={20} color={c.cream} />
        </Pressable>
      </View>

      <Pressable
        onPress={() => router.push(`/event/${event.id}` as Href)}
        accessibilityRole="link"
        accessibilityLabel={[event.name, when, priceLine].filter(Boolean).join(", ")}
        style={{ aspectRatio: 4 / 5, borderRadius: 16, overflow: "hidden", backgroundColor: "#111" }}
        className="active:opacity-90"
      >
        {event.image_url ? (
          <Image source={{ uri: event.image_url }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" transition={150} />
        ) : null}
        {event.requires_rsvp ? (
          <View className="absolute right-3 top-3 rounded-v2-pill bg-v2-flame px-2.5 py-1">
            <Text className="font-v2-ui-bold text-[11px] text-v2-cream">{t("home.rsvp")}</Text>
          </View>
        ) : null}
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.82)", "rgba(0,0,0,0.97)"]}
          locations={[0, 0.58, 1]}
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "60%" }}
          pointerEvents="none"
        />
        <View className="absolute bottom-3 left-3.5 right-3.5">
          <Text numberOfLines={2} className="font-v2-display-bold text-[20px] leading-[23px] text-v2-cream">
            {event.name}
          </Text>
          <Text className="mt-1 font-v2-ui-medium text-[14.5px] text-v2-c90">{when}</Text>
          {priceLine ? <Text className="mt-0.5 font-v2-ui text-[14.5px] text-v2-c70">{priceLine}</Text> : null}
        </View>
      </Pressable>
    </View>
  );
}
