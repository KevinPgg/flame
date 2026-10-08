# Adding Maintenance Banner to Dashboard

This guide shows how to add the maintenance banner to your dashboard to inform organizers when the site is in maintenance mode.

## Server-Side Implementation (Recommended)

Add the banner to your main organizer page using server-side rendering:

### Location: `app/organizer/page.tsx`

```tsx
// Add this import at the top
import { MaintenanceBanner } from "../components";

// Use an async Server Component to check maintenance mode
export default async function OrganizerPage() {
  // This runs on the server - no NEXT_PUBLIC_ prefix needed
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === "true";
  
  return (
    <div>
      {/* Show banner when maintenance mode is active */}
      {isMaintenanceMode && <MaintenanceBanner />}
      
      {/* Your existing dashboard component */}
      <YourDashboardComponent />
    </div>
  );
}
```

## Important Notes

### Environment Variables

Use **server-side only** environment variables for maintenance mode:
- Variable name: `MAINTENANCE_MODE=true`
- Access: `process.env.MAINTENANCE_MODE`
- More secure, not exposed to browser
- No rebuild required to toggle on/off

### Why Show the Banner?

When maintenance mode is active, organizers might wonder why:
- Their events aren't showing up on the public site
- Users are reporting they can't access the homepage
- Event links they share aren't working

The banner provides immediate context about this situation.

## Full Example: Organizer Dashboard

Here's a complete example showing where to place the banner in a typical dashboard layout:

```tsx
import { MaintenanceBanner } from "../components";

export default async function OrganizerPage() {
  // Check maintenance mode on the server
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === "true";
  
  return (
    <div className="dashboard-wrapper">
      {/* Maintenance Banner - Shows at top when active */}
      {isMaintenanceMode && <MaintenanceBanner />}
      
      {/* Your existing dashboard components */}
      <DashboardView />
    </div>
  );
}
```

## Admin Dashboard Example

You can also add the banner to the admin dashboard:

```tsx
// app/admin/page.tsx
import { MaintenanceBanner } from "../components";

export default async function AdminPage() {
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === "true";
  
  return (
    <div>
      {isMaintenanceMode && <MaintenanceBanner />}
      {/* Admin dashboard content */}
    </div>
  );
}
```

## Styling Notes

The `MaintenanceBanner` component uses your existing warning banner styles:
- ✅ Consistent with your design system
- ✅ Alert icon included
- ✅ Clear messaging
- ✅ Proper spacing

No additional styling needed!

## Testing the Banner

1. Enable maintenance mode:
   ```bash
   MAINTENANCE_MODE=true
   ```

2. Add banner to dashboard (as shown above)

3. Restart server and visit dashboard

4. You should see the amber banner at the top

5. Disable maintenance mode to hide the banner

## When NOT to Show the Banner

The banner is only useful for:
- ✅ Organizer dashboards
- ✅ Admin dashboards

Don't add it to:
- ❌ Public pages (they're already redirected)
- ❌ Maintenance page (redundant)
- ❌ Auth pages (unnecessary)

---

This is completely optional - the maintenance mode works perfectly without the banner. The banner just provides extra context to dashboard users.
