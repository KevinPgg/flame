"use server";

import { auth, currentUser } from "@clerk/nextjs/server";

export async function syncCurrentUserToSupabase() {
  try {
    const { userId } = await auth();

    if (!userId) {
      throw new Error("Not authenticated");
    }

    const clerkUser = await currentUser();

    if (!clerkUser) {
      throw new Error("User not found");
    }

    const userData = {
      clerk_id: clerkUser.id,
      email: clerkUser.emailAddresses[0]?.emailAddress || "",
      first_name: clerkUser.firstName || null,
      last_name: clerkUser.lastName || null,
    };

    console.log("Syncing user to Supabase via server action:", userData);

    // This server action will be called from a component that has MCP access
    // Return the user data for the MCP call
    return {
      success: true,
      userData,
      needsSync: true,
    };
  } catch (error) {
    console.error("Error in user sync server action:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
