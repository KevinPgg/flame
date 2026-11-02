/**
 * Send tickets (same as the web v2): free tickets or bank-transfer orders in three steps —
 * find person → ticket & quantity → confirm — with the "Sent" history below. Same endpoints and
 * rules (send to an email with no Flame account, tier stage, custom price on bank orders).
 */
import { useMemo, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import {
  SEND_MAX_QUANTITY,
  defaultSendOption,
  flameV2Colors as c,
  formatCentsAsPrice,
  formatEventDateTime,
  initialsOf,
  parseCustomPrice,
  personName,
  sendOptions,
  sentHistory,
  type SendMode,
  type SendOption,
  type SendTierRow,
  type SentBankRow,
  type SentCompRow,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiClient } from "../../../lib/api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { apiErrorText, type OrgEventV2 } from "../../../lib/v2/organizer-api";
import { Button, ErrorText, Field, Icon, StatusTag, SuccessNote } from "../ui";
import { PeoplePicker } from "../people/PeoplePicker";

const SEND_TIMEOUT_MS = 60_000;

interface FoundUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}
type Recipient = { kind: "user"; user: FoundUser } | { kind: "email"; email: string };
const recipientName = (r: Recipient) => (r.kind === "user" ? personName(r.user) : r.email);
const recipientEmail = (r: Recipient) => (r.kind === "user" ? r.user.email : r.email);

