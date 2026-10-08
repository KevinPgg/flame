# Baseline Migration Reset (January 28, 2026)

## Overview

On January 28, 2026, we performed a **baseline reset** of the Supabase migration history. This was necessary because the local git repository's migration history had diverged significantly from the remote production database, preventing the creation of new preview branches for testing.

## Changes Performed

1.  **Baseline Creation**:
    - We dumped the *exact* schema of the production database (Postgres 17) into a single migration file: `supabase/migrations/20260128000000_baseline.sql`.
    - This file represents the "source of truth" for the database schema as of this date.

2.  **History Archival**:
    - All previous migration files (from 2025 and early 2026) were moved to `migrations_archive/` (in the project root).
    - These files are preserved for reference but are no longer used by the Supabase CLI to manage the active schema.

3.  **Migration History Repair**:
    - We manually marked the `20260128000000_baseline.sql` migration as **applied** on the remote production database using `supabase migration repair`.
    - This synchronized the local state (1 file) with the remote state (1 entry), resolving the "migrations coming up" and "history mismatch" errors.
    - **Note:** We also manually inserted the migration record into the production `schema_migrations` table to ensure Supabase's automatic branching logic recognizes the baseline as already applied.

4.  **Configuration Update**:
    - `supabase/config.toml` was updated to explicitly set `major_version = 17` to match the production database version.

5.  **History Cleanup (Critical for Branching)**:
    - You MUST delete the old migration records from the `supabase_migrations.schema_migrations` table on the production database.
    - If you don't, Supabase Preview Branching will try to pull and apply these old migrations to the fresh preview database, causing failures (e.g. "column does not exist" or "relation does not exist") because the baseline hasn't run yet.
    - We executed the following SQL on Production to remove all old migration records, leaving only the baseline:
      ```sql
      DELETE FROM supabase_migrations.schema_migrations 
      WHERE version != '20260128000000';
      ```
    - This ensures Supabase Preview Branching only sees the baseline migration (which is already applied) and doesn't try to re-run old, conflicting migrations.

## Post-Reset Adjustments

### Storage Buckets & Policies
The `pg_dump` utility does not export data (rows) by default, and Supabase storage buckets are stored as rows in the `storage.buckets` table. Additionally, some storage policies were missing from the dump.

To fix this, we added a supplementary migration: `20260129000000_ensure_storage.sql`.
- Creates the `event-images` bucket if missing.
- Re-creates the "Anyone can view event images" policy if missing.

## Implications for Development

- **New Migrations**: Continue to create new migrations in `supabase/migrations/` as usual (`supabase migration new ...`). They will be applied *on top* of the baseline.
- **Local Development**: When you start a fresh local instance (`supabase start`), it will apply the baseline migration first, giving you an exact copy of production, and then apply any new migrations.
- **Testing**: You can now successfully create preview branches (`supabase branches create ...`) because the history is clean and synchronized.

## Troubleshooting

If you encounter issues with missing tables or functions in a local environment, ensure you have pulled the latest changes including `20260128000000_baseline.sql`.

If you need to reference old migration logic, check the `migrations_archive/` directory (located at `apps/web/migrations_archive/` after the monorepo migration).

### Preview Branches Have Empty Databases

If preview branches are created but have 0 tables:

1. **Check folder location:** The `supabase/` folder MUST be at repository root (`/supabase/`), NOT inside `apps/web/`.

2. **Check Dashboard configuration:** In Supabase Dashboard → Project Settings → Integrations → GitHub:
   - The **"Supabase directory"** setting must be **blank/empty**
   - If set to `supabase`, it will look for `/supabase/supabase/migrations/` (double path) which doesn't exist

3. **Verify with MCP or Dashboard:** After creating a PR, check the preview branch has:
   - 26 tables in the `public` schema
   - 1 storage bucket (`event-images`)

See [PHASE_1_to_5_MONOREPO_FOUNDATION.md](./PHASE_1_to_5_MONOREPO_FOUNDATION.md) troubleshooting item #5 for the full fix details.
