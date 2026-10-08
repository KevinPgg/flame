# Stage Validation Fix

## Problem Statement

Users were being automatically assigned to different ticket stages than what they selected. For example:

- Event has "Early Bird" stage with 2 tickets
- Two users both try to select "Early Bird"
- Instead of one getting Early Bird and the other getting a "sold out" error, the system was automatically assigning one user to "Early Bird" and the other to "Regular" (the next available stage)

This defeated the purpose of having users explicitly select ticket stages.

## Root Cause

The RSVP and holds creation flow was ignoring the user's stage selection:

1. **Frontend**: Users could select a specific stage (e.g., "Early Bird"), which set `selectedStageId`
2. **API**: The `stage_id` was sent in the request but not validated or used
3. **Database**: The `create_rsvp_atomic` function automatically determined which stage to assign based on availability, completely ignoring what the user selected

## Solution

### Changes Made

#### 1. API Routes Updated

- **`/app/api/rsvp/route.ts`**: Added `stage_id` to validation schema and passes it to the database function
- **`/app/api/holds/create/route.ts`**: Added `stage_id` to validation schema and validates stage availability before creating holds

#### 2. Database Function Updated

- **`create_rsvp_atomic` function** (`supabase/migrations/20251007000000_atomic_rsvp_creation.sql`):
  - Added optional `p_stage_id` parameter
  - When `p_stage_id` is provided, validates that specific stage has availability
  - Returns clear error messages if the requested stage is sold out
  - If `p_stage_id` is NULL, maintains backward compatibility by auto-assigning to current active stage

#### 3. Database Schema Updates

- **`20251007000001_add_stage_info_to_rsvps.sql`**: Adds `stage_id`, `stage_name`, `stage_price_cents` columns to `rsvps` table
- **`20251007000002_add_stage_info_to_holds.sql`**: Adds `stage_id`, `stage_name`, `stage_price_cents` columns to `holds` table

### Expected Behavior Now

1. User selects "Early Bird" stage
2. If "Early Bird" is sold out, they get an error: `The "Early Bird" stage is sold out. Please select another ticket option.`
3. User must manually select another stage (e.g., "Regular")
4. No automatic stage assignment happens

### Error Messages

The system now returns specific error messages:

- **Stage sold out**: `The "[Stage Name]" stage is sold out. Please select another ticket option.`
- **Insufficient quantity in stage**: `Only X ticket(s) available for the "[Stage Name]" stage. Please adjust your quantity or select another ticket option.`
- **Stage not found**: `The requested ticket stage is not found or no longer available.`

## Testing Instructions

### Prerequisites

1. Apply the database migrations:

   ```bash
   # If using Supabase CLI
   supabase db push

   # Or apply via Supabase MCP tools
   ```

### Test Scenario 1: Stage Sold Out (RSVP Events)

1. Create an event with `requires_rsvp = true`
2. Create a ticket tier with stages:
   - Early Bird: 2 tickets at $10
   - Regular: 10 tickets at $20
3. Have User A RSVP for 2 Early Bird tickets (should succeed)
4. Have User B try to RSVP for 1 Early Bird ticket
5. **Expected**: User B gets error `The "Early Bird" stage is sold out. Please select another ticket option.`
6. User B selects Regular tier instead
7. **Expected**: User B successfully creates RSVP for Regular tier

### Test Scenario 2: Stage Sold Out (Direct Purchase Events)

1. Create an event with `requires_rsvp = false`
2. Create a ticket tier with stages:
   - Early Bird: 2 tickets at $10
   - Regular: 10 tickets at $20
3. Have User A purchase 2 Early Bird tickets (should succeed)
4. Have User B try to purchase 1 Early Bird ticket
5. **Expected**: User B gets error during hold creation: `The "Early Bird" stage is sold out. Please select another ticket option.`
6. User B selects Regular tier instead
7. **Expected**: User B successfully creates hold and can proceed to purchase

### Test Scenario 3: Concurrent Requests (Race Condition)

This tests the atomic locking behavior:

1. Create a tier with stages: Early Bird: 1 ticket remaining
2. Have two users simultaneously click to RSVP for Early Bird (within milliseconds)
3. **Expected**:
   - First request acquires lock and succeeds
   - Second request waits for lock, then gets "sold out" error
   - No double-booking occurs

### Test Scenario 4: Partial Availability

1. Create a tier with stages: Early Bird: 2 tickets total
2. One ticket already sold (1 remaining)
3. User tries to RSVP for 2 Early Bird tickets
4. **Expected**: Error message `Only 1 ticket(s) available for the "Early Bird" stage. Please adjust your quantity or select another ticket option.`

### Test Scenario 5: Frontend Display

1. Create a tier with sold-out Early Bird stage
2. Load the event page
3. **Expected**:
   - Early Bird shows as "Sold Out" (red badge)
   - Card is disabled (grayed out, not clickable)
   - User cannot select it

## Database Changes Summary

### New Migrations

- `20251007000000_atomic_rsvp_creation.sql` - Updated function signature and logic
- `20251007000001_add_stage_info_to_rsvps.sql` - Add stage columns to rsvps
- `20251007000002_add_stage_info_to_holds.sql` - Add stage columns to holds

### Function Signature Changes

```sql
-- OLD
CREATE OR REPLACE FUNCTION create_rsvp_atomic(
  p_user_id UUID,
  p_event_id UUID,
  p_ticket_tier_id UUID,
  p_quantity INTEGER
)

-- NEW
CREATE OR REPLACE FUNCTION create_rsvp_atomic(
  p_user_id UUID,
  p_event_id UUID,
  p_ticket_tier_id UUID,
  p_quantity INTEGER,
  p_stage_id UUID DEFAULT NULL  -- New optional parameter
)
```

## Backward Compatibility

The changes are **backward compatible**:

- `p_stage_id` parameter has a DEFAULT NULL value
- If NULL is passed, the function behaves as before (auto-assigns to current stage)
- Existing API calls without `stage_id` will continue to work
- New columns in `rsvps` and `holds` tables allow NULL values

## Security Considerations

- Row-level locking (`FOR UPDATE`) prevents race conditions
- Stage validation happens atomically within a transaction
- All operations are rolled back on any error
- No way for users to bypass stage validation through the API

## Performance Impact

- Minimal: One additional conditional check in the database function
- Locking behavior unchanged (already locked ticket_tiers and ticket_stages)
- No additional database queries needed
- Client-side display logic unchanged

## Monitoring

To monitor stage assignment:

```sql
-- Check which stages RSVPs are assigned to
SELECT
  e.name as event_name,
  tt.name as tier_name,
  r.stage_name,
  COUNT(*) as rsvp_count
FROM rsvps r
JOIN ticket_tiers tt ON r.ticket_tier_id = tt.id
JOIN events e ON r.event_id = e.id
WHERE r.stage_name IS NOT NULL
GROUP BY e.name, tt.name, r.stage_name
ORDER BY e.name, tt.name, r.stage_name;
```

## Rollback Plan

If issues arise, to rollback:

1. Revert API changes to not pass `stage_id`
2. The database function will work as before (auto-assign)
3. New columns can remain (won't cause issues)
4. Or drop the migrations in reverse order if needed

## Related Files

- `/app/api/rsvp/route.ts`
- `/app/api/holds/create/route.ts`
- `/app/components/EventDetail.tsx`
- `/supabase/migrations/20251007000000_atomic_rsvp_creation.sql`
- `/supabase/migrations/20251007000001_add_stage_info_to_rsvps.sql`
- `/supabase/migrations/20251007000002_add_stage_info_to_holds.sql`
