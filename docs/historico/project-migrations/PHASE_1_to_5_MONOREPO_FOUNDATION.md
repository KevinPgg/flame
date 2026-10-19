# Phase 1 to 5: Monorepo Foundation & Implementation Details

This document serves as the detailed technical log for the iOS Migration and Monorepo setup. It contains meticulous records of all architectural changes, configurations, and troubleshooting steps for each phase.

## Phase 1: Monorepo Foundation & Vercel Configuration (Completed)

**Date:** January 29, 2026
**Status:** Completed

### 1. Architecture Changes

#### Directory Structure

The repository was restructured from a single Next.js app to a monorepo workspace:

```
/
├── apps/
│   ├── web/            # Existing Next.js application (moved from root)
│   └── mobile/         # New Expo (React Native) application
├── packages/
│   ├── ui/             # Shared UI components (NativeWind/Tailwind)
│   ├── lib/            # Shared business logic & utilities
│   └── config/         # Shared configurations (TSConfig, ESLint)
├── supabase/           # Shared database (serves both web & mobile)
│   ├── config.toml
│   └── migrations/
├── package.json        # Root workspace configuration
├── turbo.json          # Turborepo pipeline configuration
└── pnpm-workspace.yaml # Workspace definition
```

> **Important:** The `supabase/` folder MUST remain at the repository root (not inside `apps/web/`).
> This is because:
>
> 1. Supabase is a **shared backend** used by both web and mobile apps
> 2. The Supabase GitHub integration expects `/supabase` at root for automatic preview branching
> 3. Follows monorepo conventions where shared infrastructure lives at root level

#### Key Configurations

**Root `package.json`**

- **Engines:** Node version set to `>=20` to align with Vercel's runtime.
- **Dependencies:** Added `turbo`, `turbo-ignore`, `prettier`, and `next` (to satisfy Vercel detection).
- **Overrides:** Pinned React types to `18.3.x` to resolve `Suspense` type errors in the web build.

**`turbo.json`**

- Configured build pipeline for `^build` dependencies.
- Added `globalEnv` whitelist for all critical environment variables (Clerk, Stripe, Supabase, etc.) to ensure they are passed to the build process.

### 2. Mobile App Setup (`apps/mobile`)

- **Framework:** Expo Managed Workflow (SDK 54 — upgraded from initial SDK 51 setup).
- **Styling:** NativeWind v4 + Tailwind CSS.
- **Navigation:** Expo Router.
- **Assets:** Placeholder assets (`icon.png`, `splash.png`, etc.) generated and placed in `assets/`.
- **Fixes:**
  - Resolved `nativewind/preset` resolution errors by ensuring dependencies were correctly installed with a clean pnpm store.
  - Created `app/details.tsx` to fix a broken link in the template.

### 3. Vercel Deployment Configuration

To successfully deploy the monorepo on Vercel, the following settings were applied:

- **Root Directory:** `.` (Repository Root).
- **Build Command:** `npx turbo build --filter=@project-flame/web...`
- **Output Directory:** `apps/web/.next`
- **Install Command:** `pnpm install`
- **Ignored Build Step:** Configured to run `npx turbo-ignore` to skip builds when only mobile/shared files change.

#### Troubleshooting Log (Phase 1)

1.  **"No Next.js version detected":**
    - _Cause:_ Vercel looks for `next` in the root `package.json`.
    - _Fix:_ Added `"next": "15.5.9"` to root `devDependencies`.

2.  **"Suspense cannot be used as a JSX component":**
    - _Cause:_ React 19 types were being installed for React 18 code.
    - _Fix:_ Added `pnpm.overrides` in root `package.json` to pin `@types/react` and `@types/react-dom` to `18.3.x`.

3.  **"ERR_PNPM_OUTDATED_LOCKFILE":**
    - _Cause:_ `package.json` changes were made without updating `pnpm-lock.yaml`.
    - _Fix:_ Ran `pnpm install --no-frozen-lockfile` locally to sync the lockfile.

4.  **"Missing environment variables in turbo.json":**
    - _Cause:_ Turbo blocks env vars not explicitly listed.
    - _Fix:_ Populated `globalEnv` in `turbo.json` with all project secrets.

