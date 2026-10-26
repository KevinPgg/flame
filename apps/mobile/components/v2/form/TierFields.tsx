/**
 * One tier (prototype "cf-tier"), native counterpart of the web TierFields with the same draft
 * and rules from @project-flame/lib: name, price, spots, limit, access code (only for hidden
 * tiers), description, sales window, hide, sold out (editor), price stages (advanced), and the
 * registration questions when the event takes RSVPs.
 */
import { Pressable, Text, View } from "react-native";
import {
  TIER_DESCRIPTION_MAX_LENGTH,
  defaultStages,
  flameV2Colors as c,
  newStageDraft,
  tierTotalQuantity,
  type EventFormErrors,
  type QuestionDraft,
  type StageDraft,
  type TierDraft,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { Icon } from "../ui";
import { QuestionsBuilder, IconBtn } from "./QuestionsBuilder";
import { FieldError, Group, Hint, Input, Labeled, MoneyInput, OptionalDateRow, SwitchRow } from "./ui";

export function TierFields({
  tier,
  index,
  canRemove,
  currencySymbol,
  defaults,
  tz,
  requiresRsvp,
  reusable,
  errors,
  errorText,
  onChange,
  onRemove,
  sold = 0,
  stagesLocked = false,
  soldOut,
  reusableLabel,
}: {
  tier: TierDraft;
  index: number;
  canRemove: boolean;
  currencySymbol: string;
  defaults: { salesStart: string; salesEnd: string };
  tz: string;
  requiresRsvp: boolean;
  reusable: QuestionDraft[];
  errors: EventFormErrors;
  errorText: (path: string) => string | null;
  onChange: (next: TierDraft) => void;
  onRemove: () => void;
  sold?: number;
  stagesLocked?: boolean;
  soldOut?: { checked: boolean; onChange: (next: boolean) => void };
  reusableLabel?: string;
}) {
  const { t } = useI18n();
  const p = `tiers.${tier.key}`;
  const set = (patch: Partial<TierDraft>) => onChange({ ...tier, ...patch });
  const inv = (path: string) => Boolean(errors[path]);
  const setStage = (i: number, patch: Partial<StageDraft>) => set({ stages: tier.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const toggleStages = (on: boolean) => {
    if (!on) return set({ useStages: false });
    const stages = tier.stages.length > 0 ? tier.stages : defaultStages(tier, { first: t("eventForm.stageFirst"), second: t("eventForm.stageSecond") });
    set({ useStages: true, stages });
  };
  const total = tierTotalQuantity(tier);
  const digits = (v: string) => v.replace(/\D/g, "");

  return (
    <View className="rounded-v2-card bg-v2-ink2 p-4" accessibilityLabel={tier.name.trim() || t("eventForm.tierN", { n: index + 1 })}>
      <View className="flex-row items-center gap-2">
        <View className="h-7 w-7 items-center justify-center rounded-full bg-v2-cream">
          <Text className="font-v2-ui-bold text-[13px] text-v2-ink">{index + 1}</Text>
        </View>
        <View className="min-w-0 flex-1">
          <Input
            bare
            value={tier.name}
            onChangeText={(name) => set({ name })}
            placeholder={t("eventForm.tierN", { n: index + 1 })}
            accessibilityLabel={t("eventForm.tierName")}
            invalid={inv(`${p}.name`)}
            className="h-12 font-v2-ui-semibold text-[17px]"
          />
        </View>
        {canRemove && <IconBtn icon="close" label={t("eventForm.removeTier")} onPress={onRemove} />}
      </View>
      <FieldError message={errorText(`${p}.name`)} />
      {sold > 0 && <Text className="mt-2 font-v2-ui text-[12.5px] text-v2-c70">{t("eventForm.soldInfo", { count: sold })}</Text>}

      {!tier.useStages ? (
        <View className="mt-3 flex-row gap-3">
          <Labeled label={t("eventForm.price")} error={errorText(`${p}.price`)}>
            <MoneyInput symbol={currencySymbol} value={tier.price} onChange={(price) => set({ price })} invalid={inv(`${p}.price`)} accessibilityLabel={t("eventForm.price")} />
          </Labeled>
          <Labeled label={t("eventForm.spots")} error={errorText(`${p}.quantity`)}>
            <Input value={tier.quantity} onChangeText={(v) => set({ quantity: digits(v) })} keyboardType="number-pad" placeholder="100" invalid={inv(`${p}.quantity`)} accessibilityLabel={t("eventForm.spots")} />
          </Labeled>
        </View>
      ) : (
        <View className="mt-3 gap-2">
          {tier.stages.map((s, i) => {
            const sp = `${p}.stages.${s.key}`;
            const stageSold = s.sold ?? 0;
            return (
              <View key={s.key} className="rounded-v2-md bg-v2-ink3 p-2.5">
                <View className="flex-row items-center gap-2">
                  <View className="min-w-0 flex-1">
                    <Input dark value={s.name} onChangeText={(name) => setStage(i, { name })} placeholder={t("eventForm.stageName")} accessibilityLabel={`${t("eventForm.stageName")} ${i + 1}`} invalid={inv(`${sp}.name`)} className="h-10" />
                  </View>
                  {stageSold > 0 && <Text className="font-v2-ui text-[12px] text-v2-c50">{t("eventForm.stageSold", { count: stageSold })}</Text>}
                  <IconBtn icon="close" label={`${t("eventForm.removeStage")} ${i + 1}`} disabled={stageSold > 0} onPress={() => set({ stages: tier.stages.filter((_, j) => j !== i) })} />
                </View>
                <FieldError message={errorText(`${sp}.name`)} />
                <View className="mt-2 flex-row gap-2">
                  <Labeled label={t("eventForm.price")} error={errorText(`${sp}.price`)}>
                    <MoneyInput dark symbol={currencySymbol} value={s.price} onChange={(price) => setStage(i, { price })} invalid={inv(`${sp}.price`)} accessibilityLabel={`${t("eventForm.price")} ${i + 1}`} />
                  </Labeled>
                  <Labeled label={t("eventForm.spots")} error={errorText(`${sp}.quantity`)}>
                    <Input dark value={s.quantity} onChangeText={(v) => setStage(i, { quantity: digits(v) })} keyboardType="number-pad" invalid={inv(`${sp}.quantity`)} accessibilityLabel={`${t("eventForm.spots")} ${i + 1}`} />
                  </Labeled>
                </View>
              </View>
            );
          })}
          <FieldError message={errorText(`${p}.stages`)} />
          <View className="flex-row items-center justify-between gap-2">
            <Pressable onPress={() => set({ stages: [...tier.stages, newStageDraft()] })} accessibilityRole="button" className="h-9 flex-row items-center gap-1.5 rounded-v2-pill px-2 active:bg-v2-ink3">
              <Icon name="plus" size={15} color={c.cream} />
              <Text className="font-v2-ui-semibold text-[13px] text-v2-cream">{t("eventForm.addStage")}</Text>
            </Pressable>
            {total !== null && <Text className="font-v2-ui text-[12.5px] text-v2-c50">{t("eventForm.stagesTotal", { count: total })}</Text>}
          </View>
        </View>
      )}

      <View className="mt-3 flex-row gap-3">
        <Labeled label={t("eventForm.limit")} error={errorText(`${p}.perUserLimit`)}>
          <Input value={tier.perUserLimit} onChangeText={(v) => set({ perUserLimit: digits(v) })} keyboardType="number-pad" invalid={inv(`${p}.perUserLimit`)} accessibilityLabel={t("eventForm.limit")} />
        </Labeled>
        <Labeled label={t("eventForm.accessCode")} optional={t("eventForm.optional")} error={errorText(`${p}.accessCode`)}>
          <Input
            value={tier.hidden ? tier.accessCode : ""}
            onChangeText={(v) => set({ accessCode: v.toUpperCase() })}
            placeholder={tier.hidden ? t("eventForm.accessCodePlaceholder") : ""}
            editable={tier.hidden}
            autoCapitalize="characters"
            invalid={inv(`${p}.accessCode`)}
            accessibilityLabel={t("eventForm.accessCode")}
          />
        </Labeled>
      </View>
      <Hint>{tier.hidden ? t("eventForm.accessCodeHint") : t("eventForm.accessCodeNeedsHidden")}</Hint>

      <View className="mt-3">
        <Labeled label={t("eventForm.description")} optional={`${t("eventForm.optional")} · ${tier.description.length}/${TIER_DESCRIPTION_MAX_LENGTH}`} error={errorText(`${p}.description`)}>
          <Input value={tier.description} onChangeText={(description) => set({ description })} maxLength={TIER_DESCRIPTION_MAX_LENGTH} placeholder={t("eventForm.descriptionPlaceholder")} invalid={inv(`${p}.description`)} accessibilityLabel={t("eventForm.description")} />
        </Labeled>
      </View>

      <View className="mt-3">
        <View className="overflow-hidden rounded-v2-card border border-v2-c10">
          <Group>
            <OptionalDateRow label={t("eventForm.salesStart")} emptyLabel={t("eventForm.salesStartDefault")} value={tier.salesStart} fallback={defaults.salesStart} onChange={(salesStart) => set({ salesStart })} tz={tz} invalid={inv(`${p}.salesStart`)} />
            <OptionalDateRow label={t("eventForm.salesEnd")} emptyLabel={t("eventForm.salesEndDefault")} value={tier.salesEnd} fallback={defaults.salesEnd} onChange={(salesEnd) => set({ salesEnd })} tz={tz} invalid={inv(`${p}.salesEnd`)} />
            <SwitchRow title={t("eventForm.hide")} hint={t("eventForm.hideHint")} checked={tier.hidden} onChange={(hidden) => set(hidden ? { hidden } : { hidden, accessCode: "" })} />
            {soldOut ? <SwitchRow title={t("eventForm.soldOutToggle")} hint={t("eventForm.soldOutHint")} checked={soldOut.checked} onChange={soldOut.onChange} /> : null}
            <SwitchRow title={t("eventForm.stagesToggle")} hint={stagesLocked ? t("eventForm.stagesLockedExisting") : t("eventForm.stagesHint")} checked={tier.useStages} onChange={toggleStages} disabled={stagesLocked} />
          </Group>
        </View>
        <FieldError message={errorText(`${p}.salesStart`)} />
        <FieldError message={errorText(`${p}.salesEnd`)} />
      </View>

      {requiresRsvp && (
        <QuestionsBuilder tierKey={tier.key} questions={tier.questions} reusable={reusable} reusableLabel={reusableLabel} onChange={(questions) => set({ questions })} errors={errors} errorText={errorText} />
      )}
    </View>
  );
}
