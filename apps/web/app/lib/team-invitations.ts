/**
 * Team invitations (fase 4.5, decisions of Kevin 2026-11-02): any e-mail, app + e-mail, 7 days.
 * Shared by /api/organizations/[id]/invitations, /api/me/invitations and /api/invitations/[token].
 * Notifications are best effort: the invitation exists and shows in the app even if the e-mail
 * (Brevo) or the push fails.
 */
import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { invitationExpiry, invitationState, resolveLanguage, translate, type InvitationRow, type InviteRole } from "@project-flame/lib";
import { sendPushNotification } from "./push-notifications";
import { getBaseUrl } from "./utils/url";
import { emailCtaButton, emailInfoCard, emailSignoff, emailText, escapeHtml, wrapEmailHtml, c } from "./email/email-styles";

export type Invitation = InvitationRow & { token: string; invited_by: string | null };

export const newInvitationToken = () => randomBytes(24).toString("base64url");

/** Owner / admin of the organization, or a reason. */
export async function requireOrgAdmin(db: SupabaseClient, orgId: string, clerkUserId: string) {
  const { data: me } = await db.from("users").select("id, first_name, last_name, email").eq("clerk_id", clerkUserId).maybeSingle();
  if (!me) return { error: "User not found", status: 404 } as const;
  const { data: m } = await db.from("organization_members").select("role").eq("user_id", me.id).eq("organization_id", orgId).maybeSingle();
  if (!m || (m.role !== "owner" && m.role !== "admin")) return { error: "Forbidden", status: 403 } as const;
  return { me: me as { id: string; first_name: string | null; last_name: string | null; email: string | null } } as const;
}

/** The signed-in person (id + e-mail) for answering invitations. */
export async function currentUser(db: SupabaseClient, clerkUserId: string) {
  const { data } = await db.from("users").select("id, email, language").eq("clerk_id", clerkUserId).maybeSingle();
  return (data as { id: string; email: string | null; language?: string | null } | null) ?? null;
}

const sameEmail = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
export { sameEmail };

/**
 * Accept: becomes a member with the invited role (if already a member, nothing changes there)
 * and the invitation is closed. Returns the organization id.
 */
export async function acceptInvitation(db: SupabaseClient, inv: Invitation, userId: string): Promise<{ ok: true } | { error: string; status: number }> {
  const state = invitationState(inv);
  if (state === "expired") return { error: "This invitation has expired. Ask for a new one.", status: 410 };
  if (state !== "pending") return { error: "This invitation was already answered or cancelled.", status: 409 };
  const { data: existing } = await db.from("organization_members").select("id").eq("organization_id", inv.organization_id).eq("user_id", userId).maybeSingle();
  if (!existing) {
    const { error } = await db.from("organization_members").insert({ organization_id: inv.organization_id, user_id: userId, role: inv.role });
    if (error) throw error;
  }
  const { error: upd } = await db
    .from("organization_invitations")
    .update({ status: "accepted", accepted_user_id: userId, responded_at: new Date().toISOString() })
    .eq("id", inv.id)
    .eq("status", "pending");
  if (upd) throw upd;
  return { ok: true };
}

export async function declineInvitation(db: SupabaseClient, inv: Invitation): Promise<{ ok: true } | { error: string; status: number }> {
  if (invitationState(inv) !== "pending") return { error: "This invitation was already answered, cancelled or expired.", status: 409 };
  const { error } = await db.from("organization_invitations").update({ status: "declined", responded_at: new Date().toISOString() }).eq("id", inv.id).eq("status", "pending");
  if (error) throw error;
  return { ok: true };
}

