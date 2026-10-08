# Database Migrations

This directory contains SQL migrations for the Supabase database.

⚠️ **IMPORTANT**: This README must be kept in sync with the actual SQL migration files. When updating migrations, ensure function signatures, parameters, and examples match the SQL definitions exactly.

## How to Apply Migrations

This project uses Supabase MCP (Model Context Protocol) integration for migrations. Migrations are typically applied automatically when needed.

For manual application, you can also use the Supabase Dashboard:

1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Navigate to the **SQL Editor** section
4. Open the migration file you want to apply
5. Copy and paste the SQL content into the SQL Editor
6. Click **Run** to execute the migration

## Migration Files

### 20251006045753_add_update_ticket_stages_function.sql

**Migration file:** `20251006045753_add_update_ticket_stages_function.sql`  
**Deployed:** October 6, 2025 04:57:53 UTC via Supabase MCP

**Purpose:** Adds atomic transaction support for ticket stage operations.

**Function signature:**

```sql
CREATE OR REPLACE FUNCTION update_ticket_stages(
  p_ticket_tier_id UUID,
  p_stages JSONB
)
RETURNS JSONB
```

**What it does:**

- Creates a PostgreSQL function that handles all stage operations (delete, update, insert) in a single atomic transaction
- Ensures data consistency by preventing partial updates
- Automatically rolls back all changes if any operation fails
- Validates that stage quantities are not reduced below sold quantities
- Prevents deletion of stages that have sold tickets

**Example call:**

```sql
SELECT update_ticket_stages(
  '123e4567-e89b-12d3-a456-426614174000'::UUID,
  '[{"id": "abc-123", "name": "Early Bird", "price_cents": 5000, "quantity": 100, "order_index": 0}]'::JSONB
);
```

**Status:** ✅ **Applied** - Currently active and used by `/api/ticket-tiers` PATCH endpoint

---

### 20251006060413_sync_tier_quantity_total_with_stages.sql

**Migration file:** `20251006060413_sync_tier_quantity_total_with_stages.sql`  
**Deployed:** October 6, 2025 06:04:13 UTC via Supabase MCP

**Purpose:** Fixes quantity synchronization issue between ticket tiers and stages.

**Function signature (updated):**

```sql
CREATE OR REPLACE FUNCTION update_ticket_stages(
  p_ticket_tier_id UUID,
  p_stages JSONB
)
RETURNS JSONB
```

**What it does:**

- Updates the `update_ticket_stages` function (from migration `20251006045753`) to automatically sync the parent tier's `quantity_total` with the sum of all stage quantities
- Ensures the tier's total always matches the sum of its stages, preventing data inconsistencies
- All updates happen atomically within the same transaction
- Returns JSONB including `synced_quantity_total` field

**Example response:**

```json
{
  "success": true,
  "message": "Ticket stages updated successfully",
  "synced_quantity_total": 250
}
```

**Bug Fixed:** [Cursor Bot Comment] Price Stage Quantity Sync Issue - When price stages are enabled for a ticket tier, the tier's `quantity_total` wasn't consistently synchronized with the sum of its individual stage quantities.

**Status:** ✅ **Applied** - Currently active

---

### 20251006060706_create_tier_with_stages_atomic.sql

**Migration file:** `20251006060706_create_tier_with_stages_atomic.sql`  
**Deployed:** October 6, 2025 06:07:06 UTC via Supabase MCP

**Purpose:** Prevents orphaned ticket tiers when stage creation fails.

**Function signature:**

```sql
CREATE OR REPLACE FUNCTION create_ticket_tier_with_stages(
  p_event_id UUID,
  p_name TEXT,
  p_price_cents INTEGER,
  p_quantity_total INTEGER,
  p_per_user_limit INTEGER,
  p_sales_start TIMESTAMPTZ,
  p_sales_end TIMESTAMPTZ,
  p_order_index INTEGER,
  p_use_stages BOOLEAN DEFAULT false,
  p_stages JSONB DEFAULT NULL
)
RETURNS JSONB
```

**What it does:**

- Creates a PostgreSQL function that creates a tier and its stages atomically in a single transaction
- Eliminates the manual rollback pattern that could fail and leave orphaned tiers
- Validates that stage quantities sum to the tier total quantity
- Automatically rolls back the entire operation if any step fails

**Example call:**

