# Maintenance Mode & User Testing Access

**Last Updated**: January 21, 2026

## Overview

The Maintenance Mode feature allows administrators to temporarily block public access to the main website (homepage, event listings) while keeping critical dashboard functionality operational for organizers and admins. It also includes a "User Testing Access" backdoor to allow specific users to bypass the block for testing purposes.

## Configuration

The feature is controlled by environment variables in `.env.local` (or Vercel project settings):

| Variable | Value | Description |
| :--- | :--- | :--- |
| `MAINTENANCE_MODE` | `true` or `false` | Enables or disables the maintenance redirection. |
| `UTESTINGA` | `[SECRET_CODE]` | The access code required to bypass maintenance mode (e.g., `flameUser26`). |

## How It Works

### 1. Middleware Protection (`middleware.ts`)

When `MAINTENANCE_MODE=true`, the middleware intercepts all requests.

*   **Blocked Routes**: Public pages like `/`, `/events`, `/about-flame` are redirected to `/maintenance`.
*   **Exempt Routes**:
    *   `/maintenance` (The landing page itself)
    *   `/organizer/*` (Organizer dashboard)
    *   `/admin/*` (Admin dashboard)
    *   `/account/*` (User account management)
    *   `/sign-in/*`, `/sign-up/*` (Authentication)
    *   `/api/*` (API endpoints)
    *   Static assets (images, fonts, etc.)

### 2. User Testing Access (Bypass)

To allow stakeholders or testers to view the site normally during maintenance:

1.  Navigate to the `/maintenance` page.
2.  Click the small **"User testing Access"** link below the "Go to Dashboard" button.
3.  Enter the secret code configured in `UTESTINGA`.
4.  Click **Enter**.

**Mechanism**:
*   The code is verified via `/api/verify-testing-code`.
*   If correct, a secure HTTP-only cookie named `user_testing_access` is set.
*   This cookie is valid for **7 days**.
*   The middleware checks for this cookie; if present, it allows full access to all routes, effectively bypassing maintenance mode for that user.

## Implementation Details

*   **Page**: `app/maintenance/page.tsx` - Displays the maintenance message and the hidden input form.
*   **API**: `app/api/verify-testing-code/route.ts` - Validates the code and sets the cookie.
    *   **Rate Limiting**: Implements an in-memory rate limiter (5 attempts per minute per IP) to prevent brute-force attacks.
*   **Middleware**: `middleware.ts` - Handles the redirection logic based on env vars and cookies.
