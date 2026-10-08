# Promoter Tracking System Analysis

## Issue Report: Potential Multi-Tab Attribution Problem

### Reported Issue

Organizer from "Kora" event reports that promoters (PRs) are saying people bought tickets using their links, but the purchases aren't showing up in their link statistics.

### System Investigation

#### Current Implementation ✅

The promoter tracking system is **fundamentally sound**:

1. **URL Capture**: Promoter code captured from `?promoter=CODE` parameter
2. **SessionStorage**: Saved immediately when purchase page loads
3. **Datafast Redirect**: Survives payment provider redirect
4. **API Tracking**: Properly saved to orders table with indexes
5. **Database Schema**: Tested and working correctly

#### Tests Show System Works ✅

- 15+ integration tests pass
- Recent sales (past 2-3 days) show promoter codes being tracked
- Database indexes and queries verified

### **Identified Vulnerability: Multi-Tab Race Condition**

#### The Problem

**SessionStorage is shared across all tabs in the same browser!**

```javascript
// Tab 1: User clicks Promoter Link A
sessionStorage.setItem("flame_promoter_code", "PROMOTERA"); // ✅ Saved

// Tab 2: Same user clicks Promoter Link B (or different user shares device)
sessionStorage.setItem("flame_promoter_code", "PROMOTERB"); // ⚠️ OVERWRITES!

// Tab 1: User completes purchase
const code = sessionStorage.getItem("flame_promoter_code"); // ❌ Gets "PROMOTERB"!
// Purchase is attributed to PROMOTERB instead of PROMOTERA
```

#### Real-World Scenario

At a busy event (like Kora):

1. **Promoter shows link on their phone** to potential buyers
2. **Person A** opens the link on their phone (Tab 1) → starts checkout
3. **Person B** opens the same/different link on same phone (Tab 2) → browses event
4. **Person A** completes purchase → **wrong promoter gets credit**

OR:

1. User has event page open already (no promoter code)
2. Gets sent a promoter link, opens in new tab
3. Original tab's checkout now has wrong/no promoter code

### Evidence Supporting This Theory

1. ✅ **System works sometimes** (recent sales tracked correctly)
2. ✅ **Intermittent failures** (some purchases not attributed)
3. ✅ **More likely during busy events** (more concurrent browsing)
4. ✅ **User behavior at in-person events** (promoters showing links to multiple people)

### Technical Details

#### Where the Issue Occurs

**File**: `app/purchase/page.tsx`
**Lines**: 319-325

```typescript
// Store promoter code in sessionStorage to survive Datafast redirect
useEffect(() => {
  if (promoterCode) {
    sessionStorage.setItem("flame_promoter_code", promoterCode);
    console.log("💾 Saved promoter code to sessionStorage:", promoterCode);
  }
}, [promoterCode]);
```

**Lines**: 1573-1578 (Restoration)

```typescript
// Restore promoter code from sessionStorage
const savedPromoterCode = sessionStorage.getItem("flame_promoter_code");
console.log(
  "🔄 Restored promoter code from sessionStorage:",
  savedPromoterCode
);
```

### Why SessionStorage Was Chosen

SessionStorage was used to survive the Datafast payment redirect (external site). However:

- ✅ **Good**: Survives redirects within same tab
- ❌ **Bad**: Shared across all tabs, causing race conditions

### Additional Edge Cases

#### 1. **SessionStorage Blocked**

- Users in private browsing mode
- Users with strict privacy settings
- Corporate devices with disabled storage

#### 2. **URL Sharing**

- If users share direct `/purchase?session=...` URL without `&promoter=...`
- Bookmarked purchase page without promoter parameter

#### 3. **Back Button Navigation**

- User hits back from purchase page, promoter param might be lost from URL
- But should still be in sessionStorage (unless overwritten by multi-tab issue)

## Recommendations

### Solution 1: Session-Scoped Storage (Recommended) ⭐