```sql
SELECT create_ticket_tier_with_stages(
  p_event_id := '123e4567-e89b-12d3-a456-426614174000'::UUID,
  p_name := 'General Admission',
  p_price_cents := 5000,
  p_quantity_total := 250,
  p_per_user_limit := 10,
  p_sales_start := '2025-10-01 00:00:00+00'::TIMESTAMPTZ,
  p_sales_end := '2025-10-15 23:59:59+00'::TIMESTAMPTZ,
  p_order_index := 0,
  p_use_stages := true,
  p_stages := '[{"name": "Early Bird", "price_cents": 4000, "quantity": 100, "order_index": 0}, {"name": "Regular", "price_cents": 5000, "quantity": 150, "order_index": 1}]'::JSONB
);
```

**Example response:**

```json
{
  "success": true,
  "tier_id": "abc-def-ghi-jkl",
  "message": "Ticket tier created successfully"
}
```

**Bug Fixed:** [Cursor Bot Comment] API Rollback Failure Creates Orphaned Ticket Tiers - The POST `/api/ticket-tiers` endpoint could leave the database in an inconsistent state if ticket stage creation failed and the subsequent tier deletion (rollback) also failed.

**Status:** ✅ **Applied** - Currently active and used by `/api/ticket-tiers` POST endpoint

---

### 20251006100001_atomic_complete_hold_purchase_v2.sql

**Migration file:** `20251006100001_atomic_complete_hold_purchase_v2.sql`  
**Deployed:** October 6, 2025 10:00:01 UTC via Supabase MCP

**Purpose:** Enables atomic purchase completion for hold-based (non-RSVP) ticket purchases.

**Function signature:**

```sql
CREATE OR REPLACE FUNCTION complete_hold_purchase(
  p_hold_id UUID,
  p_user_id UUID,
  p_quantity INTEGER,
  p_unit_price_cents INTEGER,
  p_subtotal_cents INTEGER,
  p_processing_fee_cents INTEGER,
  p_total_cents INTEGER,
  p_organization_id UUID,
  p_event_id UUID,
  p_tier_id UUID,
  p_attendee_name TEXT,
  p_attendee_email TEXT,
  p_ticket_data JSONB
)
RETURNS JSONB
```

**What it does:**

- Creates a PostgreSQL function that atomically processes hold-based purchases in a single transaction
- Creates an order, marks the hold as used, updates ticket tier inventory, and generates tickets
- Uses deterministic idempotency keys (hold_id + user_id) to prevent duplicate orders on retries
- Validates hold hasn't expired or been used before processing
- Validates sufficient ticket inventory is available
- Automatically rolls back the entire transaction if any step fails

**Example call:**

```sql
SELECT complete_hold_purchase(
  p_hold_id := '123e4567-e89b-12d3-a456-426614174000'::UUID,
  p_user_id := '987f6543-e21b-12d3-a456-426614174000'::UUID,
  p_quantity := 2,
  p_unit_price_cents := 5000,
  p_subtotal_cents := 10000,
  p_processing_fee_cents := 330,
  p_total_cents := 10330,
  p_organization_id := '111e1111-e11b-11d1-a111-111111111111'::UUID,
  p_event_id := '222e2222-e22b-22d2-a222-222222222222'::UUID,
  p_tier_id := '333e3333-e33b-33d3-a333-333333333333'::UUID,
  p_attendee_name := 'John Doe',
  p_attendee_email := 'john@example.com',
  p_ticket_data := '[{"qr_token": "token1", "qr_code": "data:image/png;base64,..."}]'::JSONB
);
```

**Example response:**

```json
{
  "success": true,
  "order_id": "abc-def-ghi-jkl",
  "ticket_ids": ["ticket1-uuid", "ticket2-uuid"],
  "is_retry": false
}
```

**Idempotency:** If the same hold_id and user_id combination is retried, the function returns the existing order instead of creating a duplicate:

```json
{
  "success": true,
  "order_id": "abc-def-ghi-jkl",
  "is_retry": true
}
```

**Use Case:** This function powers the direct purchase flow for events that don't require RSVP approval. Users can reserve tickets via a temporary hold, then complete their purchase atomically.

**Status:** ✅ **Applied** - Currently active and used by `/api/purchase/complete-hold` endpoint

---

### 20251006_add_rls_policies_holds_table.sql

**Migration file:** `20251006_add_rls_policies_holds_table.sql`  
**Deployed:** October 6, 2025 via Supabase MCP