5.  **Supabase Preview Branches Empty (No Tables):**
    - _Date Fixed:_ February 3, 2026
    - _Cause:_ During the monorepo migration, the `supabase/` folder was incorrectly moved inside `apps/web/supabase/`. The Supabase GitHub integration was still configured to look at the root `/supabase` path, which no longer existed.
    - _Symptoms:_ Preview branches were created but had 0 tables (empty database). The baseline migration was never applied because Supabase couldn't find the migrations folder.
    - _Fix:_ Moved `apps/web/supabase/` back to root `/supabase/`. Since Supabase is a shared backend for both web and mobile apps, it architecturally belongs at the root level alongside `packages/`.
    - _Configuration:_ In Supabase Dashboard → Project Settings → Integrations → GitHub, set "Supabase directory" to empty or `.` to point to the root-level folder.
    - _Verification:_ Create a PR and confirm the preview branch has all 26 tables from the baseline.

### 4. Security & Cleanup

- **Secrets:** Removed accidentally committed backup env files (`.env.local.backup`, etc.) from git history.
- **Gitignore:** Updated root `.gitignore` to strictly exclude all variations of `.env` backup files.

### 5. Shared Library Setup (`packages/lib`)

**Date:** February 3, 2026
**Status:** Completed (Fully Integrated)

Extracted shared business logic from `apps/web/app/lib` to `packages/lib` so both web and mobile apps can use the same code without duplication.

#### Package Structure

