/**
 * Test Data Cleanup Utility
 *
 * This utility provides safe cleanup of test data to prevent test events
 * from appearing in production/staging environments.
 *
 * IMPORTANT: Tests should:
 * 1. Use TEST_DATA_PREFIX in all test entity names (recommended) OR use names
 *    containing "Test Event"/"Test Org" (legacy pattern, still supported)
 * 2. Use status: 'draft' for events (not 'published')
 * 3. Use slugs starting with "test-" for all test entities (required for cleanup)
 * 4. Call cleanupRegisteredTestData() in afterAll hooks to remove data
 *    created in the current test run (using the registration helpers).
 * 5. Optionally call cleanupOrphanedTestData() in beforeAll hooks to clear
 *    leftovers from previous failed/interrupted runs.
 * 6. Register created IDs for tracking via registerTestData/registerMultipleTestData.
 *
 * PARALLEL TEST SAFETY:
 * cleanupOrphanedTestData() only deletes test data older than ORPHANED_DATA_MIN_AGE_MINUTES
 * (default: 60 minutes). This prevents parallel test runs from deleting each other's
 * freshly created test data. If tests run in parallel, ensure they complete within
 * this time window or use cleanupRegisteredTestData() instead for explicit cleanup.
 *
 * CLEANUP PATTERNS:
 * - Events: Names starting with TEST_ OR containing "Test Event" OR slugs starting with "test-"
 * - Organizations: Names starting with TEST_ OR containing "Test Org" OR slugs starting with "test-"
 * - Users: Test email domains OR clerk_id starting with "test-"
 *
 * SAFETY: Orphaned test-data cleanup validates the database environment
 * before performing deletions to prevent accidental production data deletion.
 * Registered test-data cleanup deletes only explicitly registered IDs from
 * the current test run, providing inherent safety through explicit tracking.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { validateTestEnvironment } from "@/app/lib/utils/test-db-env";

// Prefix used to identify test data - all test entities should include this
export const TEST_DATA_PREFIX = "TEST_";
export const TEST_EMAIL_SUFFIX = "@test.example.com";

// Minimum age (in minutes) for orphaned test data before cleanup
// This prevents parallel test runs from deleting each other's freshly created data
// Data created less than this many minutes ago will be preserved
export const ORPHANED_DATA_MIN_AGE_MINUTES = 60; // 1 hour

// Track created test data for cleanup
interface TestDataRegistry {
  userIds: Set<string>;
  organizationIds: Set<string>;
  eventIds: Set<string>;
  tierIds: Set<string>;
  stageIds: Set<string>;
  holdIds: Set<string>;
  rsvpIds: Set<string>;
  orderIds: Set<string>;
  promoterLinkIds: Set<string>;
  ticketIds: Set<string>;
}

// Global registry for tracking test data within a test run
// NOTE: This is a module-level singleton. If tests run in parallel (e.g., with Jest's --runInBand disabled),
// different test suites could interfere with each other's registry state. For parallel test execution,
// consider using isolated registries per test suite or running tests sequentially.
let testDataRegistry: TestDataRegistry = createEmptyRegistry();

/**
 * Create an empty test data registry
 * Exported for future support of parallel test execution with isolated registries
 */
export function createEmptyRegistry(): TestDataRegistry {
  return {
    userIds: new Set(),
    organizationIds: new Set(),
    eventIds: new Set(),
    tierIds: new Set(),
    stageIds: new Set(),
    holdIds: new Set(),
    rsvpIds: new Set(),
    orderIds: new Set(),
    promoterLinkIds: new Set(),
    ticketIds: new Set(),
  };
}

/**
 * Register a created test entity for later cleanup
 */
export function registerTestData(
  type: keyof TestDataRegistry,
  id: string
): void {
  testDataRegistry[type].add(id);
}

/**
 * Register multiple test entities at once
 */
export function registerMultipleTestData(
  type: keyof TestDataRegistry,
  ids: string[]
): void {
  ids.forEach(id => testDataRegistry[type].add(id));
}

/**
 * Get a Supabase client for test operations
 */
export function getTestSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("⚠️ Missing Supabase credentials for test cleanup");
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Clean up all registered test data
 * Should be called in afterAll hooks
 */
