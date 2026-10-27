/**
 * Flame 2.0 QR ticket (fase 2.3), app. Prototype `SCREENS.ticket`: full screen over the flyer's
 * blurred colors; a white ticket with the flyer, date, start, tier and holder, and a big QR (tap →
 * full screen on white for the door scanner); Directions and Help; price, venue and organizer.
 *
 * Kevin's ask: every ticket of the event is loaded once and you SWIPE between them (or tap
 * "Ticket 2") without reloading — one horizontal pager over data already in memory; the route
 * param only says which one opens first. Data: useUserTickets; rules in lib/utils/wallet
 * (the courtesy QR keeps v1's exact content).
 */
import { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import {
  directionsUrl,
  eventTicketSlides,
  flameV2Colors as c,
  formatCentsAsPrice,
  ticketPrice,
  ticketQr,
  ticketStage,
  walletDayTime,
  walletOrganizer,
  type TicketQr,
  type UserTicket,
} from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { useUserTickets } from "../../../../hooks/useUserTickets";
import { eventShareUrl } from "../home/EventFeedCard";
import { Button, ErrorBox, Icon, type IconName } from "../../ui";

const QR = 200;

function QrImage({ qr, size }: { qr: TicketQr; size: number }) {
  if (!qr) return null;
  return qr.kind === "image" ? (
    <Image source={{ uri: qr.uri }} style={{ width: size, height: size }} contentFit="contain" accessibilityIgnoresInvertColors />
  ) : (
    <QRCode value={qr.value} size={size} backgroundColor="#FFFFFF" color="#000000" />
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: "50%" }} className="pb-2.5 pr-3">
      <Text className="font-v2-ui-medium text-[11.5px] text-[#777]">{label}</Text>
      <Text numberOfLines={2} className="font-v2-ui-semibold text-[14px] text-black">
        {value || "—"}
      </Text>
    </View>
  );
}

