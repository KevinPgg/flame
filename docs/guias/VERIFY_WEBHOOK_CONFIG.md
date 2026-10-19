# Webhook Configuration Verification Guide

This guide helps you verify that the Clerk webhook is properly configured to sync users to Supabase.

---

## ✅ Pre-Flight Checklist

### 1. Check Local Environment Variables

```bash
cd /Users/wagnerona/Desktop/Github/project-flame
cat .env.local | grep -E "CLERK_WEBHOOK_SECRET|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_URL"
```

**Expected Output:**

```bash
CLERK_WEBHOOK_SECRET=whsec_xxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_SUPABASE_URL=https://jaoqfvugxmtomdufhswa.supabase.co
```

### 2. Check Production Environment Variables (Vercel)

**Via Vercel CLI:**

```bash
vercel env ls
```

**Via Vercel Dashboard:**

1. Go to https://vercel.com/your-team/project-flame
2. Settings → Environment Variables
3. Verify these variables exist for **Production**:
   - `CLERK_WEBHOOK_SECRET`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**If any are missing, add them and redeploy:**

```bash
vercel env add SUPABASE_SERVICE_ROLE_KEY production
# Paste the service role key when prompted
vercel --prod
```

---

## 🧪 Test the Webhook

### Method 1: Create a Test User in Clerk

1. **Go to your Clerk Dashboard:**

   - https://dashboard.clerk.com/apps/your-app-id

2. **Create a test user manually:**

   - Users → Create User
   - Fill in test details (use a disposable email)

3. **Check if webhook fired:**

   - Webhooks → View Logs
   - Look for `user.created` event
   - Check the response status (should be 200)

4. **Verify user in Supabase:**
   ```sql
   SELECT id, clerk_id, email, first_name, last_name
   FROM users
   ORDER BY created_at DESC
   LIMIT 5;
   ```

### Method 2: Test Locally with ngrok

1. **Install ngrok:**

   ```bash
   npm install -g ngrok
   ```

2. **Start local dev server:**

   ```bash
   npm run dev
   ```

3. **Expose local server:**

   ```bash
   ngrok http 3000
   ```

4. **Update Clerk webhook endpoint temporarily:**

   - Go to Clerk Dashboard → Webhooks
   - Add endpoint: `https://your-ngrok-url.ngrok.io/api/webhooks/clerk`
   - Select event: `user.created`

5. **Create a test user and check logs:**
   ```bash
   # In your Next.js console, you should see:
   # "Webhook with ID of user_xxx and type of user.created"
   # "Syncing user to Supabase: { clerk_id: 'user_xxx', ... }"
   # "✅ User successfully synced to Supabase: { id: '...', ... }"
   ```

---

## 🔍 Troubleshooting

### Issue: Webhook returns 500 error

**Check Vercel logs:**

```bash
vercel logs --follow
```

**Look for:**

```
❌ CRITICAL: Supabase not configured - user sync FAILED
Missing environment variables: { hasUrl: false, hasServiceKey: false }
```

**Fix:** Add missing environment variables in Vercel and redeploy.

---

### Issue: Webhook returns 200 but user not synced

**Check Clerk webhook logs:**

- Dashboard → Webhooks → Event Logs
- Look for the `user.created` event
- Check the response body

**If response is empty `{}`:**

- This means Supabase config was missing
- Check Vercel logs for the error message
- Add missing environment variables

---

### Issue: Webhook not being called at all

**Check webhook endpoint:**

```bash
curl https://your-production-url.vercel.app/api/webhooks/clerk
```

**Should return:** `405 Method Not Allowed` (only POST is allowed)

**If it returns 404:**

- Webhook route might not be deployed
- Check `app/api/webhooks/clerk/route.ts` exists
- Redeploy: `vercel --prod`

**Verify webhook in Clerk Dashboard:**

- Go to Webhooks → Endpoints
- Should see: `https://your-production-url.vercel.app/api/webhooks/clerk`
- Status: Active ✅

---

## 📊 Monitor Webhook Health

### Set up Clerk Webhook Monitoring

1. **Go to Clerk Dashboard → Webhooks**
2. **Enable webhook logs**
3. **Set up alerts for failed webhooks** (if available)

### Set up Vercel Monitoring

1. **Go to Vercel Dashboard → Project → Logs**
2. **Filter by:** `Error syncing user to Supabase`
3. **Set up log alert rules** (if available)

### Database Monitoring Query

Run this query periodically to check for users that might be missing:

```sql
-- This query won't work directly, but conceptually:
-- Check if any Clerk users are missing from Supabase
-- (You would need to export Clerk users and compare)
```

---

## 🛠️ Quick Fix for Failed Syncs

If you discover a user that wasn't synced, manually insert them:

```sql
INSERT INTO users (clerk_id, email, first_name, last_name)
VALUES (
  'user_xxx',  -- Replace with actual clerk_id
  'user@example.com',  -- Replace with actual email
  'First',  -- Replace with actual first name
  'Last'  -- Replace with actual last name
)
ON CONFLICT (clerk_id) DO UPDATE
SET
  email = EXCLUDED.email,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  updated_at = NOW()
RETURNING *;
```

---

## ✅ Final Verification Checklist

Before marking this as resolved, verify:

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel production
- [ ] `CLERK_WEBHOOK_SECRET` is set in Vercel production
- [ ] Webhook endpoint is active in Clerk Dashboard
- [ ] Test user creation successfully syncs to Supabase
- [ ] Production logs show successful webhook processing
- [ ] No errors in Clerk webhook delivery logs
- [ ] Improved error logging is deployed (returns 500 on config failure)

---

## 📞 Support

If issues persist after following this guide:

1. Check Supabase service status: https://status.supabase.com
2. Check Clerk service status: https://status.clerk.com
3. Check Vercel service status: https://www.vercel-status.com
4. Review full documentation: `/docs_guides/CLERK_WEBHOOK_SYNC_FAILURE_FIX.md`