export async function cleanupRegisteredTestData(
  supabase?: SupabaseClient
): Promise<void> {
  const client = supabase || getTestSupabaseClient();
  if (!client) return;

  console.log("🧹 Cleaning up registered test data...");

  // Delete in reverse dependency order to respect foreign key constraints
  // CRITICAL: Delete purchase_tokens before RSVPs to avoid FK constraint violations
  const rsvpIds = Array.from(testDataRegistry.rsvpIds);
  if (rsvpIds.length > 0) {
    // Delete purchase_tokens first (they reference rsvp_id)
    const { error: tokensError } = await client
      .from("purchase_tokens")
      .delete()
      .in("rsvp_id", rsvpIds);

    if (tokensError) {
      console.warn(`⚠️ Failed to delete purchase_tokens:`, tokensError.message);
    } else {
      console.log(`  ✓ Deleted purchase_tokens for ${rsvpIds.length} RSVPs`);
    }
  }

  // CRITICAL: Delete tickets before orders to avoid FK constraint violations
  // Tickets reference orders via order_id FK, so they must be deleted first
  const orderIdsForTickets = Array.from(testDataRegistry.orderIds);
  if (orderIdsForTickets.length > 0) {
    const { error: ticketsError } = await client
      .from("tickets")
      .delete()
      .in("order_id", orderIdsForTickets);

    if (ticketsError) {
      console.warn(
        `⚠️ Failed to delete tickets for registered orders:`,
        ticketsError.message
      );
    } else {
      console.log(
        `  ✓ Deleted tickets for ${orderIdsForTickets.length} registered orders`
      );
    }
  }

  const cleanupOrder: Array<{
    table: string;
    registry: keyof TestDataRegistry;
  }> = [
    { table: "orders", registry: "orderIds" },
    { table: "holds", registry: "holdIds" },
    { table: "rsvps", registry: "rsvpIds" },
    { table: "promoter_links", registry: "promoterLinkIds" },
    { table: "ticket_stages", registry: "stageIds" },
    { table: "ticket_tiers", registry: "tierIds" },
    { table: "events", registry: "eventIds" },
    { table: "organizations", registry: "organizationIds" },
    { table: "users", registry: "userIds" },
  ];

  for (const { table, registry } of cleanupOrder) {
    const ids = Array.from(testDataRegistry[registry]);
    if (ids.length === 0) continue;

    const { error } = await client.from(table).delete().in("id", ids);

    if (error) {
      console.warn(`⚠️ Failed to delete from ${table}:`, error.message);
    } else {
      console.log(`  ✓ Deleted ${ids.length} rows from ${table}`);
    }
  }

  // Reset the registry
  testDataRegistry = createEmptyRegistry();
  console.log("✅ Test data cleanup complete");
}

/**
 * Clean up orphaned test data from previous test runs
 * This should be called at the START of test suites to clean up any
 * leftover data from failed/interrupted test runs
 *
 * SAFETY: This function validates the database environment before performing
 * deletions to prevent accidental production data deletion.
 *
 * Uses STRICT naming patterns to identify test data:
 * - Event names starting with TEST_DATA_PREFIX or slugs starting with "test-"
 * - Organization names starting with TEST_DATA_PREFIX or slugs starting with "test-"
 * - User emails ending with specific test domains or clerk_id starting with "test-"
 */
