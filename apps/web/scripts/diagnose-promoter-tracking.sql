-- Promoter Tracking Diagnostic Queries
-- Run these queries to understand what's happening with promoter attribution

-- ====================================================================
-- QUERY 1: Overview - Recent Orders by Promoter Attribution
-- ====================================================================
-- This shows how many orders have promoter codes vs. not
-- Replace 'YOUR_EVENT_ID' with the actual Kora event ID

SELECT 
  COUNT(*) as total_orders,
  COUNT(promoter_code) as orders_with_promoter,
  COUNT(*) - COUNT(promoter_code) as orders_without_promoter,
  ROUND(
    (COUNT(promoter_code)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 
    2
  ) as percentage_attributed,
  SUM(quantity) as total_tickets,
  SUM(CASE WHEN promoter_code IS NOT NULL THEN quantity ELSE 0 END) as tickets_with_promoter,
  SUM(CASE WHEN promoter_code IS NULL THEN quantity ELSE 0 END) as tickets_without_promoter
FROM orders 
WHERE event_id = 'YOUR_EVENT_ID'  -- ⚠️ REPLACE THIS
  AND status = 'completed'
  AND created_at > NOW() - INTERVAL '14 days';

-- Expected result:
-- If percentage_attributed is LOW (< 30%), users are mostly buying without promoter links
-- If percentage_attributed is HIGH (> 70%), promoter system is working well


-- ====================================================================
-- QUERY 2: Breakdown by Promoter Code
-- ====================================================================
-- Shows which promoter codes are actually being used

SELECT 
  COALESCE(promoter_code, '[NO CODE]') as promoter_code,
  COUNT(*) as order_count,
  SUM(quantity) as total_tickets,
  SUM(total_amount_cents) as total_revenue_cents,
  ROUND(SUM(total_amount_cents) / 100.0, 2) as total_revenue_usd,
  MIN(created_at) as first_purchase,
  MAX(created_at) as last_purchase
FROM orders 
WHERE event_id = 'YOUR_EVENT_ID'  -- ⚠️ REPLACE THIS
  AND status = 'completed'
  AND created_at > NOW() - INTERVAL '14 days'
GROUP BY promoter_code
ORDER BY order_count DESC;

-- Look for:
-- - How many orders have '[NO CODE]' (null promoter_code)
-- - Are the promoter codes you expect showing up?
-- - Are there any unexpected/malformed codes?


-- ====================================================================
-- QUERY 3: Compare Created Promoter Links vs. Actual Usage
-- ====================================================================
-- Shows which promoter links exist but aren't being used

WITH promoter_stats AS (
  SELECT 
    pl.promoter_code,
    pl.promoter_name,
    pl.created_at as link_created_at,
    COUNT(o.id) as order_count,
    SUM(o.quantity) as tickets_sold,
    SUM(o.total_amount_cents) as revenue_cents
  FROM promoter_links pl
  LEFT JOIN orders o 
    ON o.promoter_code = pl.promoter_code 
    AND o.event_id = pl.event_id
    AND o.status = 'completed'
    AND o.created_at > NOW() - INTERVAL '14 days'
  WHERE pl.event_id = 'YOUR_EVENT_ID'  -- ⚠️ REPLACE THIS
  GROUP BY pl.id, pl.promoter_code, pl.promoter_name, pl.created_at
)
SELECT 
  promoter_code,
  promoter_name,
  link_created_at,
  COALESCE(order_count, 0) as orders,
  COALESCE(tickets_sold, 0) as tickets,
  ROUND(COALESCE(revenue_cents, 0) / 100.0, 2) as revenue_usd,
  CASE 
    WHEN COALESCE(order_count, 0) = 0 THEN '⚠️ ZERO SALES'
    WHEN COALESCE(order_count, 0) < 3 THEN '🟡 LOW SALES'
    ELSE '✅ ACTIVE'
  END as status
FROM promoter_stats
ORDER BY orders DESC;

-- Look for:
-- - Promoters with ZERO SALES (⚠️) - their links aren't being used
-- - This could mean: links not sent, or users finding event another way


-- ====================================================================
-- QUERY 4: Hourly Pattern Analysis
-- ====================================================================
-- Shows when orders with/without promoter codes happen

SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as total_orders,
  COUNT(promoter_code) as with_promoter,
  COUNT(*) - COUNT(promoter_code) as without_promoter,
  STRING_AGG(DISTINCT promoter_code, ', ') as codes_used
FROM orders 
WHERE event_id = 'YOUR_EVENT_ID'  -- ⚠️ REPLACE THIS
  AND status = 'completed'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour DESC;

-- Look for:
-- - Bursts of orders without promoter codes (organic traffic spike?)
-- - Times when promoter codes ARE working vs. aren't


-- ====================================================================
-- QUERY 5: Recent Orders Detail View
-- ====================================================================
-- Shows last 50 orders with key details for manual inspection

SELECT 
  id,
  created_at,
  COALESCE(promoter_code, '[NONE]') as promoter_code,
  quantity,
  total_amount_cents / 100.0 as amount_usd,
  payment_method,
  payment_provider,
  SUBSTRING(user_id::text, 1, 8) || '...' as user_id_prefix
FROM orders 
WHERE event_id = 'YOUR_EVENT_ID'  -- ⚠️ REPLACE THIS
  AND status = 'completed'
ORDER BY created_at DESC
LIMIT 50;

-- Look for:
-- - Pattern: are recent orders missing promoter codes?
-- - Are they all the same payment method?
-- - Are they clustered in time?


-- ====================================================================
-- QUERY 6: Check for Orphaned Promoter Codes
-- ====================================================================
-- Shows orders with promoter codes that DON'T match any created promoter link
-- (Could indicate manual URL typing or link sharing issues)

SELECT 
  o.promoter_code,
  COUNT(*) as order_count,
  SUM(o.quantity) as tickets_sold,
  MIN(o.created_at) as first_seen,
  MAX(o.created_at) as last_seen
FROM orders o
LEFT JOIN promoter_links pl 
  ON pl.promoter_code = o.promoter_code 
  AND pl.event_id = o.event_id
WHERE o.event_id = 'YOUR_EVENT_ID'  -- ⚠️ REPLACE THIS
  AND o.status = 'completed'
  AND o.promoter_code IS NOT NULL
  AND pl.id IS NULL  -- No matching promoter link
GROUP BY o.promoter_code;

-- If this returns rows:
-- - Promoter codes are being used that weren't officially created
-- - Could be typos, old codes, or testing


-- ====================================================================
-- QUERY 7: User Purchase Pattern (Multiple Purchases)
-- ====================================================================
-- Check if same users are buying multiple times with different promoter codes
-- (Could indicate confusion or testing)

SELECT 
  o.user_id,
  COUNT(*) as purchase_count,
  COUNT(DISTINCT promoter_code) as different_promoter_codes,
  STRING_AGG(DISTINCT COALESCE(promoter_code, '[NONE]'), ' | ') as codes_used,
  MIN(o.created_at) as first_purchase,
  MAX(o.created_at) as last_purchase
FROM orders o
WHERE o.event_id = 'YOUR_EVENT_ID'  -- ⚠️ REPLACE THIS
  AND o.status = 'completed'
GROUP BY o.user_id
HAVING COUNT(*) > 1  -- Only users with multiple purchases
ORDER BY purchase_count DESC;

-- Look for:
-- - Users with multiple purchases but no promoter code
-- - Users with different promoter codes (suspicious)


-- ====================================================================
-- QUERY 8: Get the Event ID
-- ====================================================================
-- If you don't know the event ID, run this first to find it

SELECT 
  id,
  name,
  slug,
  starts_at,
  status,
  created_at
FROM events 
WHERE name ILIKE '%kora%'  -- Change this to match your event name
  OR slug ILIKE '%kora%'
ORDER BY created_at DESC
LIMIT 10;

-- Copy the 'id' value and use it in the queries above
