import { auth, currentUser, clerkClient } from "@clerk/nextjs/server";
import { supabaseAdmin } from "./supabase/server";
import { retrySupabaseOperation } from "./utils/supabase-retry";

export type DbUser = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
};

export async function getCurrentUser() {
  const user = await currentUser();
  return user;
}

export async function requireAuth() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  return userId;
}

export async function getClerkUserId() {
  const { userId } = await auth();
  return userId;
}

export async function getSupabaseUser(clerkId: string) {
  if (!supabaseAdmin) {
    console.log("Supabase not configured");
    return null;
  }

  const { data: user, error } = await retrySupabaseOperation(
    async () =>
      await supabaseAdmin!
        .from("users")
        .select("*")
        .eq("clerk_id", clerkId)
        .single()
  );

  if (error) {
    console.error("Error fetching user from Supabase:", error);
    return null;
  }

  return user;
}

export async function getOrCreateSupabaseUser() {
  const clerkUser = await currentUser();

  if (!clerkUser || !supabaseAdmin) {
    return null;
  }

  // Check if user exists
  const existingUser = await getSupabaseUser(clerkUser.id);

  if (existingUser) {
    return existingUser;
  }

  // Create user if they don't exist
  const { data: newUser, error } = await retrySupabaseOperation(
    async () =>
      await supabaseAdmin!
        .from("users")
        .insert({
          clerk_id: clerkUser.id,
          email: clerkUser.emailAddresses[0]?.emailAddress || "",
          first_name: clerkUser.firstName || null,
          last_name: clerkUser.lastName || null,
        })
        .select()
        .single()
  );

  if (error) {
    console.error("Error creating user in Supabase:", error);
    return null;
  }

  console.log("✅ User created in Supabase:", newUser);
  return newUser;
}

/**
 * Resolves a Clerk user ID to a database user record.
 * Throws errors that can be mapped to HTTP status codes.
 *
 * @param clerkUserId - The Clerk user ID to resolve
 * @returns The database user object with id, email, first_name, and last_name fields
 * @throws Error with message "Database connection not available" if supabaseAdmin is not available
 * @throws Error with message "Database error" if the database query fails
 * @throws Error with message "User not found" if no user exists with the given Clerk ID
 */
export async function resolveDbUserFromClerkId(
  clerkUserId: string
): Promise<DbUser> {
  if (!supabaseAdmin) {
    throw new Error("Database connection not available");
  }

  const { data: dbUser, error: dbUserError } = await retrySupabaseOperation(
    async () =>
      await supabaseAdmin!
        .from("users")
        .select("id, email, first_name, last_name")
        .eq("clerk_id", clerkUserId)
        .single()
  );

  // First, handle non-PGRST116 database errors (network issues, permissions, etc.)
  // These should be propagated immediately, not trigger JIT sync
  if (dbUserError && dbUserError.code !== "PGRST116") {
    console.error("Database error fetching user:", dbUserError);
    throw new Error("Database error");
  }

  // Handle the case where no rows are found (PGRST116) or user is null
  if (dbUserError?.code === "PGRST116" || !dbUser) {
    console.log(
      "User not found in database for Clerk ID:",
      clerkUserId,
      "- Attempting JIT sync..."
    );

    try {
      // Fetch user details directly from Clerk
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(clerkUserId);

      // Insert into Supabase
      const { data: newUser, error: insertError } =
        await retrySupabaseOperation(
          async () =>
            await supabaseAdmin!
              .from("users")
              .insert({
                clerk_id: clerkUserId,
                email: clerkUser.emailAddresses[0]?.emailAddress || "",
                first_name: clerkUser.firstName || null,
                last_name: clerkUser.lastName || null,
              })
              .select("id, email, first_name, last_name")
              .single()
        );

      if (insertError) {
        // Handle race condition: another request may have inserted the user
        if (insertError.code === "23505") {
          console.log(
            "JIT Sync race condition - refetching user:",
            clerkUserId
          );
          const { data: refetchedUser } = await retrySupabaseOperation(
            async () =>
              await supabaseAdmin!
                .from("users")
                .select("id, email, first_name, last_name")
                .eq("clerk_id", clerkUserId)
                .single()
          );
          if (refetchedUser) {
            return refetchedUser as DbUser;
          }
        }
        console.error("JIT Sync failed - Insert error:", insertError);
        throw new Error("User not found (Sync failed)");
      }

      // Check if insert returned data
      if (!newUser) {
        console.error(
          "JIT Sync failed - Insert returned no data for user:",
          clerkUserId
        );
        throw new Error("Insert returned no data for new user");
      }

      console.log("✅ JIT Sync successful for:", clerkUserId);
      return newUser as DbUser;
    } catch (syncError) {
      // This catches Clerk API errors, insert errors, and refetch failures
      console.error("JIT Sync failed:", syncError);
      throw new Error("User not found");
    }
  }

  // At this point, we have a valid user (all error and null cases are handled above)
  return dbUser!;
}
