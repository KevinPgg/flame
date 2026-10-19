# Maintenance Mode

This document explains how to enable and disable maintenance mode for the FLAME application.

## Overview

Maintenance mode allows you to temporarily take the public-facing parts of the application offline while keeping the dashboard and administrative functions accessible. When enabled, users attempting to access the home page or events pages will be redirected to a maintenance screen.

## What's Accessible During Maintenance Mode

**✅ Accessible:**
- `/maintenance` - The maintenance page itself
- `/organizer` - Organizer dashboard (requires authentication)
- `/admin` - Admin dashboard (requires authentication)
- `/account` - Account management pages
- `/sign-in`, `/sign-up` - Authentication pages
- `/api/*` - All API routes (needed for dashboard functionality)
- Static assets and internal Next.js routes

**❌ Not Accessible (Redirects to `/maintenance`):**
- `/` - Home page
- `/events` - Events listing page
- `/events/[slug]` - Individual event pages
- `/about-flame` - About page
- `/contact` - Contact page
- `/purchase` - Purchase flow
- Any other public pages

## How to Enable Maintenance Mode

### Option 1: Environment Variable (Recommended)

1. Add or update the environment variable in your deployment platform:
   ```bash
   MAINTENANCE_MODE=true
   ```

2. Redeploy your application

### Option 2: Local Development

1. Create or update your `.env.local` file:
   ```bash
   MAINTENANCE_MODE=true
   ```

2. Restart your development server:
   ```bash
   npm run dev
   ```

## How to Disable Maintenance Mode

### Option 1: Environment Variable (Recommended)

1. Update the environment variable in your deployment platform:
   ```bash
   MAINTENANCE_MODE=false
   ```
   Or simply remove the variable entirely.

2. Redeploy your application

### Option 2: Local Development

1. Update your `.env.local` file:
   ```bash
   MAINTENANCE_MODE=false
   ```
   Or remove the line entirely.

2. Restart your development server

## Deployment Platforms

### Vercel

1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add or edit `MAINTENANCE_MODE` with value `true` or `false`
4. Redeploy from the Deployments tab

### Other Platforms

Consult your platform's documentation for setting environment variables. The key is `MAINTENANCE_MODE` and the value should be `true` to enable or `false` (or unset) to disable.

## Testing Maintenance Mode

### Test Locally

```bash
# Terminal 1: Set maintenance mode
echo "MAINTENANCE_MODE=true" > .env.local

# Terminal 2: Start dev server
npm run dev

# Visit http://localhost:3000 - should redirect to /maintenance
# Visit http://localhost:3000/organizer - should work normally (after login)
```

### Test in Production

1. Enable maintenance mode via environment variable
2. Deploy
3. Visit your production URL - should see maintenance page
4. Visit `/organizer` or `/admin` - should work normally

## Customizing the Maintenance Page

The maintenance page is located at:
```
app/maintenance/page.tsx
```

You can customize:
- The FLAME logo styling
- The maintenance message text
- The dashboard link URL
- The overall design and layout

## Technical Implementation

Maintenance mode is implemented using:

1. **Middleware** (`middleware.ts`): Intercepts requests and redirects non-exempt routes to `/maintenance`
2. **Environment Variable** (`MAINTENANCE_MODE`): Controls whether maintenance mode is active
3. **Maintenance Page** (`app/maintenance/page.tsx`): The page users see when maintenance mode is active
4. **Utility Functions** (`app/lib/utils/maintenance.ts`): Helper functions for checking maintenance status

## Troubleshooting

### Issue: Still seeing the home page after enabling maintenance mode

**Solution:**
1. Verify the environment variable is set correctly
2. Ensure you've redeployed/restarted the server after setting the variable
3. Clear your browser cache or try in an incognito window

### Issue: Can't access the dashboard during maintenance mode

**Solution:**
1. Check that you're authenticated (signed in)
2. Verify the route is in the exempt list (see `MAINTENANCE_EXEMPT_ROUTES` in `middleware.ts`)
3. Check browser console for any errors

### Issue: API routes not working during maintenance mode

**Solution:**
API routes are exempt from maintenance mode by default. If you're having issues:
1. Check the API route itself for errors
2. Verify authentication if required
3. Look at server logs for detailed error messages

## Security Considerations

- Maintenance mode does NOT disable API routes entirely
- Protected routes still require authentication
- Admin and organizer dashboards remain protected by Clerk authentication
- Database operations continue to work normally

## Best Practices

1. **Communicate in advance**: Let users know when you'll be in maintenance mode
2. **Keep it brief**: Only enable maintenance mode when necessary
3. **Test first**: Always test in staging/development before enabling in production
4. **Monitor**: Keep an eye on error logs while in maintenance mode
5. **Document changes**: Note when you enable/disable maintenance mode for your records

## Emergency Rollback

If you need to quickly disable maintenance mode:

1. **Vercel**: Go to project settings → Environment Variables → Remove or set `MAINTENANCE_MODE=false` → Redeploy
2. **Other platforms**: Follow platform-specific steps to update environment variables

## Related Files

- `middleware.ts` - Maintenance mode logic and route matching
- `app/maintenance/page.tsx` - Maintenance page component
- `app/lib/utils/maintenance.ts` - Utility functions
- This documentation file
