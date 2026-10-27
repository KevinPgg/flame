import { resolveLanguage, translate } from "@project-flame/lib";
import { supabaseAdmin } from "./supabase/server";
import { sendPushNotification } from "./push-notifications";

/**
 * Tell an organization's owner the answer to their organizer request (2026-10-27): in-app
 * notification + push, in the owner's language. Approval already sends an e-mail; rejection
 * only reaches them this way (with the reason, when support wrote one).
 * Never throws: the approve / reject already happened.
 */
export async function notifyOrganizationReview(input: {
  ownerUserId: string | null | undefined;
  organizationId: string;
  organizationName: string;
  decision: "approved" | "rejected";
  reason?: string | null;
}): Promise<void> {
  const { ownerUserId, organizationId, organizationName, decision, reason } = input;
  if (!ownerUserId || !supabaseAdmin) return;
  try {
    const { data } = await supabaseAdmin.from("users").select("language").eq("id", ownerUserId).maybeSingle();
    const lang = resolveLanguage((data as { language?: string } | null)?.language);
    const approved = decision === "approved";
    const title = translate(lang, approved ? "pushes.organizationApproved.title" : "pushes.organizationRejected.title");
    const body = approved
      ? translate(lang, "pushes.organizationApproved.body", { name: organizationName })
      : reason
        ? translate(lang, "pushes.organizationRejected.bodyReason", { name: organizationName, reason })
        : translate(lang, "pushes.organizationRejected.body", { name: organizationName });
    await sendPushNotification({
      userId: ownerUserId,
      type: approved ? "organization_approved" : "organization_rejected",
      title,
      body,
      data: { orgId: organizationId },
    });
  } catch (err) {
    console.error("[org-review] notification failed", { organizationId, decision, error: err });
  }
}
