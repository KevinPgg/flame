import { supabaseAdmin } from "../supabase/server";

/**
 * Atomically decrements the usage_count of a promotional code by 1
 * Only decrements if usage_count > 0 to prevent underflow
 * Uses optimistic locking (compare-and-swap) to ensure atomicity
 *
 * @param promotional_code_id - The UUID of the promotional code to rollback
 * @returns true if rollback succeeded, false otherwise
 */
export async function rollbackPromoCodeUsage(
  promotional_code_id: string
): Promise<boolean> {
  try {
    // Check if supabaseAdmin is available
    if (!supabaseAdmin) {
      console.error(
        "Supabase admin client not available for promo code rollback"
      );
      return false;
    }

    // Fetch current usage_count
    const { data: currentPromo, error: fetchError } = await supabaseAdmin
      .from("promotional_codes")
      .select("usage_count")
      .eq("id", promotional_code_id)
      .single();

    if (fetchError || !currentPromo) {
      console.error("Error fetching promo code for rollback:", fetchError);
      return false;
    }

    // Check if usage_count is already 0
    if (currentPromo.usage_count === 0) {
      console.warn(
        `Promo code rollback skipped: usage_count already 0 for ${promotional_code_id}`
      );
      return false;
    }

    // Atomic decrement with optimistic locking:
    // Only update if usage_count hasn't changed since we fetched it
    // This ensures another concurrent operation hasn't modified it
    const newUsageCount = currentPromo.usage_count - 1;
    const { data, error } = await supabaseAdmin
      .from("promotional_codes")
      .update({ usage_count: newUsageCount })
      .eq("id", promotional_code_id)
      .eq("usage_count", currentPromo.usage_count) // Optimistic lock
      .select("usage_count");

    if (error) {
      console.error("Error rolling back promo code usage:", error);
      return false;
    }

    // If no data returned, another concurrent operation modified the usage_count
    // In production, you might want to retry, but for rollback it's acceptable to skip
    if (!data || data.length === 0) {
      console.warn(
        `Promo code rollback: concurrent modification detected for ${promotional_code_id}, skipping`
      );
      return false;
    }

    console.log(
      `✓ Rolled back promo code ${promotional_code_id}, usage_count: ${currentPromo.usage_count} -> ${newUsageCount}`
    );
    return true;
  } catch (error) {
    console.error("Exception during promo code rollback:", error);
    return false;
  }
}
