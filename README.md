# Flame

**Extraordinary Moments that define New Standards**

Flame is a premier digital ticketing platform connecting event organizers with attendees in Ecuador. Discover, book, and purchase tickets for concerts, festivals, workshops, and more events through our secure, easy-to-use platform.

## About

Flame provides a comprehensive solution for the event ticketing ecosystem in Ecuador. Whether you're an event organizer looking to sell tickets or an attendee searching for your next great experience, Flame offers tools and features designed to make the process seamless and secure.

### Key Features

- **Event Discovery**: Browse featured events, explore event catalogs, and find events that match your interests
- **Ticket Management**: Purchase tickets with multiple payment options, manage your ticket collection, and receive digital tickets via email
- **Organizer Dashboard**: Create and manage events, track sales, manage RSVPs, and handle promotional codes and tickets
- **QR Code Integration**: Secure ticket verification and check-in using QR code scanning
- **Payment Processing**: Secure payments via Stripe Connect with fee-on-top pricing
- **RSVP Management**: Handle both free and paid RSVPs with comprehensive management tools
- **Promotional Features**: Create promotional codes and promotional tickets to boost event attendance
- **User Authentication**: Secure authentication and authorization with role-based access control

## Architecture

Flame is a **Turborepo monorepo** containing a web app, a mobile app, and shared packages, all backed by a single Supabase project.

- **`apps/web`** — Next.js 15 (App Router) web application.
- **`apps/mobile`** — Expo (React Native) iOS/Android application.
- **`packages/lib`** — Shared business logic, types, pricing, and validators.
- **`packages/ui`** — Shared UI components (NativeWind / Tailwind).
- **`packages/config`** — Shared TSConfig / ESLint config.
- **`supabase/`** — Database migrations and config (shared by both apps).

## Tech Stack

- **Monorepo**: Turborepo + pnpm workspaces
- **Web**: Next.js 15, React 19, Tailwind CSS
- **Mobile**: Expo (React Native), Expo Router, NativeWind
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Authentication**: Clerk
- **Payments**: Stripe Connect (Datafast is a legacy, deprecated gateway)
- **State/Data**: TanStack Query (React Query)
- **Email**: Brevo
- **Monitoring**: Sentry

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- Supabase account + project
- Clerk account (authentication)
- Stripe account (payments)
- For mobile: Xcode (iOS) and/or Android Studio, plus the Expo tooling

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd project-flame
```

2. Install all workspace dependencies from the repo root:

```bash
pnpm install
```

3. Set up environment variables. Each app has its own `.env.example` — copy it and fill in real values (secrets are shared out-of-band, never committed):

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

4. Set up the database:
   Apply the migrations in `supabase/migrations/` to your Supabase project (via the Supabase CLI or dashboard).

5. Start development:

```bash
# Web (from repo root — runs the Turborepo dev pipeline)
pnpm dev
# → http://localhost:3000

# Mobile (in a separate terminal)
cd apps/mobile
pnpm start
```

### Mobile notes

Mobile is an independent Supabase client that reuses `packages/lib`. It calls the web API only for operations needing server secrets (Stripe, email). See `docs/project-migrations/IOS_MIGRATION.md` for the full mobile architecture and setup.

## Scripts (repo root)

- `pnpm dev` — Start the Turborepo dev pipeline (web)
- `pnpm build` — Build all apps/packages
- `pnpm lint` — Lint all workspaces
- `pnpm format` — Prettier format across the repo

Web-specific test scripts (run inside `apps/web`): `pnpm test`, `pnpm test:run`, `pnpm test:ui`. See `docs/testing/` for the testing guide.

## Project Structure

```
apps/
  web/            # Next.js web app (app/ router, API routes, components)
  mobile/         # Expo React Native app
packages/
  lib/            # Shared logic, types, pricing, validators
  ui/             # Shared UI components
  config/         # Shared TSConfig / ESLint
supabase/
  migrations/     # Database schema migrations
docs/             # Project documentation (see docs/README.md)
```

## Known Production Gotchas

### `www` vs non-www API URLs (recurring issue)

**Always use `https://www.flme.co` as the canonical API URL — never `https://flme.co`.**

Vercel's primary domain for this project is `www.flme.co`. Requests to `https://flme.co` receive a `307 Temporary Redirect` to `https://www.flme.co`. The `fetch()` API (per spec) strips the `Authorization: Bearer` header when following a redirect to a different hostname — even on a 307. This causes all authenticated mobile API calls to return 401 ("Your session has expired"), because `auth()` in the Next.js route handlers never receives the Clerk JWT.

This has caused issues in multiple places (Clerk webhooks, EAS production builds). The rule is simple:

| Context | Correct value |
| --- | --- |
| `apps/mobile/eas.json` — `EXPO_PUBLIC_API_URL` | `https://www.flme.co` |
| `apps/mobile/eas.json` — `EXPO_PUBLIC_APP_URL` | `https://www.flme.co` |
| Clerk Dashboard — JWT template / redirect URLs | `https://www.flme.co` |
| Stripe webhooks | `https://www.flme.co/api/...` |
| Any external service callback URL | `https://www.flme.co/...` |

Local dev is unaffected (hits `localhost:3000` directly). The symptom in TestFlight is every authenticated action returns "Your session has expired" immediately after sign-in.

## License

Private project - All rights reserved
