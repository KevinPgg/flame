/**
 * @legacy — Cédula update route from the Datafast era (Ecuador-specific).
 * Since migrating to Stripe (Jan 2026), cédula is no longer collected for
 * new purchases. This route is kept for existing users who may still have
 * a stored document_id. Do NOT reference for new features.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  supabaseAdmin,
  isSupabaseConfigured,
} from "../../../lib/supabase/server";
import { validateCedula, cleanCedula } from "@project-flame/lib";

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check if Supabase is configured
    if (!isSupabaseConfigured() || !supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 503 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { document_id } = body;

    // Validate cedula is provided
    if (!document_id || typeof document_id !== "string") {
      return NextResponse.json(
        { error: "ID number required" },
        { status: 400 }
      );
    }

    // Server-side validation using shared validator
    // This prevents malicious users from bypassing client-side validation
    const validation = validateCedula(document_id);

    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error || "Invalid ID number" },
        { status: 400 }
      );
    }

    // Clean the cedula (remove any non-digits)
    const cleanedCedula = cleanCedula(document_id);

    // Update user's document_id in Supabase
    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        document_id: cleanedCedula,
        document_type: "IDCARD", // Set default document type
        updated_at: new Date().toISOString(),
      })
      .eq("clerk_id", userId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating user cedula:", updateError);
      
      // Supabase returns PGRST116 when .single() finds zero rows
      if (updateError.code === "PGRST116") {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { error: "Error updating ID number" },
        { status: 500 }
      );
    }

    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log("✅ User cedula updated successfully:", {
      userId: updatedUser.id,
      document_updated: true,
    });

    return NextResponse.json({
      success: true,
      message: "ID number updated successfully",
      user: {
        id: updatedUser.id,
        document_id: updatedUser.document_id,
      },
    });
  } catch (error) {
    console.error("Error in update-cedula endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
