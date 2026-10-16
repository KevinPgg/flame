import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageAccessCodes, generateAccessCode, isValidAccessCode, normalizeAccessCode } from "@project-flame/lib";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { eventToolGate } from "@/app/lib/utils/event-tool-gate";

/**
 * The event's door access code (events.qr_scanner_code) — decision 2026-10-16: kept as its own
 * option next to per-person access, so an organizer can hand a phone to door staff without
 * creating an account. Whoever has the code can scan this event in the app (Settings → Scan
 * Tickets); the web does not scan.
 *
 *   PUT { action: "generate" }          → new random 6-character code
 *   PUT { action: "set", code: "DOOR1" } → custom code (4–8 letters/digits; stored upper case)
 *   PUT { action: "clear" }              → no code (only signed-in people can scan)
 *   → { code: string | null }
 *   409 { code: "CODE_TAKEN" } when another event already uses that code (codes are unique).
 *
 * Who: owner/admin of the event's organization (canManageAccessCodes, same as the app).
 * Changing or clearing the code stops anyone using the old one at the next scan.
 */

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate") }),
  z.object({ action: z.literal("set"), code: z.string().max(32) }),
  z.object({ action: z.literal("clear") }),
]);

const isUniqueViolation = (e: { code?: string } | null) => e?.code === "23505";

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await eventToolGate(id);
  if (g.res) return g.res;
  if (!canManageAccessCodes(g.role)) {
    return NextResponse.json({ error: "Only owners and admins can change the access code" }, { status: 403 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request", code: "INVALID" }, { status: 400 });
  }

  const db = supabaseAdmin!;
  const save = async (code: string | null) =>
    db.from("events").update({ qr_scanner_code: code }).eq("id", g.event.id).select("id, qr_scanner_code").single();

  if (body.action === "clear") {
    const { error } = await save(null);
    if (error) {
      console.error("[scanner-code clear]", error);
      return NextResponse.json({ error: "Failed to update the code" }, { status: 500 });
    }
    return NextResponse.json({ code: null });
  }

  if (body.action === "set") {
    const code = normalizeAccessCode(body.code);
    if (!isValidAccessCode(code)) {
      return NextResponse.json({ error: "Use 4 to 8 letters or numbers", code: "INVALID" }, { status: 400 });
    }
    const { data: taken, error: takenError } = await db
      .from("events")
      .select("id")
      .eq("qr_scanner_code", code)
      .neq("id", g.event.id)
      .limit(1);
    if (takenError) {
      console.error("[scanner-code set] lookup", takenError);
      return NextResponse.json({ error: "Failed to update the code" }, { status: 500 });
    }
    if ((taken ?? []).length > 0) {
      return NextResponse.json({ error: "Another event already uses this code", code: "CODE_TAKEN" }, { status: 409 });
    }
    const { error } = await save(code);
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "Another event already uses this code", code: "CODE_TAKEN" }, { status: 409 });
    }
    if (error) {
      console.error("[scanner-code set]", error);
      return NextResponse.json({ error: "Failed to update the code" }, { status: 500 });
    }
    return NextResponse.json({ code });
  }

  // generate: random codes rarely collide; the unique constraint catches the rest → retry.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateAccessCode((max) => randomInt(max));
    const { error } = await save(code);
    if (!error) return NextResponse.json({ code });
    if (!isUniqueViolation(error)) {
      console.error("[scanner-code generate]", error);
      return NextResponse.json({ error: "Failed to update the code" }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Failed to update the code" }, { status: 500 });
}