```text
packages/lib/
├── src/
│   ├── index.ts              # Main exports
│   ├── types/                # Event, Ticket, QRCode types
│   ├── pricing/              # Fee calculations, markup constants
│   ├── stripe/               # Stripe constants, fee functions
│   ├── validators/           # Cedula, quantity validation
│   ├── utils/                # Format, timezone, availability
│   └── supabase/             # Client factory functions
├── __tests__/                # 65 tests for shared logic
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

#### What Was Extracted

| Module         | Contents                                                                    | Tests    |
| -------------- | --------------------------------------------------------------------------- | -------- |
| **types**      | `Event`, `TicketTier`, `TicketStage`, `QRCodeData`, `validateQRCodeFormat`  | -        |
| **pricing**    | `calculateFinalPrice`, `extractBasePrice`, `getDefaultFixedFeeCents`, pricing constants | 12 tests |
| **stripe**     | `calculateFee`, `calculateUnitPrice`, `CANCELLABLE_PAYMENT_INTENT_STATUSES` | 11 tests |
| **validators** | `validateCedula`, `validateAndParseQuantity`, `validateQRCodeFormat`        | 26 tests |
| **utils**      | `formatCurrency`, timezone utils, availability checks, event-date filtering (`isEventActive`, `filterActiveEvents`, `filterPastEvents`, `separateEventsByDate`) | 30 tests |
| **supabase**   | `createSupabaseClient`, `createSupabaseAdmin` factory functions             | -        |

> **Note:** Validators includes 13 QR code format tests. Event-filters extracted Feb 24, 2026 (Fix #186). Total: 12 + 11 + 26 + 30 + 6 = 85 tests.

#### Usage

Both apps import from `@project-flame/lib`:

```typescript
// In apps/web or apps/mobile
import {
  Event,
  calculateFinalPrice,
  formatCurrency,
  validateCedula,
  createSupabaseClient,
} from "@project-flame/lib";
```

#### Migration Notes (Completed Feb 3, 2026)

- **Refactor Complete:** The web app (`apps/web`) has been fully refactored to use `@project-flame/lib`.
- **Deleted Files:** The following local files were deleted to prevent duplication:
  - `apps/web/app/lib/pricing.ts`
  - `apps/web/app/lib/utils/timezone.ts`
  - `apps/web/app/lib/validators/cedula.ts`
  - `apps/web/app/lib/utils/event-availability.ts`
- **Test Config:** `vitest.config.ts` in `apps/web` was updated to ignore CSS processing (PostCSS/Tailwind v4) during tests to prevent configuration errors.

#### Platform-Specific Code (What Stays in apps/web)

The mobile app is a **thin client** that uses shared logic from `packages/lib` and calls web API endpoints for server-side operations. Here's what each platform uses:

| Web-Specific Code                   | What Mobile Uses Instead                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `supabase/client.ts`                | `createSupabaseClient()` from `@project-flame/lib` with `EXPO_PUBLIC_SUPABASE_URL` |
| `supabase/server.ts`                | N/A - Mobile calls web API endpoints; all admin operations run on server           |
| `stripe/fees.ts` (`getEventMarkup`) | Calls `GET /api/events/:id` - markup data comes from API response                  |
| `hooks/*`                           | Mobile creates own hooks in `apps/mobile/hooks/` (React Native patterns)           |
| `email/*`                           | N/A - Backend sends emails via API; mobile just triggers via API calls             |
| `providers/*`                       | Mobile creates own providers in `apps/mobile/providers/`                           |
| `services/*`                        | Calls web API endpoints - services run on server                                   |

#### Environment Variables by Platform

| Purpose                | Web (Next.js)                        | Mobile (Expo)                             |
| ---------------------- | ------------------------------------ | ----------------------------------------- |
| Supabase URL           | `NEXT_PUBLIC_SUPABASE_URL`           | `EXPO_PUBLIC_SUPABASE_URL`                |
| Supabase Anon Key      | `NEXT_PUBLIC_SUPABASE_ANON_KEY`      | `EXPO_PUBLIC_SUPABASE_ANON_KEY`           |
| API Base URL           | N/A (same origin)                    | `EXPO_PUBLIC_API_URL` (points to web app) |
| Stripe Publishable Key | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`      |

> **Key Architecture:** Mobile never accesses the database directly for writes or admin operations. It always goes through the web API, which handles authentication, validation, and database operations with proper RLS/admin access.

#### Supabase Environments

| Environment      | Project ID                       | URL                                           | Purpose                                                  |
| ---------------- | -------------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| **Production**   | `PROD_SUPABASE_PROJECT_ID` (env)  | `PROD_SUPABASE_URL` (env)                      | **DO NOT TOUCH.** Live user data. Use env vars only.     |
| **Preview/Test** | `aqkovpwlorcjekaotagr`            | `https://aqkovpwlorcjekaotagr.supabase.co`    | Safe for running tests (`TEST_DATABASE_CONFIRMED=true`). |

---

## Phase 2: Design System Extraction (Completed)

**Date:** February 6, 2026
**Status:** Completed

### 1. Figma Design Extraction

Used the Figma MCP tools to extract design tokens from the Flame Final design file:

- **Figma Source:** `https://www.figma.com/design/XTTWqwDXeC8aPHG6RpEdQ2/Flame-Final`
- **Target Node:** `5478-4499` (Homepage)
- Extracted: color palette, typography scale (Poppins family), spacing system, border radii, and component patterns.

### 2. Shared Tailwind Configuration

Created `packages/ui/tailwind.config.js` as the centralized design token source:

```javascript
// packages/ui/tailwind.config.js — consumed as a Tailwind preset by apps
module.exports = {
  theme: {
    extend: {
      colors: {
        background: "#000B12",
        surface: "#08131A",
        card: "rgba(255,255,255,0.06)",
        "card-border": "rgba(255,255,255,0.3)",
        primary: { DEFAULT: "#FF0000", 900: "#CB0000" },
        dark: "#041C2B",
        "white-100": "#F9FBFE",
        // ... full palette in the file
      },
      fontFamily: {
        poppins: ["Poppins_400Regular"],
        "poppins-light": ["Poppins_300Light"],
        "poppins-medium": ["Poppins_500Medium"],
        "poppins-semibold": ["Poppins_600SemiBold"],
        "poppins-bold": ["Poppins_700Bold"],
      },
      borderRadius: { pill: "40px", card: "16px", badge: "12px" },
    },
  },
};
```

### 3. Mobile App Tailwind Integration

`apps/mobile/tailwind.config.js` uses the shared config as a Tailwind **preset**:

```javascript
const flamePreset = require("../../packages/ui/tailwind.config.js");

module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "../../packages/ui/src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset"), flamePreset],
};
```

### 4. Font Loading (Expo)

Configured Poppins font loading in `apps/mobile/app/_layout.tsx`:

- Uses `expo-font` with `@expo-google-fonts/poppins`.
- Loads 5 weights: Light (300), Regular (400), Medium (500), SemiBold (600), Bold (700).
- Shows loading indicator while fonts are loading.

### 5. Design System Rule

Created `.cursor/rules/flame-design-system.mdc` as a living document with:

- Full color token table
- Typography scale with NativeWind class mappings
- Spacing & border radius tokens
- Component conventions (location, naming, props)
- NativeWind patterns and screen structure template

---

## Phase 3: Component Library "Atoms" (Completed)

**Date:** February 6, 2026
**Status:** Completed

### Components Built

All components live in `packages/ui/src/components/` and are re-exported from `packages/ui/src/index.tsx`.

| Component         | File                | Purpose                                                  | Key Props                                                      |
| ----------------- | ------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| **FlameText**     | `FlameText.tsx`     | Typography primitive with Poppins weight support         | `weight`, `className`, `children`                              |
| **PillButton**    | `PillButton.tsx`    | Pill-shaped CTA button with outline/filled variants      | `label`, `variant`, `size`, `onPress`                          |
| **EventCard**     | `EventCard.tsx`     | Vertical event card with image, date badge, title, price | `imageUrl`, `date`, `title`, `location`, `price`, `currency`   |
| **CategoryPill**  | `CategoryPill.tsx`  | Circular category thumbnail with label                   | `imageUrl`, `label`, `onPress`                                 |
| **SectionHeader** | `SectionHeader.tsx` | Section title with optional "See All" action             | `title`, `actionLabel`, `onAction`                             |
| **FAQItem**       | `FAQItem.tsx`       | Expandable FAQ accordion item                            | `question`, `answer`, `isOpen`, `onToggle`                     |
| **SpotlightCard** | `SpotlightCard.tsx` | Full-width featured event card with gradient overlay     | `imageUrl`, `title`, `subtitle`, `location`, `date`, `onPress` |

### Component Conventions Established

- All accept `className?: string` for NativeWind overrides.
- PascalCase filenames matching component name.
- Icons via `@expo/vector-icons` (Ionicons, Feather, MaterialCommunityIcons).
- Images via React Native `Image` with `source={{ uri }}`.
- Exported types alongside components (e.g., `EventCardProps`).

---

## Phase 4: UI Design First - Mobile Screens (Weeks 3-4)

**Goal:** Build the UI for all remaining iOS app screens using the new design and shared components based strictly on Figma. **No functional logic (API calls, complex state) should be added in this phase.**

**Date Started:** February 6, 2026
**Date Completed:** February 18, 2026 (For Initial Screens)
**Status:** Completed Initial Screens, In Progress for Remaining

### Home Screen Implementation

#### Screen Sections Built

All section components live in `apps/mobile/components/home/`:

| Section               | File                    | Description                                         |
| --------------------- | ----------------------- | --------------------------------------------------- |
| **Header**            | `Header.tsx`            | Fixed transparent header with logo and auth buttons |
| **HeroCarousel**      | `HeroCarousel.tsx`      | Full-width image banner with overlay text and CTA   |
| **PartnerLogos**      | `PartnerLogos.tsx`      | Horizontal scrollable partner/sponsor logos         |
| **FeaturedEvents**    | `FeaturedEvents.tsx`    | Horizontal carousel of `EventCard` components       |
| **ExploreCategories** | `ExploreCategories.tsx` | Horizontal list of `CategoryPill` components        |
| **SpotlightSection**  | `SpotlightSection.tsx`  | Featured event with `SpotlightCard`                 |
| **UpcomingEvents**    | `UpcomingEvents.tsx`    | Vertical list of upcoming `EventCard` components    |
| **FAQSection**        | `FAQSection.tsx`        | Expandable FAQ accordion using `FAQItem`            |
| **Footer**            | `Footer.tsx`            | App footer with links and social icons              |

#### Screen Assembly

`apps/mobile/app/index.tsx` composes all sections:

```text
View (flex-1 bg-background)
  ├── Header (fixed overlay, z-10)
  └── ScrollView (flex-1)
      ├── GlowBlob x3 (absolute, pointerEvents="none" — Figma gradient ellipses)
      ├── HeroCarousel (starts behind header)
      ├── View (gap-[70px] — Figma section spacing)
      │   ├── PartnerLogos
      │   ├── FeaturedEvents
      │   ├── ExploreCategories
      │   ├── SpotlightSection
      │   ├── UpcomingEvents
      │   └── FAQSection
      └── Footer
```

#### Figma Fidelity Pass (Feb 6, 2026)

Compared implementation against Figma source (node `5478:4499`) and fixed:

1. **Icons:** Replaced all emoji/HTML entity placeholders with `@expo/vector-icons@15.0.3` (`Feather` for calendar, map-pin, bookmark, arrow-right; `Ionicons` for FAQ accordion +/x).
2. **Background gradients:** Added 3 `GlowBlob` components (semi-transparent red-toned circles) matching the Figma's radial gradient ellipses behind content.
3. **Color tokens:** Fixed `text-white` → `text-white-100` (`#F9FBFE`) across `SectionHeader`, `CategoryPill`, `Footer`, ensuring consistency with design system tokens.
4. **Typography:** Fixed `PartnerLogos` subtitle weight (was SemiBold, Figma specifies Regular).

#### Mock Data

`apps/mobile/data/mock.ts` contains typed mock data for all sections:

- Hero banners (title, subtitle, image URL, CTA)
- Partner logos (name, image URL)
- Featured events (image, date, title, location, price, currency)
- Categories (image, label)
- Spotlight event details
- FAQ items (question, answer)

> **Status (Mar 3, 2026):** All mock data replaced with real Supabase queries in Phase 5 (Feb–Mar 2026). `data/mock.ts` is no longer used by any screen.

### Expo SDK & Metro Configuration

#### SDK Version

- **Expo SDK 54** with React 19.1.0 and React Native 0.81.5.

#### Metro Bundler (`apps/mobile/metro.config.js`)

Critical configuration for pnpm monorepo compatibility:

```javascript
// 1. Watch monorepo root for packages/ui and packages/lib changes
config.watchFolders = [monorepoRoot];

// 2. Resolve from app-local node_modules first, then monorepo root
config.resolver.nodeModulesPaths = [
  appNodeModules,
  path.resolve(monorepoRoot, "node_modules"),
];

// 3. Pin singleton packages to apps/mobile copies
config.resolver.extraNodeModules = {
  react: path.resolve(appNodeModules, "react"),
  "react-native": path.resolve(appNodeModules, "react-native"),
  nativewind: path.resolve(appNodeModules, "nativewind"),
  "react-native-css-interop": path.resolve(appNodeModules, "react-native-css-interop"),
};

// 4. Remove duplicate peer symlinks from packages/*/node_modules at startup
// so Metro hierarchical lookup cannot resolve the wrong React copy first.
```

#### Troubleshooting Log (Phase 2-4)

1. **`Unable to resolve "react-native-css-interop/jsx-runtime"`**
   - _Cause:_ NativeWind v4 depends on `react-native-css-interop` but pnpm doesn't hoist transitive deps.
   - _Fix:_ Added `react-native-css-interop@0.2.1` as explicit dependency in `apps/mobile`.

2. **"Invalid hook call" / "Cannot read property 'useRef' of null"**
   - _Cause:_ Two React copies — `packages/ui` resolved React 19.1.4 while `apps/mobile` used 19.1.0.
   - _Fix:_ (a) Moved React-dependent packages to `peerDependencies` in `packages/ui`. (b) Added `extraNodeModules` singleton mapping and startup symlink cleanup in `metro.config.js`.  
   - _Important:_ `resolveRequest` alone was not sufficient because Metro hierarchical lookup runs first.

3. **"Metro is running in CI mode"**
   - _Cause:_ `CI=true` environment variable set in terminal.
   - _Impact:_ Hot reloading disabled but bundling still works. Set `CI=` to re-enable.

#### Stripe & Custom Dev Build (Required for Payments)

`@stripe/stripe-react-native` (v0.58) includes native modules and **does not work in Expo Go**. Developers must use a custom dev build:

- **Local:** `pnpm --filter @project-flame/mobile run ios` or `npx expo run:ios` (and `run:android`)
- **EAS:** `eas build --profile development` for a development build

Ensure `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set. The app gracefully degrades when Stripe is unavailable (e.g., Expo Go) — checkout is disabled and an alert is shown. Rebuild native code after any `@stripe/stripe-react-native` version change.

