"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  canAccessOrgSettings,
  DEFAULT_CONNECT_COUNTRY,
  STRIPE_CONNECT_COUNTRIES,
  balanceRows,
  connectState,
  formatCentsAsPrice,
  payoutMinimumCents,
  payoutTone,
  type BalanceRow,
  type OrgMemberRole,
  type StripeMoney,
} from "@project-flame/lib";
import { useStripeConnectStatus } from "../../../lib/hooks/useStripeConnectStatus";
import { useI18n } from "../../../lib/i18n";
import { Icon } from "../../components/Icon";
import { StatusTag } from "../../components/StatusTag";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ErrorBox } from "../../components/ErrorBox";
import { Skeleton } from "../../components/Skeleton";
import { routes } from "../../lib/routes";
import { OrganizerShell, type ShellUser } from "../OrganizerShell";
import { useOrganizerModel, type Org } from "../useOrganizerModel";

type Payout = { id: string; amount: number; currency: string; status: string; arrival_date: number | null; created: number; automatic: boolean };
type Summary =
  | { connected: false }
  | {
      connected: true;
      defaultCurrency: string;
      schedule: string | null;
      balance: { available: StripeMoney[]; pending: StripeMoney[] };
      payouts: Payout[];
      bank: { bankName: string | null; last4: string | null; currency: string | null } | null;
    };

const primary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-v2-pill bg-v2-cream px-5 text-[14px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper disabled:opacity-50";
const ghost =
  "inline-flex h-10 items-center justify-center gap-2 rounded-v2-pill bg-v2-ink3 px-4 text-[13.5px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4 disabled:opacity-50";
const card = "rounded-v2-card bg-v2-ink2 p-4 sm:p-5";

const money = (cents: number, currency: string) => formatCentsAsPrice(cents, currency);

/**
 * Payouts v2 (prototype "ow:payouts"): the organization's real Stripe balance right here —
 * available / available soon, request a payout (accounts use a manual payout schedule), history,
 * bank on file, and a way into Stripe. Before that: connect or finish the Stripe setup (same
 * onboarding API as v1).
 */
export default function PayoutsView({
  organization,
  organizations,
  role,
  me = null,
  justConnected = false,
  openUrl = (url: string) => window.location.assign(url),
}: {
  organization: Org;
  organizations: Org[];
  role: OrgMemberRole | null;
  me?: ShellUser | null;
  justConnected?: boolean;
  /** Where Stripe links open (tests replace it). */
  openUrl?: (url: string) => void;
}) {
  const { t } = useI18n();
  const { model } = useOrganizerModel(organization, role);
  const status = useStripeConnectStatus(organization.id);
  const state = status.data ? connectState(status.data) : null;
  const [opening, setOpening] = useState(false);
  const [onboardError, setOnboardError] = useState(false);

  const openStripe = async (country?: string) => {
    setOpening(true);
    setOnboardError(false);
    try {
      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: organization.id, ...(country ? { country } : {}) }),
      });
      const json = (await res.json().catch(() => null)) as { url?: string } | null;
      if (!res.ok || !json?.url) throw new Error(String(res.status));
      openUrl(json.url);
    } catch {
      setOnboardError(true);
      setOpening(false);
    }
  };

  let body: React.ReactNode;
  if (status.isLoading) body = <Skeleton className="h-40 rounded-v2-card" />;
  else if (status.isError || !state) body = <ErrorBox onRetry={() => void status.refetch()} />;
  else if (state === "not_connected")
    body = <ConnectCard orgName={organization.name} opening={opening} error={onboardError} onConnect={(c) => void openStripe(c)} />;
  else if (state === "incomplete")
    body = (
      <IncompleteCard
        orgName={organization.name}
        charges={Boolean(status.data?.chargesEnabled)}
        payouts={Boolean(status.data?.payoutsEnabled)}
        opening={opening}
        error={onboardError}
        onFinish={() => void openStripe()}
      />
    );
  else body = <Balance organization={organization} opening={opening} onboardError={onboardError} onManage={() => void openStripe()} />;

  return (
    <OrganizerShell
      organization={organization}
      organizations={organizations}
      role={role}
      pending={model?.pending ?? 0}
      currentEvents={model?.current ?? []}
      pastEvents={model?.past ?? []}
      section="payouts"
      title={t("payouts.title")}
      backHref={canAccessOrgSettings(role) ? routes.manage(organization.slug) : routes.dashboard(organization.slug)}
      crumbs={[
        { label: organization.name, href: routes.dashboard(organization.slug) },
        ...(canAccessOrgSettings(role) ? [{ label: t("manage.title"), href: routes.manage(organization.slug) }] : []),
        { label: t("payouts.title") },
      ]}
      me={me}
    >
      <section className="mx-auto max-w-[880px] px-4 pt-5 lg:px-10 lg:pt-8">
        <p className="mb-5 text-[14px] text-v2-c70">{t("payouts.lede", { org: organization.name })}</p>
        {justConnected && (
          <p role="status" className="mb-4 flex items-center gap-2 rounded-v2-card bg-v2-good/10 px-4 py-3 text-[13.5px] text-v2-good">
            <Icon name="check" size={16} strokeWidth={2.4} />
            {t("payouts.connectedNotice")}
          </p>
        )}
        {body}
      </section>
    </OrganizerShell>
  );
}

