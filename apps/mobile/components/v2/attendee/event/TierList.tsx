/**
 * Flame 2.0 tier cards (Kevin 2026-10-28, prototype `x-tcards`): name + "On sale · max N" on the
 * left, price + "Select" on the right. Tapping a tier selects it and the "Select" pill turns
 * into the quantity stepper RIGHT THERE — the screen doesn't move (the v1 screen scrolled to the
 * bottom on every tier change). Continue lives in the bottom bar.
 */
import { Pressable, Text, View } from "react-native";
import { flameV2Colors as c, formatCentsAsPrice } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { Icon } from "../../ui";
import type { TicketTierWithStatus } from "../../../../hooks/useEventDetails";

export function TierList({
  tiers,
  unlockedIds,
  selectedId,
  quantity,
  maxQuantity,
  isRsvp,
  currency,
  onSelect,
  onQuantity,
  onCheckout,
  checkoutDisabled,
}: {
  tiers: TicketTierWithStatus[];
  unlockedIds: ReadonlySet<string>;
  selectedId: string | null;
  quantity: number;
  maxQuantity: number;
  isRsvp: boolean;
  currency?: string;
  onSelect: (id: string) => void;
  onQuantity: (n: number) => void;
  /** Selected card: the button next to the price that opens the checkout sheet. */
  onCheckout: () => void;
  checkoutDisabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <View className="px-4">
      <Text accessibilityRole="header" className="mb-3 font-v2-display-bold text-[19px] tracking-[-0.4px] text-v2-cream">
        {t("event.tickets")}
      </Text>
      <View className="gap-2.5">
        {tiers.map((tier) => {
          const on = tier.status === "available";
          const selected = on && tier.id === selectedId;
          const status =
            tier.status === "available"
              ? t("event.onSale")
              : tier.status === "sold_out"
                ? t("event.soldOut")
                : tier.status === "sales_ended"
                  ? t("event.salesEnded")
                  : t("event.opensNext");
          const dot = tier.status === "available" ? c.good : tier.status === "not_available_yet" ? c.c50 : c.errorText;
          const limit = tier.per_user_limit && tier.per_user_limit > 0 ? ` · ${t("event.maxPer", { n: tier.per_user_limit })}` : "";
          const title = tier.currentStageName ?? tier.name;
          const desc = tier.currentStageDescription || tier.description;
          return (
            <Pressable
              key={tier.id}
              onPress={on && !selected ? () => onSelect(tier.id) : undefined}
              disabled={!on}
              accessibilityRole="button"
              accessibilityState={{ disabled: !on, selected }}
              accessibilityLabel={`${title}, ${tier.displayPrice === 0 ? t("common.free") : formatCentsAsPrice(tier.displayPrice, currency)}, ${status}`}
              style={{ borderWidth: 1, borderColor: selected ? c.cream : on ? c.c10 : c.c06, backgroundColor: on ? c.ink2 : "transparent", opacity: on ? 1 : 0.6 }}
              className="rounded-[18px] px-4 py-3.5"
            >
              <View className="flex-row items-center gap-3">
                <View className="min-w-0 flex-1">
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text numberOfLines={1} className={`font-v2-ui-semibold text-[16px] ${on ? "text-v2-cream" : "text-v2-c70"}`}>
                      {title}
                    </Text>
                    {unlockedIds.has(tier.id) ? (
                      <View className="rounded-[6px] bg-v2-cream px-1.5 py-0.5">
                        <Text className="font-v2-ui-semibold text-[11px] text-v2-ink">{t("event.unlocked")}</Text>
                      </View>
                    ) : null}
                  </View>
                  {tier.currentStageName ? <Text className="font-v2-ui text-[13px] text-v2-c70">{tier.name}</Text> : null}
                  <View className="mt-1 flex-row items-center gap-1.5">
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
                    <Text className="font-v2-ui text-[12.5px] text-v2-c70">
                      {status}
                      {limit}
                    </Text>
                  </View>
                </View>
                <Text
                  className={`font-v2-display-bold text-[18px] ${on ? "text-v2-cream" : "text-v2-c50"}`}
                  style={tier.status === "sold_out" ? { textDecorationLine: "line-through" } : undefined}
                >
                  {tier.displayPrice === 0 ? t("common.free") : formatCentsAsPrice(tier.displayPrice, currency)}
                </Text>
                {selected ? (
                  <Pressable
                    onPress={onCheckout}
                    disabled={checkoutDisabled}
                    accessibilityRole="button"
                    accessibilityLabel={isRsvp ? t("event.requestToJoin") : t("event.toCheckout")}
                    style={{ opacity: checkoutDisabled ? 0.5 : 1 }}
                    className="h-9 justify-center rounded-v2-pill bg-v2-cream px-4 active:bg-v2-paper"
                  >
                    <Text className="font-v2-ui-semibold text-[14px] text-v2-ink">{isRsvp ? t("event.request") : t("event.toCheckout")}</Text>
                  </Pressable>
                ) : tier.status === "not_available_yet" ? (
                  <Icon name="lock" size={15} color={c.c50} />
                ) : null}
              </View>
              {desc ? (
                <Text numberOfLines={selected ? undefined : 2} className="mt-2 font-v2-ui text-[13px] leading-[18px] text-v2-c50">
                  {desc}
                </Text>
              ) : null}
              {selected ? (
                <View className="mt-3 flex-row items-center justify-between border-t pt-3" style={{ borderColor: c.c10 }}>
                  <Text className="font-v2-ui text-[13px] text-v2-c70">{t("checkout.limit", { n: Math.max(1, maxQuantity) })}</Text>
                  <View className="flex-row items-center gap-1 rounded-v2-pill bg-v2-ink3 p-1">
                    <Pressable
                      onPress={() => onQuantity(quantity - 1)}
                      disabled={quantity <= 1}
                      accessibilityRole="button"
                      accessibilityLabel={t("checkout.decrease")}
                      hitSlop={4}
                      style={{ opacity: quantity <= 1 ? 0.3 : 1 }}
                      className="h-9 w-9 items-center justify-center rounded-full active:bg-v2-ink4"
                    >
                      <Text className="font-v2-ui-semibold text-[20px] text-v2-cream">−</Text>
                    </Pressable>
                    <Text accessibilityLiveRegion="polite" className="min-w-[24px] text-center font-v2-ui-semibold text-[16px] text-v2-cream">
                      {quantity}
                    </Text>
                    <Pressable
                      onPress={() => onQuantity(quantity + 1)}
                      disabled={quantity >= maxQuantity}
                      accessibilityRole="button"
                      accessibilityLabel={t("checkout.increase")}
                      hitSlop={4}
                      style={{ opacity: quantity >= maxQuantity ? 0.3 : 1 }}
                      className="h-9 w-9 items-center justify-center rounded-full active:bg-v2-ink4"
                    >
                      <Text className="font-v2-ui-semibold text-[20px] text-v2-cream">+</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
