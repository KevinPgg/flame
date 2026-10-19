# Migrations Documentation

This folder contains database and system migration guides and verification documentation.

## Key Documents

- **[IOS_MIGRATION.md](./IOS_MIGRATION.md)** - iOS / monorepo migration and mobile architecture
- **[PHASE_1_to_5_MONOREPO_FOUNDATION.md](./PHASE_1_to_5_MONOREPO_FOUNDATION.md)** - Monorepo foundation phases
- **[BASELINE_RESET_JAN_2026.md](./BASELINE_RESET_JAN_2026.md)** - Supabase migration baseline reset

## Migration Best Practices

### Pre-Migration
1. **Document current state** - Capture all existing data and configurations
2. **Create backups** - Full database backup before any migration
3. **Test in staging** - Always test migrations in staging first
4. **Review changes** - Have another developer review migration scripts

### During Migration
1. **Run in maintenance mode** - Prevent concurrent writes
2. **Monitor progress** - Track migration status
3. **Keep rollback plan ready** - Be prepared to rollback if needed

### Post-Migration
1. **Verify data integrity** - Check that all data migrated correctly
2. **Run smoke tests** - Test critical paths
3. **Monitor for errors** - Watch for any migration-related issues
4. **Document outcomes** - Record any issues or learnings

## Migration Workflow (Post-Baseline)

### 1. Development
1.  Create a new migration locally: `supabase migration new my_feature`
2.  Edit the SQL file in `supabase/migrations/`.
3.  Test locally using `supabase db reset` (this applies the baseline + your new migration).

### 2. Preview (Pull Request)
1.  Commit and push your migration file to GitHub.
2.  Supabase automatically creates a Preview Branch.
3.  The Preview Branch applies the baseline + your new migration.
4.  Run integration tests against this preview branch.

### 3. Production (Merge)
1.  **Do NOT** run migrations manually on the Preview Branch (except for debugging).
2.  **Do NOT** apply migrations to Production manually before merging (unless it's a hotfix).
3.  **Merge the PR** to `main`.
4.  **Deploy**: Run `supabase db push` against Production (or let CI/CD do it).
    - Supabase detects the new file in `supabase/migrations/`.
    - It sees the baseline is already applied.
    - It applies **only** the new migration file.

**Note:** The Preview Branch is automatically deleted by Supabase when the PR is closed or merged.

## Supabase GitHub Integration Configuration

> **CRITICAL:** The Supabase GitHub integration must be configured correctly for preview branches to work.

### Required Dashboard Settings

In **Supabase Dashboard** → **Project Settings** → **Integrations** → **GitHub**:

| Setting | Value | Why |
|---------|-------|-----|
| **Supabase directory** | *(blank/empty)* | The `supabase/` folder is at repository root. Leaving this blank tells Supabase to look at `/supabase`, not `/something/supabase`. |

### Why This Matters

If the "Supabase directory" is set to `supabase` (the default), Supabase will look for migrations at `/supabase/supabase/migrations/` (double path), which doesn't exist. This causes:
- Preview branches to be created with **empty databases** (0 tables)
- Migrations appearing as "applied" in the migration history but no schema created
- Storage buckets not being created

### Verification

After creating a PR, verify the preview branch has:
- **26 tables** in the `public` schema
- **1 storage bucket** (`event-images`)

You can verify using the Supabase Dashboard or MCP tools.

## Database Migrations

Database migrations are managed by Supabase and located in `/supabase/migrations/`.

```bash
# Create a new migration
supabase migration new migration_name

# Apply migrations
supabase db push
```

## System Migrations

For system-level migrations (environment variables, configurations, etc.):

1. Document the current state
2. Create migration guide
3. Test in staging
4. Execute in production
5. Verify post-migration

## Migration History

- **February 3, 2026**: Fixed Supabase preview branching - moved `supabase/` folder from `apps/web/supabase/` to repository root and configured GitHub integration with blank "Supabase directory" setting.
- **January 29, 2026**: Added `20260129000000_ensure_storage.sql` to ensure storage buckets and policies are correctly set up in new environments (missed by baseline dump).
- **January 28, 2026**: [Baseline Reset](./BASELINE_RESET_JAN_2026.md) - Synced local migrations with production state.
- **January 2026**: Stripe Connect migration (see [Stripe Implementation](../../stripe-implementation/))
- **Pre-Stripe**: Datafast migrations (see [Legacy Documentation](../legacy/))

## See Also

- [Stripe Implementation](../../stripe-implementation/README.md) - Stripe migration docs
- [Datafast Documentation](../datafast/) - Legacy payment system
- [Legacy Documentation](../legacy/) - Historical migrations
