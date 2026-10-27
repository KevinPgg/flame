"use client";

/**
 * Flame 2.0 organizer profile on the web (fase 2.4). Prototype `SCREENS.org`: cover, big logo,
 * name, city and Instagram, share; the description; events in a grid (upcoming / past).
 * Followers and Follow are fase 4 (not shown).
 */
import { useState } from "react";
import type { PublicOrganizer } from "../../../../lib/organizer-public";
import type { HomeEvent } from "../../../../lib/home-events";
import { useI18n } from "../../../../lib/i18n";
import { LinkifiedText } from "../../../../lib/utils/linkify-text";
import { Icon } from "../../../components/Icon";
import { OrgAvatar } from "../../../components/OrgAvatar";
import { EventTile } from "../../EventTile";

const circle = "inline-flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(28,28,28,0.82)] text-v2-cream hover:bg-v2-ink4";

export default function OrganizerProfile({ org, upcoming, past }: { org: PublicOrganizer; upcoming: HomeEvent[]; past: HomeEvent[] }) {
  const { t } = useI18n();
  const [seg, setSeg] = useState<"up" | "past">("up");
  const [copied, setCopied] = useState(false);
  const ig = org.instagram_handle?.trim().replace(/^@+/, "") || "";
  const cover = org.cover_image_url || org.logo_url;
  const list = seg === "up" ? upcoming : past;

  const share = async () => {
    const url = `${window.location.origin}/organizer/${org.slug}`;
    try {
      if (typeof navigator.share === "function") return void (await navigator.share({ title: org.name, url }));
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* closed or not allowed */
    }
  };

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="relative h-[180px] overflow-hidden bg-v2-ink3 md:mx-8 md:mt-6 md:h-[240px] md:rounded-[20px]">
        {cover && (
          <div
            aria-hidden
            data-testid="org-cover"
            className={`absolute inset-0 bg-cover bg-center ${org.cover_image_url ? "" : "scale-125 blur-[40px] brightness-[.55]"}`}
            style={{ backgroundImage: `url("${cover}")` }}
          />
        )}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-black/80" />
        <div className="absolute right-3 top-3">
          <button type="button" onClick={() => void share()} aria-label={t("organizerPage.share", { name: org.name })} className={circle}>
            <Icon name="share" size={19} />
          </button>
        </div>
      </div>

      <div className="px-4 md:px-8">
        <div className="-mt-12 flex items-end gap-4">
          <span className="rounded-[22px] border-4 border-black">
            <OrgAvatar name={org.name} logoUrl={org.logo_url} size={96} />
          </span>
        </div>
        <h1 className="mt-3 font-v2-display-bold text-[32px] leading-[1.05] tracking-[-0.04em]">{org.name}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-v2-c70">
          {org.city && (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="pin" size={15} />
              {org.city}
            </span>
          )}
          {ig && (
            <a href={`https://instagram.com/${ig}`} target="_blank" rel="noreferrer" className="hover:text-v2-cream" aria-label={t("organizerPage.instagram", { handle: ig })}>
              @{ig}
            </a>
          )}
          <span>{t("organizerPage.eventsCount", { count: upcoming.length })}</span>
        </div>
        {copied && <p className="mt-1 text-[13px] text-v2-c70">{t("home.copied")}</p>}
        {org.description && (
          <p className="mt-4 max-w-[60ch] whitespace-pre-wrap text-[15px] leading-[1.5] text-v2-c90 [&_a]:underline">
            <LinkifiedText text={org.description} />
          </p>
        )}

        <div role="tablist" className="mb-5 mt-7 flex max-w-[360px] gap-1 rounded-v2-pill bg-[#1A1A1A] p-1">
          {(["up", "past"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={seg === k}
              onClick={() => setSeg(k)}
              className={`h-9 flex-1 rounded-v2-pill text-[14px] font-v2-ui-semibold ${seg === k ? "bg-v2-cream text-v2-ink" : "text-v2-c70 hover:text-v2-cream"}`}
            >
              {k === "up" ? t("organizerPage.upcoming") : t("organizerPage.past")}
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <div className="py-10 text-center">
            <p className="font-v2-display-bold text-[18px]">{t("organizerPage.noUpcoming")}</p>
            {seg === "up" && <p className="mt-1 text-[14px] text-v2-c70">{t("organizerPage.noUpcomingBody", { name: org.name })}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {list.map((e) => (
              <EventTile key={e.id} event={e} past={seg === "past"} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
