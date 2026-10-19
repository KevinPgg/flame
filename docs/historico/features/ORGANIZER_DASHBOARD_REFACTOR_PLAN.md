# Organizer Dashboard Refactoring Plan

> ✅ **Status Update (Jan 2026)**: This refactoring has been **partially completed**. The dashboard now uses separate view components (`DashboardView.tsx`, `EventsTiersView.tsx`, `RsvpsView.tsx`, `TierInlineForm.tsx`) as planned. The document below describes the original planning phase.

**Date:** October 28, 2025  
**Original Status:** Planning Phase  
**Current Status:** Partially Implemented (Jan 2026)  
**Original File Size:** 3,646 lines (OrganizerDashboard.tsx)  
**Target:** 5-7 components (~150-800 lines each)

## Problem Statement

The `OrganizerDashboard.tsx` component has grown to over 3,600 lines of code, making it difficult to maintain, test, and reason about. The corresponding CSS file (`dashboard.css`) is over 2,100 lines. This refactoring will split the component into smaller, focused pieces while improving performance and maintainability.

## Architecture Decisions

### Folder Structure

- **Option Chosen:** New `app/components/organizer/` folder with subfolders
- **Rationale:** Clear separation of organizer-specific components from general app components

### CSS Approach

- **Option Chosen:** CSS Modules (`.module.css`)
- **Rationale:** Better encapsulation, prevents style conflicts, keeps existing CSS patterns

### Component Splitting Strategy

- **Option Chosen:** Moderate splitting (5-7 components)
- **Rationale:** Balance between maintainability and avoiding over-fragmentation

### Optimization Focus

- **Option Chosen:** Both maintainability and performance
- **Rationale:** Clean code structure + React.memo for render optimization

---

## New Folder Structure

```
app/components/organizer/
├── OrganizerDashboard.tsx          # Main orchestrator (~150 lines)
├── OrganizerSidebar.tsx            # Sidebar navigation (~200 lines)
├── DashboardView.tsx               # Stats & overview (~400 lines)
├── EventsManagementView.tsx        # Events/tiers management (~800 lines)
├── RSVPsView.tsx                   # RSVP management (~350 lines)
├── TierInlineForm.tsx              # Tier form (~600 lines)
├── EventEditForm.tsx               # Event edit form (~500 lines)
├── types.ts                        # Shared TypeScript interfaces
└── styles/
    ├── OrganizerLayout.module.css  # Layout & sidebar (~600 lines)
    ├── DashboardView.module.css    # Dashboard stats (~400 lines)
    ├── EventsManagement.module.css # Events & tiers (~700 lines)
    ├── RSVPsView.module.css        # RSVP tables (~200 lines)
    └── TierForm.module.css         # Tier forms (~200 lines)
```

---

## Component Breakdown

### 1. OrganizerDashboard.tsx (Main Orchestrator)

**Size:** ~150 lines  
**Responsibility:** Main container that orchestrates views and manages global state

**Key Features:**

- React Query integration for data fetching
- URL parameter synchronization
- View routing logic
- Global state (activeView, loadingRsvp)

**Props Interface:**

```typescript
interface OrganizerDashboardProps {
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    emailAddresses: { emailAddress: string }[];
  } | null;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  events: OrganizerEvent[];
}
```

**State Management:**

- `activeView: DashboardView` - Current view being displayed
- `loadingRsvp` - Loading state for RSVP navigation
- React Query for `organizer-data` with SSR initialData

**Structure:**

```tsx
export default function OrganizerDashboard(props) {
  // React Query setup with initialData from SSR
  const { data: queryData, isRefetching } = useQuery<OrganizerData>({
    queryKey: ["organizer-data"],
    queryFn: fetchOrganizerData,
    initialData: { organization, events: initialEvents },
    staleTime: 2 * 60 * 1000,
    refetchOnMount: false,
  });

  // URL sync and navigation
  const navigateToView = (viewId: string) => { /* ... */ };

  return (
    <div className={styles.organizerLayout}>
      <OrganizerSidebar {...} />
      <main className={styles.organizerMain}>
        {activeView === 'dashboard' && <DashboardView {...} />}
        {activeView === 'create-event' && <CreateEventForm {...} />}
        {activeView === 'events-tiers' && <EventsManagementView {...} />}
        {activeView === 'rsvps' && <RSVPsView {...} />}
      </main>
      {loadingRsvp && <RsvpLoadingPage {...} />}
    </div>
  );
}
```

