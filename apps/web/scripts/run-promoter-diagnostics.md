# How to Run Promoter Tracking Diagnostics

## Step 1: Get the Event ID

First, you need to find the Kora event ID. You can do this two ways:

### Option A: Using Supabase Dashboard

1. Go to your Supabase dashboard
2. Open the SQL Editor
3. Run this query:

```sql
SELECT
  id,
  name,
  slug,
  starts_at
FROM events
WHERE name ILIKE '%kora%'
  OR slug ILIKE '%kora%'
ORDER BY created_at DESC;
```

4. Copy the `id` value (looks like: `550e8400-e29b-41d4-a716-446655440000`)

### Option B: From the URL

If you know the event page URL:

- URL: `https://flametickets.com/events/el-calenton-kora-3`
- The slug is: `el-calenton-kora-3`

Then run:

```sql
SELECT id FROM events WHERE slug = 'el-calenton-kora-3';
```

## Step 2: Run Diagnostic Queries

Open the file: `scripts/diagnose-promoter-tracking.sql`

**For each query:**

1. Replace `'YOUR_EVENT_ID'` with the actual event ID
2. Run the query in Supabase SQL Editor
3. Screenshot or copy the results

## Step 3: Interpret Results

### Query 1: Overview

**What to look for:**

- `percentage_attributed` < 30% → **Problem**: Most users NOT using promoter links
- `percentage_attributed` > 70% → **Good**: Promoter system working
- `orders_without_promoter` > 10 → Need to investigate why

**Example Good Result:**

```
total_orders: 45
orders_with_promoter: 38
orders_without_promoter: 7
percentage_attributed: 84.44%  ✅ GOOD
```

**Example Bad Result:**

```
total_orders: 45
orders_with_promoter: 8
orders_without_promoter: 37
percentage_attributed: 17.78%  ❌ PROBLEM - Users not using promoter links!
```

### Query 2: Breakdown by Promoter Code

**What to look for:**

- Large number of `[NO CODE]` orders → Users finding event organically
- Expected promoter codes showing up → System working
- Unexpected/weird codes → Possible typos or issues

**Example:**

```
promoter_code  | order_count | tickets | revenue_usd
----------------|-------------|---------|------------
[NO CODE]      | 37          | 89      | 2,670.00    ⚠️ Most orders have no code!
MARIA2024      | 4           | 8       | 240.00      ✅ Working
CARLOS123      | 2           | 4       | 120.00      ✅ Working
JUANPR         | 2           | 4       | 120.00      ✅ Working
```

### Query 3: Compare Links vs Usage

**What to look for:**

- Promoters with `⚠️ ZERO SALES` → Their links aren't being used at all
- This means either:
  - They didn't actually send the links
  - People are finding the event another way
  - Links were sent wrong (screenshot, wrong URL, etc.)

**Example:**

```
promoter_code | promoter_name    | orders | status
--------------|------------------|--------|------------------
MARIA2024     | Maria Rodriguez  | 8      | ✅ ACTIVE
CARLOS123     | Carlos Perez     | 0      | ⚠️ ZERO SALES
JUANPR        | Juan PR Team     | 0      | ⚠️ ZERO SALES
LUISA99       | Luisa Garcia     | 2      | 🟡 LOW SALES
```

**Action:** Call Carlos and Juan - ask if they actually sent their links!

### Query 4: Hourly Pattern

**What to look for:**

- Times when `without_promoter` spikes → Organic traffic (social post? ad?)
- Consistent `with_promoter` → Promoter campaign working

### Query 5: Recent Orders Detail

**What to look for:**

- Recent string of orders all missing promoter code?
- Pattern in payment methods?

### Query 6: Orphaned Codes

**If this returns rows:** Someone is using promoter codes that don't exist in the system!

Possible causes:

- Old codes from deleted promoter links
- Typos in manually typed URLs
- Testing codes that were never officially created

### Query 7: Multiple Purchases

**If users are buying multiple times:**

- With different promoter codes → Suspicious (testing?)
- Without promoter codes → They're regular customers

## Step 4: Summary Report

After running all queries, create a summary:

```
PROMOTER TRACKING DIAGNOSTIC RESULTS
Event: [Event Name]
Period: Last 14 days

FINDINGS:
✅ Total Orders: [X]
⚠️ Orders with Promoter Code: [X] ([XX]%)
❌ Orders without Promoter Code: [X] ([XX]%)

PROMOTER PERFORMANCE:
- [Promoter 1]: [X] orders ✅
- [Promoter 2]: 0 orders ⚠️ NOT WORKING
- [Promoter 3]: [X] orders ✅

CONCLUSION:
[Your analysis here]
```

## Step 5: Next Actions Based on Results

### If percentage_attributed < 30%:

**Problem:** Users are NOT using promoter links

**Actions:**

1. Interview promoters: "Did you actually send the links?"
2. Test link sharing: Send via WhatsApp, does `?promoter=` survive?
3. Check if event is being advertised elsewhere (ads, social media)
4. Ask: "How are people finding out about the event?"

### If promoters have ZERO SALES:

**Problem:** Their links aren't being used

**Actions:**

1. Ask promoter: "Show me the exact message you sent"
2. Verify they clicked "Copy URL" button, not typed manually
3. Check if they posted publicly vs. sent directly
4. Verify the link they sent still has `?promoter=CODE`

### If orphaned codes exist:

**Problem:** Wrong codes being used

**Actions:**

1. Check if codes match old/deleted promoter links
2. Verify promoters are copying from current dashboard
3. Check for typos in manually typed URLs

## Need Help?

If results are confusing, send screenshots of:

1. Query 1 results (Overview)
2. Query 2 results (Breakdown by code)
3. Query 3 results (Promoter links vs actual usage)

This will show the core problem immediately.
