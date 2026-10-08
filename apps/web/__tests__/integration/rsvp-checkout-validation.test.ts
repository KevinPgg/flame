import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { cleanupOrphanedTestData } from "../utils/test-data-cleanup";

/**
 * Integration Test Suite for RSVP Checkout Validation
 *
 * This test suite verifies that the checkout API correctly distinguishes between:
 * 1. RSVP-based purchases (orderId = RSVP ID, purchaseType = 'rsvp')
 * 2. Hold-based purchases (orderId = Hold ID, purchaseType = 'hold' or undefined)
 *
 * BUG CONTEXT (Dec 2, 2025):
 * The checkout API was always looking up orderDetails.orderId in the 'holds' table,
 * even for RSVP-based purchases where the ID is actually an RSVP ID.
 * This caused "Hold not found" errors for users trying to purchase after RSVP approval.
 *
 * FIX: Added purchaseType parameter to distinguish between RSVP and hold purchases.
 *
 * ⚠️ SAFETY: This test creates real database rows. It includes safeguards to:
 * 1. Validate the database URL looks like a test/dev environment
 * 2. Use unique identifiers (TEST_SUITE_ID) for all created fixtures
 * 3. Only delete rows matching our test suite identifier
 */

// Unique identifier for this test suite's fixtures (used in emails/slugs for safe cleanup)
const TEST_SUITE_ID = `rsvp_checkout_test_${Date.now()}`;
const TEST_EMAIL_DOMAIN = "@test-rsvp-checkout.example.com";

// Test fixtures
let supabase: SupabaseClient;
let testUser: any;
let testOrganizer: any;
let testOrganization: any;
let testEvent: any;
let testTier: any;
let testRsvp: any;
let testHold: any;

// Flag to track if setup was successful (used for proper test skipping)
let setupSuccessful = false;

/**
 * Validates that the Supabase URL is safe for testing (not production).
 * Aborts test run if validation fails to prevent accidental production data pollution.
 *
 * IMPORTANT: Generic domains like "supabase.co" are NOT considered safe because
 * all Supabase projects (including production) use these domains.
 * Only explicit test/dev indicators in the project ref are trusted.
 */
function validateTestEnvironment(supabaseUrl: string): boolean {
  const lowerUrl = supabaseUrl.toLowerCase();

  // Local development is always safe
  if (lowerUrl.includes("localhost") || lowerUrl.includes("127.0.0.1")) {
    return true;
  }

  // For Supabase-hosted projects, require explicit test/dev indicators in the project ref
  // e.g., "myapp-test.supabase.co" or "test-myapp.supabase.co"
  const testIndicators = [
    "-test", // myproject-test.supabase.co
    "-dev", // myproject-dev.supabase.co
    "-staging", // myproject-staging.supabase.co
    "test-", // test-myproject.supabase.co
    "dev-", // dev-myproject.supabase.co
    "staging-", // staging-myproject.supabase.co
    "_test", // myproject_test.supabase.co
    "_dev", // myproject_dev.supabase.co
    "_staging", // myproject_staging.supabase.co
  ];

  const hasTestIndicator = testIndicators.some(indicator =>
    lowerUrl.includes(indicator)
  );

  if (!hasTestIndicator) {
    console.error(
      "❌ SAFETY CHECK FAILED: Supabase URL does not appear to be a test environment"
    );
    console.error(`   URL: ${supabaseUrl}`);
    console.error(
      "   For Supabase projects, the project ref must contain a test indicator:"
    );
    console.error(`   ${testIndicators.join(", ")}`);
    console.error(
      "   Example: myproject-test.supabase.co or test-myproject.supabase.co"
    );
    console.error("");
    console.error(
      "   To run against this database anyway, set TEST_DATABASE_CONFIRMED=true"
    );
    console.error(
      "   ⚠️  WARNING: Only use this override if you're certain this is not production!"
    );
    return false;
  }

  return true;
}

