import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import SupportQueueView from "./SupportQueueView";

/**
 * /v2/support/organizations — organizer approvals for Flame support, 2.0 style (same admin API as
 * the v1 section on /profile; the API decides who is support, this page only renders).
 */
export const dynamic = "force-dynamic";

export default async function SupportQueuePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/v2/support/organizations");
  return <SupportQueueView />;
}
