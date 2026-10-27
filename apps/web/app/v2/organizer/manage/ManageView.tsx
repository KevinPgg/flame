"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { balanceRows, formatCentsAsPrice, type OrgMemberRole, type StripeMoney } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { Icon, type IconName } from "../../components/Icon";
import { routes } from "../../lib/routes";
import { OrganizerShell, type ShellUser } from "../OrganizerShell";
import { useOrganizerModel, type Org } from "../useOrganizerModel";

type PayoutSummary =
  | { connected: false }
  | { connected: true; defaultCurrency?: string; balance?: { available?: StripeMoney[]; pending?: StripeMoney[] } };

/**
 * "Manage organization" — the prototype's hub (OW_SCREENS.manage), same as the app's ManageHub:
 * everything about running the organization that isn't a specific event. Every org-level tool
 * added later is a new row here, never a new menu entry (decision 2026-10-23). Owner / admin.
 * Finance and Communications from the prototype don't exist yet (fase 4) and aren't shown.
 */
export default function ManageView({
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
  const { t } = useI18n();
  const { model } = useOrganizerModel(organization, role);

  // Same cache keys as the Team and Payouts screens.
  const members = useQuery<{ members: unknown[] }>({
    queryKey: ["team-members", organization.id],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${organization.id}/members`);
      if (!res.ok) throw new Error(`members ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });
  const payouts = useQuery<PayoutSummary>({
    queryKey: ["payouts-summary", organization.id],
    queryFn: async () => {
      const res = await fetch(`/api/organizer/payouts/summary?organizationId=${encodeURIComponent(organization.id)}`);
      if (!res.ok) throw new Error(`summary ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const payoutLine = (() => {
    const p = payouts.data;
    if (!p) return payouts.isError ? "" : null;
    if (!p.connected) return t("manage.connectStripe");
    const row = balanceRows(p.balance, p.defaultCurrency ?? "USD")[0];
    return t("manage.available", { amount: formatCentsAsPrice(Math.max(0, row?.available ?? 0), row?.currency ?? "USD") });
  })();
  const membersLine = members.data ? t("manage.members", { count: members.data.members.length }) : members.isError ? "" : null;

  const rows: Array<{ key: string; icon: IconName; title: string; sub: string | null; href: string }> = [
    { key: "team", icon: "users", title: t("manage.team"), sub: membersLine, href: routes.team(organization.slug) },
    { key: "payouts", icon: "bank", title: t("manage.payouts"), sub: payoutLine, href: routes.payouts(organization.slug) },
    { key: "settings", icon: "settings", title: t("manage.settings"), sub: t("manage.settingsSub"), href: routes.settings(organization.slug) },
  ];

  return (
    <OrganizerShell
      organization={organization}
      organizations={organizations}
      role={role}
      pending={model?.pending ?? 0}
      currentEvents={model?.current ?? []}
      pastEvents={model?.past ?? []}
      section="manage"
      title={t("manage.title")}
      backHref={routes.dashboard(organization.slug)}
      crumbs={[
        { label: t("organizer.myOrganizers"), href: routes.organizers() },
        { label: organization.name, href: routes.dashboard(organization.slug) },
        { label: t("manage.title") },
      ]}
      me={me}
    >
      <section className="mx-auto max-w-[720px] px-4 pt-5 lg:px-10 lg:pt-8">
        <p className="mb-5 text-[15px] leading-relaxed text-v2-c70">{t("manage.lede", { org: organization.name })}</p>
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li key={r.key}>
              <Link
                href={r.href}
                className="flex items-center gap-3 rounded-[20px] border border-white/[0.08] bg-white/[0.04] px-4 py-3.5 transition-colors hover:bg-white/[0.08]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-v2-md bg-v2-ink3 text-v2-c90">
                  <Icon name={r.icon} size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[15px] font-v2-ui-semibold">{r.title}</b>
                  {r.sub === null ? (
                    <span aria-hidden className="mt-1 block h-3 w-28 animate-pulse rounded bg-v2-ink3" />
                  ) : r.sub ? (
                    <small className="block truncate text-[13px] text-v2-c50">{r.sub}</small>
                  ) : null}
                </span>
                <Icon name="chev" size={16} className="text-v2-c50" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </OrganizerShell>
  );
}