---

### 2. OrganizerSidebar.tsx

**Size:** ~200 lines  
**Responsibility:** Navigation sidebar with organization info and menu items

**Props Interface:**

```typescript
interface OrganizerSidebarProps {
  organization: { id: string; name: string; slug: string };
  activeView: DashboardView;
  totalPendingRsvps: number;
  isAdmin: boolean;
  onNavigate: (viewId: string) => void;
}
```

**Key Features:**

- Organization branding display
- Navigation menu with active state
- Pending RSVP badge indicators
- Admin/Organizer role badges
- Mobile dropdown navigation
- "Purchased Tickets" link to `/account`
- Settings button (opens Clerk user profile modal)

**Mobile Behavior:**

- Toggle button shows active view
- Dropdown menu for navigation
- Hides active item in dropdown (shows in toggle)

**CSS Module:** `OrganizerLayout.module.css`

---

### 3. DashboardView.tsx

**Size:** ~400 lines  
**Responsibility:** Main dashboard overview with stats and events

**Props Interface:**

```typescript
interface DashboardViewProps {
  events: OrganizerEvent[];
  onNavigateToCreate: () => void;
  onRefresh: () => void;
}
```

**Key Features:**

- Dashboard stats cards (Total Events, Total Revenue, QR Scanner link)
- Current/Upcoming events table
- Purchase details expansion per event
- Promotions section (promotional tickets & codes)
- Collapsible past events section
- Empty state handling

**Sub-sections:**

1. **Stats Cards:**

   - Total Events count
   - Total Revenue calculation
   - QR Scanner action card (opens in new tab)

2. **Events Table:**

   - Event name, date, attendees, revenue
   - Expandable rows for purchase details
   - Purchase details table with RSVP/scan status
   - Integration with `PromotionsSection` component

3. **Past Events:**
   - Collapsible section
   - Read-only view
   - Same structure as current events

**Performance:**

- Use `React.memo()` with shallow comparison
- Memoize events separation logic

**CSS Module:** `DashboardView.module.css`

---

### 4. EventsManagementView.tsx

**Size:** ~800 lines (largest component)  
**Responsibility:** Event and ticket tier management with full CRUD operations

**Props Interface:**

```typescript
interface EventsManagementViewProps {
  events: OrganizerEvent[];
  onNavigateToCreate: () => void;
  onRefresh: () => void;
  isRefetching: boolean;
}
```

**Key Features:**

- Events table with expand/collapse
- Event editing inline (venue, city, dates, image)
- Tier management (create, edit, delete)
- Tier conflict detection (30-minute rule)
- Delete confirmation (double-click pattern)
- Loading states during mutations
- Past events (read-only)

**State Management:**

- `expandedEventId` - Which event accordion is open
- `editingEventData` - Event editing state
- `editingTierId` - Which tier is being edited
- `showingAddForm` - Which event is showing add tier form
- `confirmDeleteTierId` - Delete confirmation state
- Image upload state (preview, file, pending upload)

**Complex Features:**

1. **Event Editing:**

   - Inline editing without full-page navigation
   - Date/time validation (Ecuador timezone)
   - Image upload with canvas resizing (3:4 aspect ratio)
   - Deferred image upload (uploads on save, not on select)
   - Tier conflict validation

2. **Tier Management:**

   - Inline forms using `TierInlineForm` component
   - Delete with confirmation (prevents accidental deletion)
   - Stage-based tiers cannot be deleted (must edit first)
   - Validation against 30-minute rule

3. **Warning System:**
   - Visual indicators for tiers needing updates
   - Warning banner when date conflicts exist
   - Prevents saving until conflicts resolved

**Integrations:**

- `TierInlineForm` for tier creation/editing
- `EventEditForm` for event details editing
- `useDeleteTicketTier` mutation hook
- React Query refetching on changes

**Performance:**

- Use `React.memo()`
- Loading overlay during mutations
- Optimistic updates where appropriate

**CSS Module:** `EventsManagement.module.css`

