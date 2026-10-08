import { supabaseAdmin } from "../../lib/supabase/server";

/**
 * Support-admin gate for the org-approval surface (W7-H1).
 *
 * The security boundary is server-side: a `SUPPORT_ADMIN_EMAILS` env allowlist
 * (comma-separated, lowercased) checked against the caller's synced email.
 * We NEVER trust a client-sent email or a client `isAdmin` flag.
 *
 * Side effect: a matched account is promoted to `users.role = 'admin'` on its
 * first authenticated hit, so the existing event-creation admin bypass stays
 * consistent and we converge on a single role-based gate going forward.
 *
 * Returns the discriminated shape `{ error, status } | { callerUserId, email }`
 * so callers branch with `if ("error" in gate)` — mirrors the `requireAdmin`
 * helper in `api/organizations/[id]/members/route.ts`.
 */
export type SupportAdminGate =
  | { error: string; status: number }
  | { callerUserId: string; email: string };

function getAllowlist(): string[] {
  return (process.env.SUPPORT_ADMIN_EMAILS ?? "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireSupportAdmin(
  clerkUserId: string,
): Promise<SupportAdminGate> {
  if (!supabaseAdmin) {
    return { error: "Database not configured", status: 500 };
  }

  const { data: callerUser, error: userError } = await supabaseAdmin
    .from("users")
    .select("id, email, role")
    .eq("clerk_id", clerkUserId)
    .maybeSingle();

  if (userError) {
    console.error("[requireSupportAdmin] user lookup error", { error: userError });
    return { error: "Internal server error", status: 500 };
  }
  if (!callerUser) {
    return { error: "User not found", status: 404 };
  }

  const allowlist = getAllowlist();
  const email = (callerUser.email ?? "").toLowerCase();
  if (!email || !allowlist.includes(email)) {
    return { error: "Forbidden", status: 403 };
  }

  // Promote on first hit so the role-based gates (event creation) stay aligned.
  if (callerUser.role !== "admin") {
    const { error: promoteError } = await supabaseAdmin
      .from("users")
      .update({ role: "admin" })
      .eq("id", callerUser.id);
    if (promoteError) {
      // Non-fatal: the email allowlist is the real boundary. Log and continue.
      console.error("[requireSupportAdmin] role promotion failed", {
        userId: callerUser.id,
        error: promoteError,
      });
    }
  }

  return { callerUserId: callerUser.id, email };
}
