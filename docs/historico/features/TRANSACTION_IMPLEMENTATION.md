# Transaction Implementation for Ticket Stages

## Overview

This document describes the implementation of atomic transactions for ticket stage operations, addressing the CodeRabbit suggestion to prevent database inconsistencies during stage updates.

## Problem Statement

Previously, stage operations (delete, update, insert) were executed sequentially without transaction protection. If an operation failed midway through processing multiple stages, the database could be left in an inconsistent state with some stages updated and others not, requiring manual intervention or retry operations.

## Solution

Implemented a PostgreSQL function that wraps all stage operations in a single atomic transaction, ensuring either all operations succeed or all fail together with automatic rollback.

## Implementation Details

### 1. PostgreSQL Function (`update_ticket_stages`)

**Location:** `supabase/migrations/20251006_add_update_ticket_stages_function.sql`

The function accepts:

- `p_ticket_tier_id` (UUID): The ticket tier to update
- `p_stages` (JSONB): Array of stage objects with id, name, price_cents, quantity, order_index

**Key Features:**

1. **Pre-validation**: Validates all quantities before any database changes
2. **Atomic Operations**: All deletes, updates, and inserts happen in a single transaction
3. **Business Rule Enforcement**:
   - Prevents reducing stage quantity below sold quantity
   - Prevents deletion of stages with sold tickets
   - Enforces optimistic locking for concurrent updates
4. **Automatic Rollback**: Any error triggers immediate rollback of all changes

**Transaction Flow:**

```
BEGIN (implicit)
  1. Validate all stage quantities
  2. Identify and validate stages to delete
  3. Delete stages (only those without sales)
  4. Update existing stages
  5. Insert new stages
COMMIT (if all succeed) or ROLLBACK (if any fail)
```

### 2. API Endpoint Update

**Location:** `app/api/ticket-tiers/route.ts` (PATCH method, lines 465-509)

**Before:**

```typescript
// Sequential operations without transaction protection
for (const stage of stages) {
  await supabaseAdmin.from("ticket_stages").update(...);
  // If this fails, previous updates are already committed
}
```

**After:**

```typescript
// Single atomic RPC call
const { data, error } = await supabaseAdmin.rpc("update_ticket_stages", {
  p_ticket_tier_id: validatedData.id,
  p_stages: stages,
});
// All operations succeed together or fail together
```

## Benefits

### 1. Data Consistency

- **Guaranteed Atomicity**: All stage operations complete together or none do
- **No Partial Updates**: Database never left in an inconsistent state
- **No Manual Cleanup**: Failed operations automatically rollback

### 2. Improved Error Handling

- **Clear Failure Points**: Errors are caught and handled comprehensively
- **Better User Experience**: Users get clear error messages without partial data corruption
- **Simplified Retry Logic**: Users can safely retry failed operations

### 3. Race Condition Protection

- **Optimistic Locking**: Concurrent updates are detected and prevented
- **Sold Quantity Validation**: Cannot reduce quantities below tickets already sold
- **Database Constraints**: CHECK constraints provide additional layer of protection

## Error Scenarios & Handling

### Scenario 1: Quantity Below Sold Amount

**Trigger:** Attempting to reduce stage quantity to less than tickets sold

**Response:**

- PostgreSQL exception raised with descriptive message
- Automatic rollback of all changes
- HTTP 400 error returned to client

### Scenario 2: Deleting Stage with Sales

**Trigger:** Attempting to delete a stage that has sold tickets

**Response:**

- PostgreSQL exception raised
- Automatic rollback
- HTTP 400 error with clear message

### Scenario 3: Concurrent Modification

**Trigger:** Two users editing the same stage simultaneously

**Response:**

- Optimistic lock failure detected
- Second update rejected with conflict error
- User prompted to refresh and retry

### Scenario 4: Mid-Transaction Failure

**Trigger:** Database error during stage creation/update

**Response:**

- All previous operations in the transaction are rolled back
- Database remains in pre-transaction state
- HTTP 500 error returned with details

## Migration Status

✅ **APPLIED** - The database migration has been successfully applied using Supabase MCP.

**Applied on:** October 6, 2025  
**Method:** Supabase MCP (Model Context Protocol)  
**Migrations Applied:**

1. `add_update_ticket_stages_function` - Creates the transaction function
2. `fix_update_ticket_stages_search_path` - Adds security hardening

### Verification Steps

To verify the migration is working:

1. Edit a ticket tier with multiple stages
2. Verify all stages update successfully
3. Try to reduce a stage quantity below sold amount (should fail)
4. Try to delete a stage with sales (should fail)
5. Confirm no partial updates occur on failures

The API endpoint is already integrated and is now using the transaction function.

## Testing

### Manual Testing Checklist

- [ ] Create multiple new stages (all should be created)
- [ ] Update multiple existing stages (all should update)
- [ ] Delete stages without sales (should succeed)
- [ ] Delete stage with sales (should fail, no changes)
- [ ] Reduce quantity below sold (should fail, no changes)
- [ ] Mix operations: add new + update existing (all or nothing)
- [ ] Trigger mid-transaction error (all changes rollback)

### Automated Testing

Tests are located in `__tests__/ticket-stages.test.ts` and cover:

- Atomic transaction behavior
- Rollback on validation failures
- Concurrent modification handling
- Business rule enforcement

## Performance Considerations

### Pros

- **Reduced Round Trips**: Single RPC call instead of multiple sequential queries
- **Database-Level Processing**: Operations execute within the database server
- **Better Locking**: PostgreSQL handles locking efficiently

### Cons

- **Slightly More Complex**: Requires maintaining PostgreSQL function
- **Debugging**: Function errors may be slightly harder to debug initially

**Overall Impact:** Net positive - better consistency with similar or improved performance.

## Rollback Plan

If the migration needs to be rolled back:

1. Revert API code changes in `app/api/ticket-tiers/route.ts`
2. Drop the function in Supabase:
   ```sql
   DROP FUNCTION IF EXISTS update_ticket_stages(UUID, JSONB);
   ```

**Note:** This is a low-risk migration since:

- The function is additive (doesn't modify existing schema)
- Old code will continue to work (though without transaction protection)
- No data migration required

## Conclusion

This implementation addresses the CodeRabbit suggestion by providing strong transaction guarantees for ticket stage operations. The solution ensures data consistency, improves error handling, and provides better protection against race conditions, all while maintaining good performance characteristics.

## References

- Original CodeRabbit Suggestion: Lines 465-616 in `app/api/ticket-tiers/route.ts`
- Migration File: `supabase/migrations/20251006_add_update_ticket_stages_function.sql`
- API Implementation: `app/api/ticket-tiers/route.ts` PATCH method
- Tests: `__tests__/ticket-stages.test.ts`
