# Mobile Ticket Cards Implementation

## Summary

Implemented mobile-responsive card layouts for ticket tables in the `/account` page to replace horizontal scrolling tables on mobile devices.

## Problem

The ticket tables worked well on desktop but created a poor user experience on mobile:

- Required horizontal scrolling
- Information was cramped and hard to read
- Not optimized for touch interaction

## Solution

Created a dual-rendering approach:

- **Mobile (≤767px):** Card-based layout with all information visible
- **Desktop (>767px):** Table layout (unchanged)

---

## Implementation Details

### 1. CSS Card Styles Added

Created mobile-specific card components in `dashboard.css`:

```css
/* Mobile Ticket Cards */
.tickets-mobile-cards {
  display: none; /* Hidden by default, shown on mobile */
  flex-direction: column;
  gap: calc(var(--gap) * 1);
  background-color: var(--color-neutral-100);
  padding: calc(var(--gap) * 1);
}

.ticket-mobile-card {
  background-color: var(--color-neutral-100);
  border: 1px solid var(--color-neutral-300);
  padding: calc(var(--gap) * 1);
  transition: all 0.2s ease;
}

/* ... additional card-specific styles */
```

### 2. Media Query for Mobile Display

```css
@media screen and (max-width: 767px) {
  /* Hide table on mobile, show cards */
  .tickets-table-container .events-table {
    display: none;
  }

  .tickets-mobile-cards {
    display: flex;
  }
}
```

### 3. Component Helper Functions

Added two helper functions in `UserDashboard.tsx`:

#### `renderMobileTicketCard()`

For current/upcoming events with action buttons:

```typescript
const renderMobileTicketCard = (group: any, index: number) => {
  // Renders card with:
  // - Event image (56x56px)
  // - Event title
  // - Organizer name
  // - Date and time
  // - Location
  // - Ticket quantity and tier
  // - Action button (View Ticket / Buy Tickets / Status)
};
```

#### `renderMobilePastEventCard()`

For past events showing cost instead of actions:

```typescript
const renderMobilePastEventCard = (group: any, index: number) => {
  // Renders card with:
  // - Event image (56x56px)
  // - Event title
  // - Organizer name
  // - Date and time
  // - Location
  // - Ticket quantity and tier
  // - Total cost
};
```

---

## Card Layout Structure

```
┌──────────────────────────────────┐
│ ┌────┐ Event Title              │
│ │IMG │ by Organizer Name        │
│ │    │ Nov 15, 2025 - 11:00 AM  │
│ └────┘ Location Name             │
├──────────────────────────────────┤
│ 1x Ticket Tier   [View Ticket]  │
└──────────────────────────────────┘
```

### Card Components:

1. **Top Section** (`.ticket-card-top`)

   - Event image (56x56px, rounded corners)
   - Event info (title, organizer, date, location)

2. **Bottom Section** (`.ticket-card-bottom`)
   - Left: Ticket quantity and tier name
   - Right: Action button or cost

---

## Applied To

### 1. Recent Tickets (Overview Page)

- Shows first 3 current/upcoming events
- Mobile: Cards
- Desktop: Table

### 2. Current & Upcoming Events (My Tickets Page)

- Shows all current/upcoming events
- Mobile: Cards
- Desktop: Table

### 3. Past Events (My Tickets Page)

- Shows past events (collapsible section)
- Mobile: Cards (with cost instead of actions)
- Desktop: Table

---

## CSS Classes Reference

| Class                          | Purpose                      |
| ------------------------------ | ---------------------------- |
| `.tickets-mobile-cards`        | Container for mobile cards   |
| `.ticket-mobile-card`          | Individual card wrapper      |
| `.ticket-card-event-link`      | Clickable event info section |
| `.ticket-card-image`           | Event image (56x56px)        |
| `.ticket-card-info`            | Event details container      |
| `.ticket-card-title`           | Event title                  |
| `.ticket-card-organizer`       | Organizer name               |
| `.ticket-card-details`         | Date/location container      |
| `.ticket-card-detail-item`     | Individual detail line       |
| `.ticket-card-bottom`          | Action/cost section          |
| `.ticket-card-quantity`        | Ticket count and tier        |
| `.ticket-card-quantity-amount` | Quantity text                |
| `.ticket-card-action`          | Button/cost container        |
| `.ticket-card-btn`             | Action button                |
| `.ticket-card-status`          | Status text                  |