export function SendTab({
  event,
  organization,
  canEdit,
  onChanged,
}: {
  event: OrgEventV2;
  organization: { id: string; name: string };
  canEdit: boolean;
  onChanged: () => Promise<unknown> | void;
}) {
  const { t, locale } = useI18n();
  const { getToken } = useOptionalAuth();
  const currency = event.currency || "USD";
  const money = (cents: number) => formatCentsAsPrice(cents, currency);

  const [mode, setMode] = useState<SendMode>("free");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [notice, setNotice] = useState<string | null>(null);

  // Restricted people search (10-23); remounting the picker clears it when the flow restarts.
  const [pickerKey, setPickerKey] = useState(0);
  const [recipient, setRecipient] = useState<Recipient | null>(null);

  const tiers = (event.ticket_tiers ?? []) as unknown as SendTierRow[];
  const options = useMemo(() => sendOptions(tiers, mode), [tiers, mode]);
  const [optionKey, setOptionKey] = useState<string | null>(null);
  const option: SendOption | null = options.find((o) => o.key === optionKey) ?? defaultSendOption(options);
  const [qty, setQty] = useState(1);
  const [customOn, setCustomOn] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const custom = customOn ? parseCustomPrice(customInput) : null;
  const unitCents = custom?.cents ?? option?.priceCents ?? 0;

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const history = useMemo(
    () =>
      sentHistory(
        { comps: (event.promotional_tickets ?? []) as unknown as SentCompRow[], bankOrders: (event.bank_transfer_orders ?? []) as unknown as SentBankRow[] },
        mode,
      ),
    [event.promotional_tickets, event.bank_transfer_orders, mode],
  );

  function resetFlow() {
    setStep(1);
    setPickerKey((k) => k + 1);
    setRecipient(null);
    setOptionKey(null);
    setQty(1);
    setCustomOn(false);
    setCustomInput("");
    setSendError(null);
  }

  function switchMode(next: SendMode) {
    if (next === mode) return;
    setMode(next);
    setNotice(null);
    resetFlow();
  }

  function pick(r: Recipient) {
    setRecipient(r);
    setOptionKey(null);
    setQty(1);
    setStep(2);
  }

  function toggleCustom(on: boolean) {
    setCustomOn(on);
    setCustomInput(on && option ? (option.priceCents / 100).toFixed(2) : "");
  }

  async function send() {
    if (!recipient || !option) return;
    setSending(true);
    setSendError(null);
    const who = recipient.kind === "user" ? { user_id: recipient.user.id } : { recipient_email: recipient.email };
    // The API creates the tickets and only then e-mails them, so it can take a while (and the first
    // call after a dev-server restart compiles the route): wait up to a minute, not the usual 15 s.
    const post = (endpoint: string, body: Record<string, unknown>) =>
      apiClient(endpoint, { method: "POST", body: JSON.stringify(body), getToken, timeoutMs: SEND_TIMEOUT_MS });
    try {
      if (mode === "free") {
        await post("/api/organizer/promotional-tickets", { event_id: event.id, ticket_tier_id: option.tierId, quantity: qty, ...who });
      } else {
        await post("/api/organizer/bank-transfer-tickets", {
          event_id: event.id,
          ticket_tier_id: option.tierId,
          ...(option.stageId ? { stage_id: option.stageId } : {}),
          quantity: qty,
          ...who,
          ...(custom?.cents ? { unit_price_cents: custom.cents } : {}),
        });
      }
      const name = recipientName(recipient);
      setNotice(mode === "free" ? t("eventAdmin.send.sentOk", { count: qty, name }) : t("eventAdmin.send.orderOk", { name }));
      resetFlow();
      await onChanged();
    } catch (e) {
      // No answer (timeout / connection lost): the tickets may already exist. Say so and refresh
      // the history instead of inviting a second send (Kevin, 2026-10-23: sent but "something went wrong").
      if ((e as { status?: number }).status === 0) {
        setSendError(t("eventAdmin.send.unsure"));
        void onChanged();
      } else {
        setSendError(apiErrorText(e, t("errors.generic")));
      }
    } finally {
      setSending(false);
    }
  }

  const optionLabel = (o: SendOption) => (o.stageName ? `${o.tierName} · ${o.stageName}` : o.tierName);
  const customError = custom?.error ? t(`eventAdmin.send.priceErrors.${custom.error}`) : null;
  const canContinue = Boolean(option) && !(customOn && custom?.error);
  const steps = [t("eventAdmin.send.steps.find"), t("eventAdmin.send.steps.ticket"), t("eventAdmin.send.steps.confirm")];

  const recipientCard = recipient && (
    <View className="flex-row items-center gap-3 rounded-v2-md bg-v2-ink3 p-3">
      <Avatar name={recipientName(recipient)} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-v2-ui-semibold text-[14px] text-v2-cream">{recipientName(recipient)}</Text>
        <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c50">
          {recipient.kind === "user" ? recipient.user.email : t("eventAdmin.send.noAccountBadge")}
        </Text>
      </View>
      {step < 3 && (
        <Pressable onPress={() => setStep(1)} accessibilityRole="button" hitSlop={6}>
          <Text className="font-v2-ui-semibold text-[13px] text-v2-c70">{t("eventAdmin.send.change")}</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View className="gap-4">
      <View className="flex-row rounded-v2-pill bg-v2-ink2 p-1" accessibilityRole="tablist">
        {(["free", "bank"] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => switchMode(m)}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === m }}
            className={`h-9 flex-1 items-center justify-center rounded-v2-pill px-2 ${mode === m ? "bg-v2-cream" : ""}`}
          >
            <Text numberOfLines={1} className={`font-v2-ui-semibold text-[13px] ${mode === m ? "text-v2-ink" : "text-v2-c50"}`}>
              {m === "free" ? t("eventAdmin.send.modeFree") : t("eventAdmin.send.modeBank")}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text className="-mt-1 font-v2-ui text-[13px] leading-[19px] text-v2-c50">
        {mode === "free" ? t("eventAdmin.send.freeHint") : t("eventAdmin.send.bankHint")}
      </Text>

      {notice && <SuccessNote>{notice}</SuccessNote>}

      {!canEdit ? (
        <Text className="rounded-v2-card bg-v2-ink2 p-5 font-v2-ui text-[14px] text-v2-c50">{t("eventAdmin.send.readOnly")}</Text>
      ) : options.length === 0 ? (
        <Text className="rounded-v2-card bg-v2-ink2 p-5 font-v2-ui text-[14px] text-v2-c50">{t("eventAdmin.send.noTiers")}</Text>
      ) : (
        <View className="rounded-v2-card bg-v2-ink2 p-4">
          <View className="mb-5 flex-row flex-wrap gap-x-4 gap-y-2">
            {steps.map((label, i) => {
              const n = i + 1;
              const done = n < step;
              const on = n === step;
              return (
                <View key={label} className="flex-row items-center gap-2">
                  <View
                    className={`h-6 w-6 items-center justify-center rounded-full ${on ? "bg-v2-flame" : done ? "bg-[rgba(76,215,135,0.2)]" : "bg-v2-ink3"}`}
                  >
                    {done ? (
                      <Icon name="check" size={12} color={c.good} />
                    ) : (
                      <Text className="font-v2-ui-semibold text-[12px] text-v2-cream">{n}</Text>
                    )}
                  </View>
                  <Text className={`font-v2-ui text-[13px] ${on ? "text-v2-cream" : done ? "text-v2-c70" : "text-v2-c50"}`}>{label}</Text>
                </View>
              );
            })}
          </View>

          {step === 1 && (
            <View className="gap-2">
              <PeoplePicker
                key={pickerKey}
                organization={organization}
                value={null}
                onChange={(p) => {
                  if (!p) return;
                  setNotice(null);
                  pick({ kind: "user", user: p });
                }}
                noAccount={(email) => (
                  <View className="items-start gap-3 rounded-v2-md bg-v2-ink3 p-4">
                    <Text className="font-v2-ui text-[13px] leading-[19px] text-v2-c70">{t("eventAdmin.send.noAccount", { email })}</Text>
                    <Button
                      small
                      variant="primary"
                      icon="send"
                      label={mode === "free" ? t("eventAdmin.send.noAccountFree") : t("eventAdmin.send.noAccountBank")}
                      onPress={() => pick({ kind: "email", email })}
                    />
                  </View>
                )}
              />
            </View>
          )}

          {step === 2 && recipient && option && (
            <View>
              {recipientCard}
              <Text className="mb-2 mt-5 font-v2-ui text-[11px] uppercase tracking-[0.6px] text-v2-c50">{t("eventAdmin.send.ticket")}</Text>
              <View className="gap-1" accessibilityRole="radiogroup">
                {options.map((o) => {
                  const on = o.key === option.key;
                  return (
                    <Pressable
                      key={o.key}
                      onPress={() => setOptionKey(o.key)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={optionLabel(o)}
                      className={`flex-row items-center gap-3 rounded-v2-md p-3 ${on ? "border border-v2-c30 bg-v2-ink3" : "active:bg-v2-ink3"}`}
                    >
                      <View className={`h-4 w-4 items-center justify-center rounded-full border ${on ? "border-v2-flame" : "border-v2-c30"}`}>
                        {on && <View className="h-2 w-2 rounded-full bg-v2-flame" />}
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="font-v2-ui-semibold text-[14px] text-v2-cream">{optionLabel(o)}</Text>
                        <Text className="font-v2-ui text-[12.5px] text-v2-c50">
                          {mode === "free" ? t("eventAdmin.send.complimentary") : money(o.priceCents)} · {t("eventAdmin.send.left", { count: o.left })}
                        </Text>
                      </View>
                      <View className="flex-row gap-1">
                        {o.stageId && o.current && !o.soldOut && <StatusTag tone="good">{t("eventAdmin.send.current")}</StatusTag>}
                        {o.soldOut && <StatusTag tone="danger">{t("eventAdmin.tiers.soldOut")}</StatusTag>}
                        {o.hidden && <StatusTag>{t("eventAdmin.tiers.hidden")}</StatusTag>}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <View className="mt-5 flex-row items-center justify-between gap-4">
                <View className="flex-1">
                  <Text className="font-v2-ui-semibold text-[14px] text-v2-cream">{t("eventAdmin.send.quantity")}</Text>
                  <Text className="font-v2-ui text-[12.5px] text-v2-c50">{t("eventAdmin.send.quantityHint", { max: SEND_MAX_QUANTITY })}</Text>
                </View>
                <View className="flex-row items-center gap-1 rounded-v2-pill bg-v2-ink3 p-1">
                  <Pressable
                    onPress={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                    accessibilityRole="button"
                    accessibilityLabel={t("common.less")}
                    className={`h-9 w-9 items-center justify-center rounded-full ${qty <= 1 ? "opacity-30" : "active:bg-v2-ink4"}`}
                  >
                    <Text className="font-v2-ui text-[18px] text-v2-cream">−</Text>
                  </Pressable>
                  <Text accessibilityLiveRegion="polite" className="w-8 text-center font-v2-ui-bold text-[15px] text-v2-cream">{qty}</Text>
                  <Pressable
                    onPress={() => setQty((q) => Math.min(SEND_MAX_QUANTITY, q + 1))}
                    disabled={qty >= SEND_MAX_QUANTITY}
                    accessibilityRole="button"
                    accessibilityLabel={t("common.more")}
                    className={`h-9 w-9 items-center justify-center rounded-full ${qty >= SEND_MAX_QUANTITY ? "opacity-30" : "active:bg-v2-ink4"}`}
                  >
                    <Text className="font-v2-ui text-[18px] text-v2-cream">+</Text>
                  </Pressable>
                </View>
              </View>
              {qty > option.left && (
                <View className="mt-3 flex-row gap-2 rounded-v2-md bg-[rgba(255,180,67,0.1)] p-3">
                  <Icon name="alert" size={15} color={c.warn} />
                  <Text className="flex-1 font-v2-ui text-[12.5px] text-v2-warn">{t("eventAdmin.send.overCapacity", { left: option.left, count: qty })}</Text>
                </View>
              )}

              {mode === "bank" && (
                <View className="mt-5 gap-3 border-t border-v2-c10 pt-4">
                  <View className="flex-row items-center gap-3">
                    <Switch
                      value={customOn}
                      onValueChange={toggleCustom}
                      accessibilityLabel={t("eventAdmin.send.customPrice")}
                      trackColor={{ false: c.ink4, true: c.flame }}
                      thumbColor={c.cream}
                      ios_backgroundColor={c.ink4}
                    />
                    <Text className="flex-1 font-v2-ui text-[14px] text-v2-cream">{t("eventAdmin.send.customPrice")}</Text>
                  </View>
                  {customOn && (
                    <View className="gap-1">
                      <Text className="font-v2-ui text-[12.5px] text-v2-c50">{t("eventAdmin.send.pricePerTicket")}</Text>
                      <Field
                        value={customInput}
                        onChangeText={setCustomInput}
                        keyboardType="decimal-pad"
                        accessibilityLabel={t("eventAdmin.send.pricePerTicket")}
                        className="w-[180px]"
                      />
                      {customError && <ErrorText>{customError}</ErrorText>}
                    </View>
                  )}
                </View>
              )}

              <View className="mt-6 flex-row justify-end gap-2">
                <Button label={t("common.back")} variant="ghost" onPress={() => setStep(1)} />
                <Button label={t("common.continue")} variant="primary" disabled={!canContinue} onPress={() => setStep(3)} />
              </View>
            </View>
          )}

          {step === 3 && recipient && option && (
            <View>
              {recipientCard}
              <View className="mt-4 rounded-v2-md bg-v2-ink3 px-4">
                <Row label={t("eventAdmin.send.to")} value={recipientEmail(recipient)} />
                <Row label={t("eventAdmin.send.ticket")} value={`${qty} × ${optionLabel(option)}`} divider />
                <Row
                  label={mode === "free" ? t("eventAdmin.send.price") : t("eventAdmin.send.payment")}
                  value={mode === "free" ? t("eventAdmin.send.complimentary") : t("eventAdmin.send.paidByTransfer", { amount: money(unitCents * qty) })}
                  divider
                />
              </View>
              <Text className="mt-3 font-v2-ui text-[12.5px] leading-[18px] text-v2-c50">
                {recipient.kind === "user"
                  ? t("eventAdmin.send.afterAccount", { name: recipientName(recipient).split(" ")[0] ?? "" })
                  : t("eventAdmin.send.afterEmail", { email: recipient.email })}
              </Text>
              {sendError && (
                <View className="mt-3">
                  <ErrorText>{sendError}</ErrorText>
                </View>
              )}
              <View className="mt-5 flex-row flex-wrap justify-end gap-2">
                <Button label={t("common.back")} variant="ghost" onPress={() => setStep(2)} disabled={sending} />
                <Button
                  icon="send"
                  variant="primary"
                  onPress={send}
                  disabled={sending}
                  label={
                    sending
                      ? t("eventAdmin.send.sending")
                      : mode === "free"
                        ? t("eventAdmin.send.submitFree", { count: qty })
                        : t("eventAdmin.send.submitBank")
                  }
                />
              </View>
            </View>
          )}
        </View>
      )}

      <View>
        <Text className="mb-2 font-v2-ui-semibold text-[15px] text-v2-cream">
          {t("eventAdmin.send.sent")} <Text className="font-v2-ui text-[13px] text-v2-c50">{history.length}</Text>
        </Text>
        {history.length === 0 ? (
          <Text className="rounded-v2-card bg-v2-ink2 px-4 py-10 text-center font-v2-ui text-[14px] text-v2-c50">{t("eventAdmin.send.sentNone")}</Text>
        ) : (
          <View className="overflow-hidden rounded-v2-card bg-v2-ink2">
            {history.map((h, i) => (
              <View key={h.id} className={`flex-row items-start justify-between gap-3 px-4 py-3 ${i > 0 ? "border-t border-v2-c10" : ""}`}>
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="font-v2-ui-semibold text-[14px] text-v2-cream">{h.name}</Text>
                  {h.name !== h.email && <Text numberOfLines={1} className="font-v2-ui text-[12.5px] text-v2-c50">{h.email}</Text>}
                </View>
                <View className="items-end">
                  <Text className="font-v2-ui text-[13px] text-v2-cream">
                    {h.quantity} × {h.stageName ? `${h.tierName} · ${h.stageName}` : h.tierName}
                  </Text>
                  <Text className="font-v2-ui text-[12px] text-v2-c50">
                    {h.amountCents === null ? t("eventAdmin.send.complimentary") : money(h.amountCents)} ·{" "}
                    {formatEventDateTime(h.createdAt, event.timezone, locale).date}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <View className="h-9 w-9 items-center justify-center rounded-full bg-v2-ink4">
      <Text className="font-v2-ui-semibold text-[12px] text-v2-cream">{initialsOf(name)}</Text>
    </View>
  );
}

function Row({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return (
    <View className={`flex-row justify-between gap-4 py-3 ${divider ? "border-t border-v2-c10" : ""}`}>
      <Text className="font-v2-ui text-[14px] text-v2-c50">{label}</Text>
      <Text numberOfLines={2} className="flex-1 text-right font-v2-ui-semibold text-[14px] text-v2-cream">{value}</Text>
    </View>
  );
}
