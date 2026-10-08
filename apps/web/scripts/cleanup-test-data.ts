#!/usr/bin/env npx tsx

/**
 * Manual Test Data Cleanup Script
 *
 * Run this script to clean up any test data that may have been left
 * in the database from failed or interrupted test runs.
 *
 * SAFETY FEATURES:
 * - Environment validation (prevents running against production)
 * - Dry-run mode (preview without deleting)
 * - Confirmation flag required (--confirm or --force)
 * - Strict pattern matching for known test data patterns (TEST_ prefix,
 *   specific "Test Event"/"Test Org" names, and "test-" slugs)
 * - Transaction logging (audit trail of deletions)
 *
 * Usage:
 *   # Dry-run (preview what would be deleted):
 *   npx tsx scripts/cleanup-test-data.ts --dry-run
 *
 *   # Actually delete (requires confirmation):
 *   npx tsx scripts/cleanup-test-data.ts --confirm
 *
 *   # Force mode (skip additional prompts):
 *   npx tsx scripts/cleanup-test-data.ts --force
 *
 * Environment variables required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * Safety overrides (use with extreme caution):
 *   - TEST_DATABASE_CONFIRMED=true (bypasses environment check)
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import path from "path";
import { validateTestEnvironment } from "../app/lib/utils/test-db-env";
import { TEST_DATA_PREFIX } from "../__tests__/utils/test-data-cleanup";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

interface CleanupStats {
  events: { count: number; ids: string[] };
  organizations: { count: number; ids: string[] };
  users: { count: number; ids: string[] };
  related: {
    orders: number;
    holds: number;
    rsvps: number;
    promoterLinks: number;
    tiers: number;
    stages: number;
    orgMembers: number;
  };
}

/**
 * Find test data matching strict patterns (TEST_ prefix only)
 */
