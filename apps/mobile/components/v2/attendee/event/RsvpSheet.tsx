/**
 * Flame 2.0 RSVP sheet, app (fase 3.4, prototype `ACTS.rsvp`): the organizer's questions ONE
 * BLOCK PER GUEST ("Guest 2 of 3"), the number of guests, the promoter (✓ or a field), when it's
 * charged and "Send request". Guest 1's answers at the top level of registration_data (as
 * always), guests 2..N in `_guests` (Kevin's "compatible" choice; the server validates each).
 * Sending runs the existing useCheckout RSVP path (paid → card authorization in Stripe's sheet).
 */
import { useEffect, useMemo, useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { z } from "zod";
import { filterFieldsForTier, flameV2Colors as c, formatCentsAsPrice, RSVP_GUESTS_KEY } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { Sheet } from "../../Sheet";
import { Button, Icon } from "../../ui";
import { FormFieldSchema } from "../../../../hooks/useRsvpManagement";
import type { EventDetail, TicketTierWithStatus } from "../../../../hooks/useEventDetails";
import type { PromoterValidationStatus } from "../../../../hooks/useCheckout";

type Answers = Record<string, string | boolean>;
type Field = { id: string; label: string; type: string; required?: boolean; placeholder?: string };

const isEmpty = (f: Field, v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (f.type === "checkbox" && !v);

/** Guest 1 at the top level (as always), guests 2..N in `_guests`. */
export function rsvpAnswersPayload(perGuest: Answers[]): Record<string, unknown> {
  const [first, ...rest] = perGuest;
  return rest.length ? { ...(first ?? {}), [RSVP_GUESTS_KEY]: rest } : { ...(first ?? {}) };
}

export function RsvpSheet({
  visible,
  onClose,
  event,
  tier,
  quantity,
  maxQuantity,
  onQuantity,
  promoterCode,
  promoterStatus,
  onValidatePromoter,
  onClearPromoter,
  secretCode,
  error,
  busy,
  onSend,
  promo,
}: {
  visible: boolean;
  onClose: () => void;
  event: EventDetail;
  tier: TicketTierWithStatus;
  quantity: number;
  maxQuantity: number;
  onQuantity: (n: number) => void;
  promoterCode: string;
  promoterStatus: PromoterValidationStatus;
  onValidatePromoter: (code: string) => void;
  onClearPromoter: () => void;
  secretCode: string;
  error: string | null;
  busy: boolean;
  onSend: (answers: Record<string, unknown> | null) => void;
  /** Paid RSVPs: the discount applies to the amount authorized (as in the old sheet). */
  promo?: { applied: boolean; code: string; busy: boolean; onApply: (code: string) => void; onClear: () => void };
}) {
  const { t } = useI18n();
  const org = event.organization_name || event.organizations?.name || "";
  const fields = useMemo<Field[]>(() => {
    const parsed = z.array(FormFieldSchema).safeParse(event.registration_form_config);
    return parsed.success ? (filterFieldsForTier(parsed.data, tier.registration_form_fields) as Field[]) : [];
  }, [event.registration_form_config, tier.registration_form_fields]);
  const [answers, setAnswers] = useState<Answers[]>([{}]);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [promoterInput, setPromoterInput] = useState(promoterCode);
  const [promoInput, setPromoInput] = useState("");

  useEffect(() => {
    setAnswers((prev) => Array.from({ length: Math.max(1, quantity) }, (_, i) => prev[i] ?? {}));
  }, [quantity]);
  useEffect(() => setPromoterInput(promoterCode), [promoterCode]);

  const isFree = tier.displayPrice === 0;
  const set = (gi: number, id: string, v: string | boolean) => {
    setAnswers((prev) => prev.map((a, i) => (i === gi ? { ...a, [id]: v } : a)));
    setErrors((e) => ({ ...e, [`${gi}:${id}`]: false }));
  };
  const send = () => {
    if (fields.length === 0) return onSend(null);
    const next: Record<string, boolean> = {};
    answers.forEach((a, gi) => fields.forEach((f) => f.required && isEmpty(f, a[f.id]) && (next[`${gi}:${f.id}`] = true)));
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSend(rsvpAnswersPayload(answers));
  };
  const waiting = promoterStatus === "validating";

  return (
    <Sheet
      open={visible}
      title={t("rsvpSheet.title")}
      subtitle={t("rsvpSheet.lead", { org })}
      onClose={onClose}
      footer={
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c50">{t("tickets.beforeFees", { quantity, tier: tier.name })}</Text>
            <Text className="font-v2-display-bold text-[22px] text-v2-cream">{isFree ? t("common.free") : formatCentsAsPrice(tier.displayPrice * quantity, event.currency)}</Text>
          </View>
          <Button variant="primary" label={busy || waiting ? "…" : t("rsvpSheet.send")} disabled={busy || waiting} onPress={send} />
        </View>
      }
    >
      <View className="gap-4 pb-2">
        {fields.length > 0 ? (
          <View className="gap-3" testID="rsvp-questions">
            <Text className="font-v2-ui text-[12.5px] text-v2-c50">{t("rsvpSheet.questions", { org })}</Text>
            {answers.map((a, gi) => (
              <View key={gi} style={{ borderColor: c.c10, borderWidth: 1 }} className="gap-3 rounded-[16px] p-3.5">
                {answers.length > 1 ? (
                  <Text className="font-v2-ui-semibold text-[12px] uppercase tracking-[0.6px] text-v2-c50">{t("rsvpSheet.guest", { i: gi + 1, n: answers.length })}</Text>
                ) : null}
                {fields.map((f) => {
                  const bad = errors[`${gi}:${f.id}`];
                  const label = `${f.label}${f.required ? "" : ` (${t("rsvpSheet.optional")})`}`;
                  if (f.type === "checkbox") {
                    return (
                      <View key={f.id} className="flex-row items-center gap-3">
                        <Switch value={!!a[f.id]} onValueChange={(v) => set(gi, f.id, v)} accessibilityLabel={label} />
                        <Text className="flex-1 font-v2-ui text-[14px] text-v2-cream">{label}</Text>
                        {bad ? <Text style={{ color: c.errorText }} className="font-v2-ui text-[12px]">{t("rsvpSheet.required")}</Text> : null}
                      </View>
                    );
                  }
                  return (
                    <View key={f.id} className="gap-1.5">
                      <Text className="font-v2-ui text-[13px] text-v2-c70">{label}</Text>
                      <TextInput
                        value={String(a[f.id] ?? "")}
                        onChangeText={(v) => set(gi, f.id, v)}
                        placeholder={f.placeholder || ""}
                        placeholderTextColor={c.c50}
                        accessibilityLabel={label}
                        keyboardType={f.type === "email" ? "email-address" : f.type === "number" ? "numeric" : "default"}
                        autoCapitalize={f.type === "email" ? "none" : "sentences"}
                        autoCorrect={false}
                        style={{ height: 48, paddingVertical: 0, borderWidth: 1, borderColor: bad ? "rgba(255,138,122,0.6)" : c.c16 }}
                        className="rounded-[14px] bg-v2-ink3 px-4 font-v2-ui text-[15px] text-v2-cream"
                      />
                      {bad ? <Text style={{ color: c.errorText }} className="font-v2-ui text-[12px]">{t("rsvpSheet.required")}</Text> : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ backgroundColor: "#1d1d1d" }} className="flex-row items-center justify-between gap-3 rounded-[16px] p-4">
          <View className="min-w-0 flex-1">
            <Text className="font-v2-ui-semibold text-[15px] text-v2-cream">{t("rsvpSheet.guests")}</Text>
            <Text className="font-v2-ui text-[13px] text-v2-c70">{`${tier.currentStageName ?? tier.name} · ${t("rsvpSheet.guestsHint", { n: maxQuantity })}`}</Text>
          </View>
          <View className="flex-row items-center gap-1 rounded-v2-pill bg-v2-ink3 p-1">
            <Pressable onPress={() => onQuantity(quantity - 1)} disabled={quantity <= 1} accessibilityRole="button" accessibilityLabel={t("checkout.decrease")} style={{ opacity: quantity <= 1 ? 0.3 : 1 }} className="h-9 w-9 items-center justify-center rounded-full">
              <Text className="font-v2-ui-semibold text-[20px] text-v2-cream">−</Text>
            </Pressable>
            <Text className="min-w-[24px] text-center font-v2-ui-semibold text-[16px] text-v2-cream">{quantity}</Text>
            <Pressable onPress={() => onQuantity(quantity + 1)} disabled={quantity >= maxQuantity} accessibilityRole="button" accessibilityLabel={t("checkout.increase")} style={{ opacity: quantity >= maxQuantity ? 0.3 : 1 }} className="h-9 w-9 items-center justify-center rounded-full">
              <Text className="font-v2-ui-semibold text-[20px] text-v2-cream">+</Text>
            </Pressable>
          </View>
        </View>

        {secretCode ? (
          <View style={{ backgroundColor: "rgba(76,215,135,0.1)" }} className="h-12 flex-row items-center gap-2 rounded-[14px] px-4">
            <Icon name="check" size={16} color={c.good} />
            <Text style={{ color: c.good }} className="font-v2-ui-semibold text-[14px]">{t("checkout.accessApplied", { code: secretCode })}</Text>
          </View>
        ) : null}

        {promoterStatus === "valid" ? (
          <View style={{ backgroundColor: "rgba(76,215,135,0.1)" }} className="h-12 flex-row items-center gap-2 rounded-[14px] px-4">
            <Icon name="check" size={16} color={c.good} />
            <Text style={{ color: c.good }} className="flex-1 font-v2-ui-semibold text-[14px]">{t("checkout.promoterApplied", { code: promoterCode.toUpperCase() })}</Text>
            <Pressable onPress={onClearPromoter} accessibilityRole="button" accessibilityLabel={`${t("checkout.remove")} ${promoterCode}`} hitSlop={8}>
              <Icon name="close" size={16} color={c.good} />
            </Pressable>
          </View>
        ) : (
          <View>
            <View className="flex-row gap-2">
              <TextInput
                value={promoterInput}
                onChangeText={setPromoterInput}
                placeholder={t("checkout.promoterCode")}
                placeholderTextColor={c.c50}
                accessibilityLabel={t("checkout.promoterCode")}
                autoCapitalize="characters"
                autoCorrect={false}
                style={{ height: 48, paddingVertical: 0 }}
                className="flex-1 rounded-[14px] bg-v2-ink3 px-4 font-v2-ui text-[15px] text-v2-cream"
              />
              <Button label={waiting ? "…" : t("checkout.add")} disabled={!promoterInput.trim() || waiting} onPress={() => onValidatePromoter(promoterInput)} />
            </View>
            {promoterStatus === "invalid" && promoterInput.trim() ? <Text style={{ color: c.errorText }} className="mt-1.5 font-v2-ui text-[12.5px]">{t("checkout.promoterInvalid")}</Text> : null}
            {promoterStatus === "error" && promoterInput.trim() ? (
              <View className="mt-1.5 flex-row flex-wrap items-center">
                <Text className="font-v2-ui text-[12.5px] text-v2-c70">{t("checkout.promoterCheckFailed")} · </Text>
                <Pressable onPress={() => onValidatePromoter(promoterInput)} accessibilityRole="button" accessibilityLabel={t("checkout.retry")} hitSlop={8}>
                  <Text className="font-v2-ui-semibold text-[12.5px] text-v2-cream underline">{t("checkout.retry")}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}

        {!isFree && promo ? (
          promo.applied ? (
            <View style={{ backgroundColor: "rgba(76,215,135,0.1)" }} className="h-12 flex-row items-center gap-2 rounded-[14px] px-4">
              <Icon name="check" size={16} color={c.good} />
              <Text style={{ color: c.good }} className="flex-1 font-v2-ui-semibold text-[14px]">{promo.code}</Text>
              <Pressable onPress={promo.onClear} accessibilityRole="button" accessibilityLabel={`${t("checkout.remove")} ${promo.code}`} hitSlop={8}>
                <Icon name="close" size={16} color={c.good} />
              </Pressable>
            </View>
          ) : (
            <View className="flex-row gap-2">
              <TextInput
                value={promoInput}
                onChangeText={setPromoInput}
                placeholder={t("checkout.discountPlaceholder")}
                placeholderTextColor={c.c50}
                accessibilityLabel={t("checkout.discountCode")}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!promo.busy}
                style={{ height: 48, paddingVertical: 0 }}
                className="flex-1 rounded-[14px] bg-v2-ink3 px-4 font-v2-ui text-[15px] text-v2-cream"
              />
              <Button label={promo.busy ? "…" : t("checkout.apply")} disabled={!promoInput.trim() || promo.busy} onPress={() => promo.onApply(promoInput.trim())} />
            </View>
          )
        ) : null}

        <Text className="font-v2-ui text-[12.5px] text-v2-c50">{isFree ? t("rsvpSheet.free") : t("rsvpSheet.notChargedNow")}</Text>
        {error ? (
          <View style={{ backgroundColor: "rgba(255,138,122,0.1)" }} className="rounded-[12px] px-3 py-2">
            <Text style={{ color: c.errorText }} className="font-v2-ui text-[13px]">{error}</Text>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