beforeAll(async () => {
  // Setup test database connection
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.log(
      "⚠️ Skipping RSVP checkout validation tests - missing Supabase credentials"
    );
    return;
  }

  // Safety check: Validate we're targeting a test database
  const bypassSafetyCheck = process.env.TEST_DATABASE_CONFIRMED === "true";
  if (!bypassSafetyCheck && !validateTestEnvironment(supabaseUrl)) {
    console.log(
      "⚠️ Skipping RSVP checkout validation tests - failed safety check"
    );
    return;
  }

  supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Clean up any orphaned test data from previous runs
  await cleanupOrphanedTestData(supabase);

  console.log(`🔒 Test suite ID: ${TEST_SUITE_ID}`);

  // Create test organizer (with identifiable test email)
  const { data: organizer, error: organizerError } = await supabase
    .from("users")
    .insert({
      clerk_id: `${TEST_SUITE_ID}_organizer`,
      email: `organizer.${TEST_SUITE_ID}${TEST_EMAIL_DOMAIN}`,
      first_name: "TestOrganizer",
      last_name: TEST_SUITE_ID,
    })
    .select()
    .single();

  if (organizerError) throw organizerError;
  testOrganizer = organizer;

  // Create test user (who will have RSVP and hold)
  const { data: user, error: userError } = await supabase
    .from("users")
    .insert({
      clerk_id: `${TEST_SUITE_ID}_user`,
      email: `user.${TEST_SUITE_ID}${TEST_EMAIL_DOMAIN}`,
      first_name: "TestUser",
      last_name: TEST_SUITE_ID,
    })
    .select()
    .single();

  if (userError) throw userError;
  testUser = user;

  // Create test organization (with identifiable test slug)
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({
      name: `Test RSVP Org ${TEST_SUITE_ID}`,
      slug: `${TEST_SUITE_ID}-org`,
      approved: true,
      owner_user_id: testOrganizer.id,
    })
    .select()
    .single();

  if (orgError) throw orgError;
  testOrganization = org;

  // Create test event (with identifiable test slug, using 'draft' to prevent public visibility)
  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      organization_id: testOrganization.id,
      name: `Test RSVP Event ${TEST_SUITE_ID}`,
      slug: `${TEST_SUITE_ID}-event`,
      description: `Test event for RSVP checkout validation (${TEST_SUITE_ID})`,
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      ends_at: new Date(Date.now() + 90000000).toISOString(),
      venue: "Test Venue",
      city: "Test City",
      status: "draft", // Use draft to prevent appearing on public event listings
      requires_rsvp: true,
    })
    .select()
    .single();

  if (eventError) throw eventError;
  testEvent = event;

  // Create test ticket tier (with identifiable test name)
  const { data: tier, error: tierError } = await supabase
    .from("ticket_tiers")
    .insert({
      event_id: testEvent.id,
      name: `Test Tier ${TEST_SUITE_ID}`,
      price_cents: 5000,
      quantity_total: 100,
      quantity_sold: 0,
      sales_start: new Date().toISOString(),
      sales_end: new Date(Date.now() + 86400000).toISOString(),
    })
    .select()
    .single();

  if (tierError) throw tierError;
  testTier = tier;

  // Create approved RSVP for test user
  const { data: rsvp, error: rsvpError } = await supabase
    .from("rsvps")
    .insert({
      event_id: testEvent.id,
      user_id: testUser.id,
      ticket_tier_id: testTier.id,
      requested_quantity: 1,
      status: "approved",
      stage_price_cents: 5000,
    })
    .select()
    .single();

  if (rsvpError) throw rsvpError;
  testRsvp = rsvp;

  // Create active hold for test user
  const { data: hold, error: holdError } = await supabase
    .from("holds")
    .insert({
      event_id: testEvent.id,
      user_id: testUser.id,
      tier_id: testTier.id,
      quantity: 1,
      expires_at: new Date(Date.now() + 900000).toISOString(), // 15 minutes from now
      stage_price_cents: 5000,
    })
    .select()
    .single();

  if (holdError) throw holdError;
  testHold = hold;

  console.log("✅ RSVP checkout validation test setup complete");
  console.log(`   Test RSVP ID: ${testRsvp.id}`);
  console.log(`   Test Hold ID: ${testHold.id}`);

  // Mark setup as successful so tests can run
  setupSuccessful = true;
});