export async function cleanupOrphanedTestData(
  supabase?: SupabaseClient
): Promise<void> {
  const client = supabase || getTestSupabaseClient();
  if (!client) return;

  // Get the Supabase URL for environment validation
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    console.warn(
      "⚠️ Cannot validate environment - NEXT_PUBLIC_SUPABASE_URL not set"
    );
    return;
  }

  // Validate environment before performing deletions
  if (!validateTestEnvironment(supabaseUrl)) {
    console.error(
      "❌ Aborting orphaned test data cleanup: Environment validation failed"
    );
    throw new Error(
      "Cannot clean up test data: Database does not appear to be a test environment. " +
        "Set TEST_DATABASE_CONFIRMED=true to override (use with extreme caution)."
    );
  }

  console.log("🧹 Cleaning up orphaned test data from previous runs...");
  console.log(
    `  ⏰ Only deleting data older than ${ORPHANED_DATA_MIN_AGE_MINUTES} minutes to prevent parallel test interference`
  );

  try {
    // Calculate the cutoff timestamp for stale data
    const cutoffTime = new Date(
      Date.now() - ORPHANED_DATA_MIN_AGE_MINUTES * 60 * 1000
    ).toISOString();

    // Clean up test events (this will cascade delete related data via FK)
    // Match both:
    // 1. Names starting with TEST_DATA_PREFIX (recommended pattern)
    // 2. Names containing "Test Event" (legacy pattern used by many tests)
    // 3. Slugs starting with "test-" (fallback for any test data)
    // CRITICAL: Only delete data older than ORPHANED_DATA_MIN_AGE_MINUTES to prevent
    // parallel test runs from deleting each other's freshly created test data
    const { data: testEvents, error: eventsError } = await client
      .from("events")
      .select("id")
      .or(
        `name.like.${TEST_DATA_PREFIX}%,name.ilike.%Test Event%,slug.like.test-%`
      )
      .lt("created_at", cutoffTime);

    if (!eventsError && testEvents && testEvents.length > 0) {
      const eventIds = testEvents.map(e => e.id);

      // Delete related data first (in case there are no CASCADE constraints)
      // CRITICAL: Delete tickets before orders to avoid FK constraint violations
      // First, get all order IDs for these events
      const { data: orders } = await client
        .from("orders")
        .select("id")
        .in("event_id", eventIds);

      if (orders && orders.length > 0) {
        const orderIds = orders.map((o: { id: string }) => o.id);
        // Delete tickets that reference these orders
        const { error: ticketsError } = await client
          .from("tickets")
          .delete()
          .in("order_id", orderIds);

        if (ticketsError) {
          console.warn(`⚠️ Failed to delete tickets:`, ticketsError.message);
        }
      }

      // CRITICAL: Delete purchase_tokens before RSVPs to avoid FK constraint violations
      // First, get all RSVP IDs for these events
      const { data: rsvps } = await client
        .from("rsvps")
        .select("id")
        .in("event_id", eventIds);

      if (rsvps && rsvps.length > 0) {
        const rsvpIds = rsvps.map((r: { id: string }) => r.id);
        // Delete purchase_tokens that reference these RSVPs
        const { error: tokensError } = await client
          .from("purchase_tokens")
          .delete()
          .in("rsvp_id", rsvpIds);

        if (tokensError) {
          console.warn(
            `⚠️ Failed to delete purchase_tokens:`,
            tokensError.message
          );
        }
      }

      // Delete orders, holds, RSVPs, and promoter links with error handling
      const { error: ordersError } = await client
        .from("orders")
        .delete()
        .in("event_id", eventIds);
      if (ordersError) {
        console.warn(`⚠️ Failed to delete orders:`, ordersError.message);
      }

      const { error: holdsError } = await client
        .from("holds")
        .delete()
        .in("event_id", eventIds);
      if (holdsError) {
        console.warn(`⚠️ Failed to delete holds:`, holdsError.message);
      }

      const { error: rsvpsError } = await client
        .from("rsvps")
        .delete()
        .in("event_id", eventIds);
      if (rsvpsError) {
        console.warn(`⚠️ Failed to delete RSVPs:`, rsvpsError.message);
      }

      const { error: promoterLinksError } = await client
        .from("promoter_links")
        .delete()
        .in("event_id", eventIds);
      if (promoterLinksError) {
        console.warn(
          `⚠️ Failed to delete promoter links:`,
          promoterLinksError.message
        );
      }

      // Delete ticket stages via tiers
      const { data: tiers, error: tiersFetchError } = await client
        .from("ticket_tiers")
        .select("id")
        .in("event_id", eventIds);

      if (tiersFetchError) {
        console.warn(
          `⚠️ Failed to fetch ticket tiers:`,
          tiersFetchError.message
        );
      } else if (tiers && tiers.length > 0) {
        const tierIds = tiers.map(t => t.id);
        const { error: stagesError } = await client
          .from("ticket_stages")
          .delete()
          .in("ticket_tier_id", tierIds);
        if (stagesError) {
          console.warn(
            `⚠️ Failed to delete ticket stages:`,
            stagesError.message
          );
        }

        const { error: tiersError } = await client
          .from("ticket_tiers")
          .delete()
          .in("id", tierIds);
        if (tiersError) {
          console.warn(`⚠️ Failed to delete ticket tiers:`, tiersError.message);
        }
      }

      // Delete events
      const { error: deleteError } = await client
        .from("events")
        .delete()
        .in("id", eventIds);

      if (!deleteError) {
        console.log(`  ✓ Cleaned up ${eventIds.length} orphaned test events`);
      }
    }

    // Clean up test organizations - Match both:
    // 1. Names starting with TEST_DATA_PREFIX (recommended pattern)
    // 2. Names containing "Test Org" (legacy pattern used by many tests)
    // 3. Slugs starting with "test-" (fallback for any test data)
    // CRITICAL: Only delete data older than ORPHANED_DATA_MIN_AGE_MINUTES to prevent
    // parallel test runs from deleting each other's freshly created test data
    const { data: testOrgs, error: orgsError } = await client
      .from("organizations")
      .select("id")
      .or(
        `name.like.${TEST_DATA_PREFIX}%,name.ilike.%Test Org%,slug.like.test-%`
      )
      .lt("created_at", cutoffTime);

    if (!orgsError && testOrgs && testOrgs.length > 0) {
      const orgIds = testOrgs.map(o => o.id);
      await client
        .from("organization_members")
        .delete()
        .in("organization_id", orgIds);
      const { error: deleteError } = await client
        .from("organizations")
        .delete()
        .in("id", orgIds);

      if (!deleteError) {
        console.log(
          `  ✓ Cleaned up ${orgIds.length} orphaned test organizations`
        );
      }
    }

    // Clean up test users (by email pattern)
    // CRITICAL: Only delete data older than ORPHANED_DATA_MIN_AGE_MINUTES to prevent
    // parallel test runs from deleting each other's freshly created test data
    const { data: testUsers, error: usersError } = await client
      .from("users")
      .select("id")
      .or(
        "email.ilike.%@test.example.com,email.ilike.%test-promoter-%,email.ilike.%@test-rsvp-checkout.example.com,clerk_id.ilike.test-%"
      )
      .lt("created_at", cutoffTime);

    if (!usersError && testUsers && testUsers.length > 0) {
      const userIds = testUsers.map(u => u.id);
      const { error: deleteError } = await client
        .from("users")
        .delete()
        .in("id", userIds);

      if (!deleteError) {
        console.log(`  ✓ Cleaned up ${userIds.length} orphaned test users`);
      }
    }

    console.log("✅ Orphaned test data cleanup complete");
  } catch (error) {
    console.error("❌ Error during orphaned test data cleanup:", error);
  }
}

