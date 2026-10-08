-- Migration to add purchased_at to rsvps and fix data consistency
-- Applied on 2026-01-22

-- 1. Add missing purchased_at column to rsvps
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMP WITH TIME ZONE;

-- 2. Fix stuck RSVPs that are Approved but have a Paid/Completed Order
-- Uses DISTINCT ON to ensure deterministic order selection when multiple orders share idempotency_key
UPDATE rsvps r
SET status = 'purchased',
    purchased_at = COALESCE(o_latest.created_at, NOW()),
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (idempotency_key) 
    id, 
    idempotency_key, 
    created_at, 
    stripe_payment_intent_id 
  FROM orders 
  WHERE status != 'cancelled' 
  ORDER BY idempotency_key, created_at DESC
) o_latest
WHERE r.status = 'approved'
AND (
  o_latest.idempotency_key = 'free_' || r.id::text 
  OR (r.stripe_payment_intent_id IS NOT NULL AND o_latest.stripe_payment_intent_id = r.stripe_payment_intent_id)
);

-- 3. Fix ticket_tiers quantity_sold drift
-- Also auto-expand quantity_total if we oversold, to satisfy quantity_total_gte_quantity_sold constraint
-- Uses LEFT JOIN to ensure tiers with zero orders are reset to 0
UPDATE ticket_tiers tt
SET 
  quantity_sold = COALESCE(sub.actual_sold, 0),
  quantity_total = GREATEST(tt.quantity_total, COALESCE(sub.actual_sold, 0))
FROM (
  SELECT tt.id as ticket_tier_id, SUM(CASE WHEN o.status != 'cancelled' THEN o.quantity ELSE 0 END) as actual_sold
  FROM ticket_tiers tt
  LEFT JOIN orders o ON tt.id = o.ticket_tier_id
  GROUP BY tt.id
) sub
WHERE tt.id = sub.ticket_tier_id;

-- 4. Fix ticket_stages sold_quantity drift
UPDATE ticket_stages ts
SET sold_quantity = (
  SELECT COUNT(*)
  FROM tickets t
  JOIN orders o ON t.order_id = o.id
  WHERE t.metadata->>'stage_id' = ts.id::text
  AND o.status != 'cancelled'
);