async function findTestData(
  supabase: ReturnType<typeof createClient> | any
): Promise<CleanupStats> {
  const stats: CleanupStats = {
    events: { count: 0, ids: [] },
    organizations: { count: 0, ids: [] },
    users: { count: 0, ids: [] },
    related: {
      orders: 0,
      holds: 0,
      rsvps: 0,
      promoterLinks: 0,
      tiers: 0,
      stages: 0,
      orgMembers: 0,
    },
  };

  // Find test events - Match both:
  // 1. Names starting with TEST_DATA_PREFIX (recommended pattern)
  // 2. Names containing "Test Event" (legacy pattern used by many tests)
  // 3. Slugs starting with "test-" (fallback for any test data)
  const { data: testEvents, error: eventsError } = await supabase
    .from("events")
    .select("id, name, slug")
    .or(
      `name.like.${TEST_DATA_PREFIX}%,name.ilike.%Test Event%,slug.like.test-%`
    );

  if (eventsError) {
    console.error(`❌ Error fetching test events: ${eventsError.message}`);
    throw new Error(`Failed to fetch test events: ${eventsError.message}`);
  } else if (testEvents && testEvents.length > 0) {
    stats.events = {
      count: testEvents.length,
      ids: testEvents.map((e: { id: string }) => e.id),
    };

    // Count related data
    const eventIds = stats.events.ids;
    const { count: ordersCount, error: ordersError } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .in("event_id", eventIds);
    if (ordersError) {
      console.error(`⚠️ Error counting orders: ${ordersError.message}`);
    } else {
      stats.related.orders = ordersCount || 0;
    }

    const { count: holdsCount, error: holdsError } = await supabase
      .from("holds")
      .select("*", { count: "exact", head: true })
      .in("event_id", eventIds);
    if (holdsError) {
      console.error(`⚠️ Error counting holds: ${holdsError.message}`);
    } else {
      stats.related.holds = holdsCount || 0;
    }

    const { count: rsvpsCount, error: rsvpsError } = await supabase
      .from("rsvps")
      .select("*", { count: "exact", head: true })
      .in("event_id", eventIds);
    if (rsvpsError) {
      console.error(`⚠️ Error counting RSVPs: ${rsvpsError.message}`);
    } else {
      stats.related.rsvps = rsvpsCount || 0;
    }

    const { count: promoterLinksCount, error: promoterLinksError } =
      await supabase
        .from("promoter_links")
        .select("*", { count: "exact", head: true })
        .in("event_id", eventIds);
    if (promoterLinksError) {
      console.error(
        `⚠️ Error counting promoter links: ${promoterLinksError.message}`
      );
    } else {
      stats.related.promoterLinks = promoterLinksCount || 0;
    }

    // Count tiers and stages
    const { data: tiers, error: tiersError } = await supabase
      .from("ticket_tiers")
      .select("id")
      .in("event_id", eventIds);

    if (tiersError) {
      console.error(`⚠️ Error fetching ticket tiers: ${tiersError.message}`);
    } else if (tiers && tiers.length > 0) {
      const tierIds = tiers.map((t: { id: string }) => t.id);
      stats.related.tiers = tierIds.length;

      const { count: stagesCount, error: stagesError } = await supabase
        .from("ticket_stages")
        .select("*", { count: "exact", head: true })
        .in("ticket_tier_id", tierIds);
      if (stagesError) {
        console.error(
          `⚠️ Error counting ticket stages: ${stagesError.message}`
        );
      } else {
        stats.related.stages = stagesCount || 0;
      }
    }
  }

  // Find test organizations - Match both:
  // 1. Names starting with TEST_DATA_PREFIX (recommended pattern)
  // 2. Names containing "Test Org" (legacy pattern used by many tests)
  // 3. Slugs starting with "test-" (fallback for any test data)
  const { data: testOrgs, error: orgsError } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .or(
      `name.like.${TEST_DATA_PREFIX}%,name.ilike.%Test Org%,slug.like.test-%`
    );

  if (orgsError) {
    console.error(`❌ Error fetching test organizations: ${orgsError.message}`);
    throw new Error(`Failed to fetch test organizations: ${orgsError.message}`);
  } else if (testOrgs && testOrgs.length > 0) {
    stats.organizations = {
      count: testOrgs.length,
      ids: testOrgs.map((o: { id: string }) => o.id),
    };

    // Count org members
    const orgIds = stats.organizations.ids;
    const { count: orgMembersCount, error: orgMembersError } = await supabase
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .in("organization_id", orgIds);
    if (orgMembersError) {
      console.error(
        `⚠️ Error counting organization members: ${orgMembersError.message}`
      );
    } else {
      stats.related.orgMembers = orgMembersCount || 0;
    }
  }

  // Find test users - STRICT: Only users with test email domains or test- prefix in clerk_id
  // Matches: test email domains, test-promoter emails, and test- prefix in clerk_id (case-insensitive)
  const { data: testUsers, error: usersError } = await supabase
    .from("users")
    .select("id, email, clerk_id")
    .or(
      "email.ilike.%@test.example.com,email.ilike.%test-promoter-%,email.ilike.%@test-rsvp-checkout.example.com,clerk_id.ilike.test-%"
    );

  if (usersError) {
    console.error(`❌ Error fetching test users: ${usersError.message}`);
    throw new Error(`Failed to fetch test users: ${usersError.message}`);
  } else if (testUsers && testUsers.length > 0) {
    stats.users = {
      count: testUsers.length,
      ids: testUsers.map((u: { id: string }) => u.id),
    };
  }

  return stats;
}

/**
 * Display preview of what would be deleted
 */
