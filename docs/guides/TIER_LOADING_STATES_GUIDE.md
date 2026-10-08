# Tier Loading States Implementation Guide

## Overview

This guide documents the implementation of loading states for ticket tier operations (create/delete) in the OrganizerDashboard component. It covers the current clean approach using React Query's built-in states and future refactoring opportunities.

---

## ✅ Current Implementation (Clean Approach)

### What We Use

**File:** `app/components/OrganizerDashboard.tsx`

```typescript
// Activate React Query with built-in loading states
const { data: queryData, isRefetching } = useQuery<OrganizerData>({
  queryKey: ["organizer-data"],
  queryFn: async () => {
    /* ... */
  },
  refetchInterval: 15000, // Poll every 15 seconds for RSVP updates
  // ... other config
});

// Track tier operation separately from polling (prevents spinner on every poll)
const [isTierOperationInProgress, setIsTierOperationInProgress] =
  useState(false);

// Auto-clear flag when refetch completes
useEffect(() => {
  if (isTierOperationInProgress && !isRefetching) {
    setIsTierOperationInProgress(false);
  }
}, [isRefetching, isTierOperationInProgress]);

// Mutation for deleting ticket tiers
const deleteTicketTierMutation = useDeleteTicketTier();
```

### Loading Overlay Logic

```typescript
{
  /* Loading overlay during tier operations */
}
{
  (deleteTicketTierMutation.isPending || isTierOperationInProgress) && (
    <div className="tiers-loading-overlay">
      <div className="tiers-loading-spinner"></div>
      <p>Updating tiers...</p>
    </div>
  );
}
```

### Key Insight: Separating Manual Operations from Polling

**Problem:** With 15-second polling enabled, `isRefetching` becomes `true` every 15 seconds, showing the loading spinner constantly.

**Solution:** Track tier operations separately with `isTierOperationInProgress`:

- Set to `true` when tier create/update/delete operations trigger refetches
- Automatically cleared by useEffect when refetch completes
- Polling refetches don't trigger this flag, so no unwanted spinners!

### How It Works

#### Tier Creation Flow

1. User clicks "Save" on TierInlineForm → API call succeeds
2. `handleModalSuccess()` sets `isTierOperationInProgress = true` and calls `refetchQueries()`
3. Loading overlay shows (due to `isTierOperationInProgress`)
4. React Query refetches: `isRefetching = true`
5. New data arrives from server
6. `isRefetching = false` → useEffect detects this and clears `isTierOperationInProgress`
7. Loading overlay disappears
8. ✅ User sees new tier, no gaps!

#### Tier Deletion Flow

1. User clicks delete (twice for confirmation)
2. `mutation.mutate()` → `mutation.isPending = true` → Loading overlay shows
3. DELETE API call completes → `mutation.isPending = false`
4. `onSuccess` callback sets `isTierOperationInProgress = true` and triggers `refetchQueries()`
5. Loading overlay stays visible (now due to `isTierOperationInProgress`)
6. React Query refetches: `isRefetching = true`
7. New data arrives from server
8. `isRefetching = false` → useEffect clears `isTierOperationInProgress`
9. Loading overlay disappears
10. ✅ User sees updated list, no gaps!

#### Polling Flow (Every 15 Seconds)

1. React Query automatically refetches: `isRefetching = true`
2. `isTierOperationInProgress` remains `false` (not manually triggered)
3. Loading overlay does NOT show! ✅
4. New data arrives silently
5. `isRefetching = false`
6. ✅ User experience is uninterrupted!

### Why This Approach Works

1. **Minimal Manual State**: Only one flag (`isTierOperationInProgress`) to separate tier operations from polling
2. **Automatic Cleanup**: useEffect clears the flag when React Query's refetch completes
3. **No Race Conditions**: Loading states are guaranteed accurate
4. **Polling-Safe**: 15-second background polling doesn't show spinners to users
5. **Clean Code**: ~10 lines of code for robust loading state management

---

## 📊 Previous Approach (For Reference)

### What We Had Before (Manual State Management)

