# Cache Revalidation Audit

## 📊 **Analysis: What Needs Revalidation?**

This document analyzes all data mutations in the app and determines which need cache invalidation.

---

## ✅ **Already Implemented**

### 1. **Events** (`/api/events`)

- **Create Event (POST)** ✅
  - Affects: `/organizer` dashboard
  - **Status:** `revalidatePath()` added
- **Update Event (PATCH)** ✅
  - Affects: `/organizer`, `/events`, `/events/[slug]`
  - **Status:** `revalidatePath()` added

### 2. **Ticket Tiers** (`/api/ticket-tiers`)

- **Create Tier (POST)** ✅
  - Affects: `/organizer` dashboard
  - **Status:** `revalidatePath()` added
- **Update Tier (PATCH)** ✅
  - Affects: `/organizer` dashboard
  - **Status:** `revalidatePath()` added

### 3. **RSVPs** (`/api/organizer/rsvps`)

- **Approve RSVP (PATCH)** ✅
  - Affects: `/organizer` dashboard (pending/approved/rejected counts)
  - **Status:** `revalidatePath()` added (even when email fails)
- **Reject RSVP (PATCH)** ✅
  - Affects: `/organizer` dashboard
  - **Status:** `revalidatePath()` added
- **Create RSVP (POST)**
  - Affects: `/organizer` dashboard
  - **Status:** Needs verification if `revalidatePath` is in `/api/rsvp`

---

## ⚠️ **Needs Implementation**

---

### 4. **Purchases/Orders** - HIGH PRIORITY 🔴

#### **Problem:**

Completed purchases affect:

- `totalRevenue` (sum of purchase amounts)
- `totalAttendees` (sum of ticket quantities)
- `purchases` list on organizer dashboard

#### **Routes That Need Revalidation:**

**a) Verify Payment** (`/api/datafast/verify-payment`)

```typescript
// Current: No revalidation
// Impact: Creates order, affects totalRevenue & totalAttendees
// Visible on: /organizer dashboard, /account (user's tickets)
```

**b) Complete Direct Purchase** (`/api/purchase/complete-direct`)

```typescript
// Current: No revalidation
// Impact: Creates order for direct (no RSVP) events
// Visible on: /organizer dashboard, /account
```

**c) Complete Purchase with Token** (`/api/purchase/complete`)

```typescript
// Current: No revalidation
// Impact: Creates order from RSVP approval flow
// Visible on: /organizer dashboard, /account
```

**Recommendation:** ✅ **ADD REVALIDATION**

---

## ✅ **Optional / Low Priority**

### 5. **Organizations** (`/api/organizations`)

**Create Organization (POST)**

```typescript
// Current: No revalidation
// Impact: Changes user role from 'user' to 'organizer'
// Visible on: Navbar (role-based links), redirects
// Note: User typically logs out/in after, which clears cache naturally
```

**Recommendation:** ⚠️ **OPTIONAL** - Add if you want instant navbar updates

---

### 6. **Admin Actions**

**a) Cleanup Tickets** (`/api/admin/cleanup-tickets`)

```typescript
// Current: No revalidation
// Impact: Deletes ALL tickets/orders/rsvps (resets everything)
// Visible on: /organizer dashboard, /admin dashboard
// Note: Admin-only, dev/testing feature
```

**b) Featured Events** (`/api/admin/featured-events`)

```typescript
// Current: No revalidation
// Impact: Changes which events appear on homepage
// Visible on: Homepage featured section
```

**Recommendation:** ⚠️ **OPTIONAL** - Admin actions are rare

---

## 🎯 **Priority Implementation Plan**

### **Phase 1: Critical (Do Now)** 🔴

1. **RSVP Approve/Reject**

   - Files:
     - `/api/organizer/rsvps/[id]/approve/route.ts`
     - `/api/organizer/rsvps/[id]/reject/route.ts`
   - Add: `revalidatePath("/organizer")`
   - Impact: Pending counts update immediately

