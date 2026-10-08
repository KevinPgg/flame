# RSVP Status Inconsistency & Inventory Drift Fix

**Date:** January 22, 2026
**Issue:** "Sold Out" status appearing incorrectly for ticket stages due to double-counting of inventory.

## Problem Description
Users reported that the "General Admission - Regular" stage was showing as "Sold Out" despite having available inventory.

### Root Cause Analysis
1.  **Missing Column:** The `rsvps` table was missing the `purchased_at` timestamp column.
2.  **Failed Status Update:** When a free RSVP was approved, the system successfully created the order but failed to update the RSVP status from `approved` to `purchased` due to the missing column error.
3.  **Double Counting:**
    *   The availability logic calculates usage as: `quantity_sold` (from orders) + `quantity_reserved` (from pending/approved RSVPs).
    *   Because the RSVP remained `approved` (instead of `purchased`), it was counted in `quantity_reserved`.
    *   The created order was counted in `quantity_sold`.
    *   Result: 1 actual ticket was counted as 2 consumed slots.

## Fix Implementation

### 1. Database Schema Update
Added the missing `purchased_at` column to the `rsvps` table.

```sql
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMP WITH TIME ZONE;
```

### 2. Data Cleanup & Consistency
Applied a migration to fix existing data inconsistencies:

1.  **Fix Stuck RSVPs:** Updated `approved` RSVPs that had corresponding valid orders to `purchased` status.
2.  **Recalculate Tier Inventory:** Updated `ticket_tiers.quantity_sold` based on actual active order counts.
3.  **Recalculate Stage Inventory:** Updated `ticket_stages.sold_quantity` based on ticket metadata and active orders.

## Verification
*   Confirmed that the specific RSVP that caused the issue was updated to `purchased`.
*   Verified that the "General Admission - Regular" stage availability is now calculated correctly.

## Related Files
*   `supabase/migrations/20260122000000_add_purchased_at_to_rsvps.sql`
*   `app/api/organizer/rsvps/[id]/approve/route.ts` (Logic was correct, but failed due to DB schema)