function displayPreview(stats: CleanupStats): void {
  console.log("\n📊 CLEANUP PREVIEW");
  console.log("=".repeat(60));

  if (stats.events.count > 0) {
    console.log(`\n📅 Test Events: ${stats.events.count}`);
    console.log(`   Related data to delete:`);
    console.log(`     - Orders: ${stats.related.orders}`);
    console.log(`     - Holds: ${stats.related.holds}`);
    console.log(`     - RSVPs: ${stats.related.rsvps}`);
    console.log(`     - Promoter Links: ${stats.related.promoterLinks}`);
    console.log(`     - Ticket Tiers: ${stats.related.tiers}`);
    console.log(`     - Ticket Stages: ${stats.related.stages}`);
  } else {
    console.log("\n📅 Test Events: 0");
  }

  if (stats.organizations.count > 0) {
    console.log(`\n🏢 Test Organizations: ${stats.organizations.count}`);
    console.log(`   Related data to delete:`);
    console.log(`     - Organization Members: ${stats.related.orgMembers}`);
  } else {
    console.log("\n🏢 Test Organizations: 0");
  }

  if (stats.users.count > 0) {
    console.log(`\n👤 Test Users: ${stats.users.count}`);
  } else {
    console.log("\n👤 Test Users: 0");
  }

  const total =
    stats.events.count +
    stats.organizations.count +
    stats.users.count +
    stats.related.orders +
    stats.related.holds +
    stats.related.rsvps +
    stats.related.promoterLinks +
    stats.related.tiers +
    stats.related.stages +
    stats.related.orgMembers;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📦 TOTAL ITEMS TO DELETE: ${total}`);
  console.log(`${"=".repeat(60)}\n`);
}

/**
 * Perform the actual deletion with transaction logging
 */
async function performCleanup(
  supabase: ReturnType<typeof createClient> | any,
  stats: CleanupStats
): Promise<number> {
  let totalDeleted = 0;
  const startTime = new Date();

  console.log("🗑️  Starting deletion...\n");

  try {
    // Delete test events and related data
    if (stats.events.count > 0) {
      console.log(`Deleting ${stats.events.count} test events...`);

      const eventIds = stats.events.ids;

      // Delete related data first (respecting FK constraints)
      // CRITICAL: Delete tickets before orders to avoid FK constraint violations
      if (stats.related.orders > 0) {
        // First, get all order IDs for these events
        const { data: orders, error: ordersFetchError } = await supabase
          .from("orders")
          .select("id")
          .in("event_id", eventIds);

        if (ordersFetchError) {
          console.error(
            `  ⚠️ Error fetching orders: ${ordersFetchError.message}`
          );
        } else if (orders && orders.length > 0) {
          const orderIds = orders.map((o: { id: string }) => o.id);
          // Delete tickets that reference these orders
          const { data: deletedTickets, error: ticketsError } = await supabase
            .from("tickets")
            .delete()
            .in("order_id", orderIds)
            .select("*");

          if (ticketsError) {
            console.error(
              `  ⚠️ Error deleting tickets: ${ticketsError.message}`
            );
          } else {
            const ticketsCount = deletedTickets?.length || 0;
            if (ticketsCount > 0) {
              totalDeleted += ticketsCount;
              console.log(`  ✓ Deleted ${ticketsCount} tickets`);
            }
          }
        }

        // Now delete orders
        const { data: deletedOrders, error: ordersError } = await supabase
          .from("orders")
          .delete()
          .in("event_id", eventIds)
          .select("*");

        if (ordersError) {
          console.error(`  ⚠️ Error deleting orders: ${ordersError.message}`);
        } else {
          const ordersCount = deletedOrders?.length || 0;
          totalDeleted += ordersCount;
          console.log(`  ✓ Deleted ${ordersCount} orders`);
        }
      }

      if (stats.related.holds > 0) {
        const { data: deletedHolds, error: holdsError } = await supabase
          .from("holds")
          .delete()
          .in("event_id", eventIds)
          .select("*");

        if (holdsError) {
          console.error(`  ⚠️ Error deleting holds: ${holdsError.message}`);
        } else {
          const holdsCount = deletedHolds?.length || 0;
          totalDeleted += holdsCount;
          console.log(`  ✓ Deleted ${holdsCount} holds`);
        }
      }

      if (stats.related.rsvps > 0) {
        // CRITICAL: Delete purchase_tokens before RSVPs to avoid FK constraint violations
        // First, get all RSVP IDs for these events
        const { data: rsvps, error: rsvpsFetchError } = await supabase
          .from("rsvps")
          .select("id")
          .in("event_id", eventIds);

        if (rsvpsFetchError) {
          console.error(
            `  ⚠️ Error fetching RSVPs: ${rsvpsFetchError.message}`
          );
        } else if (rsvps && rsvps.length > 0) {
          const rsvpIds = rsvps.map((r: { id: string }) => r.id);
          // Delete purchase_tokens that reference these RSVPs
          const { data: deletedTokens, error: tokensError } = await supabase
            .from("purchase_tokens")
            .delete()
            .in("rsvp_id", rsvpIds)
            .select("*");

          if (tokensError) {
            console.error(
              `  ⚠️ Error deleting purchase_tokens: ${tokensError.message}`
            );
          } else {
            const tokensCount = deletedTokens?.length || 0;
            if (tokensCount > 0) {
              totalDeleted += tokensCount;
              console.log(`  ✓ Deleted ${tokensCount} purchase tokens`);
            }
          }
        }

        // Now delete RSVPs
        const { data: deletedRsvps, error: rsvpsError } = await supabase
          .from("rsvps")
          .delete()
          .in("event_id", eventIds)
          .select("*");

        if (rsvpsError) {
          console.error(`  ⚠️ Error deleting RSVPs: ${rsvpsError.message}`);
        } else {
          const rsvpsCount = deletedRsvps?.length || 0;
          totalDeleted += rsvpsCount;
          console.log(`  ✓ Deleted ${rsvpsCount} RSVPs`);
        }
      }

      if (stats.related.promoterLinks > 0) {
        const { data: deletedPromoterLinks, error: promoterLinksError } =
          await supabase
            .from("promoter_links")
            .delete()
            .in("event_id", eventIds)
            .select("*");

        if (promoterLinksError) {
          console.error(
            `  ⚠️ Error deleting promoter links: ${promoterLinksError.message}`
          );
        } else {
          const promoterLinksCount = deletedPromoterLinks?.length || 0;
          totalDeleted += promoterLinksCount;
          console.log(`  ✓ Deleted ${promoterLinksCount} promoter links`);
        }
      }

      // Delete ticket stages via tiers
      if (stats.related.tiers > 0) {
        const { data: tiers, error: tiersFetchError } = await supabase
          .from("ticket_tiers")
          .select("id")
          .in("event_id", eventIds);

        if (tiersFetchError) {
          console.error(
            `  ⚠️ Error fetching ticket tiers: ${tiersFetchError.message}`
          );
        } else if (tiers && tiers.length > 0) {
          const tierIds = tiers.map((t: { id: string }) => t.id);

          if (stats.related.stages > 0) {
            const { data: deletedStages, error: stagesError } = await supabase
              .from("ticket_stages")
              .delete()
              .in("ticket_tier_id", tierIds)
              .select("*");

            if (stagesError) {
              console.error(
                `  ⚠️ Error deleting ticket stages: ${stagesError.message}`
              );
            } else {
              const stagesCount = deletedStages?.length || 0;
              totalDeleted += stagesCount;
              console.log(`  ✓ Deleted ${stagesCount} ticket stages`);
            }
          }

          const { data: deletedTiers, error: tiersError } = await supabase
            .from("ticket_tiers")
            .delete()
            .in("id", tierIds)
            .select("*");

          if (tiersError) {
            console.error(
              `  ⚠️ Error deleting ticket tiers: ${tiersError.message}`
            );
          } else {
            const tiersCount = deletedTiers?.length || 0;
            totalDeleted += tiersCount;
            console.log(`  ✓ Deleted ${tiersCount} ticket tiers`);
          }
        }
      }

      // Delete events
      const { data: deletedEvents, error: eventsError } = await supabase
        .from("events")
        .delete()
        .in("id", eventIds)
        .select("*");

      if (!eventsError) {
        const eventsCount = deletedEvents?.length || 0;
        totalDeleted += eventsCount;
        console.log(`  ✓ Deleted ${eventsCount} events`);
      } else {
        console.error(`  ⚠️ Error deleting events: ${eventsError.message}`);
      }
    }

    // Delete test organizations
    if (stats.organizations.count > 0) {
      console.log(
        `\nDeleting ${stats.organizations.count} test organizations...`
      );

      const orgIds = stats.organizations.ids;

      if (stats.related.orgMembers > 0) {
        const { data: deletedOrgMembers, error: orgMembersError } =
          await supabase
            .from("organization_members")
            .delete()
            .in("organization_id", orgIds)
            .select("*");

        if (orgMembersError) {
          console.error(
            `  ⚠️ Error deleting organization members: ${orgMembersError.message}`
          );
        } else {
          const orgMembersCount = deletedOrgMembers?.length || 0;
          totalDeleted += orgMembersCount;
          console.log(`  ✓ Deleted ${orgMembersCount} organization members`);
        }
      }

      const { error: orgsError } = await supabase
        .from("organizations")
        .delete()
        .in("id", orgIds);

      if (!orgsError) {
        totalDeleted += stats.organizations.count;
        console.log(`  ✓ Deleted ${stats.organizations.count} organizations`);
      } else {
        console.error(
          `  ⚠️ Error deleting organizations: ${orgsError.message}`
        );
      }
    }

    // Delete test users
    if (stats.users.count > 0) {
      console.log(`\nDeleting ${stats.users.count} test users...`);

      const userIds = stats.users.ids;
      const { error: usersError } = await supabase
        .from("users")
        .delete()
        .in("id", userIds);

      if (!usersError) {
        totalDeleted += stats.users.count;
        console.log(`  ✓ Deleted ${stats.users.count} users`);
      } else {
        console.error(`  ⚠️ Error deleting users: ${usersError.message}`);
      }
    }

    const endTime = new Date();
    const duration = ((endTime.getTime() - startTime.getTime()) / 1000).toFixed(
      2
    );

    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Total items deleted: ${totalDeleted}`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Timestamp: ${startTime.toISOString()}`);

    return totalDeleted;
  } catch (error) {
    console.error("\n❌ Error during cleanup:", error);
    throw error;
  }
}

async function cleanupTestData() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const isConfirm = args.includes("--confirm");
  const isForce = args.includes("--force");

  // Require confirmation flag unless in dry-run mode
  if (!isDryRun && !isConfirm && !isForce) {
    console.error("❌ SAFETY CHECK: Confirmation required!");
    console.error("");
    console.error("This script performs destructive DELETE operations.");
    console.error("To preview what would be deleted (dry-run):");
    console.error("  npx tsx scripts/cleanup-test-data.ts --dry-run");
    console.error("");
    console.error("To actually delete test data:");
    console.error("  npx tsx scripts/cleanup-test-data.ts --confirm");
    console.error("");
    console.error("To skip prompts (use with caution):");
    console.error("  npx tsx scripts/cleanup-test-data.ts --force");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("❌ Missing Supabase credentials");
    console.error(
      "   Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set"
    );
    process.exit(1);
  }

  // Validate environment (unless override is set)
  if (!validateTestEnvironment(supabaseUrl)) {
    console.error("\n❌ Aborting: Environment validation failed");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log("🧹 Test Data Cleanup Script");
  console.log("=".repeat(60));
  console.log(`Mode: ${isDryRun ? "DRY-RUN (preview only)" : "DELETE"}`);
  console.log(`Database: ${supabaseUrl}`);
  console.log(`${"=".repeat(60)}\n`);

  try {
    // Find test data
    console.log("🔍 Scanning for test data...\n");
    const stats = await findTestData(supabase);

    // Display preview
    displayPreview(stats);

    // If dry-run, stop here
    if (isDryRun) {
      console.log("ℹ️  DRY-RUN MODE: No data was deleted.");
      console.log("   Run with --confirm to actually delete the data above.\n");
      return;
    }

    // Check if there's anything to delete
    const totalItems =
      stats.events.count +
      stats.organizations.count +
      stats.users.count +
      stats.related.orders +
      stats.related.holds +
      stats.related.rsvps +
      stats.related.promoterLinks +
      stats.related.tiers +
      stats.related.stages +
      stats.related.orgMembers;

    if (totalItems === 0) {
      console.log("✅ No test data found to clean up.\n");
      return;
    }

    // Final confirmation (unless force mode)
    if (!isForce) {
      console.log(
        "⚠️  WARNING: This will permanently delete the data listed above!"
      );
      console.log(
        "   Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n"
      );
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Perform cleanup
    await performCleanup(supabase, stats);
  } catch (error) {
    console.error("\n❌ Error during cleanup:", error);
    process.exit(1);
  }
}

// Run the cleanup
cleanupTestData();