afterAll(async () => {
  if (!supabase) return;

  console.log(`🧹 Cleaning up test data for suite: ${TEST_SUITE_ID}`);
  const cleanedItems: string[] = [];

  // Cleanup test data in reverse dependency order
  // Only delete rows by their specific IDs (safe - won't affect other data)
  try {
    if (testHold?.id) {
      await supabase.from("holds").delete().eq("id", testHold.id);
      cleanedItems.push(`hold:${testHold.id}`);
    }
    if (testRsvp?.id) {
      await supabase.from("rsvps").delete().eq("id", testRsvp.id);
      cleanedItems.push(`rsvp:${testRsvp.id}`);
    }
    if (testTier?.id) {
      await supabase.from("ticket_tiers").delete().eq("id", testTier.id);
      cleanedItems.push(`tier:${testTier.id}`);
    }
    if (testEvent?.id) {
      await supabase.from("events").delete().eq("id", testEvent.id);
      cleanedItems.push(`event:${testEvent.id}`);
    }
    if (testOrganization?.id) {
      await supabase
        .from("organization_members")
        .delete()
        .eq("organization_id", testOrganization.id);
      await supabase
        .from("organizations")
        .delete()
        .eq("id", testOrganization.id);
      cleanedItems.push(`org:${testOrganization.id}`);
    }
    if (testUser?.id) {
      await supabase.from("users").delete().eq("id", testUser.id);
      cleanedItems.push(`user:${testUser.id}`);
    }
    if (testOrganizer?.id) {
      await supabase.from("users").delete().eq("id", testOrganizer.id);
      cleanedItems.push(`organizer:${testOrganizer.id}`);
    }

    console.log(
      `✅ RSVP checkout validation test cleanup complete (${cleanedItems.length} items)`
    );
  } catch (cleanupError) {
    console.error(
      "⚠️ Error during test cleanup (some test data may remain):",
      cleanupError
    );
    console.log("   Items cleaned before error:", cleanedItems);
  }
});

/**
 * Simulates the checkout validation logic that should be used
 * Based on purchaseType parameter
 * This is the same logic as in app/api/datafast/create-checkout/route.ts
 */
async function validateCheckout(
  orderId: string,
  purchaseType: "rsvp" | "hold" | undefined,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: "No database connection" };
  }

  if (purchaseType === "rsvp") {
    // RSVP-based purchase: validate against rsvps table
    const { data: rsvp, error } = await supabase
      .from("rsvps")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error || !rsvp) {
      return { success: false, error: "RSVP not found" };
    }

    if (rsvp.user_id !== userId) {
      return { success: false, error: "Invalid RSVP for this user" };
    }

    if (rsvp.status !== "approved") {
      return { success: false, error: "RSVP is not approved" };
    }

    return { success: true };
  } else {
    // Hold-based purchase (default): validate against holds table
    const { data: hold, error } = await supabase
      .from("holds")
      .select("*")
      .eq("id", orderId)
      .single();

    if (error || !hold) {
      return { success: false, error: "Hold not found" };
    }

    if (hold.user_id !== userId) {
      return { success: false, error: "Invalid hold for this user" };
    }

    if (hold.order_id) {
      return { success: false, error: "Hold already used" };
    }

    const now = new Date();
    const expiresAt = new Date(hold.expires_at);
    if (expiresAt <= now) {
      return { success: false, error: "Hold expired" };
    }

    return { success: true };
  }
}

