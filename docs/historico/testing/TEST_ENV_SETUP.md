# Test Environment Setup Guide

## Quick Start

### Option 1: Using `.env.test` file (Recommended)

1. **Copy the example file:**

   ```bash
   cp .env.test.example .env.test
   ```

2. **Edit `.env.test` with your credentials:**

   ```bash
   # Edit with your actual values
   # Note: TEST_ variables are preferred by vitest and will override NEXT_PUBLIC_ variables
   TEST_SUPABASE_URL=https://your-project.supabase.co
   TEST_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   
   # Fallback variables (optional if TEST_ vars are set)
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

3. **Run tests:**

   ```bash
   pnpm test
   ```

   Vitest will automatically load `.env.test` when running tests.

### Option 2: Export in current shell session

**For current terminal session only:**

```bash
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
pnpm test
```

**To make it permanent for your shell, add to `~/.zshrc` (or `~/.bashrc`):**

```bash
# Add these lines to ~/.zshrc
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

Then reload:

```bash
source ~/.zshrc
```

### Option 3: Inline with command (one-time)

```bash
TEST_SUPABASE_URL="https://your-project.supabase.co" \
TEST_SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
pnpm test
```

## Getting Your Supabase Credentials

1. **Go to your Supabase project dashboard**
2. **Navigate to Settings → API**
3. **Copy:**
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role key** (secret) → `SUPABASE_SERVICE_ROLE_KEY`

⚠️ **Important:** The `service_role` key has admin privileges. Only use it:

- In server-side code
- For testing with a test database
- Never commit it to git
- Never use it in client-side code

## Which Tests Need Database?

### ✅ Tests that require database (77 tests):

- `stage-availability-functions.test.ts` - Database function tests
- `hold-expiration-flow.test.ts` - Integration tests
- `payment-protection.test.ts` - Payment protection tests
- `promoter-tracking.test.ts` - Promoter link tests
- `__tests__/integration/*.test.ts` - All integration tests

### ✅ Tests that DON'T need database (377 tests):

- `stage-progression-logic.test.ts` - Pure logic tests
- `availability-api.test.ts` - API structure tests (mocked)
- `real-time-availability-hook.test.ts` - React hook tests (mocked)
- `purchase-flow.test.ts` - Purchase logic unit tests
- `purchase-page.integration.test.tsx` - Component tests (mocked API)
- `api/**/*.test.ts` - API route tests (mocked dependencies)

## Supabase Development Branch Requirement

**Important:** Database tests require a Supabase **development branch**, not production.

A safety check verifies the URL contains "test" or "dev":

```text
❌ SAFETY CHECK FAILED: Supabase URL does not appear to be a test environment
```

**To run database tests:**

1. Create a Supabase development branch in your dashboard
2. Update `NEXT_PUBLIC_SUPABASE_URL` to point to the dev branch
3. Update `SUPABASE_SERVICE_ROLE_KEY` for the dev branch

### Using Supabase Preview Branches

Supabase preview branches (created automatically for PRs or manually) have **random project refs** like `abc123xyz.supabase.co` that don't contain "test" or "dev".

**To bypass the safety check for preview branches:**

```bash
TEST_DATABASE_CONFIRMED=true pnpm test:run
```

⚠️ **Only use this flag when you're certain the URL points to a non-production database!**

**Example workflow with preview branch:**

```bash
# 1. Set credentials for your preview branch
export TEST_SUPABASE_URL="https://aqkovpwlorcjekaotagr.supabase.co"
export TEST_SUPABASE_SERVICE_ROLE_KEY="your-preview-key"

# 2. Run tests with safety check bypassed
TEST_DATABASE_CONFIRMED=true pnpm test:run
```

## Test Behavior Without Dev Branch

If using production URL or missing credentials:

- ✅ Skip gracefully (no errors) - Database tests are skipped, and a warning like `❌ SAFETY CHECK FAILED: Supabase URL does not appear to be a test environment` will be shown. This does not count as a test failure—only skipped tests.
- ✅ Show warning: `❌ SAFETY CHECK FAILED: Supabase URL does not appear to be a test environment`
- ✅ Continue running 377 other tests - The test suite will continue running remaining tests (they will be executed normally) and the skipped database tests will be reported as skipped rather than failed.

## Using Separate Test Credentials (Recommended)

To avoid accidentally running tests against your main development or production database, you can use dedicated environment variables for testing.

1.  Add these to your `.env.local` or `.env.test`:

    ```bash
    TEST_SUPABASE_URL=https://your-preview-project.supabase.co
    TEST_SUPABASE_SERVICE_ROLE_KEY=your-preview-service-role-key
    ```

2.  The test runner (`vitest.config.ts`) is configured to prioritize these `TEST_` variables over the standard `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Security Best Practices

1. **Never commit `.env.test` to git**
   - Already in `.gitignore`
   - Contains sensitive credentials

2. **Use a separate test database**
   - Don't use production database for tests
   - Tests create and delete data

3. **Use environment-specific keys**
   - Different keys for dev/staging/prod
   - Rotate keys regularly

4. **CI/CD Setup**
   - Store credentials as secrets in CI/CD platform
   - Never log credentials in CI output

## CI/CD Setup

### GitHub Actions Example

```yaml
# .github/workflows/test.yml
env:
  NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

### Vercel Example

Add in Vercel dashboard → Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Troubleshooting

### Tests skip even with credentials set

1. **Check if variables are loaded:**

   ```bash
   echo $NEXT_PUBLIC_SUPABASE_URL
   echo $SUPABASE_SERVICE_ROLE_KEY
   echo $TEST_SUPABASE_URL
   echo $TEST_SUPABASE_SERVICE_ROLE_KEY
   ```

2. **Verify `.env.test` exists and has correct format:**

   ```bash
   cat .env.test
   ```

3. **Check for typos:**
   - Variable names must match exactly
   - No extra spaces or quotes

### "Cannot find module" errors

Make sure you're running tests from project root:

```bash
cd /path/to/project-flame
pnpm test
```

### Database connection errors

1. **Check Supabase project is active**
2. **Verify credentials are correct**
3. **Check network/firewall settings**
4. **Ensure test database has required tables**

## Quick Reference

```bash
# Set for current session
export NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="xxx"

# Run tests
pnpm test

# Run specific test file
pnpm test stage-availability-functions

# Run with UI
pnpm test:ui
```
