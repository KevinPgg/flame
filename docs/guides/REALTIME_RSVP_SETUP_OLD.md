# Real-time RSVP Updates Setup Guide

## Overview

You now have **GitHub-style real-time notifications** for RSVP requests! When someone submits an RSVP, it will automatically appear in your dashboard within seconds, without needing to reload the page.

## How It Works

```
User submits RSVP
       ↓
Postgres database receives INSERT
       ↓
Supabase Realtime detects change
       ↓
WebSocket pushes update to all connected clients
       ↓
React Query invalidates cache
       ↓
UI updates automatically ✨
```

## Setup Steps

### 1. Enable Supabase Realtime (Required)

In your Supabase project:

1. Go to **Database** → **Replication**
2. Find the `rsvps` table
3. Click the toggle to enable **Realtime**
4. (Optional) Also enable for `events` table for real-time event updates

### 2. Configure RLS Policies (Security)

The realtime subscriptions respect your existing RLS policies. Make sure organizers can read RSVPs for their events:

```sql
-- Verify this policy exists (should already be there)
CREATE POLICY "Organizers can view RSVPs for their events"
ON rsvps FOR SELECT
USING (
  event_id IN (
    SELECT e.id FROM events e
    INNER JOIN organization_members om ON e.organization_id = om.organization_id
    INNER JOIN users u ON om.user_id = u.id
    WHERE u.clerk_id = auth.jwt() ->> 'sub'
  )
);
```

### 3. Test Real-time Updates

1. Open your organizer dashboard in one browser tab
2. Navigate to an event's RSVP management page
3. In another tab (or in incognito), submit an RSVP as a regular user
4. Watch the first tab update automatically! 🎉

## Code Implementation

### Files Added/Modified

- **`app/lib/hooks/useRealtimeRsvps.ts`** - New real-time subscription hooks
- **`app/api/organizer/rsvps/route.ts`** - New API endpoint to fetch RSVPs
- **`app/components/RsvpManagement.tsx`** - Added real-time for single event view with refetch callback
- **`app/components/OrganizerDashboard.tsx`** - Added real-time for dashboard overview

### Usage Examples

#### For a single event (RSVP management page)

```typescript
import { useRealtimeRsvps } from "../lib/hooks/useRealtimeRsvps";

function RsvpManagement({ event }) {
  // Function to refetch fresh data
  const refetchRsvps = async () => {
    const response = await fetch(`/api/organizer/rsvps?event_id=${event.id}`);
    const data = await response.json();
    setRsvps(data.rsvps);
  };

  // Automatically subscribes to real-time updates for this event
  // Calls refetchRsvps when new RSVPs arrive
  useRealtimeRsvps(event.id, {
    onUpdate: refetchRsvps,
  });

  // Your component renders normally
  // When RSVPs change, data refetches automatically
}
```

#### For all organization events (dashboard)

```typescript
import { useRealtimeOrganizerRsvps } from "../lib/hooks/useRealtimeRsvps";

function OrganizerDashboard({ organization }) {
  // Subscribes to all RSVP updates across the organization
  useRealtimeOrganizerRsvps(organization.id);

  // Dashboard shows updated RSVP counts in real-time
}
```

## Performance Considerations

### Bandwidth

- **WebSocket connection**: ~1-2 KB/s idle
- **Per update**: ~0.5-2 KB per RSVP change
- Very efficient compared to polling

### Scaling

- Supabase handles 100,000+ concurrent connections
- Your current setup will handle thousands of simultaneous organizers easily

### Battery Impact (Mobile)

- WebSocket connections are battery-efficient
- Only active updates consume power
- Connection automatically reconnects if dropped

## Customization Options

### Add Toast Notifications

Want to show a toast when new RSVPs arrive?

```typescript
// In useRealtimeRsvps.ts
if (payload.eventType === "INSERT") {
  // Add your toast library here
  toast.success("New RSVP request received!");
}
```

### Badge Notifications

Show unread count in sidebar?

```typescript
// Track new RSVPs in state
const [unreadCount, setUnreadCount] = useState(0);

// In the realtime callback
if (payload.eventType === "INSERT") {
  setUnreadCount(prev => prev + 1);
}
```

### Audio Notifications

Play a sound for new RSVPs?

```typescript
if (payload.eventType === "INSERT") {
  new Audio("/notification.mp3").play();
}
```

## Troubleshooting

### RSVPs not updating in real-time

1. **Check Supabase Realtime is enabled**

   - Go to Database → Replication
   - Ensure `rsvps` table has Realtime toggled ON

2. **Check browser console**

   - Look for: `✅ Real-time subscription active`
   - Errors? Check your Supabase URL and keys

3. **Check RLS policies**

   - Make sure organizers have SELECT permission on RSVPs
   - Test in SQL editor: `SELECT * FROM rsvps WHERE event_id = 'your-event-id'`

4. **Check network**
   - WebSocket connections can be blocked by some corporate firewalls
   - Try on different network

### High memory usage

If you notice memory leaks:

1. Check that subscriptions are cleaning up properly
2. The `useEffect` cleanup function should call `supabase.removeChannel(channel)`
3. Verify in React DevTools that hooks unmount correctly

### Multiple subscriptions

Currently, each view creates one subscription:

- Dashboard overview: 1 subscription for all organization RSVPs
- RSVP management page: 1 subscription per event

This is optimal. Don't create multiple subscriptions for the same data.

## Alternative Approaches (Not Recommended)

### Polling with React Query

```typescript
useQuery({
  queryKey: ["rsvps", eventId],
  queryFn: fetchRsvps,
  refetchInterval: 5000, // Poll every 5 seconds
});
```

**Pros**: Simpler, no WebSocket setup
**Cons**:

- Wastes bandwidth (fetches even when nothing changes)
- 5 second delay vs instant updates
- Higher server load

### Long Polling

Similar to regular polling but keeps connection open. Still less efficient than WebSockets.

## Comparison: Realtime vs Polling

| Feature     | Supabase Realtime | Polling (5s)  |
| ----------- | ----------------- | ------------- |
| Latency     | < 100ms           | 0-5 seconds   |
| Bandwidth   | ~1 KB/s idle      | ~10-50 KB/s   |
| Server Load | Low               | Medium-High   |
| Battery     | Efficient         | Drains faster |
| Setup       | Medium            | Easy          |

## Next Steps

1. ✅ Enable Realtime in Supabase Dashboard
2. ✅ Test with a real RSVP submission
3. 🎨 (Optional) Add toast notifications
4. 📊 (Optional) Add badge counts for pending RSVPs

## Resources

- [Supabase Realtime Docs](https://supabase.com/docs/guides/realtime)
- [React Query + Realtime Pattern](https://tkdodo.eu/blog/using-web-sockets-with-react-query)
- [WebSocket vs Polling](https://ably.com/topic/websockets-vs-polling)