---

## Desktop vs Mobile

### Desktop (>767px)

```
┌────────────────────────────────────────────────────────────┐
│ Event            │ Date      │ Location  │ Tickets │ Action│
├────────────────────────────────────────────────────────────┤
│ [IMG] Event Name │ Nov 15... │ Venue     │ 1x Tier │ [Btn] │
└────────────────────────────────────────────────────────────┘
```

- Table with horizontal columns
- Requires more screen width
- All info in single row

### Mobile (≤767px)

```
┌──────────────────────────────┐
│ ┌──┐ Event Name              │
│ │  │ by Organizer            │
│ └──┘ Nov 15, 2025 - 11:00 AM │
│      Venue Name               │
├──────────────────────────────┤
│ 1x Tier Name    [View Ticket]│
└──────────────────────────────┘
┌──────────────────────────────┐
│ ┌──┐ Event Name              │
│ │  │ by Organizer            │
│ └──┘ Nov 15, 2025 - 11:00 AM │
│      Venue Name               │
├──────────────────────────────┤
│ 1x Tier Name    [View Ticket]│
└──────────────────────────────┘
```

- Cards stack vertically
- Each card is self-contained
- Touch-friendly buttons
- No horizontal scrolling

---

## Button States in Cards

### Active Ticket (Purchased)

```typescript
<button className="action-btn action-btn--primary ticket-card-btn">
  View Ticket
</button>
```

### Approved RSVP (Not Purchased)

```typescript
<button className="action-btn action-btn--warning ticket-card-btn">
  Buy Tickets
</button>
```

### Loading State

```typescript
<button className="action-btn action-btn--loading ticket-card-btn">
  <div className="purchase-spinner-small"></div>
  Loading
</button>
```

### Pending RSVP

```typescript
<span className="ticket-card-status">Pending Review</span>
```

---

## Benefits

### User Experience

✅ No horizontal scrolling on mobile  
✅ Larger, touch-friendly buttons  
✅ Better information hierarchy  
✅ Clearer visual separation between events  
✅ Easier to scan and read

### Technical

✅ Progressive enhancement (desktop unaffected)  
✅ Semantic HTML maintained  
✅ Reusable helper functions  
✅ Consistent with existing design system  
✅ No breaking changes to existing functionality

### Performance

✅ No duplicate data fetching (same data, different rendering)  
✅ CSS-based show/hide (no JavaScript required)  
✅ Smooth transitions and hover states

---

## Files Modified

1. **`app/styles/components/dashboard.css`**

   - Added mobile card styles (lines 1879-2013)
   - Added media query to toggle display (lines 1703-1710)

2. **`app/components/UserDashboard.tsx`**

   - Added `renderMobileTicketCard()` helper (lines 301-377)
   - Added `renderMobilePastEventCard()` helper (lines 379-421)
   - Updated Recent Tickets section (added mobile cards)
   - Updated Current & Upcoming Events section (added mobile cards)
   - Updated Past Events section (added mobile cards)

3. **`docs_guides/MOBILE_TICKET_CARDS.md`**
   - This documentation

---

## Testing Checklist

- [ ] Mobile (≤767px): Cards display correctly
- [ ] Mobile: Images load and display properly
- [ ] Mobile: Buttons are touch-friendly
- [ ] Mobile: Loading states work correctly
- [ ] Mobile: Past events show cost instead of buttons
- [ ] Desktop (>767px): Tables display (unchanged)
- [ ] Desktop: Cards are hidden
- [ ] Tablet (768-991px): Tables display
- [ ] Click/tap actions work on both versions
- [ ] Hover states work on desktop
- [ ] No horizontal scrolling on mobile

---

## Future Enhancements

Potential improvements for future iterations:

1. **Skeleton Loading**: Add skeleton screens for card loading states
2. **Swipe Gestures**: Add swipe-to-action on mobile cards
3. **Filter/Sort**: Add mobile-specific filter UI
4. **Pagination**: Consider load more for long lists
5. **Accessibility**: Add ARIA labels for screen readers

---

## Date

October 29, 2025
