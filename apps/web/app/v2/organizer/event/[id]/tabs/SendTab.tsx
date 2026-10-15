"use client";

import { useMemo, useState } from "react";
import {
  SEND_MAX_QUANTITY,
  defaultSendOption,
  formatCentsAsPrice,
  formatEventDateTime,
  initialsOf,
  isLikelyEmail,
  normalizeEmail,
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
import type { Event as OrganizerEvent } from "../../../../../lib/hooks/useOrganizerData";
import { useI18n } from "../../../../../lib/i18n";
import { Icon } from "../../../../components/Icon";
import { apiErrorMessage } from "../../../../lib/api-error";

interface FoundUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

/** Who receives the tickets: a Flame account, or just an email (no account — PDF by email). */
type Recipient = { kind: "user"; user: FoundUser } | { kind: "email"; email: string };

const recipientName = (r: Recipient) => (r.kind === "user" ? personName(r.user) : r.email);
const recipientEmail = (r: Recipient) => (r.kind === "user" ? r.user.email : r.email);

/**
 * Send tickets (prototype "ow:event:send"): free tickets or bank-transfer orders in three steps —
 * find person → ticket & quantity → confirm — with the "Sent" history beside it.
 * Same endpoints and rules as v1; v1 extras the prototype lacks are kept (send to an email with
 * no Flame account, tier stage, custom price on bank orders).
 */
export default function SendTab({
  event,
  canEdit,
  onChanged,
}: {
  event: OrganizerEvent;
  canEdit: boolean;
  onChanged: () => Promise<unknown> | void;
}) {
  const { t, locale } = useI18n();
  const currency = event.currency || "USD";
  const money = (c: number) => formatCentsAsPrice(c, currency);

  const [mode, setMode] = useState<SendMode>("free");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [notice, setNotice] = useState<string | null>(null);

  // Step 1
  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<FoundUser[] | null>(null);
  const [searchedEmail, setSearchedEmail] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<Recipient | null>(null);

  // Step 2
  const tiers = (event.ticket_tiers ?? []) as unknown as SendTierRow[];
  const options = useMemo(() => sendOptions(tiers, mode), [tiers, mode]);
  const [optionKey, setOptionKey] = useState<string | null>(null);
  const option: SendOption | null = options.find((o) => o.key === optionKey) ?? defaultSendOption(options);
  const [qty, setQty] = useState(1);
  const [customOn, setCustomOn] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const custom = customOn ? parseCustomPrice(customInput) : null;
  const unitCents = custom?.cents ?? option?.priceCents ?? 0;

  // Step 3
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const history = useMemo(
    () =>
      sentHistory(
        {
          comps: (event.promotional_tickets ?? []) as SentCompRow[],
          bankOrders: (event.bank_transfer_orders ?? []) as SentBankRow[],
        },
        mode
      ),
    [event.promotional_tickets, event.bank_transfer_orders, mode]
  );

  function resetFlow() {
    setStep(1);
    setEmail("");
    setResults(null);
    setSearchedEmail("");
    setSearchError(null);
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

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setResults(null);
    if (!isLikelyEmail(email)) return setSearchError(t("eventAdmin.send.invalidEmail"));
    const term = normalizeEmail(email);
    setSearchError(null);
    setSearching(true);
    try {
      const res = await fetch(`/api/organizer/search-users?email=${encodeURIComponent(term)}`);
      if (!res.ok) throw new Error(await apiErrorMessage(res, t("errors.generic")));
      const json = (await res.json()) as { users?: FoundUser[] };
      setResults(Array.isArray(json.users) ? json.users : []);
      setSearchedEmail(term);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setSearching(false);
    }
  }

  function pick(r: Recipient) {
    setRecipient(r);
    setOptionKey(null);
    setQty(1);
    setStep(2);
  }

  function toggleCustom(on: boolean) {
    setCustomOn(on);
    // Pre-fill with the selected price so the organizer edits from a sensible value.
    setCustomInput(on && option ? (option.priceCents / 100).toFixed(2) : "");
  }

  async function send() {
    if (!recipient || !option) return;
    setSending(true);
    setSendError(null);
    const who = recipient.kind === "user" ? { user_id: recipient.user.id } : { recipient_email: recipient.email };
    try {
      const res =
        mode === "free"
          ? await fetch("/api/organizer/promotional-tickets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event_id: event.id, ticket_tier_id: option.tierId, quantity: qty, ...who }),
            })
          : await fetch("/api/organizer/bank-transfer-tickets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                event_id: event.id,
                ticket_tier_id: option.tierId,
                ...(option.stageId ? { stage_id: option.stageId } : {}),
                quantity: qty,
                ...who,
                ...(custom?.cents ? { unit_price_cents: custom.cents } : {}),
              }),
            });
      if (!res.ok) throw new Error(await apiErrorMessage(res, t("errors.generic")));
      const name = recipientName(recipient);
      setNotice(
        mode === "free"
          ? t("eventAdmin.send.sentOk", { count: qty, name })
          : t("eventAdmin.send.orderOk", { name })
      );
      resetFlow();
      await onChanged();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setSending(false);
    }
  }

  const field =
    "h-11 w-full rounded-v2-md bg-v2-ink3 px-4 text-[14px] placeholder:text-v2-c50 focus:outline-none focus:ring-1 focus:ring-v2-c30";
  const primary =
    "inline-flex h-11 items-center justify-center gap-2 rounded-v2-pill bg-v2-cream px-5 text-[14px] font-v2-ui-semibold text-v2-ink disabled:opacity-50";
  const ghost = "inline-flex h-11 items-center justify-center rounded-v2-pill px-5 text-[14px] font-v2-ui-semibold text-v2-c70 hover:bg-v2-ink3 hover:text-v2-cream";

  const optionLabel = (o: SendOption) => (o.stageName ? `${o.tierName} · ${o.stageName}` : o.tierName);
  const customError = custom?.error ? t(`eventAdmin.send.priceErrors.${custom.error}`) : null;
  const canContinue = Boolean(option) && !(customOn && custom?.error);

  const steps = [t("eventAdmin.send.steps.find"), t("eventAdmin.send.steps.ticket"), t("eventAdmin.send.steps.confirm")];

  const recipientCard = recipient && (
    <div className="flex items-center gap-3 rounded-v2-md bg-v2-ink3 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-v2-ink4 text-[12px] font-v2-ui-semibold">
        {initialsOf(recipientName(recipient))}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[14px] font-v2-ui-semibold">{recipientName(recipient)}</b>
        <small className="block truncate text-[12.5px] text-v2-c50">
          {recipient.kind === "user" ? recipient.user.email : t("eventAdmin.send.noAccountBadge")}
        </small>
      </span>
      {step < 3 && (
        <button type="button" onClick={() => setStep(1)} className="text-[13px] font-v2-ui-semibold text-v2-c70 hover:text-v2-cream">
          {t("eventAdmin.send.change")}
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Mode */}
      <div className="inline-flex w-full max-w-[460px] rounded-v2-pill bg-v2-ink2 p-1" role="tablist">
        {(["free", "bank"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={`h-9 flex-1 whitespace-nowrap rounded-v2-pill px-3 text-[13px] font-v2-ui-semibold transition-colors ${
              mode === m ? "bg-v2-cream text-v2-ink" : "text-v2-c50 hover:text-v2-c90"
            }`}
          >
            {m === "free" ? t("eventAdmin.send.modeFree") : t("eventAdmin.send.modeBank")}
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" className="flex items-center gap-2 rounded-v2-card bg-v2-good/15 px-4 py-3 text-[14px] text-v2-good">
          <Icon name="check" size={16} strokeWidth={2.4} />
          {notice}
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[1.25fr_1fr]">
        {/* ---------- Flow ---------- */}
        {!canEdit ? (
          <p className="rounded-v2-card bg-v2-ink2 p-5 text-[14px] text-v2-c50">{t("eventAdmin.send.readOnly")}</p>
        ) : options.length === 0 ? (
          <p className="rounded-v2-card bg-v2-ink2 p-5 text-[14px] text-v2-c50">{t("eventAdmin.send.noTiers")}</p>
        ) : (
          <div className="rounded-v2-card bg-v2-ink2 p-4 sm:p-5">
            <ol className="mb-5 flex flex-wrap gap-x-5 gap-y-2">
              {steps.map((label, i) => {
                const n = i + 1;
                const done = n < step;
                const on = n === step;
                return (
                  <li key={label} className={`flex items-center gap-2 text-[13px] ${on ? "text-v2-cream" : done ? "text-v2-c70" : "text-v2-c50"}`}>
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-v2-ui-semibold ${
                        on ? "bg-v2-flame text-white" : done ? "bg-v2-good/20 text-v2-good" : "bg-v2-ink3"
                      }`}
                    >
                      {done ? <Icon name="check" size={12} strokeWidth={3} /> : n}
                    </span>
                    {label}
                  </li>
                );
              })}
            </ol>

            {step === 1 && (
              <>
                <form onSubmit={search} className="flex gap-2" noValidate>
                  <label className="relative flex-1">
                    <span className="sr-only">{t("eventAdmin.send.emailLabel")}</span>
                    <Icon name="search" size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-v2-c50" />
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t("eventAdmin.send.emailPlaceholder")}
                      className={`${field} pl-10`}
                    />
                  </label>
                  <button type="submit" disabled={searching || !email.trim()} className={primary}>
                    {searching ? t("eventAdmin.send.searching") : t("common.search")}
                  </button>
                </form>
                <p className="mt-2 text-[12.5px] text-v2-c50">{t("eventAdmin.send.emailHint")}</p>
                {searchError && <p className="mt-2 text-[13px] text-v2-errorText">{searchError}</p>}

                {results && results.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1">
                    {results.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => pick({ kind: "user", user: u })}
                        className="flex items-center gap-3 rounded-v2-md p-3 text-left hover:bg-v2-ink3"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-v2-ink4 text-[12px] font-v2-ui-semibold">
                          {initialsOf(personName(u))}
                        </span>
                        <span className="min-w-0 flex-1">
                          <b className="block truncate text-[14px] font-v2-ui-semibold">{personName(u)}</b>
                          <small className="block truncate text-[12.5px] text-v2-c50">{u.email}</small>
                        </span>
                        <Icon name="chev" size={16} className="text-v2-c50" />
                      </button>
                    ))}
                  </div>
                )}

                {results && results.length === 0 && searchedEmail && (
                  <div className="mt-3 rounded-v2-md bg-v2-ink3 p-4">
                    <p className="text-[13px] leading-relaxed text-v2-c70">{t("eventAdmin.send.noAccount", { email: searchedEmail })}</p>
                    <button
                      type="button"
                      onClick={() => pick({ kind: "email", email: searchedEmail })}
                      className="mt-3 inline-flex h-9 items-center gap-2 rounded-v2-pill bg-v2-cream px-4 text-[13px] font-v2-ui-semibold text-v2-ink"
                    >
                      <Icon name="send" size={14} />
                      {mode === "free" ? t("eventAdmin.send.noAccountFree") : t("eventAdmin.send.noAccountBank")}
                    </button>
                  </div>
                )}
              </>
            )}

            {step === 2 && recipient && option && (
              <>
                {recipientCard}
                <div className="mb-2 mt-5 text-[11px] uppercase tracking-[0.06em] text-v2-c50">{t("eventAdmin.send.ticket")}</div>
                <div className="flex flex-col gap-1" role="radiogroup" aria-label={t("eventAdmin.send.ticket")}>
                  {options.map((o) => {
                    const on = o.key === option.key;
                    return (
                      <button
                        key={o.key}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        // Like v1: a custom price already typed is kept when the tier changes.
                        onClick={() => setOptionKey(o.key)}
                        className={`flex items-center gap-3 rounded-v2-md p-3 text-left transition-colors ${
                          on ? "bg-v2-ink3 ring-1 ring-v2-c30" : "hover:bg-v2-ink3"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            on ? "border-v2-flame" : "border-v2-c30"
                          }`}
                        >
                          {on && <span className="h-2 w-2 rounded-full bg-v2-flame" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <b className="block truncate text-[14px] font-v2-ui-semibold">{optionLabel(o)}</b>
                          <small className="block text-[12.5px] text-v2-c50">
                            {mode === "free" ? t("eventAdmin.send.complimentary") : money(o.priceCents)} ·{" "}
                            {t("eventAdmin.send.left", { count: o.left })}
                          </small>
                        </span>
                        <span className="flex shrink-0 gap-1">
                          {o.stageId && o.current && !o.soldOut && (
                            <span className="rounded-v2-pill bg-v2-good/15 px-2 py-0.5 text-[11px] font-v2-ui-semibold text-v2-good">
                              {t("eventAdmin.send.current")}
                            </span>
                          )}
                          {o.soldOut && (
                            <span className="rounded-v2-pill bg-v2-ink4 px-2 py-0.5 text-[11px] font-v2-ui-semibold text-v2-c70">
                              {t("eventAdmin.tiers.soldOut")}
                            </span>
                          )}
                          {o.hidden && (
                            <span className="rounded-v2-pill bg-v2-ink4 px-2 py-0.5 text-[11px] font-v2-ui-semibold text-v2-c70">
                              {t("eventAdmin.tiers.hidden")}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 flex items-center justify-between gap-4">
                  <div>
                    <b className="block text-[14px] font-v2-ui-semibold">{t("eventAdmin.send.quantity")}</b>
                    <small className="text-[12.5px] text-v2-c50">{t("eventAdmin.send.quantityHint", { max: SEND_MAX_QUANTITY })}</small>
                  </div>
                  <div className="flex items-center gap-1 rounded-v2-pill bg-v2-ink3 p-1">
                    <button
                      type="button"
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      disabled={qty <= 1}
                      aria-label={t("common.less")}
                      className="h-9 w-9 rounded-full text-[18px] hover:bg-v2-ink4 disabled:opacity-30"
                    >
                      −
                    </button>
                    <b className="w-8 text-center text-[15px] tabular-nums" aria-live="polite">
                      {qty}
                    </b>
                    <button
                      type="button"
                      onClick={() => setQty((q) => Math.min(SEND_MAX_QUANTITY, q + 1))}
                      disabled={qty >= SEND_MAX_QUANTITY}
                      aria-label={t("common.more")}
                      className="h-9 w-9 rounded-full text-[18px] hover:bg-v2-ink4 disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                </div>
                {qty > option.left && (
                  <p className="mt-3 flex gap-2 rounded-v2-md bg-v2-warn/10 p-3 text-[12.5px] text-v2-warn">
                    <Icon name="alert" size={15} className="mt-px shrink-0" />
                    {t("eventAdmin.send.overCapacity", { left: option.left, count: qty })}
                  </p>
                )}

                {mode === "bank" && (
                  <div className="mt-5 border-t border-v2-c10 pt-4">
                    <label className="flex cursor-pointer select-none items-center gap-2 text-[14px]">
                      <input
                        type="checkbox"
                        checked={customOn}
                        onChange={(e) => toggleCustom(e.target.checked)}
                        className="h-4 w-4 accent-[#880517]"
                      />
                      {t("eventAdmin.send.customPrice")}
                    </label>
                    {customOn && (
                      <label className="mt-3 flex flex-col gap-1">
                        <span className="text-[12.5px] text-v2-c50">{t("eventAdmin.send.pricePerTicket")}</span>
                        <input
                          inputMode="decimal"
                          value={customInput}
                          onChange={(e) => setCustomInput(e.target.value)}
                          className={`${field} max-w-[180px] tabular-nums`}
                          aria-invalid={Boolean(customError)}
                        />
                        {customError && <span className="text-[12.5px] text-v2-errorText">{customError}</span>}
                      </label>
                    )}
                  </div>
                )}

                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" onClick={() => setStep(1)} className={ghost}>
                    {t("common.back")}
                  </button>
                  <button type="button" disabled={!canContinue} onClick={() => setStep(3)} className={primary}>
                    {t("common.continue")}
                  </button>
                </div>
              </>
            )}

            {step === 3 && recipient && option && (
              <>
                {recipientCard}
                <dl className="mt-4 divide-y divide-v2-c10 rounded-v2-md bg-v2-ink3 px-4 text-[14px]">
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-v2-c50">{t("eventAdmin.send.to")}</dt>
                    <dd className="truncate text-right font-v2-ui-semibold">{recipientEmail(recipient)}</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-v2-c50">{t("eventAdmin.send.ticket")}</dt>
                    <dd className="text-right font-v2-ui-semibold">
                      {qty} × {optionLabel(option)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-v2-c50">{mode === "free" ? t("eventAdmin.send.price") : t("eventAdmin.send.payment")}</dt>
                    <dd className="text-right font-v2-ui-semibold tabular-nums">
                      {mode === "free"
                        ? t("eventAdmin.send.complimentary")
                        : t("eventAdmin.send.paidByTransfer", { amount: money(unitCents * qty) })}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-[12.5px] leading-relaxed text-v2-c50">
                  {recipient.kind === "user"
                    ? t("eventAdmin.send.afterAccount", { name: recipientName(recipient).split(" ")[0] ?? "" })
                    : t("eventAdmin.send.afterEmail", { email: recipient.email })}
                </p>
                {sendError && <p className="mt-3 text-[13px] text-v2-errorText">{sendError}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => setStep(2)} disabled={sending} className={ghost}>
                    {t("common.back")}
                  </button>
                  <button type="button" onClick={send} disabled={sending} className={primary}>
                    <Icon name="send" size={15} />
                    {sending
                      ? t("eventAdmin.send.sending")
                      : mode === "free"
                        ? t("eventAdmin.send.submitFree", { count: qty })
                        : t("eventAdmin.send.submitBank")}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ---------- Sent ---------- */}
        <div>
          <h3 className="mb-2 flex items-baseline gap-2 font-v2-ui-semibold text-[15px]">
            {t("eventAdmin.send.sent")}
            <span className="text-[13px] text-v2-c50 tabular-nums">{history.length}</span>
          </h3>
          {history.length === 0 ? (
            <p className="rounded-v2-card bg-v2-ink2 px-4 py-10 text-center text-[14px] text-v2-c50">{t("eventAdmin.send.sentNone")}</p>
          ) : (
            <ul className="max-h-[560px] divide-y divide-v2-c10 overflow-y-auto rounded-v2-card bg-v2-ink2">
              {history.map((h) => {
                const when = formatEventDateTime(h.createdAt, event.timezone, locale);
                return (
                  <li key={h.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <b className="block truncate text-[14px] font-v2-ui-semibold">{h.name}</b>
                      {h.name !== h.email && <small className="block truncate text-[12.5px] text-v2-c50">{h.email}</small>}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="block text-[13px]">
                        {h.quantity} × {h.stageName ? `${h.tierName} · ${h.stageName}` : h.tierName}
                      </span>
                      <small className="block text-[12px] text-v2-c50 tabular-nums">
                        {h.amountCents === null ? t("eventAdmin.send.complimentary") : money(h.amountCents)} · {when.date}
                      </small>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