---

### 5. RSVPsView.tsx

**Size:** ~350 lines  
**Responsibility:** RSVP management for events requiring approval

**Props Interface:**

```typescript
interface RSVPsViewProps {
  events: OrganizerEvent[];
  onNavigateToCreate: () => void;
  onManageRsvps: (event: OrganizerEvent) => void;
  loadingRsvp: {
    eventId: string;
    eventName: string;
    rsvpCount: number;
  } | null;
}
```

**Key Features:**

- Filter events by `requires_rsvp === true`
- Display pending RSVP counts
- Navigate to RSVP management page
- Collapsible past RSVP events
- Empty state for no RSVP events

**Sorting Logic:**

- Sort by pending RSVP count (descending)
- Then alphabetically by event name

**Table Columns:**

- Event Name
- Date (formatted)
- Location (venue, city)
- Pending count (with badge styling)
- Actions (navigate to RSVP management)

**Performance:**

- Use `React.memo()` with shallow comparison
- Memoize filtered/sorted events

**CSS Module:** `RSVPsView.module.css`

---

### 6. TierInlineForm.tsx

**Size:** ~600 lines  
**Responsibility:** Ticket tier creation and editing with stage support

**Props Interface:**

```typescript
interface TierInlineFormProps {
  tier?: any; // Existing tier data (undefined for new tier)
  eventId?: string; // Required for new tier
  tentativeEventStart?: string; // For validation during event editing
  onSave: () => void;
  onCancel: () => void;
}
```

**Key Features:**

- Tier name, price, quantity, per-user limit
- Sales start/end date pickers (Ecuador timezone)
- Optional price stages (toggle)
- Stage management (add, remove, edit)
- Real-time price breakdown preview
- Comprehensive validation

**Price Stages:**

- Toggle to enable/disable stages
- Cannot enable on existing tier without stages
- Cannot disable once stages exist
- Max stages: as many as needed
- Each stage: name, price, quantity
- Duplicate name detection
- Sold quantity protection

**Pricing Logic:**

- Organizer enters "base price" (what they receive)
- System calculates:
  - Service fee (10% of base)
  - IVA (15% of service fee)
  - Final customer price
- Uses `calculateFinalPrice()` from `app/lib/pricing.ts`
- Uses `extractBasePrice()` for editing existing tiers
- Integrates `PriceBreakdownDisplay` component

**Validation Rules:**

1. Tier name required and unique per event
2. Stage names unique within tier
3. Prices must be non-negative
4. Quantities must be positive
5. Cannot reduce quantity below sold tickets
6. Sales end must be after sales start
7. Sales end must be ≥30 minutes before event start
8. Per-user limit between 1-50

**Backend Integration:**

- POST `/api/ticket-tiers` for new tier
- PATCH `/api/ticket-tiers` for editing
- Sends `tentative_event_start` during event editing

**Performance:**

- Use `React.memo()`
- Memoize price breakdown calculations

**CSS Module:** `TierForm.module.css`

---

### 7. EventEditForm.tsx

**Size:** ~500 lines  
**Responsibility:** Event details editing (dates, location, image)

**Props Interface:**

```typescript
interface EventEditFormProps {
  event: OrganizerEvent;
  editingEventData: EditingEventData;
  onDataChange: (field: string, value: string) => void;
  onImageUpload: (file: File) => void;
  onImageRemove: () => void;
  onSave: () => void;
  onDiscard: () => void;
  isSaving: boolean;
}

interface EditingEventData {
  eventId: string;
  eventSlug: string;
  originalStartsAt: string;
  startsAt: string; // Ecuador local time
  endsAt: string; // Ecuador local time
  venue: string;
  city: string;
  dateChanged: boolean;
  tiersNeedUpdate: string[]; // IDs of tiers needing update
  imageUrl: string;
  originalImageUrl: string;
}
```

**Key Features:**

- Venue and city text inputs
- Start/end datetime pickers (Ecuador timezone)
- Image upload with preview
- Drag-and-drop image support
- Client-side image resizing (3:4 aspect ratio)
- Deferred upload (only uploads on save)
- Tier conflict detection

**Image Processing:**

