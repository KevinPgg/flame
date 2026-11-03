/**
 * Edit profile (Flame 2.0, prototype ACTS.editProfile, 2026-11-02): name, Instagram, avatar colour
 * (when there's no photo) and photo. One set of rules for PATCH /api/me/profile and the screens.
 */
import { normalizeArtistInstagram } from "../organizer/lineup";

/** Prototype PROFILE_COLORS. */
export const PROFILE_COLORS = ["#E8553E", "#8A281C", "#2E2A4A", "#1B4D3E", "#5A3E1B", "#1B3A4D", "#4D1B3A", "#C9A3E8"] as const;
export const PROFILE_NAME_MAX = 50;

/** The image every new account gets (Clerk webhook) — shown as "no photo" so the colour applies. */
export function isDefaultProfileImage(url: string | null | undefined): boolean {
  return !url || /\/profile-images\/default\.(jpe?g|png)(\?|$)/i.test(url);
}

/** Photo to show, or null (→ initials on the avatar colour). */
export function profilePhoto(url: string | null | undefined): string | null {
  return isDefaultProfileImage(url) ? null : (url as string);
}

/** Up to two initials ("Kevin Palacios" → "KP"); falls back to the e-mail's first letter. */
export function profileInitials(name: string | null | undefined, email?: string | null): string {
  const n = (name ?? "").trim();
  const fromName = n.split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();
  return fromName || (email?.trim()[0] ?? "?").toUpperCase();
}

/** Stored colour, or a stable one from the palette (by name) when none was chosen. */
export function profileColor(stored: string | null | undefined, seed: string | null | undefined): string {
  if (stored && /^#[0-9A-Fa-f]{6}$/.test(stored)) return stored;
  const s = seed ?? "";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PROFILE_COLORS[h % PROFILE_COLORS.length]!;
}

export type ProfileForm = { first_name: string; last_name: string; instagram: string; avatar_color: string | null };
export type ProfileUpdate = { first_name: string; last_name: string | null; instagram: string | null; avatar_color: string | null };
export type ProfileErrorKey = "firstNameRequired" | "nameTooLong" | "instagramInvalid" | "colorInvalid";

/** Body of PATCH /api/me/profile (or the form) → clean values, or the error per field. */
export function validateProfile(input: unknown): { ok: true; value: ProfileUpdate } | { ok: false; errors: Partial<Record<keyof ProfileForm, ProfileErrorKey>> } {
  const b = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
  const errors: Partial<Record<keyof ProfileForm, ProfileErrorKey>> = {};
  const first = str(b.first_name);
  const last = str(b.last_name);
  if (!first) errors.first_name = "firstNameRequired";
  else if (first.length > PROFILE_NAME_MAX) errors.first_name = "nameTooLong";
  if (last.length > PROFILE_NAME_MAX) errors.last_name = "nameTooLong";
  const ig = normalizeArtistInstagram(typeof b.instagram === "string" ? b.instagram : "");
  if (ig === "invalid") errors.instagram = "instagramInvalid";
  const color = b.avatar_color == null || b.avatar_color === "" ? null : String(b.avatar_color).toUpperCase();
  if (color !== null && !(PROFILE_COLORS as readonly string[]).includes(color)) errors.avatar_color = "colorInvalid";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { first_name: first, last_name: last || null, instagram: ig === "invalid" ? null : ig, avatar_color: color } };
}

export function profileFormFrom(p: { first_name?: string | null; last_name?: string | null; instagram?: string | null; avatar_color?: string | null }): ProfileForm {
  return { first_name: p.first_name ?? "", last_name: p.last_name ?? "", instagram: p.instagram ?? "", avatar_color: p.avatar_color ?? null };
}