describe("RSVP vs Hold Checkout Validation", () => {
  // Skip all tests in this suite if setup failed (ensures CI shows skipped, not green)
  beforeEach(({ skip }) => {
    if (!setupSuccessful) {
      skip();
    }
  });

  describe("Database Lookup Behavior", () => {
    it("should find RSVP by ID in rsvps table", async () => {
      const { data: rsvp, error } = await supabase
        .from("rsvps")
        .select("*")
        .eq("id", testRsvp.id)
        .single();

      expect(error).toBeNull();
      expect(rsvp).not.toBeNull();
      expect(rsvp.id).toBe(testRsvp.id);
      expect(rsvp.status).toBe("approved");
    });

    it("should find Hold by ID in holds table", async () => {
      const { data: hold, error } = await supabase
        .from("holds")
        .select("*")
        .eq("id", testHold.id)
        .single();

      expect(error).toBeNull();
      expect(hold).not.toBeNull();
      expect(hold.id).toBe(testHold.id);
    });

    it("should NOT find RSVP ID in holds table (the bug scenario)", async () => {
      // This is the exact bug: looking for an RSVP ID in the holds table
      const { data: hold, error } = await supabase
        .from("holds")
        .select("*")
        .eq("id", testRsvp.id)
        .single();

      // Should return error (no rows found) - don't check specific error code for robustness
      expect(error).not.toBeNull();
      expect(hold).toBeNull();
    });

    it("should NOT find Hold ID in rsvps table", async () => {
      const { data: rsvp, error } = await supabase
        .from("rsvps")
        .select("*")
        .eq("id", testHold.id)
        .single();

      // Should return error (no rows found) - don't check specific error code for robustness
      expect(error).not.toBeNull();
      expect(rsvp).toBeNull();
    });
  });

  describe("Correct Validation Logic", () => {
    it("should validate RSVP ID with purchaseType=rsvp (CORRECT)", async () => {
      const result = await validateCheckout(testRsvp.id, "rsvp", testUser.id);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should FAIL to validate RSVP ID with purchaseType=hold (THE BUG)", async () => {
      // This is the bug scenario - looking for RSVP ID in holds table
      const result = await validateCheckout(testRsvp.id, "hold", testUser.id);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Hold not found");
    });

    it("should FAIL to validate RSVP ID with purchaseType=undefined (THE BUG)", async () => {
      // Default behavior (undefined) was the bug - it defaulted to hold lookup
      const result = await validateCheckout(
        testRsvp.id,
        undefined,
        testUser.id
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe("Hold not found");
    });

    it("should validate Hold ID with purchaseType=hold (CORRECT)", async () => {
      const result = await validateCheckout(testHold.id, "hold", testUser.id);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should validate Hold ID with purchaseType=undefined (CORRECT - default)", async () => {
      const result = await validateCheckout(
        testHold.id,
        undefined,
        testUser.id
      );
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should FAIL to validate Hold ID with purchaseType=rsvp", async () => {
      // This would be a misconfiguration - hold ID looked up in rsvps table
      const result = await validateCheckout(testHold.id, "rsvp", testUser.id);
      expect(result.success).toBe(false);
      expect(result.error).toBe("RSVP not found");
    });
  });

  describe("RSVP Status Validation", () => {
    it("should reject RSVP with status pending via validateCheckout", async () => {
      // Temporarily update RSVP to pending
      await supabase
        .from("rsvps")
        .update({ status: "pending" })
        .eq("id", testRsvp.id);

      // Validation should fail - actually test the checkout validation path
      const result = await validateCheckout(testRsvp.id, "rsvp", testUser.id);
      expect(result.success).toBe(false);
      expect(result.error).toBe("RSVP is not approved");

      // Restore approved status
      await supabase
        .from("rsvps")
        .update({ status: "approved" })
        .eq("id", testRsvp.id);
    });

    it("should reject RSVP with status purchased via validateCheckout", async () => {
      // Temporarily update RSVP to purchased
      await supabase
        .from("rsvps")
        .update({ status: "purchased" })
        .eq("id", testRsvp.id);

      // Validation should fail - actually test the checkout validation path
      const result = await validateCheckout(testRsvp.id, "rsvp", testUser.id);
      expect(result.success).toBe(false);
      expect(result.error).toBe("RSVP is not approved");

      // Restore approved status
      await supabase
        .from("rsvps")
        .update({ status: "approved" })
        .eq("id", testRsvp.id);
    });

    it("should accept RSVP with status approved via validateCheckout", async () => {
      // Ensure RSVP is approved (should already be from setup)
      const { data: rsvp } = await supabase
        .from("rsvps")
        .select("status")
        .eq("id", testRsvp.id)
        .single();

      expect(rsvp?.status).toBe("approved");

      // Validation should pass - actually test the checkout validation path
      const result = await validateCheckout(testRsvp.id, "rsvp", testUser.id);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });
});
