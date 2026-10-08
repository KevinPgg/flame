# React Query vs SSR: When to Use Each

> 📝 **Updated Jan 2026**: This guide remains accurate. For recent React Query configuration updates, see [Organizer Dashboard Revenue Fix](../fixes/ORGANIZER_DASHBOARD_REVENUE_FIX.md) which documents the latest best practices for `refetchOnMount` and `staleTime` settings.

## TL;DR

**You were 100% right to notice `/events` was slower!** Pure client-side React Query is NOT always better than SSR. Here's when to use each:

## The Performance Issue You Noticed

### ❌ Client-Side Only (What We Briefly Had)

```
User clicks /events
  ↓
Empty page loads (blank screen)
  ↓
Loading spinner appears
  ↓
Browser fetches data from API
  ↓
Data arrives
  ↓
Page renders (finally!)

Total: ~1-2 seconds to see content
```

### ✅ Server-Side Rendering (What We Have Now)

```
User clicks /events
  ↓
Server fetches data from database
  ↓
Server renders HTML with content
  ↓
HTML sent to browser
  ↓
User sees full page immediately

Total: ~200-400ms to see content
```

## Real-World Best Practices

### Use SSR For:

#### 1. **Public Landing Pages**

```typescript
// ✅ GOOD: /events page
export default async function EventsPage() {
  const { events, cities } = await getEvents(); // Server-side
  return <EventsCatalog events={events} cities={cities} />;
}
```

**Why**: First impression matters. Users expect instant content on public pages.

#### 2. **SEO-Critical Pages**

- Event listings
- Event detail pages
- Blog posts
- Product pages

**Why**: Search engines need HTML with content. Client-side fetching hurts SEO.

#### 3. **Marketing/Landing Pages**

- Homepage hero sections (with static content)
- About pages
- Contact pages

**Why**: These pages should load instantly. No spinners on marketing pages.

### Use React Query For:

#### 1. **Authenticated User Data**

```typescript
// ✅ GOOD: User dashboard
export function UserDashboard() {
  const { data: tickets, isLoading } = useUserTickets(); // Client-side
  // Only fetches when user is logged in
}
```

**Why**:

- Can't pre-render personal data (security)
- Data changes frequently
- Benefits from caching between navigations

#### 2. **Interactive Mutations**

```typescript
// ✅ GOOD: RSVP submission
export function EventDetail({ event }) {
  const rsvpMutation = useRsvpSubmission();

  const handleSubmit = () => {
    rsvpMutation.mutate({ event_id, ticket_tier_id, quantity });
  };
}
```

**Why**:

- Immediate UI feedback (optimistic updates)
- Automatic cache invalidation
- Built-in loading/error states

#### 3. **Real-Time Updates**

```typescript
// ✅ GOOD: QR Scanner
export function QRScanner() {
  const verifyMutation = useTicketVerification();
  // Continuously scans and verifies tickets
}
```

**Why**:

- Needs fresh data on every scan
- Can't pre-render
- Benefits from React Query's retry/error handling

#### 4. **Background Refresh**

```typescript
// ✅ GOOD: Admin dashboard stats
export function AdminDashboard() {
  const { data: stats } = useAdminStats({
    refetchInterval: 30000, // Refresh every 30s
  });
}
```

**Why**:

- Data changes while user is on page
- Don't want to refresh entire page
- React Query handles background updates

## The Hybrid Approach (Best of Both Worlds)

### Example: Event Detail Page

```typescript
// Server Component (Fast Initial Load)
export default async function EventPage({ params }) {
  const event = await getEventBySlug(params.slug); // SSR

  return (
    <div>
      <Navbar />
      <EventDetail event={event} /> {/* Client Component */}
      <Footer />
    </div>
  );
}

// Client Component (Interactive Features)
("use client");
export function EventDetail({ event }) {
  // Initial data from props (server-rendered)
  // React Query used only for interactions
  const rsvpMutation = useRsvpSubmission();

  return (
    <div>
      <h1>{event.name}</h1>
      <p>{event.description}</p>

      {/* This uses React Query */}
      <RsvpForm onSubmit={rsvpMutation.mutate} />
    </div>
  );
}
```

