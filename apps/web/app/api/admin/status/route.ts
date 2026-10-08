import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { requireSupportAdmin } from "../_lib";

/**
 * GET /api/admin/status → { isAdmin: boolean }
 *
 * Bootstrap endpoint for the support-only org-approval surface (W7-H1). The
 * client calls this to decide whether to render the admin sections and enable
 * the pending/rejected list queries — without ever learning the allowlist.
 * Running the gate also promotes a matched account to `users.role = 'admin'`.
 *
 * Always returns 200; non-admins get `{ isAdmin: false }` (simpler client hook).
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ isAdmin: false }, { status: 200 });
    }

    const gate = await requireSupportAdmin(userId);
    return NextResponse.json({ isAdmin: !("error" in gate) }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/admin/status] unexpected", err);
    return NextResponse.json({ isAdmin: false }, { status: 200 });
  }
}
