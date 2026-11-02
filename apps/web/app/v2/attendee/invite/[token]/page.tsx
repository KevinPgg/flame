import type { Metadata } from "next";
import { AttendeeShell } from "../../AttendeeShell";
import InviteView from "./InviteView";

/**
 * Team invitation link from the e-mail (fase 4.5), served at /invite/<token> by the middleware
 * rewrite. Public; answering needs the invited account.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team invitation · Flame", robots: { index: false, follow: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AttendeeShell active={null}>
      <InviteView token={token} />
    </AttendeeShell>
  );
}
