# Feature Development Guide

## Architecture Overview

This app uses a **hybrid SSR + Client-side** architecture for optimal performance:

1. **SSR (Server-Side Rendering)** - `/app/[page]/page.tsx` fetches data on the server for fast initial page load
2. **Client-Side Refetching** - Components use React Query to keep data fresh (on window focus, after mutations)

### Key Principle: **Data must be fetched in BOTH places for consistency**

---

## Step-by-Step Guide to Add a New Feature

### 1. Database Schema (Supabase)

**File**: `supabase/migrations/YYYYMMDDHHMMSS_feature_name.sql`

```sql
-- Example: Create new table
CREATE TABLE IF NOT EXISTS public.new_feature (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_new_feature_event_id ON public.new_feature(event_id);

-- Enable RLS (Row Level Security)
ALTER TABLE public.new_feature ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Organizers can view their event features"
ON public.new_feature FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM events e
    JOIN organization_members om ON om.organization_id = e.organization_id
    WHERE e.id = new_feature.event_id
    AND om.user_id = auth.uid()
  )
);

CREATE POLICY "Organizers can create features for their events"
ON public.new_feature FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM events e
    JOIN organization_members om ON om.organization_id = e.organization_id
    WHERE e.id = new_feature.event_id
    AND om.user_id = auth.uid()
  )
);
```

**Apply migration**:

```bash
# Use Supabase MCP or dashboard to apply migrations
```

---

### 2. TypeScript Types

**File**: `/app/lib/hooks/useOrganizerData.ts`

```typescript
// Add the new field to the Event interface
interface Event {
  id: string;
  name: string;
  // ... existing fields ...

  // Add your new feature fields
  new_feature?: NewFeature[]; // ← ADD THIS
}

// Define the new type if needed
interface NewFeature {
  id: string;
  event_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export type { Event, NewFeature };
```

**⚠️ CRITICAL**: If you skip this step, React Query may strip out your new fields!

---

### 3. SSR Data Fetching (Server Component)

**File**: `/app/organizer/page.tsx` (or relevant page)

```typescript
const { data: events } = await supabaseAdmin
  .from("events")
  .select(
    `
    *,
    ticket_tiers (...),
    promotional_tickets (...),
    promotional_codes (...),
    new_feature (         // ← ADD YOUR NEW FEATURE HERE
      id,
      name,
      created_at,
      related_table (    // ← Include relations if needed
        id,
        name
      )
    )
  `
  )
  .eq("organization_id", organization.id)
  .order("starts_at", { ascending: true });
```

**Key Points**:

- Embed the new data in the main query (like `ticket_tiers`)
- Include any related tables you need
- This ensures data is available on initial page load

---

### 4. API Route for Refetching

**File**: `/app/api/organizer/data/route.ts`

```typescript
const { data: events } = await supabaseAdmin
  .from("events")
  .select(
    `
    *,
    ticket_tiers (...),
    promotional_tickets (...),
    promotional_codes (...),
    new_feature (         // ← ADD THE EXACT SAME QUERY HERE
      id,
      name,
      created_at,
      related_table (
        id,
        name
      )
    )
  `
  )
  .eq("organization_id", organization.id)
  .order("starts_at", { ascending: true });
```

**⚠️ CRITICAL**: The query must be **IDENTICAL** to the SSR query!

---

### 5. Create API Routes for CRUD Operations

**Create**: `/app/api/organizer/new-feature/route.ts`

```typescript
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { event_id, name } = body;

    // Validate input
    if (!event_id || !name) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify user has access to this event
    const { data: event } = await supabaseAdmin
      .from("events")
      .select(
        `
        *,
        organizations!inner (
          organization_members!inner (user_id)
        )
      `
      )
      .eq("id", event_id)
      .eq("organizations.organization_members.user_id", userId)
      .single();

    if (!event) {
      return NextResponse.json(
        { error: "Event not found or access denied" },
        { status: 404 }
      );
    }

    // Create the new feature
    const { data, error } = await supabaseAdmin
      .from("new_feature")
      .insert({
        event_id,
        name,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ new_feature: data }, { status: 201 });
  } catch (error) {
    console.error("Error creating new feature:", error);
    return NextResponse.json(
      { error: "Failed to create new feature" },
      { status: 500 }
    );
  }
}
```

