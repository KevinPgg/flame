"use client";

/**
 * Flame 2.0 RSVP sheet, web (fase 3.4, prototype `ACTS.rsvp`): the event, "Request to join",
 * the organizer's questions ONE BLOCK PER GUEST ("Guest 2 of 3"), the number of guests, the
 * promoter (✓ from the link or a field), when it's charged, and "Send request". Guest 1's answers
 * go at the top level of registration_data (as always) and the others in `_guests` (Kevin's
 * "compatible" choice; the server validates each guest). Paid RSVPs then go to the existing card
 * authorization step (RsvpPaymentModal), free ones are sent right away — same logic as before.
 */
import { useEffect, useState } from "react";
import { formatCentsAsPrice, walletDayTime, RSVP_GUESTS_KEY } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";
import { Icon } from "../../../components/Icon";

type CodeStatus = "idle" | "validating" | "valid" | "invalid" | "error";
export type RsvpField = { id: string; label: string; type: string; required?: boolean; placeholder?: string };
type Answers = Record<string, string | boolean>;

export type RsvpSheetProps = {
  open: boolean;
  onClose: () => void;
  event: { name: string; image_url: string | null; starts_at: string; timezone: string | null; venue: string | null; currency: string; organizer: string };
  tier: { name: string; unitCents: number; stageName?: string | null };
  quantity: number;
  maxQuantity: number;
  onQuantity: (n: number) => void;
  fields: RsvpField[];
  accessCode: string | null;
  promoter: { input: string; status: CodeStatus; onInput: (v: string) => void; onValidate: (v: string) => void; onClear: () => void };
  busy: boolean;
  error: string | null;
  /** answers: null when the tier asks nothing; else guest 1 at the top + `_guests`. */
  onSend: (answers: Record<string, unknown> | null) => void;
};

const field = "h-12 w-full min-w-0 rounded-[14px] border border-v2-c16 bg-[#1d1d1d] px-4 text-[14.5px] text-v2-cream outline-none placeholder:text-v2-c50 focus:border-v2-c30";
const ghost = "inline-flex h-12 shrink-0 items-center justify-center rounded-v2-pill bg-v2-ink3 px-4 text-[14px] font-v2-ui-semibold hover:bg-v2-ink4 disabled:opacity-50";
const okChip = "flex h-12 items-center gap-2 rounded-[14px] border border-v2-good/30 bg-v2-good/10 px-4 text-[14px] font-v2-ui-semibold text-v2-good";

