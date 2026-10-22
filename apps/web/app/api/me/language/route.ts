import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { isLanguage } from "@project-flame/lib";
import { supabaseAdmin } from "@/app/lib/supabase/server";
import { getUserLanguage } from "@/app/v2/lib/user-language";

/**
 * GET /api/me/language → { language } — read by the app (fase 1b) at start-up, since it has no
 * server render to read users.language from. Never fails for a signed-in person: missing user,
 * DB error or unmigrated column → "en" (same rule as the web, `getUserLanguage`).
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ language: await getUserLanguage(userId) });
}

/**
 * PUT /api/me/language { language: "en" | "es" } — the signed-in person's UI language
 * (users.language, decision D4: also used for their e-mails and push). Flame 2.0 Settings.
 */
export async function PUT(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdmin) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  let language: unknown;
  try {
    ({ language } = (await req.json()) as { language?: unknown });
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }
  if (!isLanguage(language)) return NextResponse.json({ error: "Unsupported language" }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("users").update({ language }).eq("clerk_id", userId).select("id");
  if (error) {
    console.error("[PUT /api/me/language]", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
  if (!data || data.length === 0) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({ language });
}
