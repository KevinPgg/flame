# RSVP Polling Updates Setup Guide

## Overview

The RSVP management system uses **React Query polling** to automatically fetch new RSVP requests every 5 seconds. This provides near-real-time updates without the complexity of WebSocket connections or JWT configuration issues.

## How It Works

```
User submits RSVP
       ↓
Saved to database
       ↓
React Query polls API every 5 seconds
       ↓
Fetches fresh RSVP data
       ↓
UI updates automatically ✨
```

## Implementation

### 1. Dashboard View (Organization-wide RSVPs)

The main organizer dashboard polls for all events and RSVPs:

```typescript
// app/components/OrganizerDashboard.tsx
const { data: queryData } = useQuery<OrganizerData>({
  queryKey: ["organizer-data"],
  queryFn: async () => {
    const response = await fetch("/api/organizer/data");
    if (!response.ok) throw new Error("Failed to fetch organizer data");
    return response.json();
  },
  refetchInterval: 5000, // Poll every 5 seconds
  refetchIntervalInBackground: true, // Keep polling even when tab is not focused
});
```

### 2. Event-Specific RSVP View

Individual event RSVP pages poll for that event's RSVPs:

```typescript
// app/components/RsvpManagement.tsx
const { data: polledData } = useQuery({
  queryKey: ["rsvps-poll", event.id],
  queryFn: async () => {
    const response = await fetch(`/api/organizer/rsvps?event_id=${event.id}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Failed to fetch RSVPs");
    return response.json();
  },
  refetchInterval: 5000,
  refetchIntervalInBackground: true,
});

// Update local state when polled data changes
useEffect(() => {
  if (polledData?.rsvps && !hasOptimisticUpdatesRef.current) {
    setRsvps(polledData.rsvps);
    lastSyncedRsvpsRef.current = polledData.rsvps;
  }
}, [polledData]);
```

## UI Behavior

### Seamless Background Updates

Polling happens **silently in the background** without disrupting the user experience:

- ❌ **No loading spinners** during polling refetches
- ✅ **Data updates seamlessly** when new information arrives
- ✅ **No UI flickering** every 5 seconds
- ✅ **Smooth user experience** without visual interruptions

### When Loading Indicators DO Appear

Loading indicators are only shown during **explicit user actions**:

- ✅ Deleting a ticket tier
- ✅ Saving event details
- ✅ Initial page load

This is implemented by:

- Using `deleteTicketTierMutation.isPending` for tier deletions
- Using `isSavingEvent` state for event saves
- NOT using React Query's `isRefetching` flag (which would show spinners every 5 seconds)

## Benefits

✅ **Simple** - No WebSocket configuration needed  
✅ **Secure** - Works perfectly with Clerk authentication and RLS  
✅ **Reliable** - No connection drops or reconnection logic  
✅ **Fast enough** - 5 second delay is acceptable for RSVP notifications  
✅ **Production-ready** - Works identically in dev and production  
✅ **Low bandwidth** - Only fetches when data actually changes  
✅ **Non-intrusive** - No loading spinners during background updates

## Configuration Options

You can adjust the polling interval based on your needs:

```typescript
refetchInterval: 5000,    // 5 seconds - current (recommended)
refetchInterval: 10000,   // 10 seconds - more conservative
refetchInterval: 3000,    // 3 seconds - more aggressive
refetchInterval: false,   // Disable polling (manual refresh only)
```

## Background Polling

The `refetchIntervalInBackground: true` option ensures polling continues even when:

- User switches to another tab
- User minimizes the browser
- Browser is in the background

This means when they come back, the data is already fresh.

## Security

All polling requests go through your API routes which:

1. Validate the Clerk session
2. Check user permissions
3. Apply RLS policies in Supabase
4. Only return authorized data

This is **more secure** than client-side WebSocket subscriptions because:

- Authentication happens on every request
- Server-side validation for every fetch
- No client-side JWT handling
- Works seamlessly with Clerk's session management

## Alternative: Why Not WebSocket Realtime?

We initially implemented Supabase Realtime (WebSocket-based), but it has limitations:

**WebSocket Challenges:**

- ❌ Requires complex JWT configuration between Clerk and Supabase
- ❌ Supabase's `auth.jwt()` function is designed for Supabase Auth, not external providers
- ❌ RLS policies can block Realtime broadcasts even with valid auth
- ❌ Requires careful configuration of public keys and JWKS endpoints
- ❌ More points of failure (connection drops, reconnection logic)

**Polling Advantages:**

- ✅ Works out of the box with existing Clerk authentication
- ✅ Simple to implement and maintain
- ✅ Predictable behavior in all environments
- ✅ No additional configuration required
- ✅ 5 second delay is perfectly acceptable for RSVP notifications

## Testing

To test the polling:

1. Open the organizer dashboard or specific event RSVP page
2. Open browser DevTools → Network tab
3. Filter by `/api/organizer`
4. You should see requests every 5 seconds
5. Submit an RSVP from another browser/incognito
6. Within 5 seconds, the RSVP should appear in the organizer view

## Performance Considerations

**Network Usage:**

- Each poll is ~1-5 KB (just JSON data)
- 12 requests per minute per user
- For 10 concurrent organizers: ~600-3000 KB/min (~50 KB/s)
- This is negligible for modern infrastructure

**Database Load:**

- React Query caches results, so no unnecessary re-renders
- Queries are optimized with proper indexes
- RLS policies are efficient (checked once per request)

**Client Performance:**

- React Query handles all caching and deduplication
- No memory leaks or connection management needed
- Minimal CPU usage compared to WebSocket message parsing

## Troubleshooting

### Polling not working?

Check:

1. **Browser console** - Look for failed fetch requests
2. **Network tab** - Verify requests are being sent every 5 seconds
3. **API route** - Ensure `/api/organizer/rsvps` returns valid data
4. **Authentication** - Verify user is logged in with Clerk

### Updates not showing?

Check:

1. **React Query DevTools** - Is the cache updating?
2. **Component state** - Check `hasOptimisticUpdatesRef.current` is `false`
3. **Database** - Verify RSVP was actually inserted
4. **RLS policies** - Ensure organizer has permission to view the RSVP

## Future Enhancements

If you need truly instant updates (< 1 second), consider:

1. **Server-Sent Events (SSE)** - One-way real-time from server to client
2. **Custom WebSocket server** - Full control over authentication
3. **Supabase Edge Function proxy** - Validate Clerk JWT, forward to Realtime
4. **Clerk + Supabase JWT integration** - Configure Supabase to accept Clerk tokens

For now, **5-second polling is the sweet spot** between simplicity and responsiveness.