**Delete**: `/app/api/organizer/new-feature/[id]/route.ts`

```typescript
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Delete the feature
    const { error } = await supabaseAdmin
      .from("new_feature")
      .delete()
      .eq("id", params.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting feature:", error);
    return NextResponse.json(
      { error: "Failed to delete feature" },
      { status: 500 }
    );
  }
}
```

---

### 6. Create UI Component

**File**: `/app/components/NewFeatureSection.tsx`

```typescript
"use client";

import { useState } from "react";

interface NewFeatureSectionProps {
  eventId: string;
  features: any[];
  onRefresh: () => void;
}

export default function NewFeatureSection({
  eventId,
  features,
  onRefresh,
}: NewFeatureSectionProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/organizer/new-feature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, name }),
      });

      if (!response.ok) {
        throw new Error("Failed to create feature");
      }

      setName("");
      onRefresh(); // Trigger React Query refetch
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to create feature");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (featureId: string) => {
    if (!confirm("Are you sure?")) return;

    try {
      const response = await fetch(`/api/organizer/new-feature/${featureId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete");

      onRefresh(); // Trigger React Query refetch
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to delete feature");
    }
  };

  return (
    <div className="new-feature-section">
      <h3>New Feature</h3>

      {/* Create Form */}
      <div className="feature-form">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Feature name"
        />
        <button onClick={handleCreate} disabled={loading || !name}>
          {loading ? "Creating..." : "Create"}
        </button>
      </div>

      {/* List */}
      {features.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {features.map(feature => (
              <tr key={feature.id}>
                <td>{feature.name}</td>
                <td>
                  <button onClick={() => handleDelete(feature.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

---

### 7. Integrate Component into Dashboard

**File**: `/app/components/OrganizerDashboard.tsx`

```typescript
import NewFeatureSection from "./NewFeatureSection";

// Inside the expanded event section:
{isExpanded && (
  <tr className="tier-expansion-row">
    <td colSpan={5} className="tier-expansion-cell">
      <div className="tier-expansion-content">
        {/* Add your new feature section */}
        <NewFeatureSection
          eventId={event.id}
          features={event.new_feature || []}
          onRefresh={() =>
            queryClient.refetchQueries({
              queryKey: ["organizer-data"],
            })
          }
        />

        {/* Existing sections */}
        <PromotionsSection ... />
      </div>
    </td>
  </tr>
)}
```

---

### 8. Add Styling

**File**: `/app/styles/components/new-feature.css`

```css
.new-feature-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.feature-form {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

/* ... more styles ... */
```

**File**: `/app/globals.css`

```css
@import "./styles/components/new-feature.css";
```

---

## Common Pitfalls & Solutions

### ❌ Problem: Data not showing after refresh

**Solution**: Ensure TypeScript interface includes the new fields in `useOrganizerData.ts`

### ❌ Problem: Data loads slowly / with delay

**Solution**: Add data to BOTH SSR query (`page.tsx`) AND API route (`/api/organizer/data/route.ts`)

### ❌ Problem: Data shows initially but disappears on refetch

**Solution**: Make sure both queries are IDENTICAL - same fields, same relations

### ❌ Problem: "Cannot read properties of undefined"

**Solution**: Use optional chaining (`?.`) when accessing nested data, e.g., `feature?.related_table?.name`

### ❌ Problem: RLS errors when fetching data

**Solution**: Check RLS policies allow authenticated users with correct organization membership

### ❌ Problem: TypeScript error "'supabaseAdmin' is possibly 'null'"

**Context**: `supabaseAdmin` from `@/app/lib/supabase/server` can be `null` if environment variables aren't configured, causing TypeScript compilation errors.

**Solution**: Use the non-null assertion operator (`!`) after verifying null check in the handler:

```typescript
// ✅ Correct Pattern
export async function POST(req: NextRequest) {
  // Check for null first
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Database connection error" },
      { status: 500 }
    );
  }

  // Now safe to use supabaseAdmin! with non-null assertion
  const { data, error } = await supabaseAdmin!
    .from("table")
    .select("*");
}

// Alternative: Add null check in helper function
async function helperFunction() {
  if (!supabaseAdmin) {
    throw new Error("Database not available");
  }

  // Use supabaseAdmin! throughout the function
  const { data } = await supabaseAdmin!
    .from("table")
    .select("*");
}
```

**Why this works**: TypeScript doesn't track null checks across function boundaries, so even though the POST handler checks for null, helper functions don't know about it. The non-null assertion (`!`) tells TypeScript "I've already checked this isn't null."

**When to use**: Any API route or helper function that uses `supabaseAdmin` after a null check.

**Fixed in**: Cron jobs (`/api/cron/cleanup-past-event-rsvps`, `/api/cron/monitor-payment-authorizations`) - January 19, 2026

---

## Testing Checklist

- [ ] Data appears on initial page load (SSR)
- [ ] Data appears after manual refetch (click eye icon to expand/collapse)
- [ ] Data appears after window focus change (switch tabs and come back)
- [ ] Create operation works and triggers refetch
- [ ] Delete operation works and triggers refetch
- [ ] TypeScript has no errors
- [ ] RLS policies prevent unauthorized access
- [ ] Mobile responsive design

---

## Key Files to Modify (Summary)

1. **Database**: `supabase/migrations/[timestamp]_feature_name.sql`
2. **Types**: `/app/lib/hooks/useOrganizerData.ts`
3. **SSR**: `/app/organizer/page.tsx`
4. **API**: `/app/api/organizer/data/route.ts`
5. **CRUD APIs**: `/app/api/organizer/[feature]/route.ts`
6. **Component**: `/app/components/FeatureSection.tsx`
7. **Integration**: `/app/components/OrganizerDashboard.tsx`
8. **Styles**: `/app/styles/components/feature.css`

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│  User visits /organizer                              │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  SSR: /app/organizer/page.tsx                       │
│  - Fetches from Supabase directly                   │
│  - Includes: events, tiers, promotional_data, etc.  │
│  - Passes data as props to OrganizerDashboard       │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  Client: OrganizerDashboard.tsx                     │
│  - useQuery with initialData from SSR               │
│  - refetchOnMount: false (uses SSR data)            │
│  - refetchOnWindowFocus: true                       │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ (On refetch triggers)
                   ▼
┌─────────────────────────────────────────────────────┐
│  API: /app/api/organizer/data/route.ts              │
│  - Fetches fresh data from Supabase                 │
│  - MUST match SSR query exactly                     │
│  - Returns updated data to React Query              │
└─────────────────────────────────────────────────────┘
```

---

## Example: Adding a "Check-in Requirements" Feature

```typescript
// 1. Database Migration
CREATE TABLE public.checkin_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id),
  requirement_text TEXT NOT NULL,
  is_mandatory BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

// 2. TypeScript Types
interface Event {
  // ...
  checkin_requirements?: CheckinRequirement[];
}

interface CheckinRequirement {
  id: string;
  event_id: string;
  requirement_text: string;
  is_mandatory: boolean;
  created_at: string;
}

// 3 & 4. Add to BOTH SSR and API queries
checkin_requirements (
  id,
  requirement_text,
  is_mandatory,
  created_at
)

// 5. Create API routes (POST, DELETE)
// 6. Create CheckinRequirementsSection component
// 7. Integrate into OrganizerDashboard
// 8. Add styling
```

---

## Need Help?

1. Review this guide
2. Check existing features (promotional_tickets, promotional_codes) as examples
3. Ensure queries match between SSR and API routes
4. Verify TypeScript types include all new fields
5. Test with React Query DevTools to debug cache issues

**Remember**: The key to this architecture is **consistency between SSR and client-side data fetching**!