function ConnectCard({ orgName, opening, error, onConnect }: { orgName: string; opening: boolean; error: boolean; onConnect: (country: string) => void }) {
  const { t } = useI18n();
  const [country, setCountry] = useState<string>(DEFAULT_CONNECT_COUNTRY);
  return (
    <div className={`${card} flex flex-col gap-4`}>
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-v2-md bg-v2-ink3 text-v2-c70">
          <Icon name="bank" size={20} />
        </span>
        <div>
          <h2 className="text-[17px] font-v2-ui-semibold">{t("payouts.connectTitle")}</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-v2-c70">{t("payouts.connectLede", { org: orgName })}</p>
        </div>
      </div>
      <div>
        <label htmlFor="po-country" className="mb-1.5 block text-[12.5px] text-v2-c70">
          {t("payouts.country")}
        </label>
        <select
          id="po-country"
          value={country}
          disabled={opening}
          onChange={(e) => setCountry(e.target.value)}
          className="h-11 w-full max-w-[360px] rounded-v2-md bg-v2-ink3 px-4 text-[14px] text-v2-cream focus:outline-none focus:ring-1 focus:ring-v2-c30"
        >
          {STRIPE_CONNECT_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[12.5px] text-v2-c50">{t("payouts.countryHint")}</p>
      </div>
      <div>
        <button type="button" onClick={() => onConnect(country)} disabled={opening} className={primary}>
          {opening ? t("payouts.opening") : t("payouts.connect")}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-v2-errorText">
          {t("payouts.onboardError")}
        </p>
      )}
    </div>
  );
}

function IncompleteCard({
  orgName,
  charges,
  payouts,
  opening,
  error,
  onFinish,
}: {
  orgName: string;
  charges: boolean;
  payouts: boolean;
  opening: boolean;
  error: boolean;
  onFinish: () => void;
}) {
  const { t } = useI18n();
  const item = (ok: boolean, label: string) => (
    <li className={`flex items-center gap-2 text-[14px] ${ok ? "text-v2-good" : "text-v2-warn"}`}>
      <Icon name={ok ? "check" : "alert"} size={16} strokeWidth={ok ? 2.4 : 1.8} />
      <span className="text-v2-c90">{label}</span>
    </li>
  );
  return (
    <div className={`${card} flex flex-col gap-4`}>
      <div>
        <h2 className="text-[17px] font-v2-ui-semibold">{t("payouts.incompleteTitle")}</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-v2-c70">{t("payouts.incompleteLede", { org: orgName })}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {item(charges, t("payouts.charges"))}
        {item(payouts, t("payouts.payoutsEnabled"))}
      </ul>
      <div>
        <button type="button" onClick={onFinish} disabled={opening} className={primary}>
          {opening ? t("payouts.opening") : t("payouts.finish")}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-v2-errorText">
          {t("payouts.onboardError")}
        </p>
      )}
    </div>
  );
}

