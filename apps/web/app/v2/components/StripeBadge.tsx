"use client";

import Link from "next/link";
import { useStripeConnectStatus } from "../../lib/hooks/useStripeConnectStatus";
import { useI18n } from "../../lib/i18n";
import { routes } from "../lib/routes";
import { Icon } from "./Icon";
import { Skeleton } from "./Skeleton";

/**
 * Stripe Connect state of the organization (dashboard hero pill, sidebar line).
 * Hidden on error, like v1, instead of showing a misleading state.
 */
export function StripeBadge({ orgId, slug, plain }: { orgId: string; slug: string; /** Sidebar: text line, no pill. */ plain?: boolean }) {
  const { t } = useI18n();
  const { data, isLoading } = useStripeConnectStatus(orgId);
  if (isLoading) return plain ? null : <Skeleton className="h-6 w-28 !rounded-v2-pill" />;
  if (!data) return null; // same as v1: hide on error instead of a misleading state
  const ok = data.connected && data.chargesEnabled && data.payoutsEnabled;
  if (plain) {
    return ok ? (
      <span className="flex items-center gap-1.5 px-1.5 text-[12px] text-v2-good">
        <Icon name="check" size={13} strokeWidth={2.6} />
        {t("organizer.stripeConnected")}
      </span>
    ) : (
      <Link href={routes.payouts(slug)} className="flex items-center gap-1.5 px-1.5 text-[12px] text-v2-warn hover:underline">
        <Icon name="alert" size={13} />
        {t("organizer.stripeIncomplete")}
      </Link>
    );
  }
  return ok ? (
    <span className="inline-flex items-center gap-1.5 rounded-v2-pill bg-v2-good/15 px-2.5 py-1 text-[12px] text-v2-good">
      <Icon name="check" size={13} strokeWidth={2.4} />
      {t("organizer.stripeConnected")}
    </span>
  ) : (
    <Link
      href={routes.payouts(slug)}
      className="inline-flex items-center gap-1.5 rounded-v2-pill bg-v2-warn/15 px-2.5 py-1 text-[12px] text-v2-warn hover:bg-v2-warn/25"
    >
      <Icon name="alert" size={13} />
      {t("organizer.stripeIncomplete")}
    </Link>
  );
}
