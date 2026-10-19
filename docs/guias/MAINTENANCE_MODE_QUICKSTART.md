# 🔧 Maintenance Mode - Quick Start Guide

## ✅ What's Been Implemented

Your FLAME app now has a **complete maintenance mode system** that lets you temporarily hide public pages while keeping dashboards accessible.

## 🚀 How to Use It

### Enable Maintenance Mode

**For Local Testing:**
```bash
# Create .env.local file with:
MAINTENANCE_MODE=true

# Restart your dev server
npm run dev
```

**For Production (Vercel):**
1. Go to your Vercel project → Settings → Environment Variables
2. Add: `MAINTENANCE_MODE` = `true`
3. Click "Save"
4. Redeploy your application

### Disable Maintenance Mode

**For Local Testing:**
```bash
# Update .env.local to:
MAINTENANCE_MODE=false
# Or delete the line entirely

# Restart your dev server
npm run dev
```

**For Production (Vercel):**
1. Go to Vercel project → Settings → Environment Variables
2. Change `MAINTENANCE_MODE` to `false` (or delete it)
3. Redeploy

## 🎯 What Happens When Enabled

### ❌ Blocked (Redirects to Maintenance Page):
- `/` - Homepage
- `/events` - Events listing
- `/events/[slug]` - Individual events
- `/about-flame` - About page
- `/contact` - Contact page
- `/purchase` - Purchase flows
- All other public pages

### ✅ Still Accessible:
- `/organizer` - Organizer Dashboard
- `/admin` - Admin Dashboard
- `/account` - Account Management
- `/sign-in` & `/sign-up` - Authentication
- `/api/*` - All API endpoints

## 📋 Testing Checklist

After enabling maintenance mode, test these:

1. **Homepage** (`/`):
   - ✅ Should redirect to `/maintenance`
   - ✅ Shows FLAME logo and maintenance message

2. **Events Page** (`/events`):
   - ✅ Should redirect to `/maintenance`

3. **Dashboard** (`/organizer`):
   - ✅ Should work normally (after sign in)
   - ✅ Can view events and RSVPs
   - ✅ API calls work

4. **Maintenance Page** (`/maintenance`):
   - ✅ Shows FLAME branding
   - ✅ Shows maintenance message
   - ✅ "Go to Dashboard" button works

## 📁 Files Created

- `app/maintenance/page.tsx` - The maintenance page
- `app/components/MaintenanceBanner.tsx` - Optional banner for dashboards
- `app/lib/utils/maintenance.ts` - Utility functions
- `MAINTENANCE_MODE.md` - Full documentation
- `MAINTENANCE_MODE_IMPLEMENTATION.md` - Implementation details
- `MAINTENANCE_MODE_DASHBOARD_EXAMPLE.md` - Dashboard integration guide

## 📝 Files Modified

- `middleware.ts` - Added maintenance mode redirect logic
- `app/components/index.ts` - Exported MaintenanceBanner

## 🎨 Customization

### Change the Maintenance Message

Edit `app/maintenance/page.tsx`:

```tsx
<h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
  Your new message here
</h2>
```

### Change the Dashboard Link

Edit `app/maintenance/page.tsx`:

```tsx
<Link href="/your-preferred-route">
  Your Button Text
</Link>
```

### Add More Accessible Routes

Edit `middleware.ts` and add to `isMaintenanceExempt`:

```tsx
const isMaintenanceExempt = createRouteMatcher([
  "/maintenance",
  "/organizer(.*)",
  // ... existing routes
  "/your-new-route(.*)", // Add here
]);
```

## 🎁 Optional: Add Banner to Dashboard

Want to show organizers when maintenance mode is active?

**Edit `app/organizer/page.tsx` or your dashboard component:**

```tsx
import { MaintenanceBanner } from "../components";

export default async function OrganizerPage() {
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === "true";
  
  return (
    <div>
      {isMaintenanceMode && <MaintenanceBanner />}
      {/* Rest of dashboard */}
    </div>
  );
}
```

See `MAINTENANCE_MODE_DASHBOARD_EXAMPLE.md` for detailed instructions.

## 🆘 Troubleshooting

**Still seeing homepage after enabling?**
- ✅ Check environment variable is set to `"true"` (with quotes in Vercel)
- ✅ Make sure you redeployed/restarted server
- ✅ Clear browser cache or try incognito mode

**Can't access dashboard?**
- ✅ Make sure you're signed in
- ✅ Check if route is in exempt list (`middleware.ts`)
- ✅ Check browser console for errors

**API not working?**
- ✅ All APIs are exempt by default
- ✅ Check if it's an auth issue (not maintenance related)

## 📚 Documentation

For more details, see:
- **`MAINTENANCE_MODE.md`** - Complete documentation
- **`MAINTENANCE_MODE_IMPLEMENTATION.md`** - Technical details
- **`MAINTENANCE_MODE_DASHBOARD_EXAMPLE.md`** - Dashboard integration

## 🎯 Common Use Cases

1. **Deploying new features**: Enable maintenance while you deploy
2. **Database migration**: Keep dashboards accessible, hide public pages
3. **Emergency fixes**: Quick way to take site offline
4. **Testing**: Test features without public seeing them
5. **Construction phase**: Your current use case! ✅

## 💡 Pro Tips

- **Test locally first**: Always test in development before production
- **Communication**: Let users know maintenance is scheduled
- **Duration**: Keep maintenance mode as brief as possible
- **Monitoring**: Watch logs during maintenance for issues
- **Rollback ready**: Know how to quickly disable if needed

## 🎉 You're Ready!

Your maintenance mode is fully implemented and ready to use. Just set `MAINTENANCE_MODE=true` when you need it!

---

**Need help?** Check the full documentation files or test locally first before enabling in production.