1. User selects/drops image file
2. Validate file size (≤ 4.5MB, Vercel serverless body limit) and type
3. Resize to 600x800 (3:4 ratio) using canvas
4. Create blob URL for preview
5. Store blob for later upload
6. On save: upload blob to Supabase Storage
7. Cleanup blob URLs on discard/unmount

**Tier Conflict Detection:**

- When event start date changes
- Check all tiers' `sales_end` times
- Flag tiers ending <30 min before new start
- Display warning banner
- Prevent save until all conflicts resolved

**Validation:**

- Event start ≥2 hours in future
- Event end after event start
- Venue and city required
- All tier conflicts resolved

**Backend Integration:**

- PATCH `/api/events` for event update
- POST `/api/upload-image` for image upload
- Uses AbortController for cancellable uploads

**Cleanup:**

- Revoke blob URLs on unmount
- Abort in-flight uploads on cancel

**Performance:**

- Use `React.memo()`
- Abort controllers for upload cancellation

**CSS Module:** `EventsManagement.module.css`

---

### 8. types.ts (Shared Types)

**Purpose:** Central location for TypeScript interfaces used across organizer components

**Exports:**

```typescript
// Form-specific stage interface
export interface FormTicketStage {
  id?: string;
  name: string;
  price_cents: number;
  quantity: number;
  order_index: number;
  sold_quantity?: number;
}

// Dashboard view types
export type DashboardView =
  | "dashboard"
  | "create-event"
  | "events-tiers"
  | "rsvps";

// Sidebar item
export interface SidebarItem {
  id: string;
  label: string;
  icon: any; // MyNaUI icon component
  pendingCount?: number;
}

// Event editing state
export interface EditingEventData {
  eventId: string;
  eventSlug: string;
  originalStartsAt: string;
  startsAt: string;
  endsAt: string;
  venue: string;
  city: string;
  dateChanged: boolean;
  tiersNeedUpdate: string[];
  imageUrl: string;
  originalImageUrl: string;
}

// Re-export from hooks for convenience
export type {
  OrganizerData,
  Event as OrganizerEvent,
} from "../../lib/hooks/useOrganizerData";
```

---

## CSS Modules Structure

### 1. OrganizerLayout.module.css (~600 lines)

**Sections:**

- `.organizerLayout` - Flex container for sidebar + main
- `.organizerSidebar` - Sidebar styling
- `.sidebarHeader`, `.sidebarBrand`, `.sidebarOrg` - Header sections
- `.sidebarNav`, `.sidebarNavItem`, `.sidebarNavItems` - Navigation
- `.sidebarDivider` - Visual separator
- `.pendingRsvpIndicator` - Badge for pending count
- `.organizerMain` - Main content area
- Mobile navigation (`.sidebarNavMobileToggle`, `.mobileNavOpen`)
- Role badges (`.organizerBadge`, `.switchRoleButton`)

**Media Queries:**

- Desktop: Full sidebar visible
- Tablet: Sidebar narrows
- Mobile (<768px): Collapsible dropdown

### 2. DashboardView.module.css (~400 lines)

**Sections:**

- `.dashboardContent` - Main container
- `.dashboardHeader` - Title and description
- `.dashboardStats` - Grid of stat cards
- `.statCard`, `.statNumber`, `.statCardIcon` - Stat card styling
- `.emptyTable`, `.emptyState` - Empty states
- `.purchasesDetailTable` - Purchase details table
- Status badges (`.statusBadge`, `.scanned`, `.notScanned`)
- RSVP status badges (`.rsvpPending`, `.rsvpApproved`)

### 3. EventsManagement.module.css (~700 lines)

**Sections:**

- `.ticketTiersContent` - Main container
- `.ticketTiersTable` - Events table
- `.expandedRow`, `.tierExpansionRow` - Accordion expansion
- `.tierExpansionContent`, `.tierExpansionItem` - Expanded content
- `.eventFormSection`, `.eventFormRow`, `.eventFormGroup` - Event form
- `.warningBanner`, `.needsUpdate` - Tier conflict warnings
- `.eventEditImageSection` - Image upload area
- `.tiersLoadingOverlay` - Loading state
- `.pastEventsSection`, `.pastEventsToggle` - Past events
- Action buttons (`.actionBtn`, variants)

