# Performance Best Practices for FLAME Events

## 🎯 Current Optimizations Implemented

### 1. **Database Query Batching** ✅

**Before:** N × 2 queries (20 queries for 10 events)
**After:** 2 parallel queries (constant time)

```typescript
// ✅ GOOD - Batch queries
const [allRsvps, allPurchases] = await Promise.all([
  supabase.from("rsvps").select("*").in("event_id", eventIds),
  supabase.from("orders").select("*").in("event_id", eventIds),
]);

// ❌ BAD - N queries
for (const event of events) {
  await supabase.from("rsvps").select("*").eq("event_id", event.id);
}
```

### 2. **ISR Caching** ✅

Changed from `revalidate = 0` to `revalidate = 60`

- Pages are cached for 60 seconds
- Subsequent visits within 60s are instant
- Background revalidation keeps data fresh

### 3. **Link Prefetching** ✅

```typescript
<Link href="/account" prefetch={true}>
```

- Next.js prefetches routes in viewport
- Near-instant navigation when clicked

### 4. **Instant URL Updates** ✅

Using `window.history.pushState()` for instant tab switching

---

## 🚀 Recommended Next Steps

### **Priority 1: Leverage React Query More**

You already have React Query! Use it for real-time updates:

```typescript
// In OrganizerDashboard component
const { data: events } = useQuery({
  queryKey: ["organizer-events", organizationId],
  queryFn: async () => {
    const res = await fetch(`/api/organizer/events`);
    return res.json();
  },
  initialData: initialEvents, // Use SSR data as initial
  staleTime: 30_000, // 30 seconds
  refetchInterval: 60_000, // Refetch every 60s
  refetchOnWindowFocus: true, // Refetch on tab focus
});
```

**Benefits:**

- ⚡ Instant navigation (uses cache)
- 🔄 Auto-refresh every 60s
- 📱 Refetch when user returns to tab
- 🎯 No server hit for cached data

### **Priority 2: Optimize Heavy Operations**

#### Database Indexes

Ensure these indexes exist:

```sql
-- RSVPs by event
CREATE INDEX idx_rsvps_event_status ON rsvps(event_id, status);

-- Orders by event
CREATE INDEX idx_orders_event_status ON orders(event_id, status);

-- Event lookups
CREATE INDEX idx_events_org_starts ON events(organization_id, starts_at);
```

#### Pagination for Large Datasets

```typescript
// For events with 100+ RSVPs or purchases
const ITEMS_PER_PAGE = 50;

const { data, count } = await supabase
  .from("rsvps")
  .select("*", { count: "exact" })
  .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
```

### **Priority 3: Streaming & Suspense**

For the organizer dashboard, use streaming:

```typescript
// app/organizer/page.tsx
export default async function OrganizerPage() {
  // Fetch critical data first (fast)
  const user = await getUser();
  const organization = await getOrganization();

  return (
    <OrganizerDashboard user={user} organization={organization}>
      {/* Stream slower data */}
      <Suspense fallback={<EventsSkeleton />}>
        <Events organizationId={organization.id} />
      </Suspense>
    </OrganizerDashboard>
  );
}
```

**Benefits:**

- Page renders immediately with user/org
- Events load progressively
- Better perceived performance

---

## 📊 Performance Targets

| Metric           | Target   | Current Status           |
| ---------------- | -------- | ------------------------ |
| Initial Load     | < 2s     | ✅ Optimized with ISR    |
| Navigation       | < 500ms  | ✅ With prefetch + cache |
| Tab Switch       | < 100ms  | ✅ Client-side only      |
| Data Refresh     | < 1s     | ✅ React Query           |
| Database Queries | Minimize | ✅ Batched               |

---

## 🔧 Configuration Recommendations

### Next.js Config

```typescript
// next.config.ts
const config = {
  experimental: {
    // Enable if using Next.js 14+
    ppr: "incremental", // Partial Prerendering
  },
  // Image optimization
  images: {
    formats: ["image/avif", "image/webp"],
  },
};
```

