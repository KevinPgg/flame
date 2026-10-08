/**
 * Test Script: Stage Availability System
 * 
 * This script tests the new stage availability features:
 * - Expired hold cleanup
 * - Real-time stage availability
 * - Tier availability calculation
 * 
 * Usage:
 *   npx tsx scripts/test-stage-availability.ts <tier-id>
 * 
 * Example:
 *   npx tsx scripts/test-stage-availability.ts 550e8400-e29b-41d4-a716-446655440000
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables!");
  console.error("Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testStageAvailability(tierId: string) {
  console.log("\n🧪 Testing Stage Availability System\n");
  console.log("=" .repeat(60));
  
  // Test 1: Cleanup expired holds
  console.log("\n1️⃣  Testing: cleanup_expired_holds()");
  console.log("-".repeat(60));
  
  const { data: cleanupResult, error: cleanupError } = await supabase.rpc(
    "cleanup_expired_holds"
  );
  
  if (cleanupError) {
    console.error("❌ Error:", cleanupError);
  } else if (cleanupResult && cleanupResult.length > 0) {
    const { deleted_count, affected_tier_ids } = cleanupResult[0];
    console.log(`✅ Cleaned up ${deleted_count} expired holds`);
    if (deleted_count > 0) {
      console.log(`📦 Affected tier IDs: ${affected_tier_ids?.join(", ") || "none"}`);
    }
  } else {
    console.log("✅ No expired holds to clean up");
  }
  
  // Test 2: Get tier stage availability
  console.log("\n2️⃣  Testing: get_tier_stage_availability()");
  console.log("-".repeat(60));
  
  const { data: tierAvailability, error: tierError } = await supabase.rpc(
    "get_tier_stage_availability",
    { p_tier_id: tierId }
  );
  
  if (tierError) {
    console.error("❌ Error:", tierError);
  } else if (tierAvailability) {
    console.log(`✅ Found ${tierAvailability.length} stages:\n`);
    
    tierAvailability.forEach((stage: any) => {
      const currentMarker = stage.is_current_stage ? "👉 " : "   ";
      const statusIcon = stage.available_quantity > 0 ? "🟢" : "🔴";
      
      console.log(`${currentMarker}${statusIcon} ${stage.stage_name}`);
      console.log(`     Order: ${stage.stage_order}`);
      console.log(`     Price: $${(stage.stage_price_cents / 100).toFixed(2)}`);
      console.log(`     Total: ${stage.total_quantity}`);
      console.log(`     Sold: ${stage.sold_quantity}`);
      console.log(`     Held: ${stage.held_quantity}`);
      console.log(`     Available: ${stage.available_quantity}`);
      console.log("");
    });
    
    const currentStage = tierAvailability.find((s: any) => s.is_current_stage);
    if (currentStage) {
      console.log(`🎯 Current Stage: ${currentStage.stage_name}`);
      console.log(`💰 Current Price: $${(currentStage.stage_price_cents / 100).toFixed(2)}`);
    } else {
      console.log("⚠️  No current stage (all stages might be sold out)");
    }
  }
  
  // Test 3: View active holds
  console.log("\n3️⃣  Testing: v_active_holds_by_stage");
  console.log("-".repeat(60));
  
  const { data: activeHolds, error: holdsError } = await supabase
    .from("v_active_holds_by_stage")
    .select("*")
    .eq("tier_id", tierId);
  
  if (holdsError) {
    console.error("❌ Error:", holdsError);
  } else if (activeHolds && activeHolds.length > 0) {
    console.log(`✅ Found ${activeHolds.length} active holds:\n`);
    
    activeHolds.forEach((hold: any) => {
      console.log(`📌 Stage: ${hold.stage_name || "No stage"}`);
      console.log(`   Holds: ${hold.hold_count}`);
      console.log(`   Total Qty: ${hold.total_held_quantity}`);
      console.log(`   Expires: ${hold.earliest_expiration} - ${hold.latest_expiration}`);
      console.log("");
    });
  } else {
    console.log("✅ No active holds for this tier");
  }
  
  // Test 4: Get tier details
  console.log("\n4️⃣  Testing: Tier Details");
  console.log("-".repeat(60));
  
  const { data: tier, error: tierDetailsError } = await supabase
    .from("ticket_tiers")
    .select("id, name, quantity_total, quantity_sold")
    .eq("id", tierId)
    .single();
  
  if (tierDetailsError) {
    console.error("❌ Error:", tierDetailsError);
  } else if (tier) {
    console.log(`✅ Tier: ${tier.name}`);
    console.log(`   Total: ${tier.quantity_total}`);
    console.log(`   Sold: ${tier.quantity_sold}`);
    console.log(`   Available: ${tier.quantity_total - tier.quantity_sold}`);
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("✅ All tests completed!\n");
}

// Main execution
const tierId = process.argv[2];

if (!tierId) {
  console.error("❌ Error: Tier ID is required");
  console.log("\nUsage:");
  console.log("  npx tsx scripts/test-stage-availability.ts <tier-id>");
  console.log("\nExample:");
  console.log("  npx tsx scripts/test-stage-availability.ts 550e8400-e29b-41d4-a716-446655440000");
  process.exit(1);
}

// Validate UUID format
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!uuidRegex.test(tierId)) {
  console.error("❌ Error: Invalid UUID format");
  process.exit(1);
}

testStageAvailability(tierId)
  .then(() => {
    console.log("🎉 Test script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Test script failed:", error);
    process.exit(1);
  });

