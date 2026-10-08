import { supabaseAdmin } from "./supabase/server";

export async function updateUserRoleToOrganizer(userId: string): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Admin client is unavailable");
  }

  const { error } = await supabaseAdmin
    .from("users")
    .update({ role: "organizer" })
    .eq("id", userId);

  if (error) {
    console.error("Error updating user role:", error);
    throw error;
  }
}