function Balance({
  organization,
  opening,
  onboardError,
  onManage,
}: {
  organization: Org;
  opening: boolean;
  onboardError: boolean;
  onManage: () => void;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const key = ["payouts-summary", organization.id];
  const summary = useQuery<Summary>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/organizer/payouts/summary?organizationId=${encodeURIComponent(organization.id)}`);
      if (!res.ok) throw new Error(`summary ${res.status}`);
      return res.json();
    },
  });
  const [confirm, setConfirm] = useState<{ row: BalanceRow; idempotencyKey: string } | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  if (summary.isLoading) return <Skeleton className="h-48 rounded-v2-card" />;
  if (summary.isError || !summary.data)
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[13.5px] text-v2-c70">{t("payouts.loadError")}</p>
        <ErrorBox onRetry={() => void summary.refetch()} />
      </div>
    );
  if (!summary.data.connected) return <ErrorBox onRetry={() => void summary.refetch()} />;

  const data = summary.data;
  const rows = balanceRows(data.balance, data.defaultCurrency);
  const bankLabel = data.bank ? [data.bank.bankName, data.bank.last4 ? `•• ${data.bank.last4}` : null].filter(Boolean).join(" ") : null;
  const date = (unix: number | null) =>
    unix ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(unix * 1000)) : "—";

  const request = async () => {
    if (!confirm) return;
    setRequesting(true);
    setRequestError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/organizer/payouts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: organization.id,
          currency: confirm.row.currency,
          clientIdempotencyKey: confirm.idempotencyKey,
        }),
      });
      const json = (await res.json().catch(() => null)) as { payout?: { amount: number; currency: string }; error?: string } | null;
      if (res.status === 409) {
        setRequestError(t("payouts.inProgress"));
      } else if (!res.ok || !json?.payout) {
        // 400s carry a specific reason (minimum, no funds); the rest get the generic message.
        setRequestError(res.status === 400 && json?.error ? json.error : t("payouts.requestError"));
      } else {
        setNotice(t("payouts.requested", { amount: money(json.payout.amount, json.payout.currency) }));
      }
    } catch {
      setRequestError(t("payouts.requestError"));
    } finally {
      setRequesting(false);
      setConfirm(null);
      await queryClient.invalidateQueries({ queryKey: key });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <p role="status" className="flex items-center gap-2 rounded-v2-card bg-v2-good/10 px-4 py-3 text-[13.5px] text-v2-good">
          <Icon name="check" size={16} strokeWidth={2.4} />
          {notice}
        </p>
      )}
      {requestError && (
        <p role="alert" className="rounded-v2-card bg-v2-ink2 px-4 py-3 text-[13.5px] text-v2-errorText">
          {requestError}
        </p>
      )}

      {rows.map((row) => (
        <div key={row.currency} className="grid gap-3 sm:grid-cols-2" data-testid={`balance-${row.currency}`}>
          <div className={`${card} flex flex-col gap-2 ring-1 ring-v2-flame`}>
            <span className="text-[12.5px] font-v2-ui-semibold text-v2-c50">
              {t("payouts.available")}
              {rows.length > 1 ? ` · ${row.currency}` : ""}
            </span>
            <b className="font-v2-display-bold text-[28px] tabular-nums tracking-[-0.02em]">{money(row.available, row.currency)}</b>
            {row.available < 0 ? (
              <small className="text-[12px] text-v2-c50">{t("payouts.negative")}</small>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!row.canPayout || requesting}
                  onClick={() => {
                    setRequestError(null);
                    setConfirm({ row, idempotencyKey: newKey() });
                  }}
                  className={`${primary} mt-1 w-full`}
                >
                  {requesting && confirm?.row.currency === row.currency ? t("payouts.requesting") : t("payouts.request")}
                </button>
                {!row.canPayout && (
                  <small className="text-[12px] text-v2-c50">
                    {t("payouts.belowMinimum", { min: money(payoutMinimumCents(row.currency), row.currency) })}
                  </small>
                )}
              </>
            )}
          </div>
          <div className={`${card} flex flex-col gap-2`}>
            <span className="text-[12.5px] font-v2-ui-semibold text-v2-c50">
              {t("payouts.soon")}
              {rows.length > 1 ? ` · ${row.currency}` : ""}
            </span>
            <b className="font-v2-display-bold text-[28px] tabular-nums tracking-[-0.02em]">{money(row.pending, row.currency)}</b>
            <small className="flex items-center gap-1.5 text-[12px] text-v2-c50">
              <Icon name="clock" size={13} />
              {t("payouts.soonNote")}
            </small>
          </div>
        </div>
      ))}

      <div>
        <h3 className="mb-2 text-[12px] font-v2-ui-semibold uppercase tracking-[0.06em] text-v2-c50">{t("payouts.history")}</h3>
        {data.payouts.length === 0 ? (
          <p className="rounded-v2-card bg-v2-ink2 px-4 py-8 text-center text-[14px] text-v2-c50">{t("payouts.historyEmpty")}</p>
        ) : (
          <ul className="divide-y divide-v2-c06 overflow-hidden rounded-v2-card bg-v2-ink2">
            {data.payouts.map((p) => {
              const tone = payoutTone(p.status);
              const pill =
                tone === "good"
                  ? "bg-v2-good/15 text-v2-good"
                  : tone === "warn"
                    ? "bg-v2-warn/15 text-v2-warn"
                    : tone === "bad"
                      ? "bg-v2-flame/30 text-v2-errorText"
                      : "bg-v2-ink3 text-v2-c70";
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <b className="block text-[14px] font-v2-ui-semibold">
                      {p.status === "paid" ? t("payouts.arrived", { date: date(p.arrival_date) }) : t("payouts.arrives", { date: date(p.arrival_date) })}
                      {p.automatic && <small className="ml-2 text-[12px] font-v2-ui text-v2-c50">{t("payouts.automatic")}</small>}
                    </b>
                    <span className="sm:flex-1" />
                    <span className={`rounded-v2-pill px-2.5 py-0.5 text-[12px] ${pill}`}>
                    {isPayoutStatus(p.status) ? t(`payouts.statuses.${p.status}`) : p.status}
                    </span>
                  </span>
                  <b className="shrink-0 text-right text-[14px] tabular-nums sm:w-[110px]">{money(p.amount, p.currency)}</b>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={`${card} flex flex-col gap-3 sm:flex-row sm:items-center`}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-v2-md bg-[#635BFF] font-v2-ui-bold text-[15px] text-white">S</span>
          <span className="min-w-0 flex-1">
            <b className="block text-[14px] font-v2-ui-semibold">{t("payouts.bankTitle")}</b>
            <small className="block text-[13px] text-v2-c50">
              {bankLabel ?? t("payouts.bankNone")} · {t("payouts.viaStripe")}
            </small>
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <StatusTag tone="good">{t("payouts.connected")}</StatusTag>
          <button type="button" onClick={onManage} disabled={opening} className={ghost}>
            {opening ? t("payouts.opening") : t("payouts.manage")}
          </button>
        </div>
        {onboardError && (
          <p role="alert" className="w-full text-[13px] text-v2-errorText">
            {t("payouts.onboardError")}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        message={confirm ? t("payouts.confirmTitle", { amount: money(confirm.row.available, confirm.row.currency) }) : ""}
        detail={confirm ? t("payouts.confirmDetail", { currency: confirm.row.currency, bank: bankLabel ?? t("payouts.yourBank") }) : ""}
        confirmLabel={t("payouts.request")}
        busy={requesting}
        onConfirm={() => void request()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

const PAYOUT_STATUSES = ["paid", "pending", "in_transit", "canceled", "failed"] as const;
const isPayoutStatus = (s: string): s is (typeof PAYOUT_STATUSES)[number] => (PAYOUT_STATUSES as readonly string[]).includes(s);

/** One idempotency key per confirmation: a double click or retry can't create two payouts. */
function newKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}
