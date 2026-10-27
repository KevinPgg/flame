import type { Metadata } from "next";
import TicketView from "./TicketView";

/**
 * QR ticket (fase 2.3), served at /account/ticket/[id] by the middleware rewrite. Full screen
 * like the prototype (no attendee bars). Signed-in only.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ticket · Flame", robots: { index: false, follow: false } };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TicketView id={id} />;
}
