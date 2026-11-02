"use client";

/**
 * Flame 2.0 "You" on the web (fase 2.6). Prototype `SCREENS.profile` — one single profile (no
 * hosting/attending switch): photo, name, e-mail, Settings and Edit profile; counters; "My
 * organizers" with Manage (approved) or Under review, and New organizer (the v1 onboarding);
 * the organizer approvals entry for Flame support; Saved (fase 4.1: hearts, upcoming first, ended
 * ones dimmed after); Following (fase 4.2: counter + list with Follow/Following); past events
 * from your tickets.
 */
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { buildWallet, splitSavedEvents, walletDayTime } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { useUserProfile } from "../../../lib/hooks/useUserProfile";
import { useUserOrganizations } from "../../../lib/hooks/useOrganizations";
import { useUserTickets } from "../../../lib/hooks/useUserTickets";
import { useIsSupportAdmin, useAdminOrganizations } from "../../../lib/hooks/useAdminOrganizations";
import OnboardingModal from "../../../components/modals/OnboardingModal";
import { Icon } from "../../components/Icon";
import { OrgAvatar } from "../../components/OrgAvatar";
import { Skeleton } from "../../components/Skeleton";
import { routes } from "../../lib/routes";
import { EventTile } from "../EventTile";
import { useSavedEvents } from "../useSavedEvents";
import { useFollowing } from "../useFollowing";
import { FollowButton } from "../FollowButton";

const circle = "inline-flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(28,28,28,0.82)] text-v2-cream hover:bg-v2-ink4";

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-9">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-v2-display-bold text-[20px] tracking-[-0.02em]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function SupportEntry() {
  const { t } = useI18n();
  const { isAdmin, isLoading } = useIsSupportAdmin();
  const pending = useAdminOrganizations("pending", isAdmin);
  if (isLoading || !isAdmin) return null;
  const n = pending.data?.organizations.length ?? 0;
  return (
    <Link href={routes.supportQueue()} className="mt-3 flex items-center gap-3 rounded-[16px] bg-[#121212] p-3 hover:bg-[#181818]">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-v2-md bg-v2-ink3 text-v2-c90">
        <Icon name="check" size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-[15px] font-v2-ui-semibold">{t("supportQueue.entry")}</b>
        <small className="block text-[12.5px] text-v2-c50">{n > 0 ? t("supportQueue.entryHint", { count: n }) : t("supportQueue.entryNone")}</small>
      </span>
      <Icon name="chev" size={18} className="text-v2-c50" />
    </Link>
  );
}