**Loading States:**

- `.eventRowLoading` - Row-level loading
- `.tiersLoadingOverlay` - Overlay with spinner
- Spinner animations

### 4. RSVPsView.module.css (~200 lines)

**Sections:**

- `.rsvpsContent` - Main container
- `.rsvpsTable` - RSVP events table
- `.rsvpCountBadge` - Badge variants (pending, muted)
- `.pastEventsSection` - Past RSVP events
- `.pastEventLabel` - "Past Event" label
- Action buttons

### 5. TierForm.module.css (~200 lines)

**Sections:**

- `.tierInlineForm` - Form container
- `.tierFormRow`, `.tierFormField` - Form layout
- `.tierFormError` - Error messages
- `.checkboxLabel`, `.checkboxWrapper`, `.checkboxInput` - Checkbox styling
- `.tierStagesSection` - Stages container
- `.tierStageCard`, `.tierStageHeader` - Individual stage cards
- `.tierFormActions` - Action buttons
- `.tierFormHelp` - Help text
- Stage display (`.tierStagesDisplay`, `.stageInfoItem`)

---

## Implementation Steps

### Phase 1: Setup (Create Structure)

1. **Create folder structure:**

   ```bash
   mkdir -p app/components/organizer/styles
   ```

2. **Create types file:**

   - `app/components/organizer/types.ts`
   - Export all shared interfaces

3. **Create empty CSS Modules:**
   - Create 5 `.module.css` files in `styles/` folder

### Phase 2: Extract CSS (Split Styles)

4. **Split `dashboard.css` into CSS Modules:**

   - Copy relevant sections to each module
   - Convert class names to camelCase for JS imports
   - Use `:global()` wrapper if global styles needed
   - Test that no styles are lost

5. **Update CSS variable usage:**
   - Ensure all CSS variables still work
   - Verify `var(--color-*, --gap, etc.)` references

### Phase 3: Create Components (Bottom-Up)

6. **Create TierInlineForm.tsx:**

   - Extract lines 66-800 from OrganizerDashboard
   - Import `TierForm.module.css`
   - Add `React.memo()`
   - Test tier creation/editing

7. **Create EventEditForm.tsx:**

   - Extract event editing logic
   - Import `EventsManagement.module.css`
   - Add image handling logic
   - Add `React.memo()`

8. **Create OrganizerSidebar.tsx:**

   - Extract sidebar JSX and logic
   - Import `OrganizerLayout.module.css`
   - Add `React.memo()`
   - Test navigation

9. **Create DashboardView.tsx:**

   - Extract dashboard view case
   - Import `DashboardView.module.css`
   - Add `React.memo()`
   - Test stats and tables

10. **Create EventsManagementView.tsx:**

    - Extract events-tiers view case
    - Import `EventsManagement.module.css`
    - Integrate TierInlineForm and EventEditForm
    - Add `React.memo()`
    - Test CRUD operations

11. **Create RSVPsView.tsx:**
    - Extract rsvps view case
    - Import `RSVPsView.module.css`
    - Add `React.memo()`
    - Test RSVP navigation

### Phase 4: Create Main Component

12. **Create new OrganizerDashboard.tsx:**
    - Import all view components
    - Keep only orchestration logic
    - React Query setup
    - URL sync logic
    - Import `OrganizerLayout.module.css`

### Phase 5: Update References

13. **Update import in `app/organizer/page.tsx`:**

    ```typescript
    // Change from:
    import OrganizerDashboard from "../components/OrganizerDashboard";

    // To:
    import OrganizerDashboard from "../components/organizer/OrganizerDashboard";
    ```

14. **Check for other imports:**
    ```bash
    grep -r "OrganizerDashboard" app/ --include="*.tsx" --include="*.ts"
    ```

### Phase 6: Testing & Cleanup

15. **Test all functionality:**

    - Dashboard stats display
    - Navigation between views
    - Event CRUD operations
    - Tier CRUD operations
    - Image uploads
    - Price calculations
    - RSVP navigation
    - Mobile responsiveness
    - URL parameter sync

16. **Performance testing:**

    - Check re-render counts
    - Verify React.memo() working
    - Test with large event lists

17. **Delete old file:**

    - `app/components/OrganizerDashboard.tsx`

