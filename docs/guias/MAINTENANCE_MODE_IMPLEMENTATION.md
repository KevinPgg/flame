# Maintenance Mode Implementation Summary

## What Was Implemented

A feature flag-based maintenance mode system that allows you to temporarily take the public-facing parts of your application offline while keeping dashboard functionality accessible.

## Files Created/Modified

### Created Files:
1. **`app/maintenance/page.tsx`** - The maintenance page users see when trying to access public pages
2. **`app/lib/utils/maintenance.ts`** - Utility functions for maintenance mode checks
3. **`app/components/MaintenanceBanner.tsx`** - Optional banner component for dashboard pages
4. **`MAINTENANCE_MODE.md`** - Complete documentation on using maintenance mode

### Modified Files:
1. **`middleware.ts`** - Added maintenance mode logic and route protection
2. **`app/components/index.ts`** - Added MaintenanceBanner export

## How It Works

### 1. Environment Variable Control
Set `MAINTENANCE_MODE=true` in your environment variables to enable maintenance mode. When enabled:

- **Public routes redirect to `/maintenance`**:
  - `/` (homepage)
  - `/events` (all event pages)
  - `/about-flame`
  - `/contact`
  - `/purchase`
  - Any other public pages

- **These routes remain accessible**:
  - `/organizer` - Organizer dashboard ✅
  - `/admin` - Admin dashboard ✅
  - `/account` - Account management ✅
  - `/sign-in`, `/sign-up` - Authentication ✅
  - `/api/*` - All API endpoints ✅

### 2. Middleware Logic
The middleware (`middleware.ts`) intercepts every request and:
1. Checks if `MAINTENANCE_MODE=true`
2. If true, checks if the route is exempt
3. If not exempt, redirects to `/maintenance`
4. Otherwise, processes the request normally

### 3. Maintenance Page
The maintenance page displays:
- Large FLAME logo with gradient animation
- Friendly message about temporary offline status
- Link to dashboard for account management
- Beautiful, responsive design

## Quick Start

### To Enable Maintenance Mode:

**Local Development:**
```bash
# Create/update .env.local
echo "MAINTENANCE_MODE=true" >> .env.local

# Restart dev server
npm run dev
```

**Production (Vercel):**
1. Go to Project Settings → Environment Variables
2. Add/update: `MAINTENANCE_MODE` = `true`
3. Redeploy

### To Disable Maintenance Mode:

**Local Development:**
```bash
# Update .env.local
echo "MAINTENANCE_MODE=false" >> .env.local

# Or remove the line entirely
# Then restart dev server
npm run dev
```

**Production (Vercel):**
1. Go to Project Settings → Environment Variables
2. Set `MAINTENANCE_MODE` = `false` or remove it
3. Redeploy

## Testing Checklist

After enabling maintenance mode, verify:

- [ ] Homepage redirects to `/maintenance` ✅
- [ ] `/events` redirects to `/maintenance` ✅
- [ ] `/organizer` still accessible (after sign in) ✅
- [ ] `/admin` still accessible (for admins) ✅
- [ ] Dashboard "Go to Dashboard" link works ✅
- [ ] Navbar links from dashboard work ✅
- [ ] API calls from dashboard work ✅

## Optional: Add Maintenance Banner to Dashboard

If you want to show organizers that the site is in maintenance mode, add this to your dashboard pages:

```tsx
// Example: In app/organizer/page.tsx or app/components/organizer/DashboardView.tsx

import { MaintenanceBanner } from "../components";

export default function OrganizerDashboard() {
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === "true";

  return (
    <div>
      {isMaintenanceMode && <MaintenanceBanner />}
      
      {/* Rest of your dashboard content */}
    </div>
  );
}
```

## Customization Options

### Update Maintenance Message
Edit `app/maintenance/page.tsx` to change:
- The message text
- Button text/link
- Styling and colors
- Logo appearance

### Add More Exempt Routes
Edit `middleware.ts` to add routes to the `isMaintenanceExempt` matcher:

```typescript
const isMaintenanceExempt = createRouteMatcher([
  "/maintenance",
  "/organizer(.*)",
  "/scanner(.*)",
  "/admin(.*)",
  "/account(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api(.*)",
  "/your-new-route(.*)", // Add new routes here
  // ...
]);
```

### Change Dashboard Link
In `app/maintenance/page.tsx`, update the Link href:

```tsx
<Link
  href="/your-preferred-dashboard"
  className="..."
>
  Go to Dashboard
</Link>
```

## Architecture Benefits

1. **Simple Toggle**: One environment variable controls everything
2. **No Code Changes**: Enable/disable without code deployments
3. **Selective Access**: Dashboard remains functional
4. **Clean UX**: Users see a friendly maintenance page
5. **Easy Testing**: Test locally before production
6. **Type Safe**: TypeScript utilities for maintenance checks
7. **Middleware-Based**: Fast, edge-optimized redirects

## Security Notes

- Authentication is still enforced on protected routes
- API endpoints remain functional but protected
- Database operations continue normally
- No public data is exposed during maintenance mode
- Rate limiting and other security measures remain active

## Troubleshooting

See the detailed [MAINTENANCE_MODE.md](./MAINTENANCE_MODE.md) documentation for:
- Common issues and solutions
- Platform-specific instructions
- Emergency rollback procedures
- Best practices

## Next Steps

1. **Test locally first**: Enable `MAINTENANCE_MODE=true` in `.env.local`
2. **Verify all routes**: Check both public and dashboard access
3. **Update any links**: If you have hardcoded links to home/events, they'll redirect
4. **Communication**: Inform users before enabling in production
5. **Monitor**: Watch logs and user reports during maintenance

## Example Use Cases

- **Feature Development**: Hide incomplete features from public
- **Data Migration**: Keep dashboard accessible while migrating data
- **Emergency Issues**: Quickly disable public access during incidents
- **Scheduled Maintenance**: Planned downtime for infrastructure updates
- **Beta Testing**: Let organizers test while public is offline

## Support

For issues or questions:
1. Check [MAINTENANCE_MODE.md](./MAINTENANCE_MODE.md) documentation
2. Review middleware logic in `middleware.ts`
3. Check browser console for client-side errors
4. Review server logs for backend issues
5. Test in local environment first

---

**Pro Tip**: Consider setting up a staging environment to test maintenance mode before enabling in production!
