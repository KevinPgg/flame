# Ticket Tier and Stage Validation Reference

Complete documentation of all validation rules for normal ticket tiers and staged pricing tiers.

---

## Table of Contents

1. [Normal Ticket Tier Validations](#normal-ticket-tier-validations)
2. [Staged Ticket Tier Validations](#staged-ticket-tier-validations)
3. [RSVP Flow Validations](#rsvp-flow-validations)
4. [Hold/Direct Purchase Flow Validations](#holddirect-purchase-flow-validations)
5. [Database-Level Validations](#database-level-validations)

---

## Normal Ticket Tier Validations

### 1. **Creation Time Validations** (API Route: `/api/events` POST)

#### Basic Tier Requirements:

- **Name**: Required, 1-100 characters
- **Price**: Must be >= 0 cents
- **Quantity Total**: Must be >= 1
- **Per User Limit**: Must be 0-50
  - `0` = tier disabled/not available for purchase
  - `null` = unlimited
- **Sales Period**:
  - `sales_start` must be before `sales_end`
  - `sales_end` may be set to event start or any time before/after (no minimum gap required)

#### Event Date Requirements:

- Event `starts_at` must be at least 2 hours in the future
- Event `ends_at` must be after `starts_at`

#### Price Warning:

- Warns if price > $10,000 (1,000,000 cents) to catch potential cents vs dollars mistakes

**Location**: `app/api/events/route.ts` lines 332-356

---

### 2. **Purchase/RSVP Time Validations**

#### Sales Period Check:

```typescript
// Check if sales period is active
const now = new Date();
if (salesStart && now < salesStart) return false; // Sales haven't started
if (salesEnd && now > salesEnd) return false; // Sales have ended
```

#### Availability Check:

```typescript
// Check tier isn't sold out (including reserved tickets)
const totalSoldAndReserved = tier.quantity_sold + tier.quantity_reserved;
const available = tier.quantity_total - totalSoldAndReserved;
```

**What counts as "reserved"**:

- Pending RSVPs (status: 'pending')
- Approved RSVPs (status: 'approved')
- Active holds (non-expired, not yet converted to orders)

#### Organizer Manual Sold-Out (`ticket_tiers.is_manually_sold_out`):

A tier the organizer marked sold out is unavailable **regardless of capacity**. Enforced server-side on both purchase paths, inside the tier row lock:

- **RSVP:** `create_rsvp_atomic` (all overloads) raises `ERRCODE 23514` / `HINT 'SOLD_OUT'` (W7-H4, Aug 2026).
- **Hold/direct purchase:** `POST /api/holds/create` rejects up front with `code: "SOLD_OUT"`, and `atomic_create_hold_with_stage_validation` returns `{success: false, error: 'This ticket tier is sold out'}` (Oct 2026).
- **Not re-checked on completion:** holds created before the tier was closed are honored until they expire (≤30 min), and approved/pending RSVPs are unaffected. Organizer-issued tickets (bank transfer, promotional) bypass the flag by design.

**Location**: `app/components/EventDetail.tsx` lines 176-199

---

### 3. **Per-User Limit Validation**

Enforced at RSVP/purchase time:

```typescript
if (tier.per_user_limit === 0) {
  // Tier is disabled
  throw new Error("This ticket tier is not available for purchase");
}

if (quantity > tier.per_user_limit) {
  throw new Error(`Maximum ${tier.per_user_limit} tickets allowed per person`);
}
```

**Location**: `app/api/rsvp/route.ts` lines 159-176

---

### 4. **Event Capacity Validation**

```typescript
// Check total RSVPs against event max_attendees
const totalRsvps = count of RSVPs with status in ['pending', 'approved'];

if (totalRsvps >= event.max_attendees) {
  throw new Error("This event has reached maximum capacity");
}
```

**Location**: `app/api/rsvp/route.ts` lines 178-190

---

### 5. **Atomic Availability Check** (Database Function)

For tiers **without stages**, availability is validated atomically in the database:

```sql
-- Count reserved tickets
SELECT COALESCE(SUM(requested_quantity), 0) INTO v_reserved_by_rsvps
FROM rsvps
WHERE ticket_tier_id = p_ticket_tier_id
  AND status IN ('pending', 'approved');

-- Calculate available
v_available := tier.quantity_total - tier.quantity_sold - v_reserved_by_rsvps;

-- Validate
IF v_available <= 0 THEN
  RAISE EXCEPTION 'This ticket tier is sold out';
END IF;

IF p_quantity > v_available THEN
  RAISE EXCEPTION 'Only % tickets available', v_available;
END IF;
```

**Location**: `supabase/migrations/20251007000000_atomic_rsvp_creation.sql` lines 166-188

---

## Staged Ticket Tier Validations

### 1. **Creation Time Validations** (API Route: `/api/events` POST)

All normal tier validations **PLUS**:

#### Stage Requirements:

- **At least one stage** required when `useStages` is true
- Each stage must have:
  - **Name**: Required, non-empty
  - **Price**: >= 0 cents
  - **Quantity**: >= 1

#### Stage Quantity Validation:

```typescript
const totalStageQuantity = stages.reduce(
  (sum, stage) => sum + stage.quantity,
  0
);

if (totalStageQuantity !== tier.quantity_total) {
  throw new Error(
    `Stage quantities total (${totalStageQuantity}) must equal tier total (${tier.quantity_total})`
  );
}
```

#### Stage Price Warning:

- Same $10,000 warning applies per stage
- Warning (not error) if stage prices are not in ascending order

**Location**: `app/api/events/route.ts` lines 358-444

---

### 2. **Display Logic** (Frontend)

Stages are displayed as separate ticket options. Availability is calculated progressively:

```typescript
// Example: Early Bird (2 tickets) → Regular (2 tickets) = 4 total
// If 1 ticket sold:
//   - Early Bird: 1/2 available
//   - Regular: 2/2 available (untouched)

let cumulativeQuantity = 0;
const totalSoldAndReserved = tier.quantity_sold + tier.quantity_reserved;

for (const stage of sortedStages) {
  const stageStart = cumulativeQuantity;
  const stageEnd = cumulativeQuantity + stage.quantity;

  // Calculate sold/reserved in this specific stage
  const soldInStage = Math.max(
    0,
    Math.min(stage.quantity, totalSoldAndReserved - stageStart)
  );

  const available = stage.quantity - soldInStage;

  cumulativeQuantity = stageEnd;
}
```

**Location**: `app/components/EventDetail.tsx` lines 138-173

---

### 3. **Stage Selection Validation** (RSVP/Hold Creation)

Users can:

1. **Explicitly select a stage** by passing `stage_id`
2. **Auto-assign** by not passing `stage_id` (system picks current active stage)

#### Explicit Stage Selection:

```sql
-- User requested specific stage (e.g., Regular instead of Early Bird)
-- Validate that SPECIFIC stage has availability

FOR v_stage IN (SELECT * FROM ticket_stages ORDER BY order_index FOR UPDATE)
LOOP
  IF v_stage.id = p_stage_id THEN
    -- Calculate availability for THIS stage only
    v_available_in_stage := stage_end - MAX(total_sold_reserved, stage_start);

    IF v_available_in_stage <= 0 THEN
      RAISE EXCEPTION 'The "%" stage is sold out', stage.name;
    END IF;

    IF p_quantity > v_available_in_stage THEN
      RAISE EXCEPTION 'Only % ticket(s) available for the "%" stage',
        v_available_in_stage, stage.name;
    END IF;
  END IF;
END LOOP;
```

**Location**: `supabase/migrations/20251007000000_atomic_rsvp_creation.sql` lines 74-124

#### Auto-Assignment:

```sql
-- No stage_id provided - find the current active stage
FOR v_stage IN (SELECT * FROM ticket_stages ORDER BY order_index FOR UPDATE)
LOOP
  IF total_sold_reserved < cumulative_quantity + stage.quantity THEN
    -- This is the current stage
    v_current_stage_id := stage.id;
    v_available := (cumulative_quantity + stage.quantity) - total_sold_reserved;
    EXIT;
  END IF;
END LOOP;

-- Validate quantity fits in current stage
IF p_quantity > v_available THEN
  RAISE EXCEPTION 'Only % ticket(s) available at current "%" price',
    v_available, stage.name;
END IF;
```

**Location**: `supabase/migrations/20251007000000_atomic_rsvp_creation.sql` lines 126-164

---

### 4. **Stage Metadata Capture**

When an RSVP or hold is created, the stage information is **captured at that moment**:

```sql
INSERT INTO rsvps (
  user_id,
  event_id,
  ticket_tier_id,
  requested_quantity,
  status,
  stage_id,              -- Captured at creation
  stage_name,            -- Captured for historical reference
  stage_price_cents      -- Locked-in price
) VALUES (...);
```

This ensures:

- User sees consistent pricing through checkout
- Historical record of which stage was selected
- Price locks even if stage sells out during checkout

**Location**: `supabase/migrations/20251007000000_atomic_rsvp_creation.sql` lines 191-212

---

## RSVP Flow Validations

### Flow Overview:

1. User requests RSVP → Creates pending RSVP
2. Organizer approves → RSVP status = 'approved', generates purchase token
3. User pays → Order created, RSVP status = 'purchased'

### Validation Points:

#### 1. **RSVP Creation** (`POST /api/rsvp`)

- All tier/stage availability validations (see above)
- **Duplicate Check (Frontend)**: Button disabled and modal warning shown if user already has an RSVP/Ticket for the event.
  - Prevents race conditions by checking loading state.
  - Checks for statuses: 'pending', 'approved', 'issued', 'checked_in'.
- **Duplicate Check (Backend)**: User can only have ONE RSVP per event
  ```sql
  SELECT COUNT(*) FROM rsvps
  WHERE user_id = p_user_id
    AND event_id = p_event_id
    AND status IN ('pending', 'approved', 'purchased');
  ```
- **Atomicity**: Uses `create_rsvp_atomic()` function with row-level locks (FOR UPDATE)

**Location**: 
- `app/api/rsvp/route.ts` lines 16-361
- `app/components/EventDetail.tsx` (Frontend Check)

#### 2. **RSVP Approval** (Organizer Action)

- Changes status from 'pending' → 'approved'
- Generates purchase token with 7-day expiry
- Sends email notification to user

**Location**: `app/organizer/rsvps/[id]/page.tsx`

#### 3. **Purchase from RSVP** (`POST /api/purchase/complete`)

- Validates purchase token
- Re-checks availability (tier and stage)
- Creates Stripe checkout session
- On successful payment (Stripe webhook):
  - Increments `ticket_tiers.quantity_sold`
  - Increments `ticket_stages.sold_quantity` (if staged)
  - Updates RSVP status to 'purchased'
  - Generates tickets

**Location**:

- `app/api/purchase/complete/route.ts` lines 21-310
- `app/api/webhooks/stripe/route.ts` lines 89-270

---

## Hold/Direct Purchase Flow Validations

### Flow Overview (for events with `requires_rsvp = false`):

1. User clicks "Purchase" → Creates hold (30 min expiry)
2. User completes payment → Hold converted to order

### Validation Points:

#### 1. **Hold Creation** (`POST /api/holds/create`)

All tier/stage availability validations **PLUS**:

```sql
-- Atomic validation with row locks
SELECT ..., is_manually_sold_out FROM ticket_tiers WHERE id = p_tier_id FOR UPDATE;

-- Organizer manual sold-out → {success: false, error: 'This ticket tier is sold out'}
-- (checked before any writes; the route maps it to code SOLD_OUT)

-- Count active (non-expired) holds
SELECT COALESCE(SUM(quantity), 0) FROM holds
WHERE tier_id = p_tier_id
  AND expires_at > NOW()
  AND order_id IS NULL;

-- For staged tiers: validate stage-specific holds
SELECT COALESCE(SUM(quantity), 0) FROM holds
WHERE stage_id = p_stage_id
  AND expires_at > NOW()
  AND order_id IS NULL;
```

**Hold Expiry**: 30 minutes from creation (`p_expires_minutes: 30` in the route)

**Location**: `supabase/migrations/20261017014559_hold_respect_manual_sold_out.sql` (current definition)

#### 2. **Hold Purchase Completion** (`POST /api/purchase/complete-hold`)

Validates:

- Hold exists and hasn't expired
- Hold hasn't been used (order_id IS NULL)
- Inventory still available
- Updates quantities atomically:

  ```sql
  -- Update tier
  UPDATE ticket_tiers
  SET quantity_sold = quantity_sold + p_quantity;

  -- Update stage (if applicable)
  UPDATE ticket_stages
  SET sold_quantity = sold_quantity + p_quantity
  WHERE id = hold.stage_id;
  ```

- Creates tickets with stage metadata
- Marks hold as used (sets order_id)

**Location**:

- `app/api/purchase/complete-hold/route.ts`
- `supabase/migrations/20251007120000_fix_complete_hold_purchase_stage_update.sql`

---

## Database-Level Validations

### Check Constraints:

```sql
-- ticket_tiers table
CONSTRAINT ticket_tiers_price_cents_check
  CHECK (price_cents >= 0)

CONSTRAINT ticket_tiers_quantity_total_check
  CHECK (quantity_total >= 0)

CONSTRAINT ticket_tiers_quantity_sold_check
  CHECK (quantity_sold >= 0)

CONSTRAINT ticket_tiers_per_user_limit_check
  CHECK (per_user_limit > 0)

-- ticket_stages table
CONSTRAINT ticket_stages_price_cents_check
  CHECK (price_cents >= 0)

CONSTRAINT ticket_stages_quantity_check
  CHECK (quantity >= 0)

CONSTRAINT ticket_stages_sold_quantity_check
  CHECK (sold_quantity >= 0)

-- rsvps table
CONSTRAINT rsvps_requested_quantity_check
  CHECK (requested_quantity > 0)

CONSTRAINT rsvps_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'purchased'))

-- holds table
CONSTRAINT holds_quantity_check
  CHECK (quantity > 0)
```

---

## Error Codes

Standardized error codes for client-side handling:

| Code                    | Meaning                        | Action                           |
| ----------------------- | ------------------------------ | -------------------------------- |
| `SOLD_OUT`              | Tier/stage completely sold out | Refresh page, reset selections   |
| `INSUFFICIENT_QUANTITY` | Not enough tickets available   | Reduce quantity or refresh       |
| `AVAILABILITY_ERROR`    | Generic availability issue     | Refresh page                     |
| `DUPLICATE_RSVP`        | User already has RSVP          | Refresh page, show existing RSVP |

**Location**: `app/api/rsvp/route.ts` lines 214-259

---

## Concurrency Protection

All availability checks use **row-level locks** (FOR UPDATE) to prevent race conditions:

```sql
-- Lock tier
SELECT * FROM ticket_tiers WHERE id = p_tier_id FOR UPDATE;

-- Lock stages
SELECT * FROM ticket_stages
WHERE ticket_tier_id = p_tier_id
ORDER BY order_index FOR UPDATE;
```

This ensures that:

1. Only one transaction can check/modify quantities at a time
2. No two users can book the last ticket simultaneously
3. Stage transitions happen atomically

---

## Quantity Tracking Fields

### Tier Level:

- `quantity_total`: Total tickets available in tier
- `quantity_sold`: Tickets purchased (converted to orders)
- `quantity_reserved`: **Computed field** = pending/approved RSVPs + active holds

### Stage Level:

- `quantity`: Total tickets in this stage
- `sold_quantity`: Tickets purchased from this stage

### Calculation Example:

```
Tier: General Admission (4 total)
├─ Stage: Early Bird (2) @ $5
└─ Stage: Regular (2) @ $500

State 1: 1 Early Bird sold
  tier.quantity_sold = 1
  early_bird.sold_quantity = 1
  Available: Early Bird 1/2, Regular 2/2

State 2: 2 Early Birds sold (stage full)
  tier.quantity_sold = 2
  early_bird.sold_quantity = 2
  Available: Early Bird 0/2 (SOLD OUT), Regular 2/2

State 3: 3 tickets sold (1 Regular)
  tier.quantity_sold = 3
  early_bird.sold_quantity = 2
  regular.sold_quantity = 1
  Available: Early Bird 0/2, Regular 1/2
```

---

## Summary

### Normal Tiers:

✅ Price, quantity, per-user limit validation  
✅ Sales period enforcement  
✅ Atomic availability checks with row locks  
✅ Reserved count includes pending/approved RSVPs + active holds

### Staged Tiers:

✅ All normal tier validations  
✅ Stage quantities must sum to tier total  
✅ Progressive stage consumption (Early Bird → Regular)  
✅ Stage-specific availability validation  
✅ Stage info captured at purchase time (price lock)  
✅ Both explicit stage selection and auto-assignment supported

### Data Integrity:

✅ Database check constraints prevent invalid data  
✅ Row-level locks prevent race conditions  
✅ Atomic functions ensure all-or-nothing operations  
✅ Stage quantities updated on all purchase flows (Stripe, Direct, RSVP)
