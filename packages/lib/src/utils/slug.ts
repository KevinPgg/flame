/**
 * URL slug utilities for events and other entities.
 * Matches web behavior in CreateEventForm.tsx and API validation.
 */

/**
 * Generate a URL-safe slug from a display name.
 * Used for event URLs; matches web CreateEventForm generateSlug.
 *
 * @param name - Display name (e.g., "Summer Music Festival 2025")
 * @returns Slug (e.g., "summer-music-festival-2025")
 */
export function generateSlug(name: string): string {
  if (!name || typeof name !== "string") return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
