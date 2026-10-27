"use client";

/** "More from {organizer}" under the purchase block (fase 2.4): other upcoming events of the org. */
import { useI18n } from "../../../../lib/i18n";
import type { HomeEvent } from "../../../../lib/home-events";
import { EventTile } from "../../EventTile";

export function MoreFromOrganizer({ organizer, events }: { organizer: string; events: HomeEvent[] }) {
  const { t } = useI18n();
  if (events.length === 0) return null;
  return (
    <section className="mx-auto mt-10 max-w-[800px] px-4">
      <h2 className="mb-4 font-v2-display-bold text-[22px] tracking-[-0.03em]">{t("event.moreFromOrganizer", { organizer })}</h2>
      <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3">
        {events.map((e) => (
          <EventTile key={e.id} event={e} />
        ))}
      </div>
    </section>
  );
}