const empty = (f: RsvpField, v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (f.type === "checkbox" && !v);

/** Guest 1 at the top level (as always), guests 2..N in `_guests`. */
export function rsvpAnswersPayload(perGuest: Answers[]): Record<string, unknown> {
  const [first, ...rest] = perGuest;
  return rest.length ? { ...(first ?? {}), [RSVP_GUESTS_KEY]: rest } : { ...(first ?? {}) };
}

export function RsvpSheet(p: RsvpSheetProps) {
  const { t, locale } = useI18n();
  const [answers, setAnswers] = useState<Answers[]>([{}]);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  // One block per guest; keep what was typed when the number changes.
  useEffect(() => {
    setAnswers((prev) => Array.from({ length: Math.max(1, p.quantity) }, (_, i) => prev[i] ?? {}));
  }, [p.quantity]);

  useEffect(() => {
    if (!p.open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.open, p.onClose]);

  if (!p.open) return null;

  const isFree = p.tier.unitCents === 0;
  const when = walletDayTime(p.event.starts_at, p.event.timezone, locale);
  const money = (c: number) => formatCentsAsPrice(c, p.event.currency);
  const set = (gi: number, id: string, v: string | boolean) => {
    setAnswers((prev) => prev.map((a, i) => (i === gi ? { ...a, [id]: v } : a)));
    setErrors((e) => ({ ...e, [`${gi}:${id}`]: false }));
  };

  const send = () => {
    if (p.fields.length === 0) return p.onSend(null);
    const next: Record<string, boolean> = {};
    answers.forEach((a, gi) => p.fields.forEach((f) => f.required && empty(f, a[f.id]) && (next[`${gi}:${f.id}`] = true)));
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    p.onSend(rsvpAnswersPayload(answers));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" role="presentation">
      <button type="button" aria-label={t("common.close")} onClick={p.onClose} className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]" />
      <div role="dialog" aria-modal="true" aria-label={t("rsvpSheet.title")} className="relative w-full max-w-[480px] rounded-t-[24px] bg-[#141414] text-v2-cream shadow-[0_-20px_60px_rgba(0,0,0,0.6)] md:rounded-[24px]">
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-v2-c30 md:hidden" />
        <div className="max-h-[78dvh] overflow-y-auto px-5 pb-4 pt-4">
          <div className="flex items-center gap-3">
            <span className="block h-14 w-14 shrink-0 overflow-hidden rounded-[10px] bg-v2-ink3">
              {p.event.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote flyer
                <img src={p.event.image_url} alt="" className="h-full w-full object-cover" />
              ) : null}
            </span>
            <span className="min-w-0">
              <b className="block truncate text-[16px] font-v2-ui-semibold">{p.event.name}</b>
              <small className="block truncate text-[13px] text-v2-c70">{[`${when.day} · ${when.time}`, p.event.venue].filter(Boolean).join(" · ")}</small>
            </span>
          </div>

          <h2 className="mt-4 font-v2-display-bold text-[22px] tracking-[-0.02em]">{t("rsvpSheet.title")}</h2>
          <p className="mt-1 text-[14px] text-v2-c70">{t("rsvpSheet.lead", { org: p.event.organizer })}</p>

          {p.fields.length > 0 && (
            <div className="mt-4 flex flex-col gap-4" data-testid="rsvp-questions">
              <p className="text-[12.5px] text-v2-c50">{t("rsvpSheet.questions", { org: p.event.organizer })}</p>
              {answers.map((a, gi) => (
                <fieldset key={gi} className="flex flex-col gap-3 rounded-[16px] border border-v2-c10 p-3.5">
                  {answers.length > 1 && <legend className="px-1 text-[12px] font-v2-ui-semibold uppercase tracking-[0.06em] text-v2-c50">{t("rsvpSheet.guest", { i: gi + 1, n: answers.length })}</legend>}
                  {p.fields.map((f) => {
                    const id = `rsvp-${gi}-${f.id}`;
                    const bad = errors[`${gi}:${f.id}`];
                    const label = `${f.label}${f.required ? "" : ` (${t("rsvpSheet.optional")})`}`;
                    if (f.type === "checkbox") {
                      return (
                        <label key={f.id} htmlFor={id} className="flex items-center gap-3 text-[14px]">
                          <input id={id} type="checkbox" checked={!!a[f.id]} onChange={(e) => set(gi, f.id, e.target.checked)} className="h-5 w-5 accent-white" />
                          <span>{label}</span>
                          {bad && <small className="ml-auto text-[12px] text-v2-errorText">{t("rsvpSheet.required")}</small>}
                        </label>
                      );
                    }
                    return (
                      <div key={f.id} className="flex flex-col gap-1.5">
                        <label htmlFor={id} className="text-[13px] text-v2-c70">
                          {label}
                        </label>
                        <input
                          id={id}
                          type={f.type === "email" ? "email" : f.type === "date" ? "date" : "text"}
                          inputMode={f.type === "number" ? "numeric" : undefined}
                          value={String(a[f.id] ?? "")}
                          onChange={(e) => set(gi, f.id, e.target.value)}
                          placeholder={f.placeholder || ""}
                          aria-invalid={bad || undefined}
                          className={`${field} ${bad ? "border-v2-errorText/60" : ""}`}
                          autoComplete="off"
                        />
                        {bad && <small className="text-[12px] text-v2-errorText">{t("rsvpSheet.required")}</small>}
                      </div>
                    );
                  })}
                </fieldset>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3 rounded-[16px] bg-[#1d1d1d] p-4">
            <span className="min-w-0">
              <b className="block text-[15px] font-v2-ui-semibold">{t("rsvpSheet.guests")}</b>
              <small className="block text-[13px] text-v2-c70">
                {[p.tier.name, p.tier.stageName].filter(Boolean).join(" · ")} · {t("rsvpSheet.guestsHint", { n: p.maxQuantity })}
              </small>
            </span>
            <span className="flex shrink-0 items-center gap-1 rounded-v2-pill bg-v2-ink3 p-1">
              <button type="button" aria-label={t("checkout.decrease")} disabled={p.quantity <= 1} onClick={() => p.onQuantity(Math.max(1, p.quantity - 1))} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[20px] hover:bg-v2-ink4 disabled:opacity-30">
                −
              </button>
              <span aria-live="polite" className="min-w-[24px] text-center text-[16px] font-v2-ui-semibold">
                {p.quantity}
              </span>
              <button type="button" aria-label={t("checkout.increase")} disabled={p.quantity >= p.maxQuantity} onClick={() => p.onQuantity(Math.min(p.maxQuantity, p.quantity + 1))} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[20px] hover:bg-v2-ink4 disabled:opacity-30">
                +
              </button>
            </span>
          </div>

          {p.accessCode && (
            <p className={`${okChip} mt-3`}>
              <Icon name="check" size={16} />
              {t("checkout.accessApplied", { code: p.accessCode })}
            </p>
          )}

          <div className="mt-3">
            {p.promoter.status === "valid" ? (
              <p className={okChip}>
                <Icon name="check" size={16} />
                <span className="flex-1">{t("checkout.promoterApplied", { code: p.promoter.input.trim().toUpperCase() })}</span>
                <button type="button" onClick={p.promoter.onClear} aria-label={`${t("checkout.remove")} ${p.promoter.input}`} className="text-v2-good hover:opacity-70">
                  <Icon name="close" size={16} />
                </button>
              </p>
            ) : (
              <>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (p.promoter.input.trim()) p.promoter.onValidate(p.promoter.input);
                  }}
                >
                  <input value={p.promoter.input} onChange={(e) => p.promoter.onInput(e.target.value)} placeholder={t("checkout.promoterCode")} aria-label={t("checkout.promoterCode")} className={`${field} uppercase placeholder:normal-case`} autoComplete="off" />
                  <button type="submit" disabled={!p.promoter.input.trim() || p.promoter.status === "validating"} className={ghost}>
                    {p.promoter.status === "validating" ? "…" : t("checkout.add")}
                  </button>
                </form>
                {p.promoter.status === "invalid" && p.promoter.input.trim() && <p className="mt-1.5 text-[12.5px] text-v2-errorText">{t("checkout.promoterInvalid")}</p>}
                {p.promoter.status === "error" && p.promoter.input.trim() && (
                  <p role="alert" className="mt-1.5 text-[12.5px] text-v2-c70">
                    {t("checkout.promoterCheckFailed")} ·{" "}
                    <button type="button" onClick={() => p.promoter.onValidate(p.promoter.input)} className="font-v2-ui-semibold text-v2-cream underline">
                      {t("checkout.retry")}
                    </button>
                  </p>
                )}
              </>
            )}
          </div>

          <p className="mt-3 text-[12.5px] text-v2-c50">{isFree ? t("rsvpSheet.free") : `${t("rsvpSheet.notChargedNow")} ${t("checkout.discountAtPayment")}`}</p>
          {p.error && <p className="mt-3 rounded-[12px] bg-v2-errorText/10 px-3 py-2 text-[13px] text-v2-errorText">{p.error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-v2-c10 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
          <span className="min-w-0">
            <small className="block truncate text-[12.5px] text-v2-c50">{t("tickets.beforeFees", { quantity: p.quantity, tier: p.tier.name })}</small>
            <b className="block font-v2-display-bold text-[22px]">{isFree ? t("common.free") : money(p.tier.unitCents * p.quantity)}</b>
          </span>
          <button
            type="button"
            onClick={send}
            disabled={p.busy || p.promoter.status === "validating"}
            className="inline-flex h-12 shrink-0 items-center rounded-v2-pill bg-v2-cream px-7 text-[15px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper disabled:opacity-60"
          >
            {p.busy || p.promoter.status === "validating" ? "…" : t("rsvpSheet.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
