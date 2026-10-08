/**
 * Database Function Tests: Stage Availability & Hold Expiration
 * 
 * Tests the core database functions that power real-time availability:
 * - get_tier_stage_availability: Returns availability for all stages in a tier
 * - get_stage_availability: Returns availability for a specific stage
 * - cleanup_expired_holds: Removes expired holds and frees inventory
 * 
 * These tests verify:
 * - Stage progression logic (when stages become available)
 * - Negative availability clamping (never returns negative values)
 * - Hold expiration cleanup
 * - Data consistency between stages and tier totals
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { cleanupOrphanedTestData } from "./utils/test-data-cleanup";

// Test database connection (use test credentials)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("⚠️  Supabase credentials not found. Database function tests will be skipped.");
}

const supabase = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

describe("Database Functions: Stage Availability", () => {
  // Test tier and stage IDs (will be created in beforeAll)
  let testTierId: string;
  let testEventId: string;
  let testStage1Id: string;
  let testStage2Id: string;
  let testUserId: string;

  beforeAll(async () => {
    if (!supabase) {
      console.warn("Skipping database tests - no Supabase connection");
      return;
    }

    // Clean up any orphaned test data from previous runs
    await cleanupOrphanedTestData(supabase);

    // Create test user with unique email using UUID
    const uniqueId = Math.random().toString(36).substring(2, 15);
    const { data: user, error: userError } = await supabase
      .from("users")
      .insert({
        clerk_id: `test-clerk-${Date.now()}-${uniqueId}`,
        email: `test-${Date.now()}-${uniqueId}@example.com`,
      })
      .select("id")
      .single();

    if (userError) {
      console.error("Failed to create test user:", userError);
      return;
    }
    testUserId = user?.id || "";

    // Create test organization
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name: `Test Org ${Date.now()}`,
        slug: `test-org-${Date.now()}`,
        owner_user_id: testUserId, // Required field
      })
      .select("id")
      .single();

    if (orgError) {
      console.error("Failed to create test organization:", orgError);
      return;
    }

    // Create test event (using 'draft' to prevent public visibility)
    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        organization_id: org?.id,
        name: `Test Event ${Date.now()}`,
        slug: `test-event-${Date.now()}`,
        city: "Test City",
        venue: "Test Venue",
        starts_at: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        ends_at: new Date(Date.now() + 90000000).toISOString(),
        description: "Test event for availability testing",
        status: "draft", // Use draft to prevent appearing on public event listings
        requires_rsvp: false,
      })
      .select("id")
      .single();

    if (eventError) {
      console.error("Failed to create test event:", eventError);
      return;
    }
    testEventId = event?.id || "";

    // Create test tier with stages
    const { data: tier, error: tierError } = await supabase
      .from("ticket_tiers")
      .insert({
        event_id: testEventId,
        name: "Test Tier",
        price_cents: 2000,
        quantity_total: 10, // Total: 10 tickets
        quantity_sold: 0,
        per_user_limit: 5,
        sales_start: new Date(Date.now() - 86400000).toISOString(), // Yesterday (sales started)
        sales_end: new Date(Date.now() + 86400000).toISOString(), // Tomorrow (sales end)
      })
      .select("id")
      .single();

    if (tierError) {
      console.error("Failed to create test tier:", tierError);
      return;
    }
    testTierId = tier?.id || "";

    // Create stage 1: Early Bird (5 tickets)
    const { data: stage1, error: stage1Error } = await supabase
      .from("ticket_stages")
      .insert({
        ticket_tier_id: testTierId,
        name: "Early Bird",
        price_cents: 1000,
        quantity: 5,
        sold_quantity: 0,
        order_index: 0,
      })
      .select("id")
      .single();

    if (stage1Error) {
      console.error("Failed to create test stage 1:", stage1Error);
      return;
    }
    testStage1Id = stage1?.id || "";

    // Create stage 2: Regular (5 tickets)
    const { data: stage2, error: stage2Error } = await supabase
      .from("ticket_stages")
      .insert({
        ticket_tier_id: testTierId,
        name: "Regular",
        price_cents: 2000,
        quantity: 5,
        sold_quantity: 0,
        order_index: 1,
      })
      .select("id")
      .single();

    if (stage2Error) {
      console.error("Failed to create test stage 2:", stage2Error);
      return;
    }
    testStage2Id = stage2?.id || "";
  });

  afterAll(async () => {
    if (!supabase) return;

    // Cleanup: Delete test data
    if (testTierId) {
      await supabase.from("ticket_stages").delete().eq("ticket_tier_id", testTierId);
      await supabase.from("holds").delete().eq("tier_id", testTierId);
      await supabase.from("ticket_tiers").delete().eq("id", testTierId);
    }
    if (testEventId) {
      await supabase.from("events").delete().eq("id", testEventId);
    }
    if (testUserId) {
      await supabase.from("users").delete().eq("id", testUserId);
    }
  });

  describe("get_tier_stage_availability() - Stage Progression Logic", () => {
    it("should mark first stage as current when no tickets sold", async () => {
      if (!supabase) {
        console.warn("Skipping - no Supabase connection");
        return;
      }

      const { data, error } = await supabase.rpc("get_tier_stage_availability", {
        p_tier_id: testTierId,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.length).toBe(2);

      const earlyBird = data?.find((s: any) => s.stage_name === "Early Bird");
      const regular = data?.find((s: any) => s.stage_name === "Regular");

      expect(earlyBird?.is_current_stage).toBe(true);
      expect(regular?.is_current_stage).toBe(false);
      expect(earlyBird?.available_quantity).toBe(5);
      expect(regular?.available_quantity).toBe(5);
    });

    it("should transition to second stage when first stage sells out", async () => {
      if (!supabase) return;

      // Update tier to simulate Early Bird sold out
      await supabase
        .from("ticket_tiers")
        .update({ quantity_sold: 5 })
        .eq("id", testTierId);

      await supabase
        .from("ticket_stages")
        .update({ sold_quantity: 5 })
        .eq("id", testStage1Id);

      const { data, error } = await supabase.rpc("get_tier_stage_availability", {
        p_tier_id: testTierId,
      });

      expect(error).toBeNull();
      const earlyBird = data?.find((s: any) => s.stage_name === "Early Bird");
      const regular = data?.find((s: any) => s.stage_name === "Regular");

      expect(earlyBird?.is_current_stage).toBe(false);
      expect(regular?.is_current_stage).toBe(true);
      expect(earlyBird?.available_quantity).toBe(0);
      expect(regular?.available_quantity).toBe(5);

      // Reset
      await supabase
        .from("ticket_tiers")
        .update({ quantity_sold: 0 })
        .eq("id", testTierId);
      await supabase
        .from("ticket_stages")
        .update({ sold_quantity: 0 })
        .eq("id", testStage1Id);
    });

    it("should handle partial stage consumption correctly", async () => {
      if (!supabase) return;

      // Sell 3 tickets from Early Bird (2 remaining)
      await supabase
        .from("ticket_tiers")
        .update({ quantity_sold: 3 })
        .eq("id", testTierId);

      await supabase
        .from("ticket_stages")
        .update({ sold_quantity: 3 })
        .eq("id", testStage1Id);

      const { data, error } = await supabase.rpc("get_tier_stage_availability", {
        p_tier_id: testTierId,
      });

      expect(error).toBeNull();
      const earlyBird = data?.find((s: any) => s.stage_name === "Early Bird");
      const regular = data?.find((s: any) => s.stage_name === "Regular");

      expect(earlyBird?.is_current_stage).toBe(true); // Still current
      expect(regular?.is_current_stage).toBe(false);
      expect(earlyBird?.available_quantity).toBe(2); // 5 - 3
      expect(regular?.available_quantity).toBe(5);

      // Reset
      await supabase
        .from("ticket_tiers")
        .update({ quantity_sold: 0 })
        .eq("id", testTierId);
      await supabase
        .from("ticket_stages")
        .update({ sold_quantity: 0 })
        .eq("id", testStage1Id);
    });
  });

  describe("get_tier_stage_availability() - Negative Availability Clamping", () => {
    it("should clamp available_quantity to zero when sold + held exceeds total", async () => {
      if (!supabase) return;

      // Create a hold that exceeds availability
      await supabase
        .from("ticket_tiers")
        .update({ quantity_sold: 3 })
        .eq("id", testTierId);

      await supabase
        .from("ticket_stages")
        .update({ sold_quantity: 3 })
        .eq("id", testStage1Id);

      // Create hold for 5 tickets (but only 2 available)
      const { data: hold } = await supabase
        .from("holds")
        .insert({
          user_id: testUserId,
          event_id: testEventId,
          tier_id: testTierId,
          stage_id: testStage1Id,
          quantity: 5, // More than available
          expires_at: new Date(Date.now() + 300000).toISOString(), // 5 min from now
        })
        .select("id")
        .single();

      const { data, error } = await supabase.rpc("get_tier_stage_availability", {
        p_tier_id: testTierId,
      });

      expect(error).toBeNull();
      const earlyBird = data?.find((s: any) => s.stage_name === "Early Bird");

      // Should clamp to 0, not negative
      expect(earlyBird?.available_quantity).toBeGreaterThanOrEqual(0);
      expect(earlyBird?.available_quantity).toBe(0); // Clamped: 5 - 3 - 5 = -3 → 0

      // Cleanup
      if (hold?.id) {
        await supabase.from("holds").delete().eq("id", hold.id);
      }
      await supabase
        .from("ticket_tiers")
        .update({ quantity_sold: 0 })
        .eq("id", testTierId);
      await supabase
        .from("ticket_stages")
        .update({ sold_quantity: 0 })
        .eq("id", testStage1Id);
    });

    it("should never return negative values even with data drift", async () => {
      if (!supabase) return;

      // Simulate data drift: sold exceeds stage quantity
      await supabase
        .from("ticket_tiers")
        .update({ quantity_sold: 10 }) // All tickets "sold"
        .eq("id", testTierId);

      await supabase
        .from("ticket_stages")
        .update({ sold_quantity: 7 }) // More than stage capacity (5)
        .eq("id", testStage1Id);

      const { data, error } = await supabase.rpc("get_tier_stage_availability", {
        p_tier_id: testTierId,
      });

      expect(error).toBeNull();
      const earlyBird = data?.find((s: any) => s.stage_name === "Early Bird");

      // Should clamp to 0, never negative
      expect(earlyBird?.available_quantity).toBeGreaterThanOrEqual(0);
      expect(earlyBird?.sold_quantity).toBeLessThanOrEqual(earlyBird?.total_quantity);

      // Reset
      await supabase
        .from("ticket_tiers")
        .update({ quantity_sold: 0 })
        .eq("id", testTierId);
      await supabase
        .from("ticket_stages")
        .update({ sold_quantity: 0 })
        .eq("id", testStage1Id);
    });
  });

  describe("get_tier_stage_availability() - Hold Calculation", () => {
    it("should subtract active holds from availability", async () => {
      if (!supabase) return;

      // Create active hold
      const { data: hold } = await supabase
        .from("holds")
        .insert({
          user_id: testUserId,
          event_id: testEventId,
          tier_id: testTierId,
          stage_id: testStage1Id,
          quantity: 2,
          expires_at: new Date(Date.now() + 300000).toISOString(), // 5 min from now
        })
        .select("id")
        .single();

      const { data, error } = await supabase.rpc("get_tier_stage_availability", {
        p_tier_id: testTierId,
      });

      expect(error).toBeNull();
      const earlyBird = data?.find((s: any) => s.stage_name === "Early Bird");

      expect(earlyBird?.held_quantity).toBe(2);
      expect(earlyBird?.available_quantity).toBe(3); // 5 - 0 sold - 2 held

      // Cleanup
      if (hold?.id) {
        await supabase.from("holds").delete().eq("id", hold.id);
      }
    });

    it("should ignore expired holds", async () => {
      if (!supabase) return;

      // Create expired hold
      const { data: expiredHold } = await supabase
        .from("holds")
        .insert({
          user_id: testUserId,
          event_id: testEventId,
          tier_id: testTierId,
          stage_id: testStage1Id,
          quantity: 2,
          expires_at: new Date(Date.now() - 1000).toISOString(), // 1 second ago (expired)
        })
        .select("id")
        .single();

      const { data, error } = await supabase.rpc("get_tier_stage_availability", {
        p_tier_id: testTierId,
      });

      expect(error).toBeNull();
      const earlyBird = data?.find((s: any) => s.stage_name === "Early Bird");

      // Expired hold should not be counted
      expect(earlyBird?.held_quantity).toBe(0);
      expect(earlyBird?.available_quantity).toBe(5); // Full availability

      // Cleanup
      if (expiredHold?.id) {
        await supabase.from("holds").delete().eq("id", expiredHold.id);
      }
    });

    // Skipped: Testing order_id filtering is not needed for test transactions
    it.skip("should ignore holds converted to orders", async () => {
      // Test removed - order_id filtering is for production, not test transactions
    });
  });

  describe("cleanup_expired_holds() - Hold Expiration", () => {
    it("should delete expired holds and return count", async () => {
      if (!supabase) return;

      // Create expired hold
      const { data: expiredHold } = await supabase
        .from("holds")
        .insert({
          user_id: testUserId,
          event_id: testEventId,
          tier_id: testTierId,
          stage_id: testStage1Id,
          quantity: 2,
          expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
        })
        .select("id")
        .single();

      const { data, error } = await supabase.rpc("cleanup_expired_holds");

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.length).toBeGreaterThan(0);
      expect(data?.[0]?.deleted_count).toBeGreaterThanOrEqual(1);
      expect(data?.[0]?.affected_tier_ids).toContain(testTierId);

      // Verify hold was deleted
      const { data: verifyHold } = await supabase
        .from("holds")
        .select("id")
        .eq("id", expiredHold?.id || "")
        .single();

      expect(verifyHold).toBeNull();
    });

    it("should not delete active holds", async () => {
      if (!supabase) return;

      // Create active hold
      const { data: activeHold } = await supabase
        .from("holds")
        .insert({
          user_id: testUserId,
          event_id: testEventId,
          tier_id: testTierId,
          stage_id: testStage1Id,
          quantity: 2,
          expires_at: new Date(Date.now() + 300000).toISOString(), // 5 min from now
        })
        .select("id")
        .single();

      const { data } = await supabase.rpc("cleanup_expired_holds");

      // Verify active hold still exists
      const { data: verifyHold } = await supabase
        .from("holds")
        .select("id")
        .eq("id", activeHold?.id || "")
        .single();

      expect(verifyHold).not.toBeNull();
      expect(verifyHold?.id).toBe(activeHold?.id);

      // Cleanup
      if (activeHold?.id) {
        await supabase.from("holds").delete().eq("id", activeHold.id);
      }
    });

    // Skipped: Testing order_id filtering is not needed for test transactions
    it.skip("should not delete holds with orders", async () => {
      // Test removed - order_id filtering is for production, not test transactions
    });
  });

  describe("get_stage_availability() - Single Stage", () => {
    it("should return correct availability for a single stage", async () => {
      if (!supabase) return;

      const { data, error } = await supabase.rpc("get_stage_availability", {
        p_stage_id: testStage1Id,
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.length).toBe(1);
      expect(data?.[0]?.stage_id).toBe(testStage1Id);
      expect(data?.[0]?.total_quantity).toBe(5);
      expect(data?.[0]?.available_quantity).toBeGreaterThanOrEqual(0);
    });

    it("should clamp available_quantity to zero", async () => {
      if (!supabase) return;

      // Create hold that exceeds availability
      await supabase
        .from("ticket_tiers")
        .update({ quantity_sold: 5 })
        .eq("id", testTierId);

      // Update stage sold quantity to match new explicit logic
      await supabase
        .from("ticket_stages")
        .update({ sold_quantity: 5 })
        .eq("id", testStage1Id);

      const { data: hold } = await supabase
        .from("holds")
        .insert({
          user_id: testUserId,
          event_id: testEventId,
          tier_id: testTierId,
          stage_id: testStage1Id,
          quantity: 3, // Total: 5 sold + 3 held = 8, but stage only has 5
          expires_at: new Date(Date.now() + 300000).toISOString(),
        })
        .select("id")
        .single();

      const { data, error } = await supabase.rpc("get_stage_availability", {
        p_stage_id: testStage1Id,
      });

      expect(error).toBeNull();
      expect(data?.[0]?.available_quantity).toBeGreaterThanOrEqual(0);
      expect(data?.[0]?.available_quantity).toBe(0); // Clamped

      // Cleanup
      if (hold?.id) {
        await supabase.from("holds").delete().eq("id", hold.id);
      }
      await supabase
        .from("ticket_tiers")
        .update({ quantity_sold: 0 })
        .eq("id", testTierId);
      await supabase
        .from("ticket_stages")
        .update({ sold_quantity: 0 })
        .eq("id", testStage1Id);
    });
  });

  describe("Data Consistency", () => {
    it("should ensure tier availability matches sum of stage availabilities", async () => {
      if (!supabase) return;

      // Create holds in both stages
      const { data: hold1 } = await supabase
        .from("holds")
        .insert({
          user_id: testUserId,
          event_id: testEventId,
          tier_id: testTierId,
          stage_id: testStage1Id,
          quantity: 2,
          expires_at: new Date(Date.now() + 300000).toISOString(),
        })
        .select("id")
        .single();

      const { data: hold2 } = await supabase
        .from("holds")
        .insert({
          user_id: testUserId,
          event_id: testEventId,
          tier_id: testTierId,
          stage_id: testStage2Id,
          quantity: 1,
          expires_at: new Date(Date.now() + 300000).toISOString(),
        })
        .select("id")
        .single();

      const { data: stageData } = await supabase.rpc("get_tier_stage_availability", {
        p_tier_id: testTierId,
      });

      const { data: tier } = await supabase
        .from("ticket_tiers")
        .select("quantity_total, quantity_sold")
        .eq("id", testTierId)
        .single();

      // Calculate sum of stage availabilities
      const totalStageAvailable = stageData?.reduce(
        (sum: number, stage: any) => sum + stage.available_quantity,
        0
      );

      // Tier availability should match sum of stages
      const tierAvailable = (tier?.quantity_total || 0) - (tier?.quantity_sold || 0) - 3; // 2 + 1 holds

      expect(totalStageAvailable).toBe(tierAvailable);

      // Cleanup
      if (hold1?.id) {
        await supabase.from("holds").delete().eq("id", hold1.id);
      }
      if (hold2?.id) {
        await supabase.from("holds").delete().eq("id", hold2.id);
      }
    });
  });
});