/**
 * Generate a unique test identifier
 * Use this for creating test entity names/slugs
 */
export function generateTestId(): string {
  // Use substring(2, 9) instead of substring(7) for better collision resistance:
  // - Skips the "0." prefix consistently
  // - Provides 7 characters of entropy (more than substring(7) which gives variable length)
  return `${TEST_DATA_PREFIX}${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 9)}`;
}

/**
 * Generate a test-safe event configuration
 * Always uses 'draft' status to prevent appearing in public listings
 *
 * Names start with TEST_DATA_PREFIX to match cleanup pattern matching
 */
export function createTestEventConfig(
  orgId: string,
  overrides: Record<string, any> = {}
): Record<string, any> {
  const testId = generateTestId();
  return {
    organization_id: orgId,
    name: `${testId} Test Event`,
    slug: `test-event-${testId}`.toLowerCase(),
    city: "Test City",
    venue: "Test Venue",
    starts_at: new Date(Date.now() + 86400000).toISOString(),
    ends_at: new Date(Date.now() + 90000000).toISOString(),
    description: "Test event created by automated tests",
    status: "draft", // ALWAYS use draft to prevent public visibility
    requires_rsvp: false,
    ...overrides,
  };
}

/**
 * Generate a test-safe organization configuration
 *
 * Names start with TEST_DATA_PREFIX to match cleanup pattern matching
 */
export function createTestOrgConfig(
  ownerUserId: string,
  overrides: Record<string, any> = {}
): Record<string, any> {
  const testId = generateTestId();
  return {
    name: `${testId} Test Org`,
    slug: `test-org-${testId}`.toLowerCase(),
    owner_user_id: ownerUserId,
    ...overrides,
  };
}

/**
 * Generate a test-safe user configuration
 */
export function createTestUserConfig(
  overrides: Record<string, any> = {}
): Record<string, any> {
  const testId = generateTestId();
  return {
    clerk_id: `test-clerk-${testId}`,
    email: `test-${testId}${TEST_EMAIL_SUFFIX}`,
    first_name: "Test",
    last_name: "User",
    ...overrides,
  };
}