**Purpose:** Adds Row Level Security (RLS) policies for the `holds` table to ensure proper access control.

**Policies created:**

1. **users_view_own_holds**: Users can view holds they created
2. **users_create_own_holds**: Users can create holds for themselves
3. **users_update_own_holds**: Users can update their own holds
4. **organizers_view_event_holds**: Event organizers can view holds for events they manage
5. **service_role_all_holds**: Service role (backend) can perform all operations for atomic transactions

**What it does:**

- Restricts access to holds table based on user identity and role
- Allows users to only see and manage their own ticket reservations
- Allows event organizers to view holds for their events (for monitoring purposes)
- Ensures backend operations (via service role) can execute atomic transactions

**Security Fix:** Resolves Supabase security advisor warning "RLS Enabled No Policy" for the `holds` table.

**Status:** ✅ **Applied** - Currently active

---

## Transaction Guarantees

The database functions provide strong consistency guarantees:

1. **Atomicity**: All operations succeed together or fail together
2. **Isolation**: Concurrent updates are properly handled with validation
3. **Consistency**: Business rules (quantity >= sold_quantity, stage quantities sum to tier total) are enforced
4. **Durability**: Changes are committed to the database only after all validations pass

### Error Handling

The functions will raise exceptions (which trigger automatic rollback) in these cases:

- Attempting to reduce a stage quantity below the number of tickets already sold
- Attempting to delete a stage that has sold tickets
- Stage quantities that don't sum to the tier total quantity
- Concurrent modifications that violate quantity constraints

## Rollback

If you need to rollback these migrations, execute the following SQL commands in reverse order of application:

```sql
-- Rollback: 20251006_add_rls_policies_holds_table.sql
-- Removes RLS policies from holds table
DROP POLICY IF EXISTS "users_view_own_holds" ON holds;
DROP POLICY IF EXISTS "users_create_own_holds" ON holds;
DROP POLICY IF EXISTS "users_update_own_holds" ON holds;
DROP POLICY IF EXISTS "organizers_view_event_holds" ON holds;
DROP POLICY IF EXISTS "service_role_all_holds" ON holds;

-- Rollback: 20251006100001_atomic_complete_hold_purchase_v2.sql
-- Removes the atomic hold purchase completion function
DROP FUNCTION IF EXISTS complete_hold_purchase(
  p_hold_id UUID,
  p_user_id UUID,
  p_quantity INTEGER,
  p_unit_price_cents INTEGER,
  p_subtotal_cents INTEGER,
  p_processing_fee_cents INTEGER,
  p_total_cents INTEGER,
  p_organization_id UUID,
  p_event_id UUID,
  p_tier_id UUID,
  p_attendee_name TEXT,
  p_attendee_email TEXT,
  p_ticket_data JSONB
);

-- Rollback: 20251006060706_create_tier_with_stages_atomic.sql
-- Removes the atomic tier creation function
DROP FUNCTION IF EXISTS create_ticket_tier_with_stages(
  p_event_id UUID,
  p_name TEXT,
  p_price_cents INTEGER,
  p_quantity_total INTEGER,
  p_per_user_limit INTEGER,
  p_sales_start TIMESTAMPTZ,
  p_sales_end TIMESTAMPTZ,
  p_order_index INTEGER,
  p_use_stages BOOLEAN,
  p_stages JSONB
);

-- Rollback: 20251006060413_sync_tier_quantity_total_with_stages.sql
-- Note: This migration modified update_ticket_stages to add quantity sync.
-- To rollback this specific change, you would need to re-apply the original version
-- from 20251006045753 (without quantity sync). To completely remove the function,
-- execute the rollback command below instead.

-- Rollback: 20251006045753_add_update_ticket_stages_function.sql
-- Removes the ticket stages update function entirely (including quantity sync from 20251006060413)
DROP FUNCTION IF EXISTS update_ticket_stages(
  p_ticket_tier_id UUID,
  p_stages JSONB
);
```

**⚠️ WARNING:** Rolling back these migrations will break functionality in the following API endpoints:

- `/api/ticket-tiers` (tier creation and stage updates)
- `/api/purchase/complete-hold` (hold-based ticket purchases)

The API endpoints will need to be updated to use the old sequential approach before rolling back.

**Rollback order matters:** Always rollback in reverse chronological order to avoid dependency issues.
