# 🚨 URGENT: Update Vercel Environment Variables Before Deployment

**Date**: October 30, 2025  
**Priority**: CRITICAL  
**Action Required**: Update Vercel environment variables NOW

---

## ⚠️ What Happened?

CodeRabbit identified a critical security issue: **production payment credentials were hardcoded in source code**.

## ✅ What Was Fixed?

- Removed all hardcoded credentials from source code
- Added strict validation - app will NOT start without proper environment variables
- Renamed variables to remove confusing "TEST" prefix

## 🔥 WHAT YOU MUST DO NOW

### Update Your Vercel Environment Variables

You need to **DELETE old variables** and **ADD new ones** with different names.

---

## 📋 Quick Action Guide

### In Vercel Dashboard → Settings → Environment Variables:

### 1. DELETE These (Old Names):

- ❌ `DATAFAST_TEST_URL`
- ❌ `DATAFAST_TEST_ENTITY_ID`
- ❌ `DATAFAST_TEST_BEARER_TOKEN`
- ❌ `DATAFAST_TEST_MID`
- ❌ `DATAFAST_TEST_TID`

### 2. ADD These (New Names with Production Values):

⚠️ **SECURITY NOTE**: Production credentials have been redacted. Obtain actual values from Datafast dashboard.

```
DATAFAST_URL=https://eu-prod.oppwa.com
DATAFAST_ENTITY_ID=<YOUR_ENTITY_ID_FROM_DATAFAST>
DATAFAST_BEARER_TOKEN=Bearer <YOUR_BEARER_TOKEN_FROM_DATAFAST>
DATAFAST_MID=<YOUR_MID_FROM_DATAFAST>
DATAFAST_TID=<YOUR_TID_FROM_DATAFAST>
DATAFAST_SHOPPER_ECI=<YOUR_ECI_FROM_DATAFAST>
DATAFAST_SHOPPER_PSERV=<YOUR_PSERV_FROM_DATAFAST>
DATAFAST_SHOPPER_VERSIONDF=2
DATAFAST_RISK_MERCHANT_NAME=FlameTicketing
```

### 3. UPDATE Your Local .env.local File:

Use the same variable names and values as above (copy the entire block).

---

## ⚠️ What Happens If You Don't?

Your application will **fail to start** with this error:

```
Error: Missing required Datafast configuration.
All DATAFAST_* environment variables must be set.
```

---

## 📚 Detailed Documentation

For complete details, see:

- **`docs_guides/DATAFAST_SECURITY_FIX_ENV_MIGRATION.md`** - Full migration guide
- **`docs_guides/DATAFAST_GO_LIVE_SUMMARY.md`** - Production setup guide

---

## ✅ Verification Checklist

- [ ] Deleted all `DATAFAST_TEST_*` variables in Vercel
- [ ] Added all new `DATAFAST_*` variables in Vercel (9 total)
- [ ] Updated `.env.local` with new variable names
- [ ] Tested locally (`npm run dev` works)
- [ ] Deployed to Vercel (build succeeds)
- [ ] Tested payment flow in production

---

## 🔐 Why This Matters

**Security Best Practices:**

- ✅ No credentials in source code (which could be exposed in git history)
- ✅ Explicit validation prevents misconfiguration
- ✅ Clear error messages if something is missing
- ✅ Better audit trail for which environment is being used

**Previous Issue:**

```typescript
// ❌ BAD - Credentials hardcoded as fallback
const URL = process.env.URL || "https://eu-prod.oppwa.com";
```

**Current (Secure):**

```typescript
// ✅ GOOD - No fallback, explicit validation
if (!process.env.DATAFAST_URL) {
  throw new Error("Missing DATAFAST_URL");
}
const URL = process.env.DATAFAST_URL;
```

---

**DO THIS NOW before your next deployment!** 🚀
