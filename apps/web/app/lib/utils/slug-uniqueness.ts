import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensures a slug is globally unique among PUBLISHED events, auto-appending a
 * short random suffix on collision.
 *
 * Why this exists:
 * - The public URL is /events/{slug} (no org prefix), so two published events
 *   with the same slug would make the page 404 (lookup uses .single()).
 * - A DB-level partial unique index (events_slug_unique_published) is the
 *   hard guarantee; this helper is the UX layer so organizers don't hit a
 *   23505 error — they transparently get a suffixed slug instead.
 *
 * Industry pattern: Eventbrite (...-tickets-{id}), Medium, dev.to, Linear all
 * combine human-readable slug + short stable suffix for globally-unique URLs.
 *
 * Within-org collisions (same org tries to create two events with the same
 * slug) are still rejected upstream as a UX signal to the organizer.
 */

const SUFFIX_LENGTH = 4; // 4 base36 chars ≈ 1.7M combinations; collision ~0
const MAX_ATTEMPTS = 5;

/**
 * Thrown when {@link ensureUniquePublishedSlug} cannot find a unique candidate
 * after {@link MAX_ATTEMPTS} random suffixes. Callers should treat this as a
 * transient/retryable condition (409), distinct from a hard DB failure (500).
 *
 * Probability in practice is ≈0 — 4-char base36 suffixes give ~1.7M combos, so
 * hitting this requires either adversarial seeding or a catastrophic RNG stall
 * — but surfacing a distinct code lets the API route give the user a clear
 * "try again" instead of a generic server error.
 */
export class ExhaustedSlugError extends Error {
  readonly code = "EXHAUSTED_SLUGS" as const;

  constructor(message: string) {
    super(message);
    this.name = "ExhaustedSlugError";
  }
}

// Mirrors the Zod schema cap in apps/web/app/api/events/route.ts. The DB
// column (varchar(255)) would accept longer values, but exceeding the input
// cap would break the "a slug you could have typed" invariant — any later
// validation that re-runs the 100-char check would reject the auto-suffixed
// slug. The base is truncated before the "-xxxx" suffix so the final slug is
// always ≤ MAX_SLUG_LENGTH.
const MAX_SLUG_LENGTH = 100;
const SUFFIX_OVERHEAD = 1 + SUFFIX_LENGTH; // 1 for the hyphen
const TRUNCATED_BASE_MAX = MAX_SLUG_LENGTH - SUFFIX_OVERHEAD;

function generateSuffix(): string {
  return Math.random().toString(36).slice(2, 2 + SUFFIX_LENGTH);
}

export async function ensureUniquePublishedSlug(
  desiredSlug: string,
  supabaseAdmin: SupabaseClient
): Promise<string> {
  const { data: collisions, error } = await supabaseAdmin
    .from("events")
    .select("id")
    .eq("slug", desiredSlug)
    .eq("status", "published")
    .limit(1);

  if (error) {
    throw new Error(`Failed to check slug uniqueness: ${error.message}`);
  }

  if (!collisions || collisions.length === 0) {
    return desiredSlug;
  }

  // Trim a trailing hyphen off the truncated base so we don't build slugs
  // like "foo-bar--a1b2" (ugly but functional) when the boundary falls on an
  // existing hyphen.
  let truncatedBase = desiredSlug
    .slice(0, TRUNCATED_BASE_MAX)
    .replace(/-+$/, "");

  // Defensive guard: a pathological input like "---" (or a long string of
  // only hyphens clipped to the boundary) would leave truncatedBase empty
  // here, producing candidates like "-a1b2" — visually broken, and starts
  // with a hyphen which most slug validators reject. Upstream Zod/toSlug
  // should never produce such an input, but we fall back to a fixed token
  // rather than trust that guarantee. "event" is the safe, generic default
  // already used elsewhere in the codebase for unnamed events.
  if (truncatedBase.length === 0) {
    truncatedBase = "event";
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = `${truncatedBase}-${generateSuffix()}`;
    const { data: suffixCollisions, error: suffixError } = await supabaseAdmin
      .from("events")
      .select("id")
      .eq("slug", candidate)
      .eq("status", "published")
      .limit(1);

    if (suffixError) {
      throw new Error(
        `Failed to check suffixed slug uniqueness: ${suffixError.message}`
      );
    }

    if (!suffixCollisions || suffixCollisions.length === 0) {
      return candidate;
    }
  }

  throw new ExhaustedSlugError(
    `Could not generate a unique slug after ${MAX_ATTEMPTS} attempts (base: ${desiredSlug})`
  );
}
