import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "../../../lib/supabase/server";
import { notificationWebHref } from "../../../lib/notifications/web-link";

/**
 * /api/me/notifications — the signed-in person's notifications for the web bell (fase 2.1).
 * The app keeps reading them straight from Supabase (decision 2026-10-27: reuse working hooks).
 *   GET    → last 50, newest first, each with `href` (where it opens on the web) and `image`
 *            (the event's flyer when it is about an event).
 *   PATCH  { ids } | { all: true } → mark as read.
 *   DELETE { ids } | { all: true } → delete.
 * Always scoped to the caller's own rows (service client + user_id filter).
 */
export const dynamic = "force-dynamic";

const LIMIT = 50;
const bodySchema = z.union([
  z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

type Row = { id: string; type: string; title: string; body: string; data: Record<string, unknown> | null; read: boolean; created_at: string };

async function me(): Promise<{ error: NextResponse } | { userId: string }> {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!supabaseAdmin) return { error: NextResponse.json({ error: "Database not configured" }, { status: 500 }) };
  const { data: user } = await supabaseAdmin.from("users").select("id").eq("clerk_id", userId).maybeSingle();
  if (!user) return { error: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  return { userId: (user as { id: string }).id };
}

export async function GET() {
  const who = await me();
  if ("error" in who) return who.error;
  const db = supabaseAdmin!;
  const { data, error } = await db
    .from("notifications")
    .select("id, type, title, body, data, read, created_at")
    .eq("user_id", who.userId)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) {
    console.error("[GET /api/me/notifications]", error);
    return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  }
  const rows = (data ?? []) as Row[];
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const orgIds = [...new Set(rows.map((r) => str(r.data?.orgId)).filter((v): v is string => !!v))];
  const eventIds = [...new Set(rows.map((r) => str(r.data?.eventId)).filter((v): v is string => !!v))];
  const [orgs, events] = await Promise.all([
    orgIds.length ? db.from("organizations").select("id, slug").in("id", orgIds) : Promise.resolve({ data: [] }),
    eventIds.length ? db.from("events").select("id, slug, image_url").in("id", eventIds) : Promise.resolve({ data: [] }),
  ]);
  const orgSlug = new Map(((orgs.data ?? []) as Array<{ id: string; slug: string }>).map((o) => [o.id, o.slug]));
  const eventById = new Map(((events.data ?? []) as Array<{ id: string; slug: string; image_url: string | null }>).map((e) => [e.id, e]));

  const notifications = rows.map((r) => {
    const ev = eventById.get(str(r.data?.eventId) ?? "");
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      read: Boolean(r.read),
      created_at: r.created_at,
      image: ev?.image_url ?? null,
      href: notificationWebHref(r.type, r.data, { org: orgSlug.get(str(r.data?.orgId) ?? "") ?? null, event: ev?.slug ?? null }),
    };
  });
  return NextResponse.json({ notifications });
}

async function write(req: NextRequest, op: "read" | "delete") {
  const who = await me();
  if ("error" in who) return who.error;
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const db = supabaseAdmin!;
  let q = op === "read" ? db.from("notifications").update({ read: true }) : db.from("notifications").delete();
  q = q.eq("user_id", who.userId);
  if ("ids" in body) q = q.in("id", body.ids);
  else if (op === "read") q = q.eq("read", false);
  const { error } = await q;
  if (error) {
    console.error(`[${op === "read" ? "PATCH" : "DELETE"} /api/me/notifications]`, error);
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export const PATCH = (req: NextRequest) => write(req, "read");
export const DELETE = (req: NextRequest) => write(req, "delete");