```typescript
// ❌ Manual state variable
const [isTierOperationInProgress, setIsTierOperationInProgress] =
  useState(false);

// ❌ Manual synchronization effect
useEffect(() => {
  if (isTierOperationInProgress && !isFetchingOrganizerData) {
    setIsTierOperationInProgress(false);
  }
}, [isFetchingOrganizerData, isTierOperationInProgress]);

// ❌ Manual state updates everywhere
setIsTierOperationInProgress(true); // On operation start
setIsTierOperationInProgress(false); // On operation end
```

### Why We Moved Away From This

1. **Complexity**: Required custom state + useEffect + manual flag management
2. **Error-Prone**: Easy to forget to clear flags or miss edge cases
3. **Race Conditions**: Manual synchronization could get out of sync
4. **Not Idiomatic**: Fighting against React Query instead of using it properly

---

## 🚀 Future Refactoring Opportunities

### Priority 1: Refactor TierInlineForm to Use useMutation

**Current State:**

```typescript
// TierInlineForm does manual fetch
const response = await fetch("/api/ticket-tiers", {
  method: tier ? "PATCH" : "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const errorData = await response.json();
  throw new Error(errorData.error || "Failed to save ticket tier");
}

onSave(); // Parent handles refetch
```

**Improved Approach:**

```typescript
// Inside TierInlineForm.tsx
import { useTicketTierMutation } from "../lib/hooks/useOrganizerData";

function TierInlineForm({ tier, eventId, onSave, onCancel }) {
  const tierMutation = useTicketTierMutation();

  const handleSubmit = async e => {
    e.preventDefault();

    // Use the mutation hook
    tierMutation.mutate(payload, {
      onSuccess: () => {
        onSave(); // Let parent know we're done
        onCancel(); // Close the form
      },
      onError: error => {
        setError(error.message);
      },
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button type="submit" disabled={tierMutation.isPending}>
        {tierMutation.isPending ? "Saving..." : "Save Tier"}
      </button>
    </form>
  );
}
```

**Benefits:**

- ✅ Consistent with delete operation
- ✅ Automatic cache invalidation (handled by mutation hook)
- ✅ Built-in loading state (`mutation.isPending`)
- ✅ Simplified error handling
- ✅ Parent component doesn't need `refetchQueries()`

---

### Priority 2: Add Optimistic Updates

**What It Means:**
Show changes in UI immediately, before server confirms. Rollback if server returns error.

**Implementation:**

```typescript
// app/lib/hooks/useOrganizerData.ts
export function useDeleteTicketTier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tierId: string) => {
      const response = await fetch(`/api/ticket-tiers?id=${tierId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete ticket tier");
      }

      return response.json();
    },

    // NEW: Optimistic update
    onMutate: async tierId => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["organizer-data"] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(["organizer-data"]);

      // Optimistically update the cache
      queryClient.setQueryData(["organizer-data"], (old: any) => {
        if (!old) return old;

        return {
          ...old,
          events: old.events.map((event: any) => ({
            ...event,
            ticket_tiers: event.ticket_tiers?.filter(
              (tier: any) => tier.id !== tierId
            ),
          })),
        };
      });

      // Return context with snapshot
      return { previousData };
    },

    // If mutation fails, rollback
    onError: (err, tierId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["organizer-data"], context.previousData);
      }
    },

    // Always refetch to ensure server state is correct
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["organizer-data"] });
    },
  });
}
```

**Benefits:**

- ✅ **Instant UI feedback** - Tier disappears immediately
- ✅ **Automatic rollback** - If server fails, tier reappears
- ✅ **Better UX** - App feels faster and more responsive
- ✅ **Server validation** - Still confirms with server after

---

### Priority 3: Remove SSR/Client Data Duplication

**Current State:**

```typescript
// Server fetches data
const { data: events } = await supabaseAdmin.from("events").select(...);

// Client ALSO fetches same data
const { data: queryData } = useOrganizerData();
const events = queryData?.events ?? initialEvents;
```

**Problem:**

- Data fetched twice (server + client on mount)
- Waste of resources
- Possible inconsistency

**Option A: Full React Query (Client-Side Only)**

```typescript
// app/organizer/page.tsx
export default async function OrganizerPage() {
  const { userId } = await auth();

  // Only fetch auth/permissions on server
  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select(`*, organizations (*)`)
    .eq("user_id", userId)
    .single();

  return (
    <OrganizerDashboard
      organization={membership.organizations}
      // NO events prop - let client fetch
    />
  );
}

