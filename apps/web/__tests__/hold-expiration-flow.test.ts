/**
 * Integration Tests: Hold Expiration & Availability Flow
 *
 * Tests the complete flow of:
 * - Hold creation → expiration → cleanup → availability update
 * - Real-time availability updates after hold expiration
 * - Stage progression when holds expire
 * - Payment protection during hold period
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { cleanupOrphanedTestData } from "./utils/test-data-cleanup";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

describe("Hold Expiration & Availability Flow", () => {
  let testTierId: string;
  let testEventId: string;
  let testStage1Id: string;
  let testUserId: string;
  let testOrgId: string;

  beforeAll(async () => {
    if (!supabase) return;

    // Clean up any orphaned test data from previous runs
    await cleanupOrphanedTestData(supabase);

    // Setup test data (similar to previous tests)
    const { data: user } = await supabase
      .from("users")
      .insert({
        clerk_id: `test-clerk-${Date.now()}`,
        email: `test-${Date.now()}@example.com`,
      })
      .select("id")
      .single();

    testUserId = user?.id || "";

    const { data: org } = await supabase
      .from("organizations")
      .insert({
        name: `Test Org ${Date.now()}`,
        slug: `test-org-${Date.now()}`,
        owner_user_id: testUserId, // Required field
      })
      .select("id")
      .single();

    testOrgId = org?.id || "";

    // Create test event (using 'draft' to prevent public visibility)
    const { data: event } = await supabase
      .from("events")
      .insert({
        organization_id: org?.id,
        name: `Test Event ${Date.now()}`,
        slug: `test-event-${Date.now()}`,
        city: "Test City",
        venue: "Test Venue",
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        ends_at: new Date(Date.now() + 90000000).toISOString(),
        description: "Test event",
        status: "draft", // Use draft to prevent appearing on public event listings
        requires_rsvp: false,
      })
      .select("id")
      .single();

    testEventId = event?.id || "";

    const { data: tier } = await supabase
      .from("ticket_tiers")
      .insert({
        event_id: testEventId,
        name: "Test Tier",
        price_cents: 2000,
        quantity_total: 10,
        quantity_sold: 0,
        sales_start: new Date(Date.now() - 86400000).toISOString(), // Yesterday (sales started)
        sales_end: new Date(Date.now() + 86400000).toISOString(), // Tomorrow (sales end)
      })
      .select("id")
      .single();

    testTierId = tier?.id || "";

    const { data: stage1 } = await supabase
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

    testStage1Id = stage1?.id || "";
  });

  afterAll(async () => {
    if (!supabase) return;

    if (testTierId) {
      await supabase
        .from("ticket_stages")
        .delete()
        .eq("ticket_tier_id", testTierId);
      await supabase.from("holds").delete().eq("tier_id", testTierId);
      await supabase.from("ticket_tiers").delete().eq("id", testTierId);
    }
    if (testEventId) {
      await supabase.from("events").delete().eq("id", testEventId);
    }
    if (testOrgId) {
      await supabase.from("organizations").delete().eq("id", testOrgId);
    }
    if (testUserId) {
      await supabase.from("users").delete().eq("id", testUserId);
    }
  });

  describe("Hold Creation → Expiration → Cleanup Flow", () => {
    it("should show reduced availability when hold is created", async () => {
      if (!supabase) return;

      // Create hold
      const { data: hold } = await supabase
        .from("holds")
        .insert({
          user_id: testUserId,
          event_id: testEventId,
          tier_id: testTierId,
          stage_id: testStage1Id,
          quantity: 2,
          expires_at: new Date(Date.now() + 300000).toISOString(), // 5 min
        })
        .select("id")
        .single();

      // Check availability
      const { data: availability } = await supabase.rpc(
        "get_tier_stage_availability",
        {
          p_tier_id: testTierId,
        }
      );

      const stage = availability?.find((s: any) => s.stage_id === testStage1Id);
      // NOTE: holds are now subtracted from available_quantity inside the RPC for display
      // but held_quantity is still returned separately
      expect(stage?.held_quantity).toBe(2);
      expect(stage?.available_quantity).toBe(3); // 5 - 2

      // Cleanup
      if (hold?.id) {
        await supabase.from("holds").delete().eq("id", hold.id);
      }
    });

    it("should restore availability when hold expires and is cleaned up", async () => {
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

      // Check availability before cleanup (should still show hold)
      const { data: beforeCleanup } = await supabase.rpc(
        "get_tier_stage_availability",
        {
          p_tier_id: testTierId,
        }
      );

      const stageBefore = beforeCleanup?.find(
        (s: any) => s.stage_id === testStage1Id
      );
      // Note: Function might still count expired holds if cleanup hasn't run
      // This is expected - cleanup needs to be called explicitly

      // Run cleanup
      await supabase.rpc("cleanup_expired_holds");

      // Check availability after cleanup
      const { data: afterCleanup } = await supabase.rpc(
        "get_tier_stage_availability",
        {
          p_tier_id: testTierId,
        }
      );

      const stageAfter = afterCleanup?.find(
        (s: any) => s.stage_id === testStage1Id
      );
      expect(stageAfter?.held_quantity).toBe(0);
      expect(stageAfter?.available_quantity).toBe(5); // Full availability restored

      // Cleanup
      if (expiredHold?.id) {
        await supabase.from("holds").delete().eq("id", expiredHold.id);
      }
    });

    it("should progress to next stage when previous stage sells out", async () => {
      if (!supabase) return;

      // Setup: Create Stage 2 to test progression
      const { data: stage2 } = await supabase
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

      const testStage2Id = stage2?.id || "";

      // Sell all tickets in Stage 1 (5 total - 5 sold - 0 held = 0 available)
      await supabase
        .from("ticket_tiers")
        .update({ quantity_sold: 5 })
        .eq("id", testTierId);

      await supabase
        .from("ticket_stages")
        .update({ sold_quantity: 5 })
        .eq("id", testStage1Id);

      const { data: availability } = await supabase.rpc(
        "get_tier_stage_availability",
        {
          p_tier_id: testTierId,
        }
      );

      const stage1 = availability?.find(
        (s: any) => s.stage_id === testStage1Id
      );
      const stage2Result = availability?.find(
        (s: any) => s.stage_id === testStage2Id
      );

      // Assert: Stage 1 is sold out and not current
      expect(stage1?.available_quantity).toBe(0);
      expect(stage1?.is_current_stage).toBe(false);

      // Assert: Stage 2 becomes current when Stage 1 sells out
      expect(stage2Result?.available_quantity).toBe(5);
      expect(stage2Result?.is_current_stage).toBe(true);

      // Cleanup
      await supabase
        .from("ticket_tiers")
        .update({ quantity_sold: 0 })
        .eq("id", testTierId);
      await supabase
        .from("ticket_stages")
        .update({ sold_quantity: 0 })
        .eq("id", testStage1Id);
      if (testStage2Id) {
        await supabase.from("ticket_stages").delete().eq("id", testStage2Id);
      }
    });
  });

  describe("Payment Protection", () => {
    it("should prevent hold deletion during payment flow", async () => {
      if (!supabase) return;

      // Create hold with payment_in_progress flag
      // Note: payment_started_at is required when payment_in_progress = TRUE
      const { data: hold } = await supabase
        .from("holds")
        .insert({
          user_id: testUserId,
          event_id: testEventId,
          tier_id: testTierId,
          stage_id: testStage1Id,
          quantity: 2,
          expires_at: new Date(Date.now() - 1000).toISOString(), // Expired hold
          payment_in_progress: true, // Protected
          payment_started_at: new Date().toISOString(), // Required when payment_in_progress = TRUE
        })
        .select("id")
        .single();

      // Attempt to cleanup (should not delete protected holds)
      const { data: cleanupResult } = await supabase.rpc(
        "cleanup_expired_holds"
      );

      // Verify hold still exists
      const { data: verifyHold } = await supabase
        .from("holds")
        .select("id, payment_in_progress")
        .eq("id", hold?.id || "")
        .single();

      expect(verifyHold).not.toBeNull();
      expect(verifyHold?.payment_in_progress).toBe(true);

      // Cleanup
      if (hold?.id) {
        await supabase.from("holds").delete().eq("id", hold.id);
      }
    });
  });
});
