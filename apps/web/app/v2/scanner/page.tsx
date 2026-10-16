import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import ScannerApp from "./ScannerApp";

/**
 * /v2/scanner[?event=<id>] — door scanner for any signed-in person who may scan (members of the
 * organizer or a co-host, people designated for an event, platform admins). Not tied to one
 * organization: door staff don't need to be members.
 */
export const dynamic = "force-dynamic";

export default async function ScannerPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/v2/scanner");
  return <ScannerApp />;
}
