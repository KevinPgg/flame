"use client";

import Link from "next/link";
import {
  IoCheckmarkCircleOutline,
  IoTimeOutline,
  IoChevronForward,
} from "react-icons/io5";
import { useStripeConnectStatus } from "../../lib/hooks/useStripeConnectStatus";
import { Skeleton } from "../ui/Skeleton";

interface StripeStatusPillProps {
  orgId: string;
  orgSlug?: string;
}

export function StripeStatusPill({ orgId, orgSlug }: StripeStatusPillProps) {
  const { data: status, isLoading } = useStripeConnectStatus(orgId);

  if (isLoading) {
    return <Skeleton className="h-6 w-[120px] rounded-pill" />;
  }

  // Fetch settled but no data (error or unauthenticated) — hide rather than
  // show a perpetual skeleton or misleading "Not Connected" state.
  if (!status) return null;

  const isFullyConnected =
    status.connected && status.chargesEnabled && status.payoutsEnabled;

  if (isFullyConnected) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-xs font-poppins-medium bg-[rgba(34,197,94,0.15)]">
        <IoCheckmarkCircleOutline size={14} className="text-green-400" />
        <span className="text-green-400">Stripe Connected</span>
      </span>
    );
  }

  const orgParam = orgSlug || orgId;
  return (
    <Link
      href={`/organizer/settings?org=${encodeURIComponent(orgParam)}&tab=payouts`}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-xs font-poppins-medium hover:opacity-90 transition-opacity bg-[rgba(234,179,8,0.15)]"
    >
      <IoTimeOutline size={14} className="text-yellow-400" />
      <span className="text-yellow-400">Stripe Not Connected</span>
      <IoChevronForward size={12} className="text-yellow-400" />
    </Link>
  );
}
