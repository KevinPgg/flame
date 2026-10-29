/** Organizer logo tile; falls back to the initial on the dark surface. */
export function OrgAvatar({
  name,
  logoUrl,
  size = 52,
  round = false,
}: {
  name: string;
  logoUrl?: string | null;
  size?: number;
  round?: boolean;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-v2-ink3 ${round ? "rounded-full" : "rounded-v2-md"}`}
      style={{ width: size, height: size }}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- small logo; storage host differs per env
        <img style={{zIndex: 100}} src={logoUrl} alt="" width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        <span className="font-v2-display-bold" style={{ fontSize: Math.round(size * 0.42), zIndex: 100 }}>
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
    </span>
  );
}
