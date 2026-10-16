import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { eventToolGate } from "@/app/lib/utils/event-tool-gate";

/**
 * People designated to scan one event's tickets (decision 2026-10-16). Members of the
 * organization (and co-hosts) can always scan; this list adds anyone else with a Flame account.
 *
 *   GET    → { scanners: [{ id, user_id, email, first_name, last_name, created_at }] }
 *   POST   { email } → designate the account with that exact e-mail
 *   DELETE ?scannerId=<row id> → remove
 *
 * Who manages it: owner/admin of the event's organization, or an organizer assigned to it
 * (same rule as the rest of the event's tools).
 */

type Ctx = { params: Promise<{ id: string }> };
const gate = eventToolGate;

type Row = {
  id: string;
  user_id: string;
  created_at: string;
  users: { email: string | null; first_name: string | null; last_name: string | null } | Array<{ email: string | null; first_name: string | null; last_name: string | null }> | null;
};

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await gate(id);
  if (g.res) return g.res;
  const { data, error } = await supabaseAdmin!
    .from("event_scanners")
    .select("id, user_id, created_at, users:user_id ( email, first_name, last_name )")
    .eq("event_id", g.event.id)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[scanners GET]", error);
    return NextResponse.json({ error: "Failed to load scanners" }, { status: 500 });
  }
  const scanners = ((data ?? []) as Row[]).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      id: r.id,
      user_id: r.user_id,
      created_at: r.created_at,
      email: u?.email ?? null,
      first_name: u?.first_name ?? null,
      last_name: u?.last_name ?? null,
    };
  });
  return NextResponse.json({ scanners });
}

const postSchema = z.object({ email: z.string().trim().toLowerCase().email().max(320) });

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await gate(id);
  if (g.res) return g.res;

  let email: string;
  try {
    email = postSchema.parse(await req.json()).email;
  } catch {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }

  // Emails are stored lower-case: exact match, no wildcards.
  const { data: person, error: personError } = await supabaseAdmin!
    .from("users")
    .select("id, email, first_name, last_name")
    .eq("email", email)
    .maybeSingle();
  if (personError) return NextResponse.json({ error: "Failed to look up the account" }, { status: 500 });
  if (!person) {
    return NextResponse.json({ error: "No Flame account with that email", code: "NOT_FOUND" }, { status: 404 });
  }

  const { data: member, error: memberError } = await supabaseAdmin!
    .from("organization_members")
    .select("id")
    .eq("organization_id", g.event.organization_id)
    .eq("user_id", person.id)
    .maybeSingle();
  if (memberError) return NextResponse.json({ error: "Failed to look up the account" }, { status: 500 });
  if (member) {
    return NextResponse.json(
      { error: "This person is a member of the organization and can already scan", code: "ALREADY_MEMBER" },
      { status: 409 }
    );
  }

  const { data: existing } = await supabaseAdmin!
    .from("event_scanners")
    .select("id")
    .eq("event_id", g.event.id)
    .eq("user_id", person.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Already designated for this event", code: "ALREADY_SCANNER" }, { status: 409 });
  }

  const { data: inserted, error: insertError } = await supabaseAdmin!
    .from("event_scanners")
    .insert({ event_id: g.event.id, user_id: person.id, added_by: g.callerId })
    .select("id, user_id, created_at")
    .single();
  if (insertError) {
    console.error("[scanners POST]", insertError);
    return NextResponse.json({ error: "Failed to add scanner" }, { status: 500 });
  }
  return NextResponse.json(
    { scanner: { ...inserted, email: person.email, first_name: person.first_name, last_name: person.last_name } },
    { status: 201 }
  );
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const g = await gate(id);
  if (g.res) return g.res;
  const scannerId = req.nextUrl.searchParams.get("scannerId");
  if (!scannerId) return NextResponse.json({ error: "scannerId is required" }, { status: 400 });
  const { error } = await supabaseAdmin!.from("event_scanners").delete().eq("id", scannerId).eq("event_id", g.event.id);
  if (error) {
    console.error("[scanners DELETE]", error);
    return NextResponse.json({ error: "Failed to remove scanner" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