### React Query Config

```typescript
// app/lib/providers/QueryProvider.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 minute
      gcTime: 5 * 60_000, // 5 minutes (formerly cacheTime)
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});
```

---

## 🎨 Loading States Best Practices

### 1. Use React Query's Built-in States ✅

**Implemented in OrganizerDashboard for tier operations:**

```typescript
// Use React Query's built-in loading states
const { data: queryData, isRefetching } = useOrganizerData();
const deleteTicketTierMutation = useDeleteTicketTier();

// Show loading overlay when mutation is pending OR refetching data
{
  (deleteTicketTierMutation.isPending || isRefetching) && <LoadingOverlay />;
}
```

**Benefits:**

- ✅ No manual state management
- ✅ Guaranteed accurate loading states
- ✅ No gaps in loading feedback
- ✅ Cleaner, more maintainable code

**See [TIER_LOADING_STATES_GUIDE.md](./TIER_LOADING_STATES_GUIDE.md) for detailed implementation**

### 2. Optimistic Updates

```typescript
const updateRsvp = useMutation({
  mutationFn: (data) => fetch('/api/rsvp/approve', ...),
  onMutate: async (newRsvp) => {
    // Instantly update UI
    await queryClient.cancelQueries(['rsvps']);
    const previous = queryClient.getQueryData(['rsvps']);

    queryClient.setQueryData(['rsvps'], (old) => ({
      ...old,
      status: 'approved' // Update immediately
    }));

    return { previous };
  },
  onError: (err, newRsvp, context) => {
    // Rollback on error
    queryClient.setQueryData(['rsvps'], context.previous);
  },
});
```

### 3. Skeleton Screens

Better than spinners - shows layout structure:

```typescript
<div className="event-card-skeleton">
  <div className="skeleton-header" />
  <div className="skeleton-text" />
  <div className="skeleton-text short" />
</div>
```

---

## ⚠️ Anti-Patterns to Avoid

### ❌ DON'T: Fetch on every render

```typescript
// BAD
useEffect(() => {
  fetchEvents(); // Refetches on every render
}, []);
```

### ✅ DO: Use React Query

```typescript
// GOOD
const { data } = useQuery(["events"], fetchEvents);
```

### ❌ DON'T: Use `revalidate = 0` everywhere

- Only use for truly real-time pages (rare)
- Most pages can cache for 30-60 seconds

### ✅ DO: Choose appropriate cache times

```typescript
export const revalidate = 60; // Most pages
export const revalidate = 30; // High-traffic dashboards
export const revalidate = 300; // Static content (5 min)
```

---

## 🔍 Monitoring Performance

### Add Performance Logging

```typescript
// lib/utils/performance.ts
export function measurePerformance(label: string) {
  const start = performance.now();

  return {
    end: () => {
      const duration = performance.now() - start;
      console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);

      // Send to analytics in production
      if (process.env.NODE_ENV === "production") {
        // analytics.track('performance', { label, duration });
      }
    },
  };
}

// Usage
const perf = measurePerformance("Fetch Events");
await fetchEvents();
perf.end();
```

### Use Next.js Built-in Analytics

```typescript
// app/layout.tsx
import { SpeedInsights } from "@vercel/speed-insights/next";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
```

---

## 🎯 Summary

### What We've Implemented:

✅ Query batching (2 queries instead of 20)
✅ ISR caching (60s revalidation)
✅ Link prefetching
✅ Instant URL updates

### Next Recommended Steps:

1. Add React Query to more components
2. Add database indexes
3. Implement streaming/Suspense for slow sections
4. Add optimistic updates for mutations
5. Monitor with Speed Insights

### Expected Performance:

- **First visit:** ~2 seconds (SSR + data fetch)
- **Cached visits:** ~200ms (prefetched + ISR cache)
- **Tab switches:** ~50ms (client-side only)
- **Data refreshes:** Background, no blocking

This architecture balances **freshness**, **performance**, and **user experience** perfectly for a production event platform! 🚀