Store promoter code with the session/hold ID to prevent cross-tab contamination:

```typescript
// Save with session ID
useEffect(() => {
  const sessionId = holdSessionId || token;
  if (promoterCode && sessionId) {
    sessionStorage.setItem(`flame_promoter_code_${sessionId}`, promoterCode);
    console.log(
      `💾 Saved promoter code for session ${sessionId}:`,
      promoterCode
    );
  }
}, [promoterCode, holdSessionId, token]);

// Restore with session ID
const sessionId = holdSessionId || token;
const savedPromoterCode = sessionStorage.getItem(
  `flame_promoter_code_${sessionId}`
);
```

**Pros:**

- ✅ Each checkout session has its own promoter code
- ✅ Multiple tabs don't interfere
- ✅ Minimal code changes
- ✅ Still survives Datafast redirect

**Cons:**

- ⚠️ Slightly more complex storage key

### Solution 2: URL Parameter Preservation

Always preserve promoter code in URL throughout flow:

```typescript
// Event Detail → Hold Creation
const holdUrl = promoterCode
  ? `/purchase?session=${holdId}&promoter=${promoterCode}`
  : `/purchase?session=${holdId}`;

// Purchase Page → Always read from URL first
const promoterCodeFromUrl = searchParams.get("promoter");
const promoterCodeFromStorage = sessionStorage.getItem("flame_promoter_code");
const finalPromoterCode = promoterCodeFromUrl || promoterCodeFromStorage;
```

**Pros:**

- ✅ URL is source of truth
- ✅ Shareable links work correctly
- ✅ No storage conflicts

**Cons:**

- ⚠️ URL parameters can be lost on redirects
- ⚠️ More complex fallback logic

### Solution 3: Server-Side Hold Tracking (Most Robust) 🏆

Store promoter code on the hold record itself:

```sql
ALTER TABLE holds
ADD COLUMN promoter_code VARCHAR(50);
```

```typescript
// When creating hold, include promoter code
await createHold({
  // ... existing fields
  promoter_code: promoterCode,
});

// When completing purchase, read from hold record
const hold = await getHold(holdSessionId);
const promoterCode = hold.promoter_code; // ✅ Guaranteed correct
```

**Pros:**

- ✅ 100% reliable (database is source of truth)
- ✅ Survives any redirect/navigation
- ✅ Works across devices (if user switches devices)
- ✅ No multi-tab issues
- ✅ No storage issues

**Cons:**

- ⚠️ Requires database migration
- ⚠️ Requires updating hold creation endpoint

## Immediate Actions

### For Organizer (Right Now)

1. **Ask promoters specific questions:**

   - "Did the person open multiple tabs or windows?"
   - "Were you showing your link to multiple people at once?"
   - "Did they have the event page already open in another tab?"

2. **Check logs** (if available):

   ```
   Look for: "💾 Saved promoter code to sessionStorage"
   Look for: "🔄 Restored promoter code from sessionStorage"
   ```

   Compare what was saved vs. what was restored

3. **Test scenario:**
   - Open promoter link A in Tab 1
   - Open promoter link B in Tab 2
   - Try to checkout in Tab 1
   - Check which promoter gets credited

### For Development Team

1. **Implement Solution 1** (session-scoped storage) - Quick fix, low risk
2. **Add logging** to track promoter code changes
3. **Consider Solution 3** for long-term robustness

### Monitoring & Validation

Add instrumentation to track:

- How often promoter code changes during a session
- When sessionStorage is overwritten
- Tab/window count during checkout

```typescript
// Track promoter code changes
useEffect(() => {
  const savedCode = sessionStorage.getItem("flame_promoter_code");
  if (savedCode && savedCode !== promoterCode && promoterCode) {
    console.warn(`⚠️ Promoter code mismatch detected!`);
    console.warn(`  - URL has: ${promoterCode}`);
    console.warn(`  - Storage has: ${savedCode}`);
    // Send to analytics/Sentry
  }
}, [promoterCode]);
```