export default function YouView() {
  const { t, locale } = useI18n();
  const profile = useUserProfile();
  const orgs = useUserOrganizations();
  const tickets = useUserTickets();
  const [newOrg, setNewOrg] = useState(false);
  const p = profile.profile;
  const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
  const list = orgs.data?.organizations ?? [];
  const past = useMemo(() => buildWallet(tickets.data?.tickets ?? []).past, [tickets.data?.tickets]);
  const attended = past.filter((w) => w.checkedIn > 0).length;
  const saved = useSavedEvents();
  const savedSplit = useMemo(() => splitSavedEvents(saved.events), [saved.events]);
  const savedCount = saved.events.length;
  const following = useFollowing();

  return (
    <div className="mx-auto max-w-[760px] px-4 pt-6 lg:pt-10">
      <div className="flex justify-end">
        <Link href="/v2/account" aria-label={t("userSettings.title")} className={circle}>
          <Icon name="settings" size={19} />
        </Link>
      </div>
      <div className="flex flex-col items-center text-center">
        {profile.isLoading && !p ? (
          <Skeleton className="h-[84px] w-[84px] rounded-full" />
        ) : (
          <span className="inline-flex h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-full bg-v2-ink3 text-[28px] font-v2-display-bold">
            {p?.profile_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- profile photo from storage
              <img src={p.profile_image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              (name[0] ?? p?.email?.[0] ?? "?").toUpperCase()
            )}
          </span>
        )}
        <h1 className="mt-3 font-v2-display-bold text-[28px] tracking-[-0.03em]">{name || p?.email || " "}</h1>
        {name && p?.email && <p className="text-[14px] text-v2-c50">{p.email}</p>}
        <div className="mt-5 flex gap-3">
          <a href="#following" className="min-w-[110px] rounded-[14px] bg-[#121212] px-4 py-2.5 hover:bg-[#181818]">
            <b className="block font-v2-display-bold text-[20px]">{following.orgs.length}</b>
            <span className="text-[12px] text-v2-c50">{t("follow.title")}</span>
          </a>
          <Link href="/account" className="min-w-[110px] rounded-[14px] bg-[#121212] px-4 py-2.5 hover:bg-[#181818]">
            <b className="block font-v2-display-bold text-[20px]">{attended}</b>
            <span className="text-[12px] text-v2-c50">{t("you.events")}</span>
          </Link>
          <a href="#my-organizers" className="min-w-[110px] rounded-[14px] bg-[#121212] px-4 py-2.5 hover:bg-[#181818]">
            <b className="block font-v2-display-bold text-[20px]">{list.length}</b>
            <span className="text-[12px] text-v2-c50">{t("you.organizers")}</span>
          </a>
        </div>
        <Link href="/v2/account" className="mt-4 inline-flex h-9 items-center rounded-v2-pill bg-v2-ink3 px-4 text-[13px] font-v2-ui-semibold hover:bg-v2-ink4">
          {t("you.editProfile")}
        </Link>
      </div>

      <Section title={t("you.myOrganizers")} aside={<span className="text-[13px] text-v2-c50">{list.length || ""}</span>}>
        <div id="my-organizers" className="flex flex-col gap-2">
          {orgs.isLoading && <Skeleton className="h-[72px] w-full rounded-[16px]" />}
          {list.map((o) =>
            o.approved ? (
              <Link key={o.id} href={`/organizer?org=${encodeURIComponent(o.slug)}`} className="flex items-center gap-3 rounded-[16px] bg-[#121212] p-3 hover:bg-[#181818]">
                <OrgAvatar name={o.name} logoUrl={o.logo_url} size={48} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[15px] font-v2-ui-semibold">{o.name}</b>
                  <small className="block text-[12.5px] text-v2-c50">{t("you.eventsCount", { count: o.eventCount })}</small>
                </span>
                <span className="inline-flex items-center gap-1 text-[13px] font-v2-ui-semibold text-v2-c90">
                  {t("you.manage")}
                  <Icon name="chev" size={15} />
                </span>
              </Link>
            ) : (
              <div key={o.id} className="flex items-center gap-3 rounded-[16px] bg-[#121212] p-3 opacity-70">
                <OrgAvatar name={o.name} logoUrl={o.logo_url} size={48} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[15px] font-v2-ui-semibold">{o.name}</b>
                  <small className="block text-[12.5px] text-v2-warn">{t("you.underReview")}</small>
                </span>
                <Icon name="clock" size={18} className="text-v2-c50" />
              </div>
            ),
          )}
          <button type="button" onClick={() => setNewOrg(true)} className="flex items-center gap-3 rounded-[16px] border border-dashed border-v2-c16 p-3 text-left hover:bg-[#121212]">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-v2-md bg-v2-ink3">
              <Icon name="plus" size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[15px] font-v2-ui-semibold">{t("you.newOrganizer")}</b>
              <small className="block text-[12.5px] text-v2-c50">{t("you.newOrganizerHint")}</small>
            </span>
          </button>
          <SupportEntry />
        </div>
      </Section>

      <Section title={t("saved.title")} aside={<span className="text-[13px] text-v2-c50">{savedCount || ""}</span>}>
        {saved.status === "loading" || saved.status === "idle" ? (
          <div className="flex gap-3">
            <Skeleton className="aspect-[4/5] w-[168px] rounded-[14px]" />
            <Skeleton className="aspect-[4/5] w-[168px] rounded-[14px]" />
          </div>
        ) : savedCount === 0 ? (
          <p className="text-[14px] text-v2-c50">{t("saved.empty")}</p>
        ) : (
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2" data-testid="saved-list">
            {savedSplit.upcoming.map((e) => (
              <div key={e.id} className="w-[168px] shrink-0 snap-start">
                <EventTile event={e} />
              </div>
            ))}
            {savedSplit.past.map((e) => (
              <div key={e.id} className="relative w-[168px] shrink-0 snap-start">
                <EventTile event={e} past save />
                <span className="absolute left-2 top-2 rounded-v2-pill bg-[rgba(0,0,0,0.6)] px-2 py-0.5 text-[10.5px] font-v2-ui-semibold text-v2-c90">
                  {t("saved.ended")}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={t("follow.title")} aside={<span className="text-[13px] text-v2-c50">{following.orgs.length || ""}</span>}>
        <div id="following">
          {following.status === "loading" || following.status === "idle" ? (
            <Skeleton className="h-[64px] w-full rounded-[16px]" />
          ) : following.orgs.length === 0 ? (
            <div className="rounded-[16px] bg-[#121212] p-4">
              <b className="block text-[15px] font-v2-ui-semibold">{t("follow.empty")}</b>
              <small className="mt-0.5 block text-[13px] text-v2-c50">{t("follow.emptyHint")}</small>
              <Link href="/discover" className="mt-3 inline-flex h-9 items-center rounded-v2-pill bg-v2-cream px-4 text-[13px] font-v2-ui-semibold text-v2-ink">
                {t("follow.find")}
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="following-list">
              {following.orgs.map((o) => (
                <li key={o.id} className="flex items-center gap-3 rounded-[16px] bg-[#121212] p-3">
                  <Link href={`/organizer/${o.slug}`} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80">
                    <OrgAvatar name={o.name} logoUrl={o.logo_url} size={48} />
                    <span className="min-w-0">
                      <b className="block truncate text-[15px] font-v2-ui-semibold">{o.name}</b>
                      <small className="block truncate text-[12.5px] text-v2-c50">
                        {[o.city, t("follow.followers", { count: following.followersOf(o.id, o.followers_count) })].filter(Boolean).join(" · ")}
                      </small>
                    </span>
                  </Link>
                  <FollowButton org={o} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section
        title={t("you.pastEvents")}
        aside={
          <Link href="/account" className="text-[13px] font-v2-ui-semibold underline hover:text-v2-c70">
            {t("you.history")}
          </Link>
        }
      >
        {past.length === 0 ? (
          <p className="text-[14px] text-v2-c50">{t("you.noPast")}</p>
        ) : (
          <div className="flex flex-col">
            {past.slice(0, 5).map((w) => (
              <Link key={w.event.id} href={`/account/ticket/${w.tickets[0]!.id}`} className="flex items-center gap-3 rounded-v2-md px-1 py-2.5 hover:bg-v2-ink2">
                <span className="block h-[60px] w-[48px] shrink-0 overflow-hidden rounded-[8px] bg-v2-ink3">
                  {w.event.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote flyer
                    <img src={w.event.image_url} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[15px] font-v2-ui-semibold">{w.event.name}</b>
                  <small className="block text-[13px] text-v2-c50">{walletDayTime(w.event.starts_at, w.event.timezone, locale).day}</small>
                  <small className="block truncate text-[13px] text-v2-c50">{w.event.venue}</small>
                </span>
                {w.checkedIn > 0 && <span className="rounded-v2-pill bg-v2-ink3 px-2.5 py-1 text-[12px] font-v2-ui-semibold text-v2-c90">{t("wallet.attended")}</span>}
              </Link>
            ))}
          </div>
        )}
      </Section>

      <OnboardingModal isOpen={newOrg} onClose={() => setNewOrg(false)} onSuccess={() => setNewOrg(false)} />
    </div>
  );
}
