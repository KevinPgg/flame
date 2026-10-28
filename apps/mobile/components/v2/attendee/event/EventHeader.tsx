/**
 * Flame 2.0 event screen, top part (fase 2.4), app. Prototype `SCREENS.event`: flyer over its own
 * blurred colors, organizer (logo + name → profile) above a big title, when and where (with
 * Directions), RSVP note, description in 3 lines with "More". Below it the v1 purchase block of
 * app/event/[id].tsx renders unchanged until fase 3 (decision 1a).
 */
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { directionsUrl, flameV2Colors as c, walletDayTime } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { LinkableText } from "../../../LinkableText";
import { Icon, OrgAvatar, type IconName } from "../../ui";

export type EventHeaderData = {
  name: string;
  description?: string | null;
  image_url?: string | null;
  starts_at: string;
  ends_at: string;
  timezone?: string | null;
  venue?: string | null;
  city?: string | null;
  requires_rsvp?: boolean | null;
};

function Row({ icon, label, value, action, tone }: { icon: IconName; label?: string; value: string; action?: { label: string; onPress: () => void }; tone?: "flame" }) {
  return (
    <View className="flex-row items-center gap-3">
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: tone === "flame" ? c.flame : c.ink3 }} className="items-center justify-center">
        <Icon name={icon} size={18} color={c.cream} />
      </View>
      <View className="min-w-0 flex-1">
        {label ? <Text className="font-v2-ui text-[12px] text-v2-c50">{label}</Text> : null}
        <Text className="font-v2-ui-semibold text-[14.5px] text-v2-cream">{value}</Text>
      </View>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="link" className="rounded-v2-pill bg-v2-ink3 px-3 py-1.5 active:bg-v2-ink4">
          <Text className="font-v2-ui-semibold text-[12.5px] text-v2-cream">{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EventHeader({
  event,
  organizer,
}: {
  event: EventHeaderData;
  organizer: { names: string; slug?: string | null; logoUrl?: string | null } | null;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const start = walletDayTime(event.starts_at, event.timezone, locale);
  const end = walletDayTime(event.ends_at, event.timezone, locale);
  const oneNight = Date.parse(event.ends_at) - Date.parse(event.starts_at) < 24 * 3600_000;
  const when = oneNight ? `${start.day} · ${start.time} – ${end.time}` : `${start.day} ${start.time} – ${end.day} ${end.time}`;
  const where = [event.venue, event.city].filter(Boolean).join(", ");
  const maps = directionsUrl(event);
  const desc = event.description ?? "";
  const long = desc.length > 220 || desc.split("\n").length > 3;

  return (
    <View style={{ paddingTop: insets.top + 8 }} className="overflow-hidden px-4 pb-2">
      {event.image_url ? (
        <Image
          source={{ uri: event.image_url }}
          style={{ position: "absolute", top: -80, left: -80, right: -80, height: 700, opacity: 0.5 }}
          blurRadius={60}
          contentFit="cover"
        />
      ) : null}
      {/* Back and share live in EventTopBar, fixed over the page (Kevin 2026-10-28). */}
      <View style={{ height: 40 }} className="mb-4" />
      <View style={{ aspectRatio: 4 / 5, borderRadius: 18, overflow: "hidden", backgroundColor: c.ink3 }}>
        {event.image_url ? <Image source={{ uri: event.image_url }} style={{ width: "100%", height: "100%" }} contentFit="cover" accessibilityLabel={event.name} /> : null}
      </View>

      {organizer ? (
        <Pressable
          onPress={organizer.slug ? () => router.push(`/organizer/${organizer.slug}` as Href) : undefined}
          disabled={!organizer.slug}
          accessibilityRole="link"
          accessibilityLabel={t("event.seeOrganizer")}
          className="mt-6 flex-row items-center gap-2.5 active:opacity-70"
        >
          <OrgAvatar name={organizer.names} logoUrl={organizer.logoUrl ?? null} size={34} />
          <Text numberOfLines={1} className="flex-shrink font-v2-ui-semibold text-[15px] text-v2-cream">{organizer.names}</Text>
        </Pressable>
      ) : null}
      <Text accessibilityRole="header" className="mt-2 font-v2-display-bold text-[34px] leading-[36px] tracking-[-1.2px] text-v2-cream">
        {event.name}
      </Text>

      <View className="mt-5 gap-3">
        <Row icon="cal" label={t("event.when")} value={when} />
        {where ? (
          <Row
            icon="pin"
            label={t("event.venue")}
            value={where}
            action={maps ? { label: t("ticket.directions"), onPress: () => void Linking.openURL(maps).catch(() => {}) } : undefined}
          />
        ) : null}
        {event.requires_rsvp ? <Row icon="rsvp" value={t("event.rsvpRequired")} tone="flame" /> : null}
      </View>

      {desc ? (
        <View className="mt-6">
          <Text className="mb-1.5 font-v2-ui-semibold text-[12px] uppercase tracking-[0.7px] text-v2-c50">{t("event.about")}</Text>
          <LinkableText numberOfLines={open ? undefined : 3} className="font-v2-ui" style={{ color: c.c90, fontSize: 15, lineHeight: 22 }} testID="event-description">
            {desc}
          </LinkableText>
          {long ? (
            <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" hitSlop={6} className="mt-1 self-start">
              <Text className="font-v2-ui-semibold text-[14px] text-v2-cream underline">{open ? t("common.less") : t("common.more")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
