# Stage Availability & Hold Expiration Test Suite

## ✅ Test Suite Created

Comprehensive test suite covering all aspects of the stage availability system:

### Test Files Created

1. **`stage-availability-functions.test.ts`** (Database Functions)
   - Tests `get_tier_stage_availability()`
   - Tests `get_stage_availability()`
   - Tests `cleanup_expired_holds()`
   - Verifies stage progression, negative clamping, hold calculations

2. **`stage-progression-logic.test.ts`** (Pure Logic)
   - Simulates stage progression algorithm
   - Tests edge cases without database
   - Verifies clamping behavior

3. **`hold-expiration-flow.test.ts`** (Integration)
   - Tests complete hold lifecycle
   - Verifies availability updates after expiration
   - Tests stage progression after cleanup

4. **`payment-protection.test.ts`** (Payment Protection)
   - Tests 15-minute grace period for payment
   - Verifies protected holds survive cleanup
   - Tests abandoned payment cleanup

5. **`availability-api.test.ts`** (API Endpoints)
   - Tests `/api/ticket-tiers/[tierId]/availability`
   - Verifies response structure
   - Tests error handling

6. **`real-time-availability-hook.test.ts`** (React Hooks)
   - Tests `useTicketAvailability` hook
   - Tests `useMultipleTicketAvailability` hook
   - Verifies change detection and memory leak prevention

## 🎯 What These Tests Verify

### ✅ Stage Progression Logic
- First stage is current when no tickets sold
- Next stage opens only when previous stage is completely full (sold + held >= total)
- Partial fills keep current stage active
- All stages sold out → no current stage

### ✅ Negative Availability Prevention
- Clamped to zero when sold + held > total
- Handles data drift gracefully
- Never returns negative values

### ✅ Hold Expiration & Cleanup
- Active holds reduce availability
- Expired holds are ignored in calculations
- Cleanup removes expired holds
- Holds with orders are ignored

### ✅ Payment Protection
- Holds protected during payment (15-minute grace period)
- Expired holds without protection are cleaned up
- Prevents stuck transactions

### ✅ Data Consistency
- Tier availability = sum of stage availabilities
- Tier held = sum of stage held quantities
- Consistency maintained across operations

### ✅ Real-time Updates
- Polling works correctly
- Change detection works
- Memory leaks prevented
- Data merges correctly with SSR

## 🚀 Running Tests

### Prerequisites

**✅ If you already have `.env.local` with Supabase credentials, you're all set!**

Vitest automatically loads environment variables from:
1. `.env.test` (if exists, takes precedence)
2. `.env.local` (your existing file)
3. `process.env` (exported variables)

**Just run:**
```bash
pnpm test
```

**Option 1: Use existing `.env.local` (Easiest)**

If you already have `.env.local` with:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Then tests will work automatically! No setup needed.

**Option 2: Create `.env.test` (Optional - for test-specific values)**

```bash
cp .env.test.example .env.test
# Edit .env.test with test database credentials
pnpm test
```

**Option 3: Export in shell session**

```bash
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
pnpm test
```

📖 **See `TEST_ENV_SETUP.md` for detailed setup instructions**

### Run All Tests
```bash
pnpm test
```

### Run Specific Test File
```bash
# Database function tests
pnpm test stage-availability-functions

# Stage progression logic (no DB required)
pnpm test stage-progression-logic

# Hold expiration flow
pnpm test hold-expiration-flow

# Payment protection
pnpm test payment-protection
```

### Run with UI
```bash
pnpm test:ui
```

### CI Mode (run once)
```bash
pnpm test:run
```

## 📋 Test Coverage

### Database Functions
- ✅ `get_tier_stage_availability()` - All scenarios
- ✅ `get_stage_availability()` - Single stage
- ✅ `cleanup_expired_holds()` - With payment protection

### API Endpoints
- ✅ `/api/ticket-tiers/[tierId]/availability` - Response structure
- ✅ Error handling
- ✅ Hold cleanup integration

### React Hooks
- ✅ `useTicketAvailability` - Single tier
- ✅ `useMultipleTicketAvailability` - Multiple tiers
- ✅ Change detection
- ✅ Memory leak prevention

### Edge Cases
- ✅ Single stage
- ✅ All stages sold out
- ✅ Zero quantity stages
- ✅ Data drift
- ✅ Concurrent updates
- ✅ Rapid hold creation/expiration

## 🔍 Test Scenarios

### Scenario 1: Basic Stage Progression
```
Stage 1 (5 tickets) → 0 sold → Current: Stage 1
Stage 1 (5 tickets) → 3 sold → Current: Stage 1 (2 available)
Stage 1 (5 tickets) → 5 sold → Current: Stage 2
```

### Scenario 2: Hold-Based Progression
```
Stage 1: 2 sold + 3 held = 5 total (full) → Stage 2 opens
Stage 1: 2 sold + 2 held = 4 total (not full) → Stage 1 still current
```

### Scenario 3: Hold Expiration
```
Create hold → Availability decreases
Hold expires → Cleanup runs → Availability increases
Stage progression updates accordingly
```

### Scenario 4: Payment Protection
```
Create hold → Start payment → Hold protected
Hold expires → Still protected (15min grace)
After 15min → Cleanup removes hold
```

## ⚠️ Note on Database Tests

Tests that require database connections will be **skipped** if Supabase credentials are not set. This is intentional to allow:
- Running logic tests without database
- Running full suite with database in CI/CD
- Local development without database access

To run database tests, ensure environment variables are set:
```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## 📊 Expected Results

All tests should pass, verifying:
1. ✅ Stage progression logic is correct
2. ✅ Negative availability is prevented
3. ✅ Hold expiration works correctly
4. ✅ Payment protection prevents stuck transactions
5. ✅ Real-time availability updates work
6. ✅ Data consistency is maintained

## 🔄 Continuous Integration

These tests should run:
- ✅ Before merging PRs
- ✅ Before deploying to production
- ✅ On schedule (daily/weekly)

## 📝 Manual Testing Checklist

After automated tests pass, verify manually:

- [ ] Create hold → see availability decrease in UI
- [ ] Wait for hold to expire → see availability increase
- [ ] Create hold → start payment → hold doesn't expire
- [ ] Complete payment → hold converted to order
- [ ] Stage progression works correctly in browser
- [ ] Real-time updates appear without refresh
- [ ] "Updated" indicator appears when availability changes

## 🐛 Known Issues / Limitations

1. **Database Tests Require Credentials**: Tests that hit the database will skip if credentials aren't set
2. **Test Data Cleanup**: Tests create and clean up data, but ensure test database is separate from production
3. **Timing**: Some tests rely on time-based logic (expiration, grace periods) - may need adjustment for CI environments

## 📚 Related Documentation

- `AVAILABILITY_TEST_SUITE.md` - Detailed test documentation
- `TESTING_GUIDE.md` - General testing guide
- Database migrations:
  - `20251114000000_improve_hold_expiration_handling.sql`
  - `20251115000000_add_payment_protection_to_holds.sql`