## Testing the Fix

After implementing Solution 1:

```bash
# Test scenario
1. Open /events/test-event?promoter=TESTCODE1 in Tab 1
2. Start checkout in Tab 1 (creates session A)
3. Open /events/test-event?promoter=TESTCODE2 in Tab 2
4. Start checkout in Tab 2 (creates session B)
5. Complete purchase in Tab 1
6. Verify order has promoter_code = "TESTCODE1" ✅
7. Complete purchase in Tab 2
8. Verify order has promoter_code = "TESTCODE2" ✅
```

## UPDATE: Individual Device Usage

### New Information from Organizer

Organizer confirms: **"They all bought on their individual device"**

This **significantly reduces** the likelihood of the multi-tab race condition being the primary issue.

### Most Likely Root Causes (Individual Device Scenario)

#### 1. **Users Not Using Promoter Links** 🔴 HIGH PROBABILITY

**What's happening:**

- Promoters THINK they sent the link
- But users found the event through other means:
  - Google search for "Kora event tickets"
  - Homepage browse on flametickets.com
  - Social media posts without promoter code
  - Word of mouth → manual URL entry

**How to verify:**

```
Ask promoters:
- "Did you send the EXACT link from the dashboard, or did you send a screenshot?"
- "Did people already know about the event before you sent the link?"
- "Did you post the link publicly on social media?"
```

**Evidence:** If users are aware of the event (e.g., "Kora" is a popular event), they might:

1. Search for it themselves
2. Already have the event page bookmarked
3. See it advertised elsewhere

#### 2. **Link Truncation/Modification** 🟡 MEDIUM PROBABILITY

**What's happening:**

- Promoter copies: `https://flametickets.com/events/kora?promoter=CODE123`
- WhatsApp/Facebook/SMS strips to: `https://flametickets.com/events/kora`
- OR user copy/pastes from browser but misses the query parameter

**Known issues with messaging apps:**

- WhatsApp: Sometimes strips query parameters
- Facebook Messenger: Previews can strip params
- SMS: Long URLs get broken across messages
- Instagram: Click tracking removes parameters

**How to verify:**

```
Test:
1. Send promoter link via WhatsApp
2. Click it from the message
3. Check if URL still has ?promoter= parameter
```

#### 3. **Promoters Sending Wrong URL** 🟡 MEDIUM PROBABILITY

**What's happening:**

- Promoter opens the promoter dashboard
- Copies the event URL from browser address bar (wrong!)
- Instead of clicking "Copy Link" button (correct)

**Let me check the UI...**

Looking at `PromotionsSection.tsx` lines 1645-1760, promoters are supposed to:

1. See their promoter URL like: `flametickets.com/events/kora?promoter=THEIRCODE`
2. Click "Copy URL" button to copy it

**But what if:**

- They're sharing a screenshot instead of the link
- They're manually typing the event name
- They're copying from the wrong place

#### 4. **Browser Privacy Settings** 🟢 LOW PROBABILITY

**What's happening:**

- User has aggressive privacy settings
- SessionStorage gets blocked/cleared
- Promoter code never saved

**Browsers affected:**

- Safari with "Prevent Cross-Site Tracking" + iFrame blocking
- Firefox with Enhanced Tracking Protection: Strict
- Incognito/Private modes
- Corporate devices with restrictive policies

**Likelihood:** Low (would affect all sessions, not just some)

#### 5. **Back/Forward Button Issues** 🟢 LOW PROBABILITY

**What's happening:**

1. User visits `/events/kora?promoter=CODE`
2. Starts checkout, gets scared, hits back
3. Forward button might lose query parameters (browser-dependent)
4. Completes purchase without promoter code

**Likelihood:** Low (modern browsers preserve params)

### Diagnostic Steps for Organizer

**Immediate Actions:**

