# Datafast Security Fix: Environment Variable Migration

> ⚠️ **Deprecated System**: This document describes security fixes for the legacy Datafast payment system which has been superseded by Stripe Connect. Datafast is no longer actively used for new implementations. This document is retained for historical reference and to support any remaining legacy transactions during the transition period. For current payment processing security, see Stripe Connect documentation. See [Payment Systems Evolution](../PAYMENT_SYSTEMS_EVOLUTION.md) for migration details.

**Date**: October 30, 2025  
**Priority**: 🚨 HISTORICAL - Security Fix for Legacy System  
**Status**: Deprecated — Superseded by Stripe Connect

---

## 🔒 What Changed?

**Security Issue**: Production credentials were hardcoded in source code as fallback values.

**Fix**: Removed all hardcoded credentials. All values MUST now be provided via environment variables with no fallbacks.

**Impact**: Application will throw an error on startup if any required environment variable is missing.

---

## 📋 Required Actions in Vercel

You need to **RENAME and UPDATE** your environment variables in Vercel.

### Step 1: Delete Old Variables

Delete these variables (they use the old "TEST" naming):

- ❌ `DATAFAST_TEST_URL`
- ❌ `DATAFAST_TEST_ENTITY_ID`
- ❌ `DATAFAST_TEST_BEARER_TOKEN`
- ❌ `DATAFAST_TEST_MID`
- ❌ `DATAFAST_TEST_TID`

### Step 2: Add New Variables

Add these variables with the NEW names (no "TEST" prefix):

⚠️ **Production credentials have been redacted for security. Obtain actual values from Datafast dashboard.**

| Variable Name                 | Value Source / Format                        | Required |
| ----------------------------- | -------------------------------------------- | -------- |
| `DATAFAST_URL`                | `https://eu-prod.oppwa.com`                  | ✅ Yes   |
| `DATAFAST_ENTITY_ID`          | `<from Datafast dashboard>`                  | ✅ Yes   |
| `DATAFAST_BEARER_TOKEN`       | `Bearer <from Datafast dashboard>`           | ✅ Yes   |
| `DATAFAST_MID`                | `<from Datafast dashboard>`                  | ✅ Yes   |
| `DATAFAST_TID`                | `<from Datafast dashboard>`                  | ✅ Yes   |
| `DATAFAST_SHOPPER_ECI`        | `<from Datafast dashboard>`                  | ✅ Yes   |
| `DATAFAST_SHOPPER_PSERV`      | `<from Datafast dashboard>`                  | ✅ Yes   |
| `DATAFAST_SHOPPER_VERSIONDF`  | `2`                                          | ✅ Yes   |
| `DATAFAST_RISK_MERCHANT_NAME` | `FlameTicketing` (or your merchant name)     | ✅ Yes   |

---

## 🔄 Migration Quick Reference

### Before (Old Variable Names) → After (New Variable Names)

```text
DATAFAST_TEST_URL              → DATAFAST_URL
DATAFAST_TEST_ENTITY_ID        → DATAFAST_ENTITY_ID
DATAFAST_TEST_BEARER_TOKEN     → DATAFAST_BEARER_TOKEN
DATAFAST_TEST_MID              → DATAFAST_MID
DATAFAST_TEST_TID              → DATAFAST_TID
DATAFAST_SHOPPER_ECI           → (unchanged)
DATAFAST_SHOPPER_PSERV         → (unchanged)
DATAFAST_SHOPPER_VERSIONDF     → (unchanged)
DATAFAST_RISK_MERCHANT_NAME    → (unchanged)
```

---

## 📸 Screenshot of Required Vercel Variables

Your Vercel environment variables should look like this:

```bash
# ⚠️ REDACTED FOR SECURITY - Use your actual production credentials from Datafast
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

---

## 📚 Historical Context

This security fix addressed a critical issue where Datafast production credentials were hardcoded in the source code. The fix removed all hardcoded credentials and required 9 Datafast-specific environment variables (URL, Entity ID, Bearer Token, MID, TID, ECI, PSERV, VERSIONDF, RISK_MERCHANT_NAME) to be provided via environment variables with startup validation. The system would fail to start if any required variables were missing.

---

## 🔄 Migration to Stripe Connect

**For Current Payment Processing**: This historical Datafast security configuration is no longer relevant. The application now uses Stripe Connect for all payment processing.

**See**: 
- `docs/stripe-implementation/` - Current Stripe Connect implementation
- `docs/PAYMENT_SYSTEMS_EVOLUTION.md` - Migration timeline and context

---

## 🔐 Remaining Legacy Support

**If supporting legacy Datafast transactions**: Internal teams should reference secure credential storage documentation and secrets management practices rather than this deprecated guide.

**Note**: No new Datafast integrations should be created. All new payment processing uses Stripe Connect.
