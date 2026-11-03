import { profileColor, profileInitials } from "@project-flame/lib";

/** The person's avatar: photo, or initials on their colour (Edit profile, 2026-11-02). */
export function ProfileAvatar({ name, email, photo, color, size = 84 }: { name: string; email?: string | null; photo: string | null; color: string | null; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-v2-display-bold text-v2-cream"
      style={{ width: size, height: size, fontSize: Math.round(size / 3), backgroundColor: photo ? undefined : profileColor(color, name || email) }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- profile photo from storage
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : (
        profileInitials(name, email)
      )}
    </span>
  );
}