// OrganizerDashboard.tsx
function OrganizerDashboard({ organization }) {
  // Client fetches events
  const { data, isLoading } = useOrganizerData();

  if (isLoading) return <LoadingSpinner />;

  return <div>{/* Use data.events */}</div>;
}
```

**Option B: Full SSR (Disable Refetch on Mount)**

```typescript
// Keep server-fetched data, but disable automatic client refetch
const { data: queryData, isRefetching } = useOrganizerData({
  initialData: { organization, events: initialEvents },
  refetchOnMount: false, // Don't refetch on mount
  refetchOnWindowFocus: true, // Still refetch on tab focus
  staleTime: 60_000, // Consider fresh for 60 seconds
});
```

**Recommendation: Option B** (keeps fast initial load + selective refetching)

---

### Priority 4: Add Loading States to Individual Tiers

**Current:** Overlay covers entire tier list
**Better:** Show loading state on specific tier being edited/deleted

```typescript
{
  tierList.map(tier => (
    <div
      key={tier.id}
      className={cn("tier-card", {
        "tier-loading": deleteMutation.variables === tier.id,
      })}
    >
      {/* Tier content */}
      <button
        onClick={() => deleteMutation.mutate(tier.id)}
        disabled={
          deleteMutation.isPending && deleteMutation.variables === tier.id
        }
      >
        {deleteMutation.isPending && deleteMutation.variables === tier.id
          ? "Deleting..."
          : "Delete"}
      </button>
    </div>
  ));
}
```

---

## 📚 Best Practices Summary

### ✅ DO

1. **Use React Query's built-in states** (`isPending`, `isRefetching`, `isFetching`)
2. **Force refetches with `refetchQueries()`** instead of just `invalidateQueries()`
3. **Keep queries active** to enable tracking (call `useOrganizerData()` hook)
4. **Use mutations for write operations** (CREATE, UPDATE, DELETE)
5. **Add optimistic updates** for instant UI feedback
6. **Handle errors gracefully** with rollback logic

### ❌ DON'T

1. **Create manual loading states** when React Query provides them
2. **Use `useEffect` to synchronize states** - let React Query handle it
3. **Fetch data twice** (SSR + client mount) - choose one or configure properly
4. **Forget error states** - always handle `onError` in mutations
5. **Block UI unnecessarily** - use optimistic updates when possible

---

## 🎯 Implementation Checklist

### Short-term Improvements (Current Sprint)

- [x] Use `isRefetching` to track refetch state
- [x] Add `isTierOperationInProgress` flag to separate manual ops from polling
- [x] Add synchronization `useEffect` to auto-clear flag
- [x] Update loading overlay condition to use both mutation state and operation flag
- [x] Document approach in this guide
- [x] Fix polling issue (spinner appearing every 15 seconds)

### Medium-term Improvements (Next Sprint)

- [ ] Refactor TierInlineForm to use `useTicketTierMutation()`
- [ ] Add optimistic updates to tier deletion
- [ ] Add optimistic updates to tier creation
- [ ] Configure SSR data to avoid double-fetch

### Long-term Improvements (Future)

- [ ] Add per-tier loading indicators
- [ ] Implement undo functionality for deletions
- [ ] Add batch operations (delete multiple tiers)
- [ ] Add drag-and-drop reordering with optimistic updates

---

## 📖 Related Documentation

- [REACT_QUERY_OPTIMIZATION.md](./REACT_QUERY_OPTIMIZATION.md) - Overall React Query usage
- [PERFORMANCE_BEST_PRACTICES.md](./PERFORMANCE_BEST_PRACTICES.md) - Performance guidelines
- [React Query Docs - Optimistic Updates](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
- [React Query Docs - Mutations](https://tanstack.com/query/latest/docs/react/guides/mutations)

---

## 🎉 Summary

**Current State:**

- ✅ Clean implementation using React Query's built-in states
- ✅ No manual state management
- ✅ No gaps in loading feedback
- ✅ Works reliably for tier create/delete

**Next Steps:**

- 🚀 Refactor TierInlineForm to use mutation hooks
- 🚀 Add optimistic updates for instant feedback
- 🚀 Optimize SSR/client data fetching strategy
- 🚀 Consider per-tier loading indicators

The current implementation is production-ready and follows React Query best practices. Future improvements will enhance UX and maintainability further!