**Benefits**:

- ✅ Fast initial page load (SSR)
- ✅ SEO-friendly content
- ✅ Interactive features work smoothly (React Query)
- ✅ Form submissions don't require page reload

## Real-World Examples from Major Sites

### Airbnb

- **SSR**: Listing pages, property details
- **Client**: Booking form, date picker, price calculator

### Amazon

- **SSR**: Product listings, product details
- **Client**: Add to cart, reviews, recommendations

### Netflix

- **SSR**: Browse page (for SEO)
- **Client**: Video player, recommendations, continue watching

### Your Event Platform

- **SSR**: `/events`, `/events/[slug]` (public browsing)
- **Client**: RSVP forms, user dashboard, admin panel, QR scanner

## Common Mistakes

### ❌ Mistake #1: Using React Query for Everything

```typescript
// ❌ BAD: Slow initial load
export default function EventsPage() {
  const { data, isLoading } = useEvents(); // Client-side
  if (isLoading) return <Spinner />; // User sees spinner
  return <EventsCatalog events={data} />;
}
```

**Problem**: Every user sees a loading spinner on first visit.

### ❌ Mistake #2: Using SSR for User-Specific Data

```typescript
// ❌ BAD: Can't cache, security risk
export default async function DashboardPage() {
  const tickets = await getUserTickets(); // Don't do this!
  return <UserDashboard tickets={tickets} />;
}
```

**Problem**:

- Can't cache (user-specific)
- Slower than React Query's caching
- Security concerns with server-side user data

### ✅ Correct Approach: Use Both

```typescript
// ✅ GOOD: Public data via SSR
export default async function EventPage({ params }) {
  const event = await getEventBySlug(params.slug); // Public data
  return <EventDetail event={event} />;
}

// ✅ GOOD: User data via React Query
("use client");
function EventDetail({ event }) {
  const { data: userTickets } = useUserTickets(); // User-specific
  const rsvpMutation = useRsvpSubmission(); // Interactive

  return (
    <>
      <EventInfo event={event} /> {/* From SSR */}
      <UserTicketsList tickets={userTickets} /> {/* From React Query */}
      <RsvpForm onSubmit={rsvpMutation.mutate} /> {/* React Query mutation */}
    </>
  );
}
```

## Performance Comparison

### Initial Page Load (First Visit)

| Approach        | Time to Content | SEO          | User Experience          |
| --------------- | --------------- | ------------ | ------------------------ |
| **SSR**         | ~200-400ms      | ✅ Excellent | ✅ Instant               |
| **Client-side** | ~1-2 seconds    | ❌ Poor      | ❌ Loading spinner       |
| **Hybrid**      | ~200-400ms      | ✅ Excellent | ✅ Instant + Interactive |

### Subsequent Navigations

| Approach                 | Time to Content | User Experience |
| ------------------------ | --------------- | --------------- |
| **SSR**                  | ~200-400ms      | ✅ Good         |
| **Client-side (cached)** | ~50-100ms       | ✅ Excellent    |
| **Hybrid**               | ~50-100ms       | ✅ Excellent    |

## Decision Tree

```
Does the page need SEO?
├─ YES → Use SSR for initial content
│   └─ Does it need interactivity?
│       ├─ YES → Use React Query for interactive features (hybrid)
│       └─ NO → SSR only
│
└─ NO → Is it authenticated/user-specific?
    ├─ YES → Use React Query (client-side)
    └─ NO → Use SSR (better performance)
```

## Summary

**Your `/events` page should use SSR** because:

1. It's a public page (not user-specific)
2. SEO matters for event discovery
3. First impression matters (instant load > loading spinner)
4. No dynamic interactivity needed on the list

**Use React Query for**:

- User dashboard (authenticated, personal data)
- RSVP submissions (mutations, interactivity)
- Admin panel (real-time updates)
- QR scanner (continuous scanning)

**The key insight**: SSR and React Query aren't competing solutions—they're complementary tools for different use cases. The best apps use both strategically.