18. **Update dashboard.css:**
    - Add comment noting migration to CSS Modules
    - Keep file for now (may be used elsewhere)

---

## Migration Checklist

### Functionality Verification

- [ ] Dashboard view displays correctly
- [ ] Stats cards calculate correctly
- [ ] Navigation between views works
- [ ] URL parameters sync correctly
- [ ] Create event flow works
- [ ] Event editing saves properly
- [ ] Event date editing validates tiers
- [ ] Image upload and preview works
- [ ] Image resizing works (3:4 ratio)
- [ ] Tier creation works
- [ ] Tier editing works
- [ ] Tier deletion works (with confirmation)
- [ ] Price stages work correctly
- [ ] Price breakdown displays
- [ ] Stage validation works
- [ ] RSVP navigation works
- [ ] RSVP loading state displays
- [ ] Promotions section displays
- [ ] Purchase details display
- [ ] Mobile navigation works
- [ ] Mobile dropdown works
- [ ] Past events sections work
- [ ] Past events are collapsible
- [ ] Admin role badge displays
- [ ] React Query refetching works
- [ ] Loading states display correctly
- [ ] Error states display correctly

### CSS Verification

- [ ] All styles render correctly
- [ ] No style conflicts
- [ ] Responsive design works (mobile)
- [ ] Responsive design works (tablet)
- [ ] Responsive design works (desktop)
- [ ] Hover states work
- [ ] Active states work
- [ ] Animations work (dropdown)
- [ ] Animations work (accordion)
- [ ] Animations work (loading spinners)
- [ ] CSS variables resolve correctly
- [ ] Color scheme consistent
- [ ] Spacing consistent

### Performance Verification

- [ ] Components use React.memo()
- [ ] No unnecessary re-renders
- [ ] Price calculations memoized
- [ ] Event filtering memoized
- [ ] Image blob URLs cleaned up
- [ ] AbortController works for uploads
- [ ] No memory leaks

---

## Key Technical Considerations

### 1. Timezone Handling

- All datetime inputs use Ecuador timezone
- Conversion functions: `ecuadorLocalToUtc()`, `utcToEcuadorLocal()`, `getEcuadorNow()`
- Located in `app/lib/utils/timezone.ts`
- Must maintain consistency across all components

### 2. Pricing System

- **Base Price:** What organizer receives
- **Service Fee:** 10% of base (Flame commission)
- **IVA:** 15% of service fee (tax)
- **Final Price:** Base + Service Fee + IVA

Functions:

- `calculateFinalPrice(basePrice)` - Returns full breakdown
- `extractBasePrice(finalPriceCents)` - Reverse calculation
- `formatPrice(cents)` - Display formatting

Located in: `app/lib/pricing.ts`

### 3. Image Handling

- Max size: 4.5MB
- Target aspect ratio: 3:4 (600x800px)
- Canvas-based resizing
- Blob URLs for preview
- Deferred upload (on save, not on select)
- Cleanup blob URLs to prevent memory leaks
- AbortController for cancellable uploads

### 4. React Query Integration

- Query key: `["organizer-data"]`
- SSR initial data support
- Stale time: 2 minutes
- `refetchOnMount: false` (SSR data is fresh)
- Manual refetch after mutations
- Optimistic updates where appropriate

### 5. Form Validation

**Tier Form:**

- Name required, unique per event
- Stage names unique within tier
- Prices non-negative
- Quantities positive
- Cannot reduce below sold count
- Sales dates valid range
- 30-minute rule before event

**Event Form:**

- Start date ≥2 hours in future
- End date after start date
- Venue and city required
- All tier conflicts resolved

### 6. State Management Strategy

- React Query for server state
- Local state for UI interactions
- URL parameters for navigation state
- No global state library needed

### 7. Performance Optimizations

- `React.memo()` on all view components
- Custom comparison functions where needed
- Memoize expensive calculations (price breakdown, event filtering)
- Lazy load views if bundle size grows
- AbortController for cancellable requests

---

## Potential Issues & Solutions

### Issue 1: CSS Module Naming Conflicts

**Problem:** Multiple components might have similar class names
**Solution:** Use descriptive, unique class names. Prefix with component name if needed.

