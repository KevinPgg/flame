# Clerk Webhook User Sync Failure - Root Cause & Fix

**Date:** October 28, 2025  
**Issue:** Clerk `user.created` webhook failed to sync user to Supabase  
**User ID:** `user_34gE4Ii6QHYeBbt77b5oa09WvEq`  
**Email:** familiaona11@gmail.com

---

## 🔍 Root Cause Analysis

### What Happened

When a new user signed up via Clerk, the webhook was triggered successfully with the correct payload. However, the user was **NOT inserted into the Supabase `users` table**, causing subsequent API calls to fail with HTTP 406 (Not Acceptable) errors.

### Why It Failed

The Clerk webhook handler at `/api/webhooks/clerk/route.ts` uses `supabaseAdmin` (configured with `SUPABASE_SERVICE_ROLE_KEY`) to insert users. However, the webhook likely failed due to one of the following reasons:

1. **Missing Environment Variable in Production**

   - `SUPABASE_SERVICE_ROLE_KEY` might not be configured in Vercel/production environment
   - The webhook code checks `isSupabaseConfigured()` and returns early if not configured
   - This would result in a **silent failure** (returns 200 OK but doesn't sync)

2. **Service Role Key Misconfiguration**
   - If the service role key is incorrect or expired, the upsert would fail
   - The service role should have `rolbypassrls = true` to bypass RLS policies

### Evidence from Logs

**API Logs (Supabase):**

```
GET /rest/v1/users?clerk_id=eq.user_34gE4Ii6QHYeBbt77b5oa09WvEq → 406 (Not Acceptable)
```

**Database Query Result:**

```sql
SELECT * FROM users WHERE clerk_id = 'user_34gE4Ii6QHYeBbt77b5oa09WvEq';
-- Result: [] (empty - user doesn't exist)
```

**RLS Policies on `users` table:**

- INSERT: Only allows users to insert their own profile (`clerk_id = auth.jwt() ->> 'sub'`)
- SELECT: Only allows users to view their own profile
- **Service role bypasses RLS** (confirmed: `rolbypassrls = true`)

---

## ✅ Immediate Fix Applied

The user was manually inserted into Supabase using the MCP SQL execution tool:

```sql
INSERT INTO users (clerk_id, email, first_name, last_name)
VALUES (
  'user_34gE4Ii6QHYeBbt77b5oa09WvEq',
  'familiaona11@gmail.com',
  'Fam',
  'Co'
)
ON CONFLICT (clerk_id) DO UPDATE
SET
  email = EXCLUDED.email,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  updated_at = NOW()
RETURNING *;
```

**Result:**

```json
{
  "id": "476b0405-878b-4b8e-a1ac-f8220dc84654",
  "clerk_id": "user_34gE4Ii6QHYeBbt77b5oa09WvEq",
  "email": "familiaona11@gmail.com",
  "first_name": "Fam",
  "last_name": "Co",
  "role": "user",
  "created_at": "2025-10-28 04:48:55.309754+00"
}
```

✅ **The user is now properly synced and can access the application.**

---

## 🔧 Long-Term Solutions

### 1. Verify Environment Variables in Production

**Check Vercel Environment Variables:**

```bash
# Required environment variables for webhook to work:
CLERK_WEBHOOK_SECRET=whsec_xxx
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_SUPABASE_URL=https://jaoqfvugxmtomdufhswa.supabase.co
```

**Steps:**

1. Go to Vercel Dashboard → Project Settings → Environment Variables
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is set for **Production**
3. Verify `CLERK_WEBHOOK_SECRET` is set for **Production**
4. Redeploy if any variables were missing

### 2. Improve Webhook Error Logging

Update `/app/api/webhooks/clerk/route.ts` to provide better visibility when Supabase is not configured:

```typescript
if (!isSupabaseConfigured() || !supabaseAdmin) {
  console.error("❌ CRITICAL: Supabase not configured - user sync FAILED");
  console.error("Missing env vars:", {
    hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  console.error("🔄 USER_SYNC_REQUIRED:", JSON.stringify(userData));

  // Return 500 instead of 200 to alert us of the failure
  return NextResponse.json(
    { error: "Supabase not configured" },
    { status: 500 }
  );
}
```

### 3. Add Webhook Monitoring

Set up monitoring to detect webhook failures:

**Option A: Clerk Dashboard**

- Go to Clerk Dashboard → Webhooks
- Check webhook delivery status
- Set up alerts for failed webhooks

**Option B: Vercel Logs**

- Monitor production logs for `Error syncing user to Supabase`
- Set up log alerts for webhook failures

### 4. Create Fallback User Sync Mechanism

Add a client-side fallback that attempts to sync the user on first login if they don't exist in Supabase:

```typescript
// In a useEffect or middleware
const syncUserIfNeeded = async () => {
  const response = await fetch("/api/users/me");
  if (response.status === 404) {
    // User doesn't exist in Supabase, trigger manual sync
    await fetch("/api/auth/sync-current-user", { method: "POST" });
  }
};
```

### 5. Database-Level Solution (Optional)

Create a database trigger or function that automatically creates user records when needed, though this is less preferred than fixing the webhook.

---

## 🧪 Testing the Fix

### Test Webhook Locally

1. **Start local development server:**

   ```bash
   npm run dev
   ```

2. **Use Clerk CLI to test webhooks:**

   ```bash
   npx @clerk/clerk-cli test-webhook \
     --endpoint https://your-local-url.ngrok.io/api/webhooks/clerk \
     --event user.created
   ```

3. **Verify user is created in Supabase:**
   ```sql
   SELECT * FROM users WHERE clerk_id = 'test_clerk_id';
   ```

### Test in Production

1. Create a test user in Clerk
2. Check Supabase `users` table to confirm sync
3. Verify user can access the application

---

## 📊 Monitoring Checklist

- [ ] Verify `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel production
- [ ] Verify `CLERK_WEBHOOK_SECRET` is set in Vercel production
- [ ] Check Clerk Dashboard for webhook delivery status
- [ ] Monitor Vercel logs for webhook errors
- [ ] Test user registration flow end-to-end
- [ ] Implement improved error logging (return 500 on config failure)
- [ ] Set up alerts for webhook failures

---

## 🔗 Related Files

- Webhook Handler: `/app/api/webhooks/clerk/route.ts`
- Supabase Admin Client: `/app/lib/supabase/server.ts`
- Manual Sync API: `/app/api/auth/sync-current-user/route.ts`
- Environment Config: `.env.local` (local), Vercel Dashboard (production)

---

## 📝 Summary

**Problem:** Clerk webhook failed to sync user to Supabase, likely due to missing `SUPABASE_SERVICE_ROLE_KEY` in production.

**Immediate Fix:** Manually inserted user into Supabase via SQL.

**Long-Term Fix:**

1. Verify environment variables in Vercel
2. Improve error logging in webhook handler
3. Set up monitoring for webhook failures
4. Add client-side fallback sync mechanism

**Impact:** User can now access the application. Future users should sync automatically once environment variables are verified.
