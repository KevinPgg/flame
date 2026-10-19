# Quick Promoter System Test

Run this quick test to verify your promoter tracking system is working correctly.

## One-Command Test

```bash
pnpm test promoter-tracking --run
```

Expected output:
```
✓ Promoter Link Management (3)
  ✓ should create promoter link with valid code
  ✓ should prevent duplicate promoter codes for same event
  ✓ should allow same promoter code for different events

✓ Promoter Code Tracking in Orders (3)
  ✓ should store promoter code when order is created
  ✓ should allow order creation without promoter code
  ✓ should accept any promoter code value (no FK constraint)

✓ Promoter Revenue Attribution with Stage Pricing (4)
  ✓ should correctly attribute revenue from stage 1 (Early Bird) purchases
  ✓ should correctly attribute revenue from stage 2 (Regular) purchases
  ✓ should aggregate statistics correctly for multiple orders
  (1 more)

✓ Promoter Code Validation (2)
✓ Historical Data Preservation (1)
✓ Query Performance (2)

Test Files  1 passed (1)
     Tests  15 passed (15)
  Duration  2.5s
```

## What Gets Verified

✅ **Database Schema** - All tables and columns exist  
✅ **Promoter Links** - Can create and manage links  
✅ **Order Tracking** - Promoter codes stored correctly  
✅ **Stage Pricing** - Revenue attributed at correct prices  
✅ **Data Integrity** - Historical data preserved  
✅ **Performance** - Queries use indexes efficiently  

## Manual Verification (Optional)

### 1. Check Database Tables

```sql
-- Verify promoter_links table exists
SELECT * FROM promoter_links LIMIT 1;

-- Verify orders.promoter_code column exists
SELECT id, promoter_code FROM orders WHERE promoter_code IS NOT NULL LIMIT 1;

-- Check indexes exist
SELECT indexname FROM pg_indexes 
WHERE tablename = 'orders' 
AND indexname = 'idx_orders_promoter_code';
```

### 2. Test Promoter Link Creation (Dashboard)

1. Log in as organizer
2. Navigate to event dashboard
3. Go to "Promotions" section
4. Scroll to "Promoter Links"
5. Create a new promoter link: `TESTPROMO`
6. Verify it appears in the list
7. Copy the promoter URL

### 3. Test Purchase with Promoter Code

1. Open promoter URL: `https://yoursite.com/events/event-slug?promoter=TESTPROMO`
2. Add ticket to cart
3. Complete purchase
4. Check order in database:

```sql
SELECT id, quantity, total_amount_cents, promoter_code 
FROM orders 
WHERE promoter_code = 'TESTPROMO' 
ORDER BY created_at DESC 
LIMIT 1;
```

### 4. Verify Statistics

1. Return to event dashboard
2. Check "Promoter Links" section
3. Find `TESTPROMO` row
4. Verify statistics show:
   - ✅ Tickets Sold: 1 (or your quantity)
   - ✅ Revenue: $XX.XX (correct amount)

## Troubleshooting

### Tests Fail with "Supabase client not initialized"

**Fix:** Add environment variables to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_url_here
SUPABASE_SERVICE_ROLE_KEY=your_key_here
```

Then restart the test:
```bash
pnpm test promoter-tracking --run
```

### Database Connection Errors

**Fix:** Verify your Supabase project is running and accessible:

```bash
# Test connection
curl https://your-project.supabase.co/rest/v1/
```

### Test Data Not Cleaning Up

**Manual cleanup:**
```sql
DELETE FROM orders WHERE idempotency_key LIKE 'test-%';
DELETE FROM holds WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'test-promoter-%@example.com'
);
DELETE FROM promoter_links WHERE promoter_code LIKE 'TEST%';
DELETE FROM ticket_stages WHERE ticket_tier_id IN (
  SELECT id FROM ticket_tiers WHERE name LIKE 'General Admission%'
);
-- Continue with other test data...
```

## Success Criteria

All tests pass = Promoter system is working correctly! ✅

You can now:
- Create promoter links in production
- Track sales attribution
- View accurate revenue statistics
- Be confident the system handles edge cases