### Issue 2: Global Styles Needed

**Problem:** Some styles need to be global (e.g., for child components)
**Solution:** Use `:global()` wrapper in CSS Modules or keep truly global styles in original file.

### Issue 3: CSS Variable Access

**Problem:** CSS Modules might not access CSS variables correctly
**Solution:** CSS variables work fine in modules. Ensure variables defined in `:root` or global scope.

### Issue 4: React.memo() Not Preventing Re-renders

**Problem:** Components re-render despite React.memo()
**Solution:** Implement custom comparison function, memoize callback props with useCallback.

### Issue 5: Image Blob URL Memory Leaks

**Problem:** Blob URLs not cleaned up, causing memory leaks
**Solution:** Always call `URL.revokeObjectURL()` in cleanup effects and on unmount.

### Issue 6: Type Errors After Splitting

**Problem:** Missing type imports after component split
**Solution:** Import from central `types.ts` file, re-export from hooks where needed.

---

## Future Enhancements (Post-Refactor)

1. **Code Splitting:** Lazy load view components for better initial load
2. **Testing:** Add unit tests for each component
3. **Storybook:** Create stories for isolated component development
4. **Accessibility:** ARIA labels, keyboard navigation
5. **Analytics:** Track component usage and performance
6. **Error Boundaries:** Wrap views in error boundaries
7. **Suspense:** Add React Suspense for loading states
8. **Virtual Scrolling:** For large event/tier lists

---

## Benefits Summary

### Maintainability

- ✅ Each component has single responsibility
- ✅ Easy to locate specific functionality
- ✅ Reduced cognitive load (150-800 lines vs 3646)
- ✅ Clear component boundaries

### Reusability

- ✅ TierInlineForm can be reused
- ✅ EventEditForm can be reused
- ✅ Components can be used in other contexts

### Testability

- ✅ Smaller components easier to unit test
- ✅ Clear inputs/outputs (props/callbacks)
- ✅ Isolated business logic

### Performance

- ✅ React.memo prevents unnecessary re-renders
- ✅ Better code splitting opportunities
- ✅ Faster hot reload during development

### Developer Experience

- ✅ Faster file navigation
- ✅ Better IDE performance
- ✅ Clearer git diffs
- ✅ Easier onboarding for new developers

### Type Safety

- ✅ Centralized types file
- ✅ Consistent interfaces across components
- ✅ Better TypeScript inference

### CSS Management

- ✅ Scoped styles prevent conflicts
- ✅ Easier to find relevant styles
- ✅ Better tree-shaking of unused styles
- ✅ Clear component-style relationship

---

## Timeline Estimate

- **Phase 1 (Setup):** 30 minutes
- **Phase 2 (CSS Split):** 2-3 hours
- **Phase 3 (Components):** 6-8 hours
- **Phase 4 (Main Component):** 1 hour
- **Phase 5 (References):** 30 minutes
- **Phase 6 (Testing):** 3-4 hours

**Total:** ~13-17 hours of development time

---

## Success Criteria

The refactoring is successful when:

1. ✅ All existing functionality works identically
2. ✅ No visual regressions
3. ✅ Performance is equal or better
4. ✅ Code is more maintainable (subjective, but clear)
5. ✅ Tests pass (if tests exist)
6. ✅ No linter errors
7. ✅ No TypeScript errors
8. ✅ Mobile responsiveness maintained
9. ✅ Accessible navigation works
10. ✅ Team approval of new structure

---

## References

- Original file: `app/components/OrganizerDashboard.tsx` (3646 lines)
- Original CSS: `app/styles/components/dashboard.css` (2106 lines)
- Related components:
  - `app/components/forms/CreateEventForm.tsx`
  - `app/components/PromotionsSection.tsx`
  - `app/components/PriceBreakdownDisplay.tsx`
  - `app/components/RsvpLoadingPage.tsx`
- Hooks:
  - `app/lib/hooks/useOrganizerData.ts`
  - `app/lib/hooks/useUserRole.ts`
- Utils:
  - `app/lib/utils/timezone.ts`
  - `app/lib/utils/event-filters.ts`
  - `app/lib/pricing.ts`

---

**Last Updated:** October 28, 2025  
**Status:** Ready for implementation