function TicketCard({ ticket, qr, width, onZoom }: { ticket: UserTicket; qr: TicketQr; width: number; onZoom: () => void }) {
  const { t, locale } = useI18n();
  const e = ticket.ticket_tier?.event;
  const when = e ? walletDayTime(e.starts_at, e.timezone, locale) : null;
  const tier = [ticket.ticket_tier?.name, ticketStage(ticket)].filter(Boolean).join(" · ");
  return (
    <View style={{ width }} className="px-5">
      <View style={{ borderRadius: 22, overflow: "hidden", backgroundColor: "#FFFFFF" }}>
        <View style={{ height: 120, backgroundColor: c.ink3 }}>
          {e?.image_url ? <Image source={{ uri: e.image_url }} style={{ height: 120 }} contentFit="cover" contentPosition="top" /> : null}
        </View>
        <View className="px-[18px] pb-[18px] pt-4">
          <Text className="font-v2-display-bold text-[24px] leading-[26px] tracking-[-0.8px] text-black">{e?.name ?? t("ticket.title")}</Text>
          <View className="mt-3.5 flex-row flex-wrap">
            <Cell label={t("ticket.date")} value={when?.day ?? ""} />
            <Cell label={t("ticket.starts")} value={when?.time ?? ""} />
            <Cell label={t("ticket.tier")} value={tier} />
            <Cell label={t("ticket.holder")} value={ticket.attendee_name || ticket.attendee_email || ""} />
          </View>
          <View style={{ borderTopWidth: 2, borderStyle: "dashed", borderColor: "#DDDDDD", marginHorizontal: -18, marginVertical: 12 }} />
          {ticket.status === "checked_in" ? (
            <Text className="mb-2 text-center font-v2-ui-semibold text-[13px] text-[#1E7F4A]">{t("ticket.checkedIn")}</Text>
          ) : null}
          {qr ? (
            <>
              <Pressable onPress={onZoom} accessibilityRole="button" accessibilityLabel={t("ticket.enlarge")} className="items-center active:opacity-80">
                <QrImage qr={qr} size={QR} />
              </Pressable>
              <Text className="mt-2 text-center font-v2-ui text-[12.5px] text-[#888]">{t("ticket.qrHint")}</Text>
            </>
          ) : (
            <Text className="py-6 text-center font-v2-ui text-[14px] text-[#666]">{t("ticket.noQr")}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} className="flex-1 items-center gap-2 active:opacity-70">
      <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(28,28,28,0.82)" }} className="items-center justify-center">
        <Icon name={icon} size={21} color={c.cream} />
      </View>
      <Text className="font-v2-ui text-[12.5px] text-v2-c90">{label}</Text>
    </Pressable>
  );
}

function Circle({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(28,28,28,0.82)" }}
      className="items-center justify-center active:opacity-80"
    >
      <Icon name={icon} size={20} color={c.cream} />
    </Pressable>
  );
}

export function TicketPager({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data, isLoading, isError, refetch } = useUserTickets();
  const rows = useMemo(() => data?.tickets ?? [], [data?.tickets]);
  const found = useMemo(() => eventTicketSlides(rows, id), [rows, id]);
  const slides = found?.slides ?? [];
  const [index, setIndex] = useState<number | null>(null);
  const current = Math.min(index ?? found?.index ?? 0, Math.max(0, slides.length - 1));
  const [zoom, setZoom] = useState(false);
  const pager = useRef<FlatList<UserTicket>>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/dashboard" as Href));
  const goTo = useCallback(
    (i: number) => {
      setIndex(i);
      pager.current?.scrollToIndex({ index: i, animated: true });
    },
    [],
  );
  const onSwipe = (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(ev.nativeEvent.contentOffset.x / width);
    if (i >= 0 && i < slides.length && i !== current) setIndex(i);
  };

  const ticket = slides[current];
  const e = ticket?.ticket_tier?.event;
  const qr = ticket ? ticketQr(ticket, rows) : null;

  const top = (
    <View style={{ paddingTop: insets.top + 8 }} className="flex-row items-center justify-between px-4 pb-2">
      <Circle icon="back" label={t("common.back")} onPress={back} />
      {e?.slug ? (
        <Circle
          icon="share"
          label={t("common.share")}
          onPress={() => {
            void Share.share({ message: eventShareUrl(e.slug) }).catch(() => {});
          }}
        />
      ) : null}
    </View>
  );

  if (!ticket) {
    return (
      <View className="flex-1 bg-black">
        {top}
        <View className="flex-1 items-center justify-center gap-3 px-8">
          {isLoading ? (
            <Text className="font-v2-ui text-[14px] text-v2-c70">{t("common.loading")}</Text>
          ) : isError ? (
            <ErrorBox message={t("ticket.loadError")} onRetry={() => void refetch()} />
          ) : (
            <>
              <Text className="text-center font-v2-display-bold text-[20px] text-v2-cream">{t("ticket.notFound")}</Text>
              <Text className="mb-2 text-center font-v2-ui text-[14.5px] text-v2-c70">{t("ticket.notFoundBody")}</Text>
              <Button variant="primary" small label={t("ticket.toWallet")} onPress={() => router.replace("/dashboard" as Href)} />
            </>
          )}
        </View>
      </View>
    );
  }

  const price = ticketPrice(ticket);
  const priceText =
    price.kind === "complimentary" ? t("ticket.complimentary") : price.kind === "free" ? t("common.free") : price.kind === "amount" ? formatCentsAsPrice(price.cents, e?.currency) : "";
  const maps = e ? directionsUrl(e) : null;
  const info: Array<[string, string]> = [
    [t("ticket.price"), priceText],
    [t("ticket.venue"), [e?.venue, e?.city].filter(Boolean).join(", ")],
    [t("ticket.organizer"), walletOrganizer(e) ?? ""],
  ].filter(([, v]) => !!v) as Array<[string, string]>;

  return (
    <View className="flex-1 bg-black">
      {e?.image_url ? (
        <Image
          source={{ uri: e.image_url }}
          style={{ position: "absolute", top: -60, left: -60, right: -60, bottom: -60, opacity: 0.45 }}
          blurRadius={50}
          contentFit="cover"
        />
      ) : null}
      {top}
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {slides.length > 1 ? (
          <View className="mb-3.5 items-center gap-2">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 4 }}>
              <View className="flex-row gap-1 rounded-v2-pill bg-[#1A1A1A] p-1" accessibilityRole="tablist">
                {slides.map((s, i) => {
                  const on = i === current;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => goTo(i)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      style={{ backgroundColor: on ? c.cream : "transparent" }}
                      className="h-[30px] items-center justify-center rounded-v2-pill px-3.5"
                    >
                      <Text style={{ color: on ? c.ink : c.c70 }} className="font-v2-ui-semibold text-[13px]">
                        {t("ticket.pick", { n: i + 1 })}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <Text className="font-v2-ui text-[12.5px] text-v2-c70">{t("ticket.of", { n: current + 1, total: slides.length })}</Text>
          </View>
        ) : null}

        <FlatList
          ref={pager}
          data={slides}
          keyExtractor={(s) => s.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={found?.index ?? 0}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={onSwipe}
          renderItem={({ item }) => <TicketCard ticket={item} qr={ticketQr(item, rows)} width={width} onZoom={() => setZoom(true)} />}
          accessibilityLabel={t("ticket.of", { n: current + 1, total: slides.length })}
        />

        <View className="mt-[18px] flex-row px-5">
          {maps ? <Action icon="map" label={t("ticket.directions")} onPress={() => void Linking.openURL(maps).catch(() => {})} /> : null}
          <Action icon="help" label={t("ticket.help")} onPress={() => router.push("/support" as Href)} />
        </View>

        {info.length ? (
          <View className="mx-5 mt-[22px] rounded-[16px] bg-[rgba(20,20,20,0.8)] px-4 py-1.5">
            {info.map(([k, v], i) => (
              <View key={k} className={`flex-row justify-between gap-4 py-2.5 ${i > 0 ? "border-t border-v2-c06" : ""}`}>
                <Text className="font-v2-ui text-[13.5px] text-v2-c50">{k}</Text>
                <Text className="flex-1 text-right font-v2-ui-semibold text-[13.5px] text-v2-cream">{v}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={zoom && !!qr} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setZoom(false)}>
        <Pressable onPress={() => setZoom(false)} accessibilityRole="button" accessibilityLabel={t("common.close")} className="flex-1 items-center justify-center bg-white px-8">
          <Text className="text-center font-v2-display-bold text-[20px] text-black">{e?.name}</Text>
          <Text className="mb-6 mt-1 text-center font-v2-ui text-[14px] text-[#666]">
            {[slides.length > 1 ? t("ticket.pick", { n: current + 1 }) : null, ticket.ticket_tier?.name].filter(Boolean).join(" · ")}
          </Text>
          <QrImage qr={qr} size={Math.min(width - 64, 320)} />
          <Text className="mt-6 font-v2-ui text-[13px] text-[#888]">{t("ticket.closeHint")}</Text>
        </Pressable>
      </Modal>
    </View>
  );
}