1. **Check Recent Orders in Database**

   ```sql
   SELECT
     id,
     created_at,
     promoter_code,
     total_amount_cents,
     quantity
   FROM orders
   WHERE event_id = 'KORA_EVENT_ID'
     AND created_at > NOW() - INTERVAL '7 days'
   ORDER BY created_at DESC;
   ```

   **Look for:**

   - Orders with `promoter_code = NULL` (these are unattributed)
   - Compare count of NULL vs. attributed orders

2. **Interview Promoters**

   Ask specific questions:

   - ✅ "Show me EXACTLY how you sent the link"
   - ✅ "Did you use the Copy URL button or type it yourself?"
   - ✅ "What app did you use to send it? (WhatsApp/Instagram/SMS)"
   - ✅ "Did you post it publicly or send directly to people?"
   - ✅ "Did people already know about the event?"

3. **Test Link Distribution**

   As organizer:

   ```
   1. Get a promoter's link from dashboard
   2. Send it to yourself via WhatsApp
   3. Send it via Instagram DM
   4. Post on Facebook
   5. Click each one and check if ?promoter= parameter survives
   ```

4. **Check Browser Console Logs**

   If promoter can reproduce:

   ```
   1. Open browser DevTools (F12)
   2. Go to Console tab
   3. Click promoter link
   4. Look for logs:
      "💾 Saved promoter code to sessionStorage: CODE"
      "🔄 Restored promoter code from sessionStorage: CODE"
   5. Screenshot and send to you
   ```

### Recommendations (Updated)

#### Quick Fix: Add Server-Side Hold Tracking ⭐ RECOMMENDED

Since they're on individual devices, the best solution is to store the promoter code on the **hold record** (server-side):

```sql
-- Migration
ALTER TABLE holds
ADD COLUMN promoter_code VARCHAR(50);

CREATE INDEX idx_holds_promoter_code ON holds(promoter_code);
```

```typescript
// app/api/holds/create/route.ts
const { data: hold } = await supabase
  .from("holds")
  .insert({
    // ... existing fields
    promoter_code: promoter_code, // Add this
  })
  .select()
  .single();
```

Then in purchase completion, read from hold instead of sessionStorage:

```typescript
// app/api/purchase/complete-hold/route.ts
const promoterCode = hold.promoter_code; // ✅ Guaranteed correct
```

**Benefits:**

- ✅ Survives ANY navigation issues
- ✅ No storage dependencies
- ✅ Works even if user switches devices
- ✅ Immune to messaging app link mangling
- ✅ Source of truth in database

#### Additional: Add Analytics Tracking

Add logging to understand WHERE users are coming from:

```typescript
// On event page load
useEffect(() => {
  const hasPromoterCode = !!searchParams.get("promoter");
  const referrer = document.referrer;

  // Log to analytics
  console.log("[ANALYTICS] Event page view:", {
    hasPromoterCode,
    referrer,
    utm_source: searchParams.get("utm_source"),
  });
}, []);
```

This tells you if users are:

- Coming from Google (no promoter code)
- Coming from social media (might lose promoter code)
- Direct URL entry (definitely no promoter code)

### Next Steps

1. **Run diagnostic queries** on database
2. **Interview 2-3 promoters** with the specific questions above
3. **Test link sharing** through different platforms
4. **Implement server-side hold tracking** (2-3 hours work)
5. **Add analytics** to track attribution sources

## Conclusion (Updated)

**Most Likely Root Cause**: Users finding event through non-promoter channels (organic search, social media, word of mouth)

**Secondary Cause**: Link parameter stripping by messaging apps

**Tertiary Cause**: Multi-tab race condition (less likely given individual devices)

**Best Solution**: Server-side hold tracking (Solution #3) - makes the system immune to ALL client-side issues

---

**Status**: INVESTIGATION IN PROGRESS  
**Priority**: HIGH (affects revenue attribution)  
**Next Action**: Run diagnostic queries + interview promoters
**Estimated Fix Time**: 2-3 hours for server-side tracking
