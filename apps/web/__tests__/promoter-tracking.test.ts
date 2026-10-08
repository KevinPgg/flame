/**
 * Integration Tests: Promoter Link Tracking & Revenue Attribution
 *
 * Tests the complete flow of:
 * - Promoter link creation by organizers
 * - Promoter code capture from URL parameters
 * - Promoter code persistence through purchase flow
 * - Revenue attribution to promoter links
 * - Stage pricing compatibility with promoter tracking
 * - Promoter statistics calculation
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { cleanupOrphanedTestData } from "./utils/test-data-cleanup";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

describe("Promoter Link Tracking & Revenue Attribution", () => {
  let testUserId: string;
  let testOrgId: string;
  let testEventId: string;
  let testTierId: string;
  let testStage1Id: string;
  let testStage2Id: string;
  let testPromoterLink1Id: string;
  let testPromoterLink2Id: string;

  beforeAll(async () => {
    if (!supabase) {
      console.warn("Supabase client not initialized - skipping tests");
      return;
    }

    // Clean up any orphaned test data from previous runs
    await cleanupOrphanedTestData(supabase);

    console.log("Setting up test data for promoter tracking tests...");

    try {
      // Create test user
      const { data: user, error: userError } = await supabase
        .from("users")
        .insert({
          clerk_id: `test-promoter-clerk-${Date.now()}`,
          email: `test-promoter-${Date.now()}@example.com`,
          first_name: "Test",
          last_name: "User",
          document_type: "IDCARD",
          document_id: "1234567890",
        })
        .select("id")
        .single();

      if (userError || !user?.id) {
        throw new Error(
          `Failed to create test user: ${userError?.message || "No user ID returned"}`
        );
      }
      testUserId = user.id;

      // Create test organization
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({
          name: `Test Org Promoter ${Date.now()}`,
          slug: `test-org-promoter-${Date.now()}`,
          owner_user_id: testUserId,
        })
        .select("id")
        .single();

      if (orgError || !org?.id) {
        throw new Error(
          `Failed to create test organization: ${orgError?.message || "No org ID returned"}`
        );
      }
      testOrgId = org.id;

      // Create test event (using 'draft' to prevent public visibility)
      const { data: event, error: eventError } = await supabase
        .from("events")
        .insert({
          organization_id: testOrgId,
          name: `Test Event Promoter ${Date.now()}`,
          slug: `test-event-promoter-${Date.now()}`,
          city: "Test City",
          venue: "Test Venue",
          starts_at: new Date(Date.now() + 86400000).toISOString(),
          ends_at: new Date(Date.now() + 90000000).toISOString(),
          description: "Test event for promoter tracking",
          status: "draft", // Use draft to prevent appearing on public event listings
          requires_rsvp: false,
        })
        .select("id")
        .single();

      if (eventError || !event?.id) {
        throw new Error(
          `Failed to create test event: ${eventError?.message || "No event ID returned"}`
        );
      }
      testEventId = event.id;

      // Create ticket tier with stages
      const { data: tier, error: tierError } = await supabase
        .from("ticket_tiers")
        .insert({
          event_id: testEventId,
          name: "General Admission",
          price_cents: 3000,
          quantity_total: 100,
          quantity_sold: 0,
          per_user_limit: 10,
          sales_start: new Date(Date.now() - 86400000).toISOString(),
          sales_end: new Date(Date.now() + 86400000).toISOString(),
        })
        .select("id")
        .single();

      if (tierError || !tier?.id) {
        throw new Error(
          `Failed to create test ticket tier: ${tierError?.message || "No tier ID returned"}`
        );
      }
      testTierId = tier.id;

      // Create stage 1 - Early Bird (lower price)
      const { data: stage1, error: stage1Error } = await supabase
        .from("ticket_stages")
        .insert({
          ticket_tier_id: testTierId,
          name: "Early Bird",
          price_cents: 2000,
          quantity: 50,
          sold_quantity: 0,
          order_index: 0,
        })
        .select("id")
        .single();

      if (stage1Error || !stage1?.id) {
        throw new Error(
          `Failed to create test stage 1 (Early Bird): ${stage1Error?.message || "No stage ID returned"}`
        );
      }
      testStage1Id = stage1.id;

      // Create stage 2 - Regular (higher price)
      const { data: stage2, error: stage2Error } = await supabase
        .from("ticket_stages")
        .insert({
          ticket_tier_id: testTierId,
          name: "Regular",
          price_cents: 3000,
          quantity: 50,
          sold_quantity: 0,
          order_index: 1,
        })
        .select("id")
        .single();

      if (stage2Error || !stage2?.id) {
        throw new Error(
          `Failed to create test stage 2 (Regular): ${stage2Error?.message || "No stage ID returned"}`
        );
      }
      testStage2Id = stage2.id;

      // Create promoter links
      const { data: link1, error: link1Error } = await supabase
        .from("promoter_links")
        .insert({
          event_id: testEventId,
          promoter_code: "PROMOTER1",
          promoter_name: "First Promoter",
          created_by: testUserId,
        })
        .select("id")
        .single();

      if (link1Error || !link1?.id) {
        throw new Error(
          `Failed to create promoter link 1: ${link1Error?.message || "No link ID returned"}`
        );
      }
      testPromoterLink1Id = link1.id;

      const { data: link2, error: link2Error } = await supabase
        .from("promoter_links")
        .insert({
          event_id: testEventId,
          promoter_code: "PROMOTER2",
          promoter_name: "Second Promoter",
          created_by: testUserId,
        })
        .select("id")
        .single();

      if (link2Error || !link2?.id) {
        throw new Error(
          `Failed to create promoter link 2: ${link2Error?.message || "No link ID returned"}`
        );
      }
      testPromoterLink2Id = link2.id;

      console.log("Test data setup complete:", {
        testUserId,
        testOrgId,
        testEventId,
        testTierId,
        testStage1Id,
        testStage2Id,
        testPromoterLink1Id,
        testPromoterLink2Id,
      });
    } catch (error) {
      console.error("❌ Test setup failed:", error);
      // Attempt cleanup of any partially created data
      if (testUserId) {
        await supabase.from("users").delete().eq("id", testUserId);
      }
      throw error; // Re-throw to fail the test suite
    }
  });

  afterAll(async () => {
    if (!supabase) return;

    console.log("Cleaning up test data...");

    // Delete in correct order to respect foreign key constraints
    // Log errors but don't fail the cleanup process
    if (testPromoterLink1Id) {
      const { error } = await supabase
        .from("promoter_links")
        .delete()
        .eq("id", testPromoterLink1Id);
      if (error) {
        console.error("⚠️ Failed to delete promoter link 1:", error.message);
      }
    }
    if (testPromoterLink2Id) {
      const { error } = await supabase
        .from("promoter_links")
        .delete()
        .eq("id", testPromoterLink2Id);
      if (error) {
        console.error("⚠️ Failed to delete promoter link 2:", error.message);
      }
    }
    if (testTierId) {
      // Delete orders first
      const { error: ordersError } = await supabase
        .from("orders")
        .delete()
        .eq("ticket_tier_id", testTierId);
      if (ordersError) {
        console.error("⚠️ Failed to delete test orders:", ordersError.message);
      }

      // Delete holds
      const { error: holdsError } = await supabase
        .from("holds")
        .delete()
        .eq("tier_id", testTierId);
      if (holdsError) {
        console.error("⚠️ Failed to delete test holds:", holdsError.message);
      }

      // Delete stages
      const { error: stagesError } = await supabase
        .from("ticket_stages")
        .delete()
        .eq("ticket_tier_id", testTierId);
      if (stagesError) {
        console.error("⚠️ Failed to delete test stages:", stagesError.message);
      }

      // Delete tier
      const { error: tierError } = await supabase
        .from("ticket_tiers")
        .delete()
        .eq("id", testTierId);
      if (tierError) {
        console.error("⚠️ Failed to delete test tier:", tierError.message);
      }
    }
    if (testEventId) {
      const { error } = await supabase
        .from("events")
        .delete()
        .eq("id", testEventId);
      if (error) {
        console.error("⚠️ Failed to delete test event:", error.message);
      }
    }
    if (testOrgId) {
      const { error } = await supabase
        .from("organizations")
        .delete()
        .eq("id", testOrgId);
      if (error) {
        console.error("⚠️ Failed to delete test organization:", error.message);
      }
    }
    if (testUserId) {
      const { error } = await supabase
        .from("users")
        .delete()
        .eq("id", testUserId);
      if (error) {
        console.error("⚠️ Failed to delete test user:", error.message);
      }
    }

    console.log("Test data cleanup complete");
  });

  describe("Promoter Link Management", () => {
    it("should create promoter link with valid code", async () => {
      if (!supabase) return;

      const { data: link, error } = await supabase
        .from("promoter_links")
        .insert({
          event_id: testEventId,
          promoter_code: "TESTCODE123",
          promoter_name: "Test Promoter",
          created_by: testUserId,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(link).toBeDefined();
      expect(link?.promoter_code).toBe("TESTCODE123");
      expect(link?.promoter_name).toBe("Test Promoter");

      // Cleanup
      if (link?.id) {
        await supabase.from("promoter_links").delete().eq("id", link.id);
      }
    });

    it("should prevent duplicate promoter codes for same event", async () => {
      if (!supabase) return;

      // Try to create link with existing code
      const { error } = await supabase
        .from("promoter_links")
        .insert({
          event_id: testEventId,
          promoter_code: "PROMOTER1", // Already exists for this event
          promoter_name: "Duplicate Promoter",
          created_by: testUserId,
        });

      // Should fail due to unique constraint
      expect(error).not.toBeNull();
      expect(error?.code).toBe("23505"); // PostgreSQL unique violation
    });

    it("should allow same promoter code for different events", async () => {
      if (!supabase) return;

      // Create another event (using 'draft' to prevent public visibility)
      const { data: event2 } = await supabase
        .from("events")
        .insert({
          organization_id: testOrgId,
          name: `Test Event Another ${Date.now()}`,
          slug: `test-event-another-${Date.now()}`,
          city: "Test City",
          venue: "Test Venue",
          starts_at: new Date(Date.now() + 86400000).toISOString(),
          ends_at: new Date(Date.now() + 90000000).toISOString(),
          description: "Another test event",
          status: "draft", // Use draft to prevent appearing on public event listings
          requires_rsvp: false,
        })
        .select("id")
        .single();

      // Create link with same code but different event
      const { data: link, error } = await supabase
        .from("promoter_links")
        .insert({
          event_id: event2?.id,
          promoter_code: "PROMOTER1", // Same as existing, but different event
          promoter_name: "Same Code Different Event",
          created_by: testUserId,
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(link).toBeDefined();

      // Cleanup
      if (link?.id) {
        await supabase.from("promoter_links").delete().eq("id", link.id);
      }
      if (event2?.id) {
        await supabase.from("events").delete().eq("id", event2.id);
      }
    });
  });

  describe("Promoter Code Tracking in Orders", () => {
    it("should store promoter code when order is created", async () => {
      if (!supabase) return;

      // Create a test order with promoter code
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          user_id: testUserId,
          organization_id: testOrgId,
          event_id: testEventId,
          ticket_tier_id: testTierId,
          quantity: 2,
          unit_price_cents: 2000,
          subtotal_cents: 4000,
          fees_cents: 0,
          total_cents: 4000,
          total_amount_cents: 4000,
          processing_fee_cents: 0,
          promoter_code: "PROMOTER1",
          status: "completed",
          payment_method: "test",
          idempotency_key: randomUUID(),
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(order).toBeDefined();
      expect(order?.promoter_code).toBe("PROMOTER1");
      expect(order?.quantity).toBe(2);
      expect(order?.unit_price_cents).toBe(2000);

      // Cleanup
      if (order?.id) {
        await supabase.from("orders").delete().eq("id", order.id);
      }
    });

    it("should allow order creation without promoter code", async () => {
      if (!supabase) return;

      // Create order without promoter code
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          user_id: testUserId,
          organization_id: testOrgId,
          event_id: testEventId,
          ticket_tier_id: testTierId,
          quantity: 1,
          unit_price_cents: 2000,
          subtotal_cents: 2000,
          fees_cents: 0,
          total_cents: 2000,
          total_amount_cents: 2000,
          processing_fee_cents: 0,
          promoter_code: null, // No promoter
          status: "completed",
          payment_method: "test",
          idempotency_key: randomUUID(),
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(order).toBeDefined();
      expect(order?.promoter_code).toBeNull();

      // Cleanup
      if (order?.id) {
        await supabase.from("orders").delete().eq("id", order.id);
      }
    });

    it("should accept any promoter code value (no FK constraint)", async () => {
      if (!supabase) return;

      // Create order with promoter code that doesn't exist in promoter_links
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          user_id: testUserId,
          organization_id: testOrgId,
          event_id: testEventId,
          ticket_tier_id: testTierId,
          quantity: 1,
          unit_price_cents: 2000,
          subtotal_cents: 2000,
          fees_cents: 0,
          total_cents: 2000,
          total_amount_cents: 2000,
          processing_fee_cents: 0,
          promoter_code: "RANDOM_CODE_999", // Not in promoter_links
          status: "completed",
          payment_method: "test",
          idempotency_key: randomUUID(),
        })
        .select()
        .single();

      // Should succeed - promoter_code is treated as attribution string
      expect(error).toBeNull();
      expect(order).toBeDefined();
      expect(order?.promoter_code).toBe("RANDOM_CODE_999");

      // Cleanup
      if (order?.id) {
        await supabase.from("orders").delete().eq("id", order.id);
      }
    });
  });

  describe("Promoter Revenue Attribution with Stage Pricing", () => {
    it("should correctly attribute revenue from stage 1 (Early Bird) purchases", async () => {
      if (!supabase) return;

      // Create order at Early Bird price ($20.00)
      const { data: order1 } = await supabase
        .from("orders")
        .insert({
          user_id: testUserId,
          organization_id: testOrgId,
          event_id: testEventId,
          ticket_tier_id: testTierId,
          quantity: 3,
          unit_price_cents: 2000, // Early Bird price
          subtotal_cents: 6000,
          fees_cents: 0,
          total_cents: 6000,
          total_amount_cents: 6000,
          processing_fee_cents: 0,
          promoter_code: "PROMOTER1",
          status: "completed",
          payment_method: "test",
          fee_percentage: 7.0, // Current service fee
          idempotency_key: randomUUID(),
        })
        .select()
        .single();

      // Query orders by promoter code
      const { data: orders } = await supabase
        .from("orders")
        .select("quantity, total_amount_cents, unit_price_cents, promoter_code")
        .eq("event_id", testEventId)
        .eq("promoter_code", "PROMOTER1")
        .eq("status", "completed");

      expect(orders).toBeDefined();
      expect(orders?.length).toBeGreaterThan(0);

      const promoter1Order = orders?.find((o) => o.promoter_code === "PROMOTER1");
      expect(promoter1Order).toBeDefined();
      expect(promoter1Order?.unit_price_cents).toBe(2000);
      expect(promoter1Order?.quantity).toBe(3);
      expect(promoter1Order?.total_amount_cents).toBe(6000);

      // Cleanup
      if (order1?.id) {
        await supabase.from("orders").delete().eq("id", order1.id);
      }
    });

    it("should correctly attribute revenue from stage 2 (Regular) purchases", async () => {
      if (!supabase) return;

      // Simulate stage 1 selling out
      await supabase
        .from("ticket_stages")
        .update({ sold_quantity: 50 })
        .eq("id", testStage1Id);

      await supabase
        .from("ticket_tiers")
        .update({ quantity_sold: 50 })
        .eq("id", testTierId);

      // Create order at Regular price ($30.00)
      const { data: order2 } = await supabase
        .from("orders")
        .insert({
          user_id: testUserId,
          organization_id: testOrgId,
          event_id: testEventId,
          ticket_tier_id: testTierId,
          quantity: 2,
          unit_price_cents: 3000, // Regular price (stage 2)
          subtotal_cents: 6000,
          fees_cents: 0,
          total_cents: 6000,
          total_amount_cents: 6000,
          processing_fee_cents: 0,
          promoter_code: "PROMOTER2",
          status: "completed",
          payment_method: "test",
          fee_percentage: 7.0,
          idempotency_key: randomUUID(),
        })
        .select()
        .single();

      // Query orders by promoter code
      const { data: orders } = await supabase
        .from("orders")
        .select("quantity, total_amount_cents, unit_price_cents, promoter_code")
        .eq("event_id", testEventId)
        .eq("promoter_code", "PROMOTER2")
        .eq("status", "completed");

      expect(orders).toBeDefined();
      const promoter2Order = orders?.find((o) => o.promoter_code === "PROMOTER2");
      expect(promoter2Order).toBeDefined();
      expect(promoter2Order?.unit_price_cents).toBe(3000); // Higher price
      expect(promoter2Order?.quantity).toBe(2);

      // Cleanup
      if (order2?.id) {
        await supabase.from("orders").delete().eq("id", order2.id);
      }

      // Reset stage quantities
      await supabase
        .from("ticket_stages")
        .update({ sold_quantity: 0 })
        .eq("id", testStage1Id);

      await supabase
        .from("ticket_tiers")
        .update({ quantity_sold: 0 })
        .eq("id", testTierId);
    });

    it("should aggregate statistics correctly for multiple orders", async () => {
      if (!supabase) return;

      // Create multiple orders for PROMOTER1
      const order1Data = {
        user_id: testUserId,
        organization_id: testOrgId,
        event_id: testEventId,
        ticket_tier_id: testTierId,
        quantity: 2,
        unit_price_cents: 2000,
        subtotal_cents: 4000,
        fees_cents: 0,
        total_cents: 4000,
        total_amount_cents: 4000,
        processing_fee_cents: 0,
        promoter_code: "PROMOTER1",
        status: "completed",
        payment_method: "test",
        fee_percentage: 7.0,
        idempotency_key: randomUUID(),
      };

      const order2Data = {
        ...order1Data,
        quantity: 3,
        subtotal_cents: 6000,
        total_cents: 6000,
        total_amount_cents: 6000,
        idempotency_key: randomUUID(),
      };

      const { data: orders } = await supabase
        .from("orders")
        .insert([order1Data, order2Data])
        .select();

      // Query aggregated stats
      const { data: allOrders } = await supabase
        .from("orders")
        .select("quantity, total_amount_cents")
        .eq("event_id", testEventId)
        .eq("promoter_code", "PROMOTER1")
        .eq("status", "completed");

      const totalTickets = allOrders?.reduce((sum, o) => sum + o.quantity, 0) || 0;
      const totalRevenue =
        allOrders?.reduce((sum, o) => sum + o.total_amount_cents, 0) || 0;

      expect(totalTickets).toBeGreaterThanOrEqual(5); // At least 2 + 3 = 5
      expect(totalRevenue).toBeGreaterThanOrEqual(10000); // At least 4000 + 6000 = 10000

      // Cleanup
      if (orders) {
        for (const order of orders) {
          await supabase.from("orders").delete().eq("id", order.id);
        }
      }
    });
  });

  describe("Database Schema Flexibility", () => {
    it("should accept lowercase promoter codes in database", async () => {
      if (!supabase) return;

      // Create order with lowercase promoter code directly in DB
      // Note: This tests that the database schema is flexible and doesn't enforce
      // uppercase at the DB level. The API layer handles normalization to uppercase
      // via validateAndNormalizePromoterCode() before insertion.
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          user_id: testUserId,
          organization_id: testOrgId,
          event_id: testEventId,
          ticket_tier_id: testTierId,
          quantity: 1,
          unit_price_cents: 2000,
          subtotal_cents: 2000,
          fees_cents: 0,
          total_cents: 2000,
          total_amount_cents: 2000,
          processing_fee_cents: 0,
          promoter_code: "lowercase123", // Database accepts any case
          status: "completed",
          payment_method: "test",
          idempotency_key: randomUUID(),
        })
        .select()
        .single();

      // Verify database accepts lowercase without constraint violation
      expect(error).toBeNull();
      expect(order).toBeDefined();
      expect(order?.promoter_code).toBe("lowercase123"); // Stored as-is

      // Cleanup
      if (order?.id) {
        await supabase.from("orders").delete().eq("id", order.id);
      }
    });

    it("should accept promoter codes with whitespace in database", async () => {
      if (!supabase) return;

      // Create order with whitespace directly in DB
      // Note: This tests that the database schema is flexible and doesn't enforce
      // trimming at the DB level. The API layer handles trimming via
      // validateAndNormalizePromoterCode() before insertion.
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          user_id: testUserId,
          organization_id: testOrgId,
          event_id: testEventId,
          ticket_tier_id: testTierId,
          quantity: 1,
          unit_price_cents: 2000,
          subtotal_cents: 2000,
          fees_cents: 0,
          total_cents: 2000,
          total_amount_cents: 2000,
          processing_fee_cents: 0,
          promoter_code: "  SPACED123  ", // Database accepts whitespace
          status: "completed",
          payment_method: "test",
          idempotency_key: randomUUID(),
        })
        .select()
        .single();

      // Verify database accepts whitespace without constraint violation
      expect(error).toBeNull();
      expect(order).toBeDefined();
      expect(order?.promoter_code).toBe("  SPACED123  "); // Stored as-is

      // Cleanup
      if (order?.id) {
        await supabase.from("orders").delete().eq("id", order.id);
      }
    });
  });

  describe("Historical Data Preservation", () => {
    it("should preserve promoter attribution even if promoter link is deleted", async () => {
      if (!supabase) return;

      // Create a temporary promoter link
      const { data: tempLink } = await supabase
        .from("promoter_links")
        .insert({
          event_id: testEventId,
          promoter_code: "TEMPCODE",
          promoter_name: "Temporary Promoter",
          created_by: testUserId,
        })
        .select()
        .single();

      // Create an order with this promoter code
      const { data: order } = await supabase
        .from("orders")
        .insert({
          user_id: testUserId,
          organization_id: testOrgId,
          event_id: testEventId,
          ticket_tier_id: testTierId,
          quantity: 1,
          unit_price_cents: 2000,
          subtotal_cents: 2000,
          fees_cents: 0,
          total_cents: 2000,
          total_amount_cents: 2000,
          processing_fee_cents: 0,
          promoter_code: "TEMPCODE",
          status: "completed",
          payment_method: "test",
          idempotency_key: randomUUID(),
        })
        .select()
        .single();

      // Delete the promoter link
      if (tempLink?.id) {
        await supabase.from("promoter_links").delete().eq("id", tempLink.id);
      }

      // Verify order still exists with promoter code
      const { data: verifyOrder } = await supabase
        .from("orders")
        .select("promoter_code")
        .eq("id", order?.id)
        .single();

      expect(verifyOrder).toBeDefined();
      expect(verifyOrder?.promoter_code).toBe("TEMPCODE");

      // Cleanup
      if (order?.id) {
        await supabase.from("orders").delete().eq("id", order.id);
      }
    });
  });

  describe("Query Performance", () => {
    it("should efficiently query orders by promoter code using index", async () => {
      if (!supabase) return;

      const startTime = Date.now();

      // Query with indexed column
      const { data: orders } = await supabase
        .from("orders")
        .select("id, quantity, total_amount_cents")
        .eq("event_id", testEventId)
        .eq("promoter_code", "PROMOTER1")
        .eq("status", "completed");

      const queryTime = Date.now() - startTime;

      expect(orders).toBeDefined();
      expect(queryTime).toBeLessThan(1000); // Should be fast with index
    });

    it("should efficiently list all promoter links for an event", async () => {
      if (!supabase) return;

      const startTime = Date.now();

      const { data: links } = await supabase
        .from("promoter_links")
        .select("*")
        .eq("event_id", testEventId);

      const queryTime = Date.now() - startTime;

      expect(links).toBeDefined();
      expect(links?.length).toBeGreaterThanOrEqual(2);
      expect(queryTime).toBeLessThan(500);
    });
  });
});

