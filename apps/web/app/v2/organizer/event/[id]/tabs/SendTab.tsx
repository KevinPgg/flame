"use client";

import Link from "next/link";
import type { Event as OrganizerEvent } from "../../../../../lib/hooks/useOrganizerData";
import { useI18n } from "../../../../../lib/i18n";
import { Icon } from "../../../../components/Icon";
import { routes } from "../../../../lib/routes";

/** Send tickets (free / bank transfer) — next delivery; until then it opens the v1 tool. */
export default function SendTab({ event, slug }: { event: OrganizerEvent; slug: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-start gap-4 rounded-v2-card bg-v2-ink2 p-5">
      <p className="max-w-[560px] text-[14px] leading-relaxed text-v2-c70">{t("eventAdmin.send.intro")}</p>
      <Link
        href={routes.eventV1(event.id, slug)}
        className="inline-flex h-10 items-center gap-2 rounded-v2-pill bg-v2-cream px-4 text-[13px] font-v2-ui-semibold text-v2-ink"
      >
        <Icon name="send" size={15} />
        {t("eventAdmin.send.open")}
      </Link>
    </div>
  );
}