---

## Phase 5A: Audit Existing Logic Against Web (COMPLETE — Feb 24, 2026)

**Goal:** Review all already-integrated mobile logic against the web source-of-truth. These features were built before the Logic Porting Protocol was established and may have drift from the working web implementation.

**All audits follow the Web-to-Mobile Logic Porting Protocol** (see `project-flame-master.mdc` Section 9).

### Why This Phase Exists

During initial development, mobile hooks like `useCheckout.ts` and `useEventDetails.ts` were written as fresh implementations rather than methodical ports of the web code. While they call the same API endpoints and use the same shared lib functions, the glue code (state management, fee display, edge case handling) may diverge from the proven web patterns. PR reviewers flagged pricing/cents/checkout bugs that trace back to this drift.

### Audit Checklist

For each feature, the audit process is:
1. Read the corresponding web source files (see Reference Mapping Table in `docs/historico/project-migrations/IOS_MIGRATION.md` Section 7).
2. Compare mobile implementation line-by-line against web flow.
3. Fix any divergences: wrong parameters, missing edge cases, different calculation approaches, inconsistent error handling.
4. Attach Phase 5 PR Parity Gate evidence from `project-flame-master.mdc` Section 9.1 in the PR description.

| Feature | Mobile File | Web Source Files | Status |
| --- | --- | --- | --- |
| Event Details | `hooks/useEventDetails.ts` | `components/EventDetail.tsx`, `lib/hooks/useTicketAvailability.ts` | Complete (Feb 24 #188) |
| Checkout (PRIORITY) | `hooks/useCheckout.ts` | `components/EventDetail.tsx`, `components/modals/RsvpPaymentModal.tsx`, `components/StripePaymentForm.tsx`, `api/purchase/create-payment-intent/route.ts`, `lib/utils/purchase-calculations.ts`. **Legacy (do not use):** `components/StripePurchaseFlow.tsx` (token-based post-approval payment — inactive). | Complete (Feb 24 #190–#191) |
| Auth | `hooks/useSignInHandlers.ts` | `lib/auth.ts`, `lib/user-sync.ts` | Complete (Feb 24 #194) |

---

## Phase 5B: New Logic Integration (COMPLETE — Feb 25 – Mar 3, 2026)

**Goal:** Integrate logic for remaining screens, strictly following the Logic Porting Protocol.

Every mobile hook/function was ported from the corresponding web code. See `project-flame-master.mdc` Section 9 for the mandatory 7-step protocol, Section 9.1 for the PR Parity Gate, and `docs/historico/project-migrations/IOS_MIGRATION.md` Section 7 for the reference mapping table.

### Implementations (all complete)

| Feature | Mobile File | Web Source Files | Status |
| --- | --- | --- | --- |
| User Tickets | `hooks/useUserTickets.ts` | `components/UserDashboard.tsx`, `lib/orders.ts` | Done Feb 25 (#196) |
| User Profile | `hooks/useUserProfile.ts`, `hooks/useUserRole.ts` | `lib/users.ts`, `lib/roles.ts` | Done Feb 25 (#208) |
| Ticket QR Display | `app/ticket/[id].tsx` | `components/modals/TicketCodeModal.tsx`, `lib/orders.ts` | Done Feb 25 (#196) |
| Organizer Data | `hooks/useOrgEvents.ts`, `hooks/useOrgData.ts` | `components/organizer/DashboardView.tsx`, `api/organizer/data/route.ts` | Done Feb 27 (#271) |
| RSVP Management | `hooks/useRsvpManagement.ts` | `components/organizer/RsvpsView.tsx`, `components/RsvpManagement.tsx` | Done Feb 25 (#213) |
| QR Scanner | `hooks/useQRScanner.ts`, `app/scanner.tsx` | `components/QRScannerApp.tsx`, `lib/hooks/useQRScanner.ts` | Done Feb 26 (merged Mar 3) |
| Event CRUD | `hooks/useCreateEvent.ts`, `hooks/useUpdateEvent.ts` | `components/forms/CreateEventForm.tsx`, `api/events/route.ts` | Done Feb 26 (#247) |
| Stripe Connect | `hooks/useStripeConnect.ts` | `components/StripeConnectStatus.tsx`, `lib/stripe/connect.ts` | Done Feb 26 (#247) |
| Auth Flows | `hooks/useOptionalAuth.ts`, `hooks/useSignInHandlers.ts` | `lib/auth.ts`, `middleware.ts` | Done Mar 3 (#290) |

---

## Phase 6: Web Integration (Pending)

_Details will be added here upon completion._
