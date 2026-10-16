"use client";

import { useRef } from "react";
import {
  TIER_DESCRIPTION_MAX_LENGTH,
  defaultStages,
  newStageDraft,
  tierTotalQuantity,
  type EventFormErrors,
  type QuestionDraft,
  type StageDraft,
  type TierDraft,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { Icon } from "../../components/Icon";
import { QuestionsBuilder } from "./QuestionsBuilder";
import { FieldError, Group, Labeled, SwitchRow, fieldCls, fieldId, iconBtn } from "./ui";

/**
 * One tier of the create form (prototype "cf-tier"): name, price, spots, limit, access code,
 * description, sales window, hide — all visible. "Price changes as tickets sell" (stages) is the
 * advanced option Kevin kept from v1. Registration questions per tier when the event takes RSVPs.
 */
export function TierFields({
  tier,
  index,
  canRemove,
  currencySymbol,
  defaults,
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
  /** datetime-local values used when the organizer opens a sales date. */
  defaults: { salesStart: string; salesEnd: string };
  requiresRsvp: boolean;
  reusable: QuestionDraft[];
  errors: EventFormErrors;
  errorText: (path: string) => string | null;
  onChange: (next: TierDraft) => void;
  onRemove: () => void;
  /** Tier editor: tickets already sold (spots can't go below). */
  sold?: number;
  /** Tier editor: an existing tier can't switch stages on/off (v1 rule; the API can't convert). */
  stagesLocked?: boolean;
  /** Tier editor: the "Mark as sold out" switch. */
  soldOut?: { checked: boolean; onChange: (next: boolean) => void };
  reusableLabel?: string;
}) {
  const { t } = useI18n();
  const p = `tiers.${tier.key}`;
  const set = (patch: Partial<TierDraft>) => onChange({ ...tier, ...patch });
  const inv = (path: string) => (errors[path] ? true : undefined);
  const setStage = (i: number, patch: Partial<StageDraft>) =>
    set({ stages: tier.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const toggleStages = (on: boolean) => {
    if (!on) return set({ useStages: false });
    const stages =
      tier.stages.length > 0
        ? tier.stages
        : defaultStages(tier, { first: t("eventForm.stageFirst"), second: t("eventForm.stageSecond") });
    set({ useStages: true, stages });
  };
  const total = tierTotalQuantity(tier);

  return (
    <article id={fieldId(p)} aria-label={tier.name.trim() || t("eventForm.tierN", { n: index + 1 })} className="rounded-v2-card bg-v2-ink2 p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-v2-cream text-[13px] font-v2-ui-bold text-v2-ink">
          {index + 1}
        </span>
        <input
          id={fieldId(`${p}.name`)}
          value={tier.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={t("eventForm.tierN", { n: index + 1 })}
          aria-label={t("eventForm.tierName")}
          aria-invalid={inv(`${p}.name`)}
          className={`${fieldCls} h-10 flex-1 bg-transparent px-1 text-[17px] font-v2-ui-semibold focus:ring-0`}
        />
        {canRemove && (
          <button type="button" className={iconBtn} onClick={onRemove} aria-label={t("eventForm.removeTier")}>
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
      <FieldError path={`${p}.name`} message={errorText(`${p}.name`)} />
      {sold > 0 && <p className="mt-2 text-[12.5px] text-v2-c70">{t("eventForm.soldInfo", { count: sold })}</p>}

      {!tier.useStages ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Labeled label={t("eventForm.price")} htmlFor={fieldId(`${p}.price`)} error={errorText(`${p}.price`)}>
            <MoneyInput
              id={fieldId(`${p}.price`)}
              symbol={currencySymbol}
              value={tier.price}
              onChange={(price) => set({ price })}
              invalid={inv(`${p}.price`)}
              placeholder="0"
            />
          </Labeled>
          <Labeled label={t("eventForm.spots")} htmlFor={fieldId(`${p}.quantity`)} error={errorText(`${p}.quantity`)}>
            <input
              id={fieldId(`${p}.quantity`)}
              inputMode="numeric"
              value={tier.quantity}
              onChange={(e) => set({ quantity: e.target.value.replace(/\D/g, "") })}
              aria-invalid={inv(`${p}.quantity`)}
              placeholder="100"
              className={`${fieldCls} tabular-nums`}
            />
          </Labeled>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {tier.stages.map((s, i) => {
            const sp = `${p}.stages.${s.key}`;
            return (
              <div key={s.key} className="rounded-v2-md bg-v2-ink3 p-2.5">
                <div className="flex items-center gap-2">
                  <input
                    id={fieldId(`${sp}.name`)}
                    value={s.name}
                    onChange={(e) => setStage(i, { name: e.target.value })}
                    aria-label={t("eventForm.stageName")}
                    aria-invalid={inv(`${sp}.name`)}
                    placeholder={t("eventForm.stageName")}
                    className={`${fieldCls} h-10 flex-1 bg-v2-ink2`}
                  />
                  {(s.sold ?? 0) > 0 && (
                    <span className="shrink-0 text-[12px] text-v2-c50">{t("eventForm.stageSold", { count: s.sold ?? 0 })}</span>
                  )}
                  <button
                    type="button"
                    className={iconBtn}
                    disabled={(s.sold ?? 0) > 0}
                    onClick={() => set({ stages: tier.stages.filter((_, j) => j !== i) })}
                    aria-label={t("eventForm.removeStage")}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
                <FieldError path={`${sp}.name`} message={errorText(`${sp}.name`)} />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Labeled label={t("eventForm.price")} htmlFor={fieldId(`${sp}.price`)} error={errorText(`${sp}.price`)}>
                    <MoneyInput
                      id={fieldId(`${sp}.price`)}
                      symbol={currencySymbol}
                      value={s.price}
                      onChange={(price) => setStage(i, { price })}
                      invalid={inv(`${sp}.price`)}
                      placeholder="0"
                      dark
                    />
                  </Labeled>
                  <Labeled label={t("eventForm.spots")} htmlFor={fieldId(`${sp}.quantity`)} error={errorText(`${sp}.quantity`)}>
                    <input
                      id={fieldId(`${sp}.quantity`)}
                      inputMode="numeric"
                      value={s.quantity}
                      onChange={(e) => setStage(i, { quantity: e.target.value.replace(/\D/g, "") })}
                      aria-invalid={inv(`${sp}.quantity`)}
                      className={`${fieldCls} bg-v2-ink2 tabular-nums`}
                    />
                  </Labeled>
                </div>
              </div>
            );
          })}
          <FieldError path={`${p}.stages`} message={errorText(`${p}.stages`)} />
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => set({ stages: [...tier.stages, newStageDraft()] })}
              className="inline-flex h-9 items-center gap-1.5 rounded-v2-pill px-2 text-[13px] font-v2-ui-semibold hover:bg-v2-ink3"
            >
              <Icon name="plus" size={15} />
              {t("eventForm.addStage")}
            </button>
            {total !== null && <span className="text-[12.5px] text-v2-c50">{t("eventForm.stagesTotal", { count: total })}</span>}
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Labeled label={t("eventForm.limit")} htmlFor={fieldId(`${p}.perUserLimit`)} error={errorText(`${p}.perUserLimit`)}>
          <input
            id={fieldId(`${p}.perUserLimit`)}
            inputMode="numeric"
            value={tier.perUserLimit}
            onChange={(e) => set({ perUserLimit: e.target.value.replace(/\D/g, "") })}
            aria-invalid={inv(`${p}.perUserLimit`)}
            className={`${fieldCls} tabular-nums`}
          />
        </Labeled>
        <Labeled
          label={t("eventForm.accessCode")}
          optional={t("eventForm.optional")}
          htmlFor={fieldId(`${p}.accessCode`)}
          error={errorText(`${p}.accessCode`)}
        >
          <input
            id={fieldId(`${p}.accessCode`)}
            value={tier.accessCode}
            onChange={(e) => set({ accessCode: e.target.value.toUpperCase() })}
            aria-invalid={inv(`${p}.accessCode`)}
            placeholder={t("eventForm.accessCodePlaceholder")}
            autoCapitalize="characters"
            className={`${fieldCls} uppercase`}
          />
        </Labeled>
      </div>

      <div className="mt-3">
        <Labeled
          label={t("eventForm.description")}
          optional={`${t("eventForm.optional")} · ${tier.description.length}/${TIER_DESCRIPTION_MAX_LENGTH}`}
          htmlFor={fieldId(`${p}.description`)}
          error={errorText(`${p}.description`)}
        >
          <input
            id={fieldId(`${p}.description`)}
            value={tier.description}
            maxLength={TIER_DESCRIPTION_MAX_LENGTH}
            onChange={(e) => set({ description: e.target.value })}
            aria-invalid={inv(`${p}.description`)}
            placeholder={t("eventForm.descriptionPlaceholder")}
            className={fieldCls}
          />
        </Labeled>
      </div>

      <div className="mt-3">
        <Group>
          <OptionalDate
            id={fieldId(`${p}.salesStart`)}
            label={t("eventForm.salesStart")}
            emptyLabel={t("eventForm.salesStartDefault")}
            value={tier.salesStart}
            fallback={defaults.salesStart}
            onChange={(salesStart) => set({ salesStart })}
            invalid={inv(`${p}.salesStart`)}
          />
          <OptionalDate
            id={fieldId(`${p}.salesEnd`)}
            label={t("eventForm.salesEnd")}
            emptyLabel={t("eventForm.salesEndDefault")}
            value={tier.salesEnd}
            fallback={defaults.salesEnd}
            onChange={(salesEnd) => set({ salesEnd })}
            invalid={inv(`${p}.salesEnd`)}
          />
          <SwitchRow title={t("eventForm.hide")} hint={t("eventForm.hideHint")} checked={tier.hidden} onChange={(hidden) => set({ hidden })} />
          {soldOut && (
            <SwitchRow
              title={t("eventForm.soldOutToggle")}
              hint={t("eventForm.soldOutHint")}
              checked={soldOut.checked}
              onChange={soldOut.onChange}
            />
          )}
          <SwitchRow
            title={t("eventForm.stagesToggle")}
            hint={stagesLocked ? t("eventForm.stagesLockedExisting") : t("eventForm.stagesHint")}
            checked={tier.useStages}
            onChange={toggleStages}
            disabled={stagesLocked}
          />
        </Group>
        <FieldError path={`${p}.salesStart`} message={errorText(`${p}.salesStart`)} />
        <FieldError path={`${p}.salesEnd`} message={errorText(`${p}.salesEnd`)} />
      </div>

      {requiresRsvp && (
        <QuestionsBuilder
          tierKey={tier.key}
          questions={tier.questions}
          reusable={reusable}
          reusableLabel={reusableLabel}
          onChange={(questions) => set({ questions })}
          errors={errors}
          errorText={errorText}
        />
      )}
    </article>
  );
}

export function MoneyInput({
  id,
  symbol,
  value,
  onChange,
  invalid,
  placeholder,
  dark,
}: {
  id: string;
  symbol: string;
  value: string;
  onChange: (next: string) => void;
  invalid?: boolean;
  placeholder?: string;
  dark?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-v2-c50">{symbol}</span>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        // Digits plus one decimal separator; "25,50" is accepted (es keyboards).
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        aria-invalid={invalid}
        placeholder={placeholder}
        className={`${fieldCls} tabular-nums ${dark ? "bg-v2-ink2" : ""}`}
        style={{ paddingLeft: `${1.1 + symbol.length * 0.55}rem` }}
      />
    </div>
  );
}

/**
 * Date that defaults to something sensible when empty ("Now", "When the event ends"):
 * shows the default as text until the organizer opens it; "×" goes back to the default.
 */
export function OptionalDate({
  id,
  label,
  emptyLabel,
  value,
  fallback,
  onChange,
  invalid,
}: {
  id: string;
  label: string;
  emptyLabel: string;
  value: string;
  fallback: string;
  onChange: (next: string) => void;
  invalid?: boolean;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2">
      <label htmlFor={id} className="w-[96px] shrink-0 text-[13px] text-v2-c70 sm:w-[120px]">
        {label}
      </label>
      {value ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <input
            ref={input}
            id={id}
            type="datetime-local"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={invalid}
            className={`${fieldCls} h-10 flex-1 bg-v2-ink3 [color-scheme:dark]`}
          />
          <button type="button" className={iconBtn} onClick={() => onChange("")} aria-label={t("eventForm.useDefault")}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ) : (
        <button
          id={id}
          type="button"
          onClick={() => {
            onChange(fallback);
            requestAnimationFrame(() => input.current?.focus());
          }}
          className="flex min-w-0 flex-1 items-center justify-end gap-1 text-right text-[14px] text-v2-c50 hover:text-v2-cream"
        >
          <span className="truncate">{emptyLabel}</span>
          <Icon name="chev" size={16} />
        </button>
      )}
    </div>
  );
}
