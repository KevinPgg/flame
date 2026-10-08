import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import { z } from "zod";
import {
  supabaseAdmin,
  isSupabaseConfigured,
} from "../../../lib/supabase/server";
import { retrySupabaseOperation } from "../../../lib/utils/supabase-retry";

const clerkUserDataSchema = z.object({
  id: z.string(),
  email_addresses: z
    .array(z.object({ email_address: z.string() }))
    .optional(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
});

// This webhook will sync Clerk users to Supabase via MCP
export async function POST(req: NextRequest) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error(
      "Please add CLERK_WEBHOOK_SECRET to your environment variables"
    );
  }

  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Error occured -- no svix headers", {
      status: 400,
    });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error occured", {
      status: 400,
    });
  }

  const parsedData = clerkUserDataSchema.safeParse(evt.data);
  if (!parsedData.success) {
    console.error(
      "Invalid webhook payload shape:",
      parsedData.error.flatten()
    );
    return new Response("Invalid payload", { status: 400 });
  }
  const { id, email_addresses, first_name, last_name } = parsedData.data;
  const eventType = evt.type;

  console.log(`Webhook with ID of ${id} and type of ${eventType}`);

  // Handle the webhook - sync user to Supabase automatically
  const DEFAULT_PROFILE_IMAGE_URL =
    "https://jaoqfvugxmtomdufhswa.supabase.co/storage/v1/object/public/profile-images/default.jpg";

  if (eventType === "user.created" || eventType === "user.updated") {
    try {
      const baseUserData = {
        clerk_id: id,
        email: email_addresses?.[0]?.email_address || "",
        first_name: first_name || null,
        last_name: last_name || null,
      };

      console.log("Syncing user to Supabase:", { clerk_id: id });

      if (!isSupabaseConfigured() || !supabaseAdmin) {
        console.log("⚠️ Supabase not configured - user sync skipped");
        console.log("🔄 USER_SYNC_REQUIRED:", JSON.stringify({ clerk_id: id }));
        return new Response("", { status: 200 });
      }

      // Upsert base fields without profile_image_url so a custom image is never overwritten.
      const { data: syncedUser, error: syncError } = await retrySupabaseOperation<{
        id: string;
        profile_image_url: string | null;
      }>(async () =>
        await supabaseAdmin!
          .from("users")
          .upsert(baseUserData, {
            onConflict: "clerk_id",
          })
          .select("id, profile_image_url")
          .single()
      );

      if (syncError) {
        console.error("Error syncing user to Supabase:", syncError);
        throw syncError;
      }

      // For newly inserted rows the profile_image_url will be null.
      // Only set the default in that case — never overwrite a custom image.
      if (syncedUser && !syncedUser.profile_image_url) {
        const { error: imageError } = await retrySupabaseOperation(async () =>
          await supabaseAdmin!
            .from("users")
            .update({ profile_image_url: DEFAULT_PROFILE_IMAGE_URL })
            .eq("id", syncedUser.id)
            .is("profile_image_url", null)
        );
        if (imageError) {
          console.error("Error setting default profile image:", imageError);
          throw imageError;
        }
      }

      console.log("✅ User successfully synced to Supabase:", { clerk_id: id });
    } catch (error) {
      console.error("Error syncing user to Supabase:", error);
      return NextResponse.json(
        { error: "Failed to sync user" },
        { status: 500 }
      );
    }
  }

  // Handle user deletion
  if (eventType === "user.deleted") {
    try {
      console.log("Deleting user from Supabase:", id);

      if (!isSupabaseConfigured() || !supabaseAdmin) {
        console.log("⚠️ Supabase not configured - user deletion skipped");
        return new Response("", { status: 200 });
      }

      const { error: deleteError } = await retrySupabaseOperation(async () =>
        await supabaseAdmin!.from("users").delete().eq("clerk_id", id)
      );

      if (deleteError) {
        // Handle foreign key constraint violation (e.g. user is an organizer)
        // Code 23503 is foreign_key_violation in Postgres
        if (deleteError.code === "23503") {
          console.warn(
            `⚠️ Could not delete user ${id} because they have dependent records. Anonymizing email to allow re-registration.`
          );

          // Anonymize the email of the "deleted" user so they can sign up again with the same email
          // We append a timestamp to the email: "old_email@domain.com" -> "deleted_123456789_old_email@domain.com"
          // This keeps the record but frees up the email constraint
          const { error: updateError } = await retrySupabaseOperation(async () =>
            await supabaseAdmin!
              .from("users")
              .update({
                email: `deleted_${Date.now()}_${id}@deleted.user`,
                first_name: "Deleted User",
                last_name: "Deleted User",
                // We keep the clerk_id as is because the new user will have a NEW clerk_id
              })
              .eq("clerk_id", id)
          );

          if (updateError) {
            console.error(
              "Error anonymizing user after failed deletion:",
              updateError
            );
            // If anonymization fails, we should fail the webhook so Clerk retries
            // Otherwise we risk leaving the email taken, blocking re-registration
            throw updateError;
          } else {
            console.log(`✅ User ${id} successfully anonymized/archived.`);
          }

          return new Response("", { status: 200 });
        }

        console.error("Error deleting user from Supabase:", deleteError);
        throw deleteError;
      }

      console.log("✅ User successfully deleted from Supabase:", id);
    } catch (error) {
      console.error("Error deleting user from Supabase:", error);
      return NextResponse.json(
        { error: "Failed to delete user" },
        { status: 500 }
      );
    }
  }

  return new Response("", { status: 200 });
}
