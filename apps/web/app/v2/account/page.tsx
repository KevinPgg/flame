import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { loadMe } from "../lib/organizer-context";
import AccountView from "./AccountView";

/**
 * /v2/account — the signed-in person's own settings (account, language, sign out). Kept apart
 * from organization settings (decision 2026-10-20). Phase 2 folds it into the attendee profile.
 */
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/v2/account");
  return <AccountView me={await loadMe()} />;
}
