/**
 * Team invitations (fase 4.5, 2026-11-02). Owners / admins invite any e-mail as admin or
 * organizer; the person is "Invited" until they accept (app + e-mail link); 7 days to answer.
 */
export const INVITATION_DAYS = 7;
export const INVITE_ROLES = ["admin", "organizer"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];
export type InvitationStatus = "pending" | "accepted" | "declined" | "cancelled";
export type InvitationState = InvitationStatus | "expired";

export type InvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: InviteRole;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
};

export function normalizeInviteEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Same shape check as the prototype ("name@email.com"); the e-mail itself proves the rest. */
export function isValidInviteEmail(raw: string): boolean {
  const v = normalizeInviteEmail(raw);
  return v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}

export function isInviteRole(v: unknown): v is InviteRole {
  return typeof v === "string" && (INVITE_ROLES as readonly string[]).includes(v);
}

/** What the invitation is now: a pending one past its date is "expired". */
export function invitationState(row: Pick<InvitationRow, "status" | "expires_at">, now: Date = new Date()): InvitationState {
  if (row.status !== "pending") return row.status;
  return new Date(row.expires_at).getTime() <= now.getTime() ? "expired" : "pending";
}

export function invitationExpiry(from: Date = new Date()): string {
  return new Date(from.getTime() + INVITATION_DAYS * 24 * 3600 * 1000).toISOString();
}

/** Days left to answer (0 on the last day), for "Expires in N days". */
export function invitationDaysLeft(expiresAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / (24 * 3600 * 1000)) - 1);
}
