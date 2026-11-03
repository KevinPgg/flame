"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  balanceRows,
  formatCentsAsPrice,
  formatEventDateTime,
  organizationFinance,
  type FinanceEvent,
  type OrgMemberRole,
  type StripeMoney,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { ErrorBox } from "../../components/ErrorBox";
import { Skeleton } from "../../components/Skeleton";
import { routes } from "../../lib/routes";
import { OrganizerShell, type ShellUser } from "../OrganizerShell";
import { useOrganizerModel, type Org } from "../useOrganizerModel";

type PayoutSummary =
  | { connected: false }
  | { connected: true; defaultCurrency?: string; balance?: { available?: StripeMoney[]; pending?: StripeMoney[] } };

/**
 * Finance v2 (prototype "ow:finance", 2026-11-02): every event of the organization added up —
 * total revenue, tickets sold, tickets via promoters, what's ready to withdraw (Stripe, same
 * query as Payouts) — and a table by event (row → the event's Breakdown tab). Read only; the
 * numbers come from /api/organizer/data (same rule as Breakdown, see lib organizationFinance).
 */
export default function FinanceView({
  organization,
  organizations,
  role,
  me = null,
}: {
  organization: Org;
  organizations: Org[];
  role: OrgMemberRole | null;
  me?: ShellUser | null;
}) {
  const { t, locale } = useI18n();
  const { model, loading, failed, refetch } = useOrganizerModel(organization, role);
  const finance = useMemo(() => (model ? organizationFinance(model.owned as unknown as FinanceEvent[]) : null), [model]);

  const payouts = useQuery<PayoutSummary>({
    queryKey: ["payouts-summary", organization.id],
    queryFn: async () => {
      const res = await fetch(`/api/organizer/payouts/summary?organizationId=${encodeURIComponent(organization.id)}`);
      if (!res.ok) throw new Error(`summary ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });
  const ready = (() => {
    const p = payouts.data;
    if (!p) return payouts.isError ? { value: "—", sub: "" } : null;
    if (!p.connected) return { value: "—", sub: t("finance.notConnected") };
    const row = balanceRows(p.balance, p.defaultCurrency ?? "USD")[0];
    return { value: formatCentsAsPrice(Math.max(0, row?.available ?? 0), row?.currency ?? "USD"), sub: t("finance.seePayouts") };
  })();

  let body;
  if (failed) body = <ErrorBox message={t("finance.loadError")} onRetry={() => void refetch()} />;
  else if (loading || !finance) body = <Skeleton className="h-48 rounded-v2-card" />;
  else {
    const [main, ...others] = finance.revenue;
    body = (
      <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label={t("finance.revenue")}
            value={formatCentsAsPrice(main.cents, main.currency)}
            sub={[t("finance.events", { count: finance.events }), ...others.map((o) => formatCentsAsPrice(o.cents, o.currency))].join(" · ")}
          />
          <Stat label={t("finance.sold")} value={finance.sold.toLocaleString(locale)} />
          <Stat label={t("finance.viaPromoters")} value={finance.viaPromoters.toLocaleString(locale)} sub={t("finance.viaPromotersSub", { count: finance.viaPromoters })} />
          <Link href={routes.payouts(organization.slug)} className="rounded-v2-card bg-v2-ink2 p-4 transition-colors hover:bg-v2-ink3 sm:p-5">
            <small className="block text-[12.5px] text-v2-c50">{t("finance.ready")}</small>
            {ready ? (
              <>
                <b className="mt-1 block font-v2-display-bold text-[24px] tracking-[-0.02em] tabular-nums">{ready.value}</b>
                {ready.sub ? <small className="mt-0.5 block text-[12.5px] text-v2-c70 underline-offset-2 hover:underline">{ready.sub}</small> : null}
              </>
            ) : (
              <span aria-hidden className="mt-2 block h-7 w-24 animate-pulse rounded bg-v2-ink3" />
            )}
          </Link>
        </div>

        <h2 className="mb-2 mt-7 text-[13px] font-v2-ui-semibold uppercase tracking-[0.06em] text-v2-c50">{t("finance.byEvent")}</h2>
        {finance.rows.length === 0 ? (
          <p className="rounded-v2-card bg-v2-ink2 p-5 text-[14px] text-v2-c50">{t("finance.none")}</p>
        ) : (
          <div className="overflow-hidden rounded-v2-card bg-v2-ink2">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-[12px] text-v2-c50">
                  <th className="px-4 py-3 font-v2-ui-semibold">{t("finance.event")}</th>
                  <th className="px-4 py-3 text-right font-v2-ui-semibold">{t("finance.soldCol")}</th>
                  <th className="px-4 py-3 text-right font-v2-ui-semibold">{t("finance.revenueCol")}</th>
                </tr>
              </thead>
              <tbody>
                {finance.rows.map((r) => (
                  <tr key={r.id} className="border-t border-white/[0.06]">
                    <td className="px-4 py-3">
                      <Link href={routes.event(r.id, organization.slug, "breakdown")} className="block hover:underline">
                        <b className="block font-v2-ui-semibold">{r.name}</b>
                        <small className="text-[12.5px] text-v2-c50">{formatEventDateTime(r.starts_at, r.timezone, locale).date}</small>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.sold.toLocaleString(locale)}</td>
                    <td className="px-4 py-3 text-right font-v2-ui-semibold tabular-nums">{formatCentsAsPrice(r.revenueCents, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[12.5px] leading-relaxed text-v2-c50">{t("finance.note")}</p>
      </>
    );
  }

  return (
    <OrganizerShell
      organization={organization}
      organizations={organizations}
      role={role}
      pending={model?.pending ?? 0}
      currentEvents={model?.current ?? []}
      pastEvents={model?.past ?? []}
      section="finance"
      title={t("finance.title")}
      backHref={routes.manage(organization.slug)}
      crumbs={[
        { label: t("organizer.myOrganizers"), href: routes.organizers() },
        { label: organization.name, href: routes.dashboard(organization.slug) },
        { label: t("manage.title"), href: routes.manage(organization.slug) },
        { label: t("finance.title") },
      ]}
      me={me}
    >
      <section className="mx-auto max-w-[960px] px-4 pb-10 pt-5 lg:px-10 lg:pt-8">
        <p className="mb-5 text-[15px] leading-relaxed text-v2-c70">{t("finance.lede", { org: organization.name })}</p>
        {body}
      </section>
    </OrganizerShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-v2-card bg-v2-ink2 p-4 sm:p-5">
      <small className="block text-[12.5px] text-v2-c50">{label}</small>
      <b className="mt-1 block font-v2-display-bold text-[24px] tracking-[-0.02em] tabular-nums">{value}</b>
      {sub ? <small className="mt-0.5 block text-[12.5px] text-v2-c50">{sub}</small> : null}
    </div>
  );
}
