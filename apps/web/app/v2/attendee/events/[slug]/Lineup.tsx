"use client";

/**
 * Line-up on the event page (fase 4.3, prototype `x-artists`): a row of square artist tiles with
 * their links. No photos yet: the tile shows the initials on a tone picked from the name.
 */
import { artistInitials, artistLinks, parseLineup } from "@project-flame/lib";
import { useI18n } from "../../../../lib/i18n";

const TONES = ["#2A1A1F", "#1B2230", "#26211A", "#1C2722", "#2A2033", "#30201A"];
const tone = (name: string) => TONES[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % TONES.length]!;
const SERVICE = { instagram: "Instagram", spotify: "Spotify", soundcloud: "SoundCloud" } as const;

/** Small, simple marks (not the brands' logos): camera, sound arcs, cloud. */
function Mark({ kind }: { kind: keyof typeof SERVICE }) {
  const common = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (kind === "instagram")
    return (
      <svg {...common}>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
      </svg>
    );
  if (kind === "spotify")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M7.5 9.5c3-1 6.5-.7 9 .8M8 12.6c2.5-.7 5.3-.4 7.4.8M8.6 15.4c2-.5 4-.3 5.6.6" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M7 18h10.5a3.5 3.5 0 0 0 .4-7A5.5 5.5 0 0 0 7.4 9.6 4.2 4.2 0 0 0 7 18z" />
    </svg>
  );
}

export function Lineup({ lineup }: { lineup: unknown }) {
  const { t } = useI18n();
  const artists = parseLineup(lineup);
  if (artists.length === 0) return null;
  return (
    <section className="mx-auto mt-8 max-w-[800px] px-4" aria-labelledby="lineup-title">
      <div className="mb-4 h-px bg-[#1C1C1C]" />
      <h3 id="lineup-title" className="mb-3 font-v2-display-bold text-[20px] tracking-[-0.02em]">
        {t("event.lineup")}
      </h3>
      <ul className="-mx-4 flex snap-x gap-3.5 overflow-x-auto px-4 pb-1">
        {artists.map((a, i) => (
          <li key={`${a.name}-${i}`} className="w-[112px] shrink-0 snap-start">
            <div
              aria-hidden
              className="flex h-[112px] w-[112px] items-center justify-center rounded-[12px] font-v2-display-bold text-[30px] tracking-[-0.02em] text-v2-cream/90"
              style={{ background: `linear-gradient(145deg, ${tone(a.name)}, #0E0E0E)` }}
            >
              {artistInitials(a.name)}
            </div>
            <b className="mt-2 block line-clamp-2 text-[13.5px] font-v2-ui-semibold leading-[1.2]">{a.name}</b>
            {artistLinks(a).length > 0 && (
              <div className="mt-1.5 flex gap-1.5">
                {artistLinks(a).map((l) => (
                  <a
                    key={l.kind}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t("event.artistOn", { name: a.name, service: SERVICE[l.kind] })}
                    className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#1C1C1C] text-v2-cream hover:bg-v2-ink4"
                  >
                    <Mark kind={l.kind} />
                  </a>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