/** Create, or refresh the open one (re-send keeps the same link and gives it 7 new days). */
export async function upsertInvitation(
  db: SupabaseClient,
  input: { orgId: string; email: string; role: InviteRole; invitedBy: string }
): Promise<{ invitation: Invitation; resent: boolean }> {
  const { data: open } = await db
    .from("organization_invitations")
    .select("*")
    .eq("organization_id", input.orgId)
    .eq("email", input.email)
    .eq("status", "pending")
    .maybeSingle();
  if (open) {
    const { data, error } = await db
      .from("organization_invitations")
      .update({ role: input.role, expires_at: invitationExpiry(), invited_by: input.invitedBy })
      .eq("id", (open as Invitation).id)
      .select("*")
      .single();
    if (error) throw error;
    return { invitation: { ...(open as Invitation), ...(data as Invitation) }, resent: true };
  }
  const row = {
    organization_id: input.orgId,
    email: input.email,
    role: input.role,
    token: newInvitationToken(),
    status: "pending",
    invited_by: input.invitedBy,
    expires_at: invitationExpiry(),
  };
  const { data, error } = await db.from("organization_invitations").insert(row).select("*").single();
  if (error) throw error;
  return { invitation: { created_at: new Date().toISOString(), ...row, ...(data as object) } as Invitation, resent: false };
}

/** E-mail + (if the person already has an account) bell / push. Never throws. */
export async function notifyInvitation(
  db: SupabaseClient,
  inv: Invitation,
  ctx: { orgName: string; inviterName: string }
): Promise<{ email: boolean; inApp: boolean }> {
  const result = { email: false, inApp: false };
  try {
    const { data: user } = await db.from("users").select("id, language").eq("email", inv.email).maybeSingle();
    if (user) {
      const lang = resolveLanguage((user as { language?: string }).language);
      const role = translate(lang, `organizer.roles.${inv.role}`);
      result.inApp = await sendPushNotification({
        userId: (user as { id: string }).id,
        type: "team_invitation",
        title: translate(lang, "pushes.teamInvitation.title"),
        body: translate(lang, "pushes.teamInvitation.body", { org: ctx.orgName, role }),
        data: { orgId: inv.organization_id, invitationId: inv.id },
      });
    }
  } catch (e) {
    console.error("[team-invitations] in-app notification failed", e);
  }
  result.email = await sendInvitationEmail(inv, ctx);
  return result;
}

export function invitationLink(token: string) {
  return `${getBaseUrl()}/invite/${encodeURIComponent(token)}`;
}

async function sendInvitationEmail(inv: Invitation, ctx: { orgName: string; inviterName: string }): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn("BREVO_API_KEY not found. Invitation e-mail not sent (the invitation still shows in the app).");
    return false;
  }
  try {
    const { BrevoClient } = await import("@getbrevo/brevo");
    const client = new BrevoClient({ apiKey });
    await client.transactionalEmails.sendTransacEmail({
      to: [{ email: inv.email }],
      sender: { email: process.env.FROM_EMAIL || "noreply@flme.co", name: "FLAME Events" },
      subject: `${ctx.orgName} invited you to its team on Flame`,
      htmlContent: invitationEmailHtml(inv, ctx),
    });
    return true;
  } catch (e) {
    console.error("[team-invitations] e-mail failed", e);
    return false;
  }
}

export function invitationEmailHtml(inv: Pick<Invitation, "token" | "role" | "expires_at" | "email">, ctx: { orgName: string; inviterName: string }) {
  const org = escapeHtml(ctx.orgName);
  const who = escapeHtml(ctx.inviterName || "Someone");
  const role = inv.role === "admin" ? "Admin" : "Organizer";
  const body = `
    ${emailText(`${who} invited you to join <strong>${org}</strong> on FLAME Events as <strong>${role}</strong>.`)}
    ${emailInfoCard({
      title: ctx.orgName,
      rows: [
        { label: "Role", value: role, valueBold: true },
        { label: "Expires", value: new Date(inv.expires_at).toUTCString().slice(0, 16) },
      ],
      accentColor: c.green,
    })}
    ${emailText(`Open the invitation to accept it. If you don't have a Flame account yet, create one with <strong>${escapeHtml(inv.email)}</strong>.`)}
    ${emailCtaButton(invitationLink(inv.token), "Open invitation")}
    ${emailText("If you weren't expecting this, you can ignore this e-mail.")}
    ${emailSignoff()}
  `;
  return wrapEmailHtml({
    title: `Invitation to ${ctx.orgName}`,
    preheader: `${ctx.inviterName || "Someone"} invited you to ${ctx.orgName} on Flame`,
    bodyHtml: body,
    footerContext: `You received this e-mail because someone at ${ctx.orgName} invited ${inv.email}`,
    footerTransactional: "This is a transactional e-mail about a team invitation.",
  });
}