2. **Purchase Completion**
   - Files:
     - `/api/datafast/verify-payment/route.ts`
     - `/api/purchase/complete-direct/route.ts`
     - `/api/purchase/complete/route.ts`
   - Add:
     - `revalidatePath("/organizer")` (for revenue/attendees)
     - `revalidatePath("/account")` (for user's ticket list)
   - Impact: Revenue & attendee counts update immediately

### **Phase 2: Nice-to-Have (Later)** ⚠️

3. **Create Organization**

   - File: `/api/organizations/route.ts`
   - Add: `revalidatePath("/")` (navbar updates)
   - Impact: Role-based navigation updates without refresh

4. **Admin Actions**
   - Files: `/api/admin/cleanup-tickets/route.ts`, `/api/admin/featured-events/route.ts`
   - Add: `revalidatePath("/organizer")`, `revalidatePath("/")`
   - Impact: Admin changes appear immediately

---

## 📊 **Impact Analysis**

### **Without Revalidation (Current State):**

| Action            | Cache Behavior       | User Experience                         |
| ----------------- | -------------------- | --------------------------------------- |
| Approve RSVP      | Cached for 60s       | Pending count doesn't update for 60s ❌ |
| Complete Purchase | Cached for 60s       | Revenue doesn't update for 60s ❌       |
| Create Event      | Cleared instantly ✅ | Event appears immediately ✅            |

### **With Revalidation (Recommended):**

| Action            | Cache Behavior       | User Experience                      |
| ----------------- | -------------------- | ------------------------------------ |
| Approve RSVP      | Cleared instantly ✅ | Pending count updates immediately ✅ |
| Complete Purchase | Cleared instantly ✅ | Revenue updates immediately ✅       |
| Create Event      | Cleared instantly ✅ | Event appears immediately ✅         |

---

## 🔧 **Implementation Examples**

### **Example 1: RSVP Approval**

```typescript:app/api/organizer/rsvps/[id]/approve/route.ts
import { revalidatePath } from "next/cache";

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  // ... approve RSVP logic ...

  // ⚡ INSTANT UPDATE: Clear organizer dashboard cache
  revalidatePath("/organizer");

  return NextResponse.json({
    message: "RSVP approved successfully",
    rsvp: updatedRsvp,
  });
}
```

### **Example 2: Payment Verification**

```typescript:app/api/datafast/verify-payment/route.ts
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  // ... verify payment & create order ...

  // ⚡ INSTANT UPDATE: Clear both organizer and user caches
  revalidatePath("/organizer"); // For organizer's revenue/attendees
  revalidatePath("/account");   // For user's ticket list

  return NextResponse.json({ order });
}
```

---

## 🎯 **Summary**

### **Must Add (2 areas):**

1. ✅ **RSVP Actions** (approve/reject) → Add `revalidatePath("/organizer")`
2. ✅ **Purchase Completion** → Add `revalidatePath("/organizer")` + `revalidatePath("/account")`

### **Optional (2 areas):**

3. ⚠️ **Organizations** → Add `revalidatePath("/")`
4. ⚠️ **Admin Actions** → Add `revalidatePath("/organizer")` + `revalidatePath("/")`

### **Expected Improvement:**

- ⚡ **RSVPs:** Pending counts update instantly (vs 60s delay)
- ⚡ **Purchases:** Revenue & attendees update instantly (vs 60s delay)
- ⚡ **Overall:** Professional, responsive dashboard experience

---

## 💡 **Best Practice Learned**

**Rule of Thumb:**

> Any API route that **writes** to the database should ask:  
> "Does this change affect a **cached page**?"  
> If YES → Add `revalidatePath()`

**Quick Checklist:**

- [ ] Does it affect `/organizer` dashboard? → `revalidatePath("/organizer")`
- [ ] Does it affect `/account` user data? → `revalidatePath("/account")`
- [ ] Does it affect `/events` listings? → `revalidatePath("/events")`
- [ ] Does it affect homepage? → `revalidatePath("/")`
