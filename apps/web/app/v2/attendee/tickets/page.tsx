import type { Metadata } from "next";
import { AttendeeShell } from "../AttendeeShell";
import WalletView from "./WalletView";

/**
 * My tickets (fase 2.3), served at /account by the middleware rewrite (decision 2026-10-27:
 * same public URLs). Signed-in only (the middleware protects /account and /v2).
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My tickets · Flame", robots: { index: false, follow: false } };

export default function TicketsPage() {
  return (
    <AttendeeShell active="tickets">
      <WalletView />
    </AttendeeShell>
  );
}
