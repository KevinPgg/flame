/**
 * Flame 2.0 payment screen, app (fase 3.3, prototype `SCREENS.checkout`): back + "Checkout", the
 * reservation countdown (B7), the event, the order (tickets + promoter ✓ or a field to add one),
 * the discount code, the breakdown (tickets, discount, service fee ⓘ, total) and "Pay $X"
 * (Stripe's PaymentSheet). After paying: "You're in" — tickets are being prepared (the webhook
 * creates them), View tickets / Done. Logic in hooks/usePaymentScreen.
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { flameV2Colors as c, formatCentsAsPrice, holdCountdown, walletDayTime } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { usePaymentScreen } from "../../../../hooks/usePaymentScreen";
import { Icon } from "../../ui";

type Screen = ReturnType<typeof usePaymentScreen>;

const input = "h-12 flex-1 rounded-[14px] bg-v2-ink3 px-4 font-v2-ui text-[15px] text-v2-cream";
const ghostBtn = "h-12 items-center justify-center rounded-v2-pill bg-v2-ink3 px-4";
const H3 = ({ children }: { children: string }) => <Text className="mb-3 font-v2-ui-semibold text-[12px] uppercase tracking-[0.7px] text-v2-c50">{children}</Text>;

function Timer({ expiresAt, onExpired }: { expiresAt: string; onExpired: () => void }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const cd = holdCountdown(expiresAt, now);
  const expired = !!cd?.expired;
  useEffect(() => {
    if (expired) onExpired();
  }, [expired, onExpired]);
  if (!cd || cd.expired) return null;
  return (
    <View
      testID="hold-timer"
      style={{ borderWidth: 1, borderColor: cd.warn ? "rgba(255,180,67,0.4)" : c.c10, backgroundColor: cd.warn ? "rgba(255,180,67,0.1)" : c.ink2 }}
      className="flex-row items-center gap-2 rounded-v2-pill px-4 py-2.5"
    >
      <Icon name="clock" size={17} color={cd.warn ? c.warn : c.cream} />
      <Text style={{ color: cd.warn ? c.warn : c.cream }} className="font-v2-ui text-[14px]">
        {t("checkout.holdTimer", { time: cd.label })}
      </Text>
    </View>
  );
}

export function PaymentScreenView({ s, onBack, onDone, onViewTickets }: { s: Screen; onBack: () => void; onDone: () => void; onViewTickets: () => void }) {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const [expired, setExpired] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [feeOpen, setFeeOpen] = useState(false);
  const markExpired = useCallback(() => setExpired(true), []);

  const wrapTop = { paddingTop: insets.top + 8 };

  if (s.step === "loading") {
    return (
      <View style={wrapTop} className="flex-1 items-center justify-center gap-3 bg-black">
        <ActivityIndicator color={c.cream} />
        <Text className="font-v2-ui text-[14px] text-v2-c70">{t("checkout.loading")}</Text>
      </View>
    );
  }
  if (s.step === "error" || !s.details) {
    return (
      <View style={wrapTop} className="flex-1 items-center justify-center gap-3 bg-black px-6">
        <Text className="text-center font-v2-display-bold text-[22px] text-v2-cream">{t("checkout.loadError")}</Text>
        {s.error ? <Text className="text-center font-v2-ui text-[14px] text-v2-c70">{s.error}</Text> : null}
        <Pressable onPress={onBack} accessibilityRole="button" className="mt-2 h-11 justify-center rounded-v2-pill bg-v2-cream px-6">
          <Text className="font-v2-ui-semibold text-[14px] text-v2-ink">{t("common.back")}</Text>
        </Pressable>
      </View>
    );
  }
  if (s.step === "paid" || s.step === "claimed") {
    return (
      <View style={wrapTop} className="flex-1 items-center justify-center gap-3 bg-black px-6">
        <View style={{ backgroundColor: "rgba(76,215,135,0.15)" }} className="h-16 w-16 items-center justify-center rounded-full">
          <Icon name="check" size={30} color={c.good} />
        </View>
        <Text accessibilityRole="header" className="font-v2-display-bold text-[30px] text-v2-cream">{t("checkout.youreIn")}</Text>
        <Text className="text-center font-v2-ui-semibold text-[15px] text-v2-cream">{s.details.event.name}</Text>
        <Text className="text-center font-v2-ui text-[14px] text-v2-c70">{s.step === "paid" ? t("checkout.ticketsPreparing") : t("checkout.freeClaimed")}</Text>
        <Pressable onPress={onViewTickets} accessibilityRole="button" className="mt-3 h-12 w-full flex-row items-center justify-center gap-2 rounded-v2-pill bg-v2-cream">
          <Icon name="qr" size={18} color={c.ink} />
          <Text className="font-v2-ui-semibold text-[15px] text-v2-ink">{t("checkout.viewTickets")}</Text>
        </Pressable>
        <Pressable onPress={onDone} accessibilityRole="button" className="h-11 w-full items-center justify-center rounded-v2-pill bg-v2-ink3">
          <Text className="font-v2-ui-semibold text-[14px] text-v2-c90">{t("checkout.done")}</Text>
        </Pressable>
      </View>
    );
  }

  const d = s.details;
  const cur = (s.amounts?.currency ?? d.event.currency ?? "USD").toUpperCase();
  const money = (cents: number) => formatCentsAsPrice(cents, cur);
  const when = walletDayTime(d.event.starts_at, d.event.timezone ?? null, locale);
  const tier = [d.ticket_tier.name, d.stage_name].filter(Boolean).join(" · ");
  const total = s.amounts?.total ?? s.baseCents;
  const waitingPromoter = s.promoter.status === "validating";
  const busy = s.step === "paying";

  return (
    <KeyboardAvoidingView className="flex-1 bg-black" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        <View className="gap-6 px-4">
          <View className="flex-row items-center gap-3">
            <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={4} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.ink3 }} className="items-center justify-center">
              <Icon name="back" size={20} color={c.cream} />
            </Pressable>
            <Text accessibilityRole="header" className="font-v2-display-bold text-[22px] text-v2-cream">{t("checkout.title")}</Text>
          </View>

          {s.expiresAt && !expired ? <Timer expiresAt={s.expiresAt} onExpired={markExpired} /> : null}
          {expired ? (
            <View accessibilityRole="alert" style={{ backgroundColor: "rgba(255,138,122,0.1)", borderColor: "rgba(255,138,122,0.3)", borderWidth: 1 }} className="gap-2 rounded-[16px] p-4">
              <Text className="font-v2-ui-semibold text-[15px] text-v2-cream">{t("checkout.holdExpired")}</Text>
              <Text className="font-v2-ui text-[13.5px] text-v2-c70">{t("checkout.holdExpiredBody")}</Text>
              <Pressable onPress={onBack} accessibilityRole="button" className="self-start rounded-v2-pill bg-v2-cream px-4 py-2">
                <Text className="font-v2-ui-semibold text-[14px] text-v2-ink">{t("checkout.holdBack")}</Text>
              </Pressable>
            </View>
          ) : null}

          <View className="flex-row items-center gap-3">
            <View style={{ width: 64, height: 64, borderRadius: 12, overflow: "hidden", backgroundColor: c.ink3 }}>
              {d.event.image_url ? <Image source={{ uri: d.event.image_url }} style={{ width: 64, height: 64 }} contentFit="cover" /> : null}
            </View>
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="font-v2-ui-semibold text-[17px] text-v2-cream">{d.event.name}</Text>
              <Text numberOfLines={1} className="font-v2-ui text-[13px] text-v2-c70">{`${when.day} · ${when.time}`}</Text>
              <Text numberOfLines={1} className="font-v2-ui text-[13px] text-v2-c70">{[d.event.venue, d.event.city].filter(Boolean).join(", ")}</Text>
            </View>
          </View>

          <View>
            <H3>{t("checkout.order")}</H3>
            <View style={{ backgroundColor: "#111" }} className="gap-2 rounded-[16px] p-4">
              <View className="flex-row justify-between">
                <Text className="font-v2-ui text-[15px] text-v2-cream">{`${d.quantity} × ${tier}`}</Text>
                <Text className="font-v2-ui-semibold text-[15px] text-v2-cream">{money(s.baseCents)}</Text>
              </View>
              {s.promoterCode ? (
                <View className="flex-row justify-between" testID="order-promoter">
                  <Text className="font-v2-ui text-[14px] text-v2-c70">{t("checkout.promoter")}</Text>
                  <View className="flex-row items-center gap-1.5">
                    <Icon name="check" size={14} color={c.good} />
                    <Text style={{ color: c.good }} className="font-v2-ui-semibold text-[14px]">{s.promoterCode}</Text>
                  </View>
                </View>
              ) : null}
            </View>
            {!s.promoterCode ? (
              <View className="mt-3">
                <View className="flex-row gap-2">
                  <TextInput
                    value={s.promoter.code}
                    onChangeText={s.setPromoterInput}
                    placeholder={t("checkout.promoterCode")}
                    placeholderTextColor={c.c50}
                    accessibilityLabel={t("checkout.promoterCode")}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    className={input}
                    style={{ paddingVertical: 0 }}
                  />
                  <Pressable
                    onPress={() => void s.applyPromoter(s.promoter.code)}
                    disabled={!s.promoter.code.trim() || waitingPromoter}
                    accessibilityRole="button"
                    accessibilityLabel={t("checkout.add")}
                    className={ghostBtn}
                    style={{ opacity: !s.promoter.code.trim() || waitingPromoter ? 0.5 : 1 }}
                  >
                    <Text className="font-v2-ui-semibold text-[14px] text-v2-cream">{waitingPromoter ? "…" : t("checkout.add")}</Text>
                  </Pressable>
                </View>
                {s.promoter.status === "invalid" ? <Text style={{ color: c.errorText }} className="mt-1.5 font-v2-ui text-[12.5px]">{t("checkout.promoterInvalid")}</Text> : null}
                {s.promoter.status === "error" ? (
                  <View className="mt-1.5 flex-row flex-wrap items-center">
                    <Text className="font-v2-ui text-[12.5px] text-v2-c70">{t("checkout.promoterCheckFailed")} · </Text>
                    <Pressable onPress={() => void s.applyPromoter(s.promoter.code)} accessibilityRole="button" accessibilityLabel={t("checkout.retry")} hitSlop={8}>
                      <Text className="font-v2-ui-semibold text-[12.5px] text-v2-cream underline">{t("checkout.retry")}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          {!s.isFree || s.promo.applied ? (
            <View>
              <H3>{t("checkout.discountCode")}</H3>
              {s.promo.applied ? (
                <View style={{ backgroundColor: "rgba(76,215,135,0.1)", borderColor: "rgba(76,215,135,0.3)", borderWidth: 1 }} className="h-12 flex-row items-center gap-2 rounded-[14px] px-4">
                  <Icon name="check" size={16} color={c.good} />
                  <Text style={{ color: c.good }} className="flex-1 font-v2-ui-semibold text-[14px]">{s.promo.applied}</Text>
                  <Pressable onPress={() => void s.removePromo()} disabled={s.promo.busy} accessibilityRole="button" accessibilityLabel={t("checkout.remove")} hitSlop={8}>
                    <Text style={{ color: c.good }} className="font-v2-ui text-[13px] underline">{t("checkout.remove")}</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <View className="flex-row gap-2">
                    <TextInput
                      value={promoInput}
                      onChangeText={setPromoInput}
                      placeholder={t("checkout.discountPlaceholder")}
                      placeholderTextColor={c.c50}
                      accessibilityLabel={t("checkout.discountCode")}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      editable={!s.promo.busy}
                      className={input}
                      style={{ paddingVertical: 0 }}
                    />
                    <Pressable
                      onPress={() => void s.applyPromo(promoInput)}
                      disabled={!promoInput.trim() || s.promo.busy}
                      accessibilityRole="button"
                      accessibilityLabel={t("checkout.apply")}
                      className={ghostBtn}
                      style={{ opacity: !promoInput.trim() || s.promo.busy ? 0.5 : 1 }}
                    >
                      <Text className="font-v2-ui-semibold text-[14px] text-v2-cream">{s.promo.busy ? "…" : t("checkout.apply")}</Text>
                    </Pressable>
                  </View>
                  {s.promo.error ? <Text style={{ color: c.errorText }} className="mt-1.5 font-v2-ui text-[12.5px]">{s.promo.error}</Text> : null}
                </>
              )}
            </View>
          ) : null}

          {s.amounts ? (
            <View className="gap-2">
              <View className="flex-row justify-between">
                <Text className="font-v2-ui text-[14.5px] text-v2-c70">{t("checkout.tickets")}</Text>
                <Text className="font-v2-ui text-[14.5px] text-v2-cream">{money(s.amounts.base)}</Text>
              </View>
              {s.amounts.discount ? (
                <View className="flex-row justify-between">
                  <Text style={{ color: c.good }} className="font-v2-ui text-[14.5px]">{`${t("checkout.discount")}${s.promo.applied ? ` ${s.promo.applied}` : ""}`}</Text>
                  <Text style={{ color: c.good }} className="font-v2-ui text-[14.5px]">−{money(s.amounts.discount)}</Text>
                </View>
              ) : null}
              {s.amounts.fee > 0 ? (
                <View className="flex-row justify-between">
                  <Pressable onPress={() => setFeeOpen((v) => !v)} accessibilityRole="button" accessibilityLabel={t("checkout.serviceFee")} className="flex-row items-center gap-1.5">
                    <Text className="font-v2-ui text-[14.5px] text-v2-c70">{t("checkout.serviceFee")}</Text>
                    <View style={{ borderColor: c.c30, borderWidth: 1 }} className="h-5 w-5 items-center justify-center rounded-full">
                      <Text className="font-v2-ui text-[11px] text-v2-c70">i</Text>
                    </View>
                  </Pressable>
                  <Text className="font-v2-ui text-[14.5px] text-v2-cream">{money(s.amounts.fee)}</Text>
                </View>
              ) : null}
              {feeOpen ? <Text className="font-v2-ui text-[12.5px] text-v2-c50">{t("checkout.feeInfo")}</Text> : null}
              <View style={{ height: 1, backgroundColor: c.c10 }} className="my-1" />
              <View className="flex-row justify-between">
                <Text className="font-v2-ui-semibold text-[18px] text-v2-cream">{t("checkout.total")}</Text>
                <Text className="font-v2-display-bold text-[18px] text-v2-cream">{money(total)}</Text>
              </View>
              <Text className="font-v2-ui text-[12px] text-v2-c50">{t("checkout.finalPrice")}</Text>
            </View>
          ) : (
            <Text className="font-v2-ui text-[13.5px] text-v2-c70">{t("checkout.noPayment")}</Text>
          )}

          {s.payError ? (
            <View style={{ backgroundColor: "rgba(255,138,122,0.1)" }} className="rounded-[12px] px-3 py-2">
              <Text style={{ color: c.errorText }} className="font-v2-ui text-[13px]">{s.payError}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={{ paddingBottom: Math.max(insets.bottom, 12), borderTopColor: "#161616", borderTopWidth: 1 }} className="absolute bottom-0 left-0 right-0 bg-black/95 px-4 pt-3.5">
        <Pressable
          onPress={() => void (s.isFree ? s.claimFree() : s.pay())}
          disabled={busy || expired || waitingPromoter}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || expired || waitingPromoter }}
          style={{ opacity: busy || expired || waitingPromoter ? 0.55 : 1 }}
          className="h-[52px] flex-row items-center justify-center gap-2 rounded-v2-pill bg-v2-cream active:bg-v2-paper"
        >
          {busy ? <ActivityIndicator color={c.ink} /> : null}
          <Text className="font-v2-ui-semibold text-[15.5px] text-v2-ink">{s.isFree ? t("checkout.claimFree") : t("checkout.pay", { amount: money(total) })}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

export function PaymentScreen({ holdId }: { holdId: string }) {
  const s = usePaymentScreen(holdId);
  const router = useRouter();
  const back = () => {
    s.cancel(); // release the tickets (nothing was charged)
    if (router.canGoBack()) router.back();
    else router.replace("/" as Href);
  };
  return (
    <PaymentScreenView
      s={s}
      onBack={back}
      onDone={() => router.replace("/" as Href)}
      onViewTickets={() => router.replace("/(tabs)/dashboard" as Href)}
    />
  );
}
