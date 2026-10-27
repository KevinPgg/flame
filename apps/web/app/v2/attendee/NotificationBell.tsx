"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "../../lib/i18n";
import { Icon } from "../components/Icon";
import { Badge } from "../components/Badge";
import { useMyNotifications } from "./useMyNotifications";
import { NotificationsList } from "./NotificationsList";

/**
 * No display class here: each bell sets its own (`inline-flex lg:hidden` / `hidden lg:inline-flex`).
 * With `inline-flex` in the shared classes the panel bell's `hidden` lost on phones and both
 * bells showed (Kevin 2026-10-27).
 */
const circle = "relative h-10 w-10 items-center justify-center rounded-full bg-[rgba(28,28,28,0.82)] text-v2-cream hover:bg-v2-ink4";

/**
 * Bell (fase 2.1, decision 2026-10-27: adapted to a computer, not a copy of the app). On a wide
 * screen it opens a panel under the bell (closes on Esc, outside click or when a notification is
 * opened); on a phone it is a link to the full page (/notifications).
 */
export function NotificationBell() {
  const { t } = useI18n();
  const { unreadCount } = useMyNotifications();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const label = unreadCount > 0 ? `${t("inbox.title")}, ${t("inbox.unread", { count: unreadCount })}` : t("inbox.title");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const badge = unreadCount > 0 && (
    <span className="absolute -right-1 -top-1">
      <Badge n={unreadCount} />
    </span>
  );

  return (
    <div ref={box} className="relative">
      <Link href="/notifications" aria-label={label} className={`${circle} inline-flex lg:hidden`}>
        <Icon name="bell" size={19} />
        {badge}
      </Link>
      <button type="button" aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)} className={`${circle} hidden lg:inline-flex`}>
        <Icon name="bell" size={19} />
        {badge}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t("inbox.title")}
          className="absolute right-0 top-12 z-40 flex max-h-[min(72vh,620px)] w-[400px] flex-col overflow-hidden rounded-v2-card border border-v2-c10 bg-v2-ink2 shadow-[0_18px_40px_rgba(0,0,0,0.6)]"
        >
          <NotificationsList heading="h2" compact onNavigate={() => setOpen(false)} />
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="border-t border-v2-c10 px-4 py-3 text-center text-[13px] font-v2-ui-semibold text-v2-c90 hover:text-v2-cream"
          >
            {t("inbox.seeAll")}
          </Link>
        </div>
      )}
    </div>
  );
}
