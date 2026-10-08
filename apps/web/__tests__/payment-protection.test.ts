/**
 * Payment Protection Tests
 * 
 * Tests that holds are protected during payment flow:
 * - Holds with payment_in_progress=true are not deleted
 * - Expired holds without payment protection are cleaned up
 * - Payment protection prevents stuck transactions
 * - Hold expiration respects payment_in_progress flag
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { cleanupOrphanedTestData } from "./utils/test-data-cleanup";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

describe("Payment Protection for Holds", () => {
  let testTierId: string;
  let testEventId: string;
  let testStage1Id: string;
  let testUserId: string;
  let testOrgId: string;
  let testEventOrgId: string;

  beforeAll(async () => {
    if (!supabase) {
      throw new Error("Supabase client not initialized. Check environment variables.");
    }

    // Clean up any orphaned test data from previous runs
    await cleanupOrphanedTestData(supabase);

    // Create test user
    const { data: user, error: userError } = await supabase
      .from("users")
      .insert({
        clerk_id: `test-clerk-${Date.now()}`,
        email: `test-${Date.now()}@example.com`,
      })
      .select("id")
      .single();

    if (userError || !user?.id) {
      throw new Error(`Failed to create test user: ${userError?.message || "Unknown error"}`);
    }
    testUserId = user.id;

    // Create test organization
    const uniqueId = crypto.randomUUID();
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({
        name: `Test Org ${Date.now()}`,
        slug: `test-org-${uniqueId}`,
        owner_user_id: testUserId,
      })
      .select("id")
      .single();

    if (orgError || !org?.id) {
      throw new Error(`Failed to create test organization: ${orgError?.message || "Unknown error"}`);
    }
    testOrgId = org.id;

    // Create test event (using 'draft' to prevent public visibility)
    const eventUniqueId = crypto.randomUUID();
    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        organization_id: testOrgId,
        name: `Test Event ${Date.now()}`,
        slug: `test-event-${eventUniqueId}`,
        city: "Test City",
        venue: "Test Venue",
        starts_at: new Date(Date.now() + 86400000).toISOString(),
        ends_at: new Date(Date.now() + 90000000).toISOString(),
        description: "Test event",
        status: "draft", // Use draft to prevent appearing on public event listings
        requires_rsvp: false,
      })
      .select("id, organization_id")
      .single();

    if (eventError || !event?.id) {
      throw new Error(`Failed to create test event: ${eventError?.message || "Unknown error"}`);
    }
    testEventId = event.id;
    testEventOrgId = event.organization_id || "";

    // Create test tier
    const { data: tier, error: tierError } = await supabase
      .from("ticket_tiers")
      .insert({
        event_id: testEventId,
        name: "Test Tier",
        price_cents: 2000,
        quantity_total: 10,
        quantity_sold: 0,
        sales_start: new Date(Date.now() - 86400000).toISOString(),
        sales_end: new Date(Date.now() + 86400000).toISOString(),
      })
      .select("id")
      .single();

    if (tierError || !tier?.id) {
      throw new Error(`Failed to create test tier: ${tierError?.message || "Unknown error"}`);
    }
    testTierId = tier.id;

    // Create test stage
    const { data: stage1, error: stageError } = await supabase
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

    if (stageError || !stage1?.id) {
      throw new Error(`Failed to create test stage: ${stageError?.message || "Unknown error"}`);
    }
    testStage1Id = stage1.id;
  });

  afterAll(async () => {
    if (!supabase) return;

    if (testTierId) {
      await supabase.from("ticket_stages").delete().eq("ticket_tier_id", testTierId);
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

  describe("cleanup_expired_holds() - Payment Protection", () => {
    it("should NOT delete expired holds with payment_in_progress=true (within 15min grace period)", async () => {
      if (!supabase || !testUserId || !testEventId || !testTierId || !testStage1Id) {
        throw new Error("Test setup incomplete. Check beforeAll hook.");
      }

      // Create expired hold with payment protection (within 15min grace period)
      const { data: protectedHold, error: holdError } = await supabase
        .from("holds")
        .insert({
          user_id: testUserId,
          event_id: testEventId,
          tier_id: testTierId,
          stage_id: testStage1Id,
          quantity: 2,
          expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
          payment_in_progress: true,
          payment_started_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago (within 15min grace)
          datafast_checkout_id: "test-checkout-123",
        })
        .select("id")
        .single();

      if (holdError || !protectedHold?.id) {
        throw new Error(`Failed to create protected hold: ${holdError?.message || "Unknown error"}`);
      }

      // Run cleanup
      const { data: cleanupResult } = await supabase.rpc("cleanup_expired_holds");

      // Verify protected hold still exists (within grace period)
      const { data: verifyHold } = await supabase
        .from("holds")
        .select("id, payment_in_progress")
        .eq("id", protectedHold.id)
        .single();

      expect(verifyHold).not.toBeNull();
      expect(verifyHold?.payment_in_progress).toBe(true);

      // Cleanup
      if (protectedHold?.id) {
        await supabase.from("holds").delete().eq("id", protectedHold.id);
      }
    });

    it("should delete expired holds with payment_in_progress=true after 15min grace period", async () => {
      if (!supabase) return;

      // Create expired hold with payment protection (beyond 15min grace period)
      const { data: oldProtectedHold } = await supabase
        .from("holds")
        .insert({
          user_id: testUserId,
          event_id: testEventId,
          tier_id: testTierId,
          stage_id: testStage1Id,
          quantity: 2,
          expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
          payment_in_progress: true,
          payment_started_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 min ago (beyond 15min grace)
          datafast_checkout_id: "test-checkout-456",
        })
        .select("id")
        .single();

      // Run cleanup
      const { data: cleanupResult } = await supabase.rpc("cleanup_expired_holds");

      // Verify old protected hold was deleted (beyond grace period)
      const { data: verifyHold } = await supabase
        .from("holds")
        .select("id")
        .eq("id", oldProtectedHold?.id || "")
        .maybeSingle();

      expect(verifyHold).toBeNull();
    });

    it("should delete expired holds without payment protection", async () => {
      if (!supabase) return;

      // Create expired hold WITHOUT payment protection
      const { data: unprotectedHold } = await supabase
        .from("holds")
        .insert({
          user_id: testUserId,
          event_id: testEventId,
          tier_id: testTierId,
          stage_id: testStage1Id,
          quantity: 2,
          expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
          payment_in_progress: false, // Not protected
        })
        .select("id")
        .single();

      // Run cleanup
      const { data: cleanupResult } = await supabase.rpc("cleanup_expired_holds");

      // Verify unprotected hold was deleted
      const { data: verifyHold } = await supabase
        .from("holds")
        .select("id")
        .eq("id", unprotectedHold?.id || "")
        .maybeSingle();

      expect(verifyHold).toBeNull();
    });

    it("should delete expired holds with payment_in_progress=false explicitly", async () => {
      if (!supabase || !testUserId || !testEventId || !testTierId || !testStage1Id) {
        throw new Error("Test setup incomplete. Check beforeAll hook.");
      }

      const { data: hold } = await supabase
        .from("holds")
        .insert({
          user_id: testUserId,
          event_id: testEventId,
          tier_id: testTierId,
          stage_id: testStage1Id,
          quantity: 2,
          expires_at: new Date(Date.now() - 1000).toISOString(),
          payment_in_progress: false,
        })
        .select("id")
        .single();

      await supabase.rpc("cleanup_expired_holds");

      const { data: verifyHold } = await supabase
        .from("holds")
        .select("id")
        .eq("id", hold?.id || "")
        .maybeSingle();

      expect(verifyHold).toBeNull();
    });
  });

  describe("Payment Flow Protection", () => {
    it("should protect hold during entire payment flow", async () => {
      if (!supabase || !testUserId || !testEventId || !testTierId || !testStage1Id) {
        throw new Error("Test setup incomplete. Check beforeAll hook.");
      }

      // Simulate payment flow:
      // 1. Create hold
      const { data: hold, error: holdError } = await supabase
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

      if (holdError || !hold?.id) {
        throw new Error(`Failed to create hold: ${holdError?.message || "Unknown error"}`);
      }

      // 2. Start payment (set protection)
      await supabase
        .from("holds")
        .update({
          payment_in_progress: true,
          payment_started_at: new Date().toISOString(),
          datafast_checkout_id: "checkout-456",
        })
        .eq("id", hold.id);

      // 3. Hold expires during payment
      await supabase
        .from("holds")
        .update({
          expires_at: new Date(Date.now() - 1000).toISOString(), // Now expired
        })
        .eq("id", hold.id);

      // 4. Cleanup runs (should NOT delete protected hold)
      await supabase.rpc("cleanup_expired_holds");

      // 5. Verify hold still exists
      const { data: verifyHold } = await supabase
        .from("holds")
        .select("id, payment_in_progress, datafast_checkout_id")
        .eq("id", hold.id)
        .single();

      expect(verifyHold).not.toBeNull();
      expect(verifyHold?.payment_in_progress).toBe(true);
      expect(verifyHold?.datafast_checkout_id).toBe("checkout-456");

      // Cleanup
      if (hold?.id) {
        await supabase.from("holds").delete().eq("id", hold.id);
      }
    });

    it("should allow cleanup after payment completes", async () => {
      if (!supabase || !testUserId || !testEventId || !testTierId || !testStage1Id) {
        throw new Error("Test setup incomplete. Check beforeAll hook.");
      }

      // Create hold with completed payment (order_id set)
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: testUserId,
          organization_id: testEventOrgId,
          event_id: testEventId,
          ticket_tier_id: testTierId,
          quantity: 2,
          unit_price_cents: 1000,
          subtotal_cents: 2000,
          fees_cents: 0,
          total_cents: 2000,
          total_amount_cents: 2000,
          processing_fee_cents: 0,
          status: "completed",
          payment_method: "test",
          idempotency_key: crypto.randomUUID(),
        })
        .select("id")
        .single();

      if (orderError || !order?.id) {
        throw new Error(`Failed to create order for test: ${orderError?.message || "Unknown error"}`);
      }

      const { data: hold } = await supabase
        .from("holds")
        .insert({
          user_id: testUserId,
          event_id: testEventId,
          tier_id: testTierId,
          stage_id: testStage1Id,
          quantity: 2,
          expires_at: new Date(Date.now() - 1000).toISOString(),
          payment_in_progress: true,
          payment_started_at: new Date(Date.now() - 5000).toISOString(),
          order_id: order.id, // Payment completed
        })
        .select("id")
        .single();

      if (!hold?.id) {
        throw new Error("Failed to create hold for test");
      }

      // Cleanup should not delete (has order_id, not because of payment_in_progress)
      // But cleanup_expired_holds only deletes holds with order_id IS NULL
      const { data: cleanupResult } = await supabase.rpc("cleanup_expired_holds");

      // Hold should still exist (has order_id)
      const { data: verifyHold } = await supabase
        .from("holds")
        .select("id, order_id")
        .eq("id", hold.id)
        .single();

      expect(verifyHold).not.toBeNull();
      expect(verifyHold?.order_id).toBe(order.id);

      // Cleanup
      if (hold?.id) {
        await supabase.from("holds").delete().eq("id", hold.id);
      }
      if (order?.id) {
        await supabase.from("orders").delete().eq("id", order.id);
      }
    });
  });
});

