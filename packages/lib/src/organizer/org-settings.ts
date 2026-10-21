/**
 * Organization settings (Flame 2.0 "Settings → Organization"): the editable part of the public
 * profile. Same fields and limits as PATCH /api/organizations/[id] — instagram ≤ 30, city ≤ 100,
 * description ≤ 500. The name is not editable (it isn't in v1 or the API either).
 */
export const ORG_DESCRIPTION_MAX = 500;
export const ORG_CITY_MAX = 100;
export const ORG_INSTAGRAM_MAX = 30;

export interface OrgProfile {
  instagram_handle?: string | null;
  city?: string | null;
  description?: string | null;
}

export interface OrgForm {
  instagram: string;
  city: string;
  description: string;
}

export type OrgFormErrors = Partial<Record<keyof OrgForm, "instagram" | "tooLong">>;

export function orgFormFrom(p: OrgProfile | null | undefined): OrgForm {
  return { instagram: p?.instagram_handle ?? "", city: p?.city ?? "", description: p?.description ?? "" };
}

/** "@kora", "instagram.com/kora/", "https://www.instagram.com/kora?igsh=…" → "kora". */
export function normalizeInstagram(input: string): string {
  let v = input.trim();
  const url = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i.exec(v);
  if (url) v = url[1]!;
  return v.replace(/^@+/, "").trim();
}

const INSTAGRAM_RE = /^[A-Za-z0-9._]{1,30}$/;

export function validateOrgForm(f: OrgForm): OrgFormErrors {
  const errors: OrgFormErrors = {};
  const ig = normalizeInstagram(f.instagram);
  if (ig && !INSTAGRAM_RE.test(ig)) errors.instagram = "instagram";
  if (f.city.trim().length > ORG_CITY_MAX) errors.city = "tooLong";
  if (f.description.trim().length > ORG_DESCRIPTION_MAX) errors.description = "tooLong";
  return errors;
}

/** Body for PATCH /api/organizations/[id]: trimmed, empty → null. */
export function orgFormPayload(f: OrgForm): { instagram_handle: string | null; city: string | null; description: string | null } {
  const orNull = (v: string) => (v.trim() ? v.trim() : null);
  return { instagram_handle: orNull(normalizeInstagram(f.instagram)), city: orNull(f.city), description: orNull(f.description) };
}

/** Whether the form differs from what is saved (compared as it would be stored). */
export function orgFormDirty(saved: OrgForm, current: OrgForm): boolean {
  const a = orgFormPayload(saved);
  const b = orgFormPayload(current);
  return a.instagram_handle !== b.instagram_handle || a.city !== b.city || a.description !== b.description;
}

const ORG_IMAGE_PUBLIC_PREFIX = "/object/public/organization-images/";

/**
 * Storage path of an organization image from its public URL (what DELETE /api/upload-org-image
 * expects), or null if the URL isn't one of ours.
 */
export function orgImageStoragePath(publicUrl: string): string | null {
  try {
    const { pathname } = new URL(publicUrl);
    const at = pathname.indexOf(ORG_IMAGE_PUBLIC_PREFIX);
    if (at === -1) return null;
    const path = decodeURIComponent(pathname.slice(at + ORG_IMAGE_PUBLIC_PREFIX.length));
    return path.trim() ? path : null;
  } catch {
    return null;
  }
}

/** Same limits as /api/upload-org-image. */
export const ORG_LOGO_MAX_BYTES = 4.5 * 1024 * 1024;
export const ORG_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export function logoFileProblem(file: { size: number; type: string }): "type" | "size" | null {
  if (!(ORG_LOGO_TYPES as readonly string[]).includes(file.type.toLowerCase())) return "type";
  if (file.size > ORG_LOGO_MAX_BYTES) return "size";
  return null;
}

/** Logos: at least this many pixels per side (the hint promises 400×400). */
export const LOGO_MIN_SIDE = 400;
/** Bigger logos are scaled down before upload so the file stays small and the type is clean. */
export const LOGO_MAX_SIDE = 1024;

export function logoDimensionProblem(width: number, height: number): "tooSmall" | null {
  return Math.min(width, height) < LOGO_MIN_SIDE ? "tooSmall" : null;
}

/**
 * Size to re-encode the logo at: same aspect, longest side ≤ LOGO_MAX_SIDE but the short side kept
 * ≥ LOGO_MIN_SIDE (very long images stay sharp where it matters), never upscaled.
 */
export function logoTargetSize(width: number, height: number, max = LOGO_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, Math.max(max / Math.max(width, height), LOGO_MIN_SIDE / Math.min(width, height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
