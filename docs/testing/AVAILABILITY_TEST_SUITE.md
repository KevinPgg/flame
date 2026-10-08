# Stage Availability & Hold Expiration Test Suite

## Overview

This test suite verifies the complete stage availability system, including:
- Stage progression logic
- Hold expiration and cleanup
- Real-time availability updates
- Payment protection during holds
- Negative availability clamping
- Data consistency

## Test Files

### 1. `stage-availability-functions.test.ts`
**Database Function Tests**

Tests the core database functions:
- `get_tier_stage_availability()` - Returns availability for all stages
- `get_stage_availability()` - Returns availability for a single stage
- `cleanup_expired_holds()` - Removes expired holds

**Coverage:**
- ✅ Stage progression (when stages become available)
- ✅ Negative availability clamping
- ✅ Hold calculation (active vs expired)
- ✅ Data consistency (tier vs stage totals)

### 2. `stage-progression-logic.test.ts`
**Pure Logic Tests**

Tests the stage progression algorithm without database:
- Simulates `get_tier_stage_availability` logic
- Tests edge cases and concurrent scenarios
- Verifies clamping behavior

**Coverage:**
- ✅ Basic progression (first → second → third stage)
- ✅ Hold-based progression
- ✅ Negative availability clamping
- ✅ Edge cases (single stage, all sold out, zero quantity)

### 3. `hold-expiration-flow.test.ts`
**Integration Tests**

Tests the complete flow:
- Hold creation → expiration → cleanup → availability update
- Stage progression when holds expire
- Real-time availability updates

**Coverage:**
- ✅ Hold creation reduces availability
- ✅ Hold expiration restores availability
- ✅ Stage progression after expiration
- ✅ Cleanup removes expired holds

### 4. `payment-protection.test.ts`
**Payment Protection Tests**

Tests that holds are protected during payment:
- Holds with `payment_in_progress=true` are not deleted
- Expired holds without protection are cleaned up
- Payment flow protection

**Coverage:**
- ✅ Protected holds survive cleanup
- ✅ Unprotected expired holds are deleted
- ✅ Payment flow protection works end-to-end

### 5. `availability-api.test.ts`
**API Endpoint Tests**

Tests the `/api/ticket-tiers/[tierId]/availability` endpoint:
- Response structure
- Availability consistency
- Error handling
- Hold cleanup integration

**Coverage:**
- ✅ Response structure validation
- ✅ Tier/stage availability consistency
- ✅ Error handling
- ✅ Cleanup integration

### 6. `real-time-availability-hook.test.ts`
**React Hook Tests**

Tests the client-side hooks:
- `useTicketAvailability` - Single tier hook
- `useMultipleTicketAvailability` - Multiple tiers hook

**Coverage:**
- ✅ Change detection
- ✅ Polling behavior
- ✅ Memory leak prevention
- ✅ Data merging (real-time + SSR)

## Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test stage-availability-functions

# Run with UI
pnpm test:ui

# Run once (CI mode)
pnpm test:run
```

## Test Requirements

### Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Database Setup

Tests create and clean up test data automatically:
- Test users
- Test organizations
- Test events
- Test ticket tiers and stages
- Test holds

## Test Scenarios Covered

### ✅ Stage Progression
- [x] First stage is current when no tickets sold
- [x] Next stage opens when previous stage sells out
- [x] Partial stage consumption keeps current stage active
- [x] All stages sold out → no current stage

### ✅ Hold Management
- [x] Active holds reduce availability
- [x] Expired holds are ignored
- [x] Holds with orders are ignored
- [x] Cleanup removes expired holds
- [x] Protected holds survive cleanup

### ✅ Negative Availability Prevention
- [x] Clamped to zero when sold + held > total
- [x] Handles data drift gracefully
- [x] Never returns negative values

### ✅ Data Consistency
- [x] Tier availability = sum of stage availabilities
- [x] Tier held = sum of stage held quantities
- [x] Consistency maintained across all operations

### ✅ Payment Protection
- [x] Holds protected during payment flow
- [x] Expired holds without protection are cleaned up
- [x] Payment protection prevents stuck transactions

### ✅ Real-time Updates
- [x] Polling works correctly
- [x] Change detection works
- [x] Memory leaks prevented
- [x] Data merges correctly with SSR

## Expected Test Results

All tests should pass, verifying:
1. ✅ Stage progression logic is correct
2. ✅ Negative availability is prevented
3. ✅ Hold expiration works correctly
4. ✅ Payment protection prevents stuck transactions
5. ✅ Real-time availability updates work
6. ✅ Data consistency is maintained

## Continuous Integration

These tests should run in CI/CD pipeline:
- Before merging PRs
- Before deploying to production
- On schedule (daily/weekly)

## Manual Testing Checklist

After running automated tests, verify manually:

- [ ] Create hold → see availability decrease
- [ ] Wait for hold to expire → see availability increase
- [ ] Create hold → start payment → hold doesn't expire
- [ ] Complete payment → hold converted to order
- [ ] Stage progression works in UI
- [ ] Real-time updates appear in browser


