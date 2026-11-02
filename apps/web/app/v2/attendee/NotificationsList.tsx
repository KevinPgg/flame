"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "../../lib/i18n";
import { Icon, type IconName } from "../components/Icon";
import { Skeleton } from "../components/Skeleton";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useMyNotifications, type WebNotification } from "./useMyNotifications";

const TYPE_ICON: Record<string, IconName> = {
  rsvp_pending: "clock",
  rsvp_approved: "check",
  rsvp_rejected: "close",
  ticket_received: "ticket",
  event_date_changed: "cal",
  event_reminder: "bell",
  new_rsvp_request: "rsvp",
  ticket_sold: "ticket",
  auth_expiry_warning: "alert",
  organization_approved: "check",
  organization_rejected: "close",
  team_invitation: "users",
};

/** "5 min ago", "yesterday", or a date — in the person's language. */
export function timeAgo(iso: string, locale: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.round((then - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  if (Math.abs(s) < 60) return rtf.format(0, "second");
  if (Math.abs(s) < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (Math.abs(s) < 86_400) return rtf.format(Math.round(s / 3600), "hour");
  if (Math.abs(s) < 7 * 86_400) return rtf.format(Math.round(s / 86_400), "day");
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(then));
}

/**
 * The notifications list with its actions (fase 2.1) — used by the bell's panel on a computer
 * and by the full page on a phone. Same rules as the app: "Clear all" asks first only when some
 * are unread. On a computer each row has its own delete button (the app swipes instead).
 */
export function NotificationsList({ heading, compact = false, onNavigate }: { heading: "h1" | "h2"; compact?: boolean; onNavigate?: () => void }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { query, notifications, unreadCount, markRead, remove } = useMyNotifications();
  const [confirmClear, setConfirmClear] = useState(false);
  const failed = markRead.isError || remove.isError;
  const H = heading;

  const open = (n: WebNotification) => {
    if (!n.read) markRead.mutate({ ids: [n.id] });
    if (n.href) {
      onNavigate?.();
      router.push(n.href);
    }
  };
  const clearAll = () => {
    setConfirmClear(false);
    remove.mutate({ all: true });
  };

  return (
    <section className="flex min-h-0 flex-col">
      <div className={`flex items-center gap-3 ${compact ? "px-4 pb-2 pt-4" : "pb-4"}`}>
        <H className={`flex-1 font-v2-display-bold tracking-[-0.03em] ${compact ? "text-[17px]" : "text-[26px]"}`}>{t("inbox.title")}</H>
        {unreadCount > 0 && (
          <button type="button" onClick={() => markRead.mutate({ all: true })} className="text-[12.5px] font-v2-ui-semibold text-v2-c90 hover:text-v2-cream">
            {t("inbox.markAllRead")}
          </button>
        )}
        {notifications.length > 0 && (
          <button
            type="button"
            onClick={() => (unreadCount > 0 ? setConfirmClear(true) : clearAll())}
            className="text-[12.5px] font-v2-ui-semibold text-v2-c50 hover:text-v2-cream"
          >
            {t("inbox.clearAll")}
          </button>
        )}
      </div>
      {failed && (
        <p role="alert" className={`pb-2 text-[12.5px] text-v2-errorText ${compact ? "px-4" : ""}`}>
          {remove.isError ? t("inbox.clearAllError") : t("inbox.actionError")}
        </p>
      )}

      {query.isLoading ? (
        <div className={`flex flex-col gap-2 ${compact ? "px-3 pb-3" : ""}`}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-v2-md" />
          ))}
        </div>
      ) : query.isError ? (
        <div className={`flex flex-col items-start gap-3 ${compact ? "px-4 pb-4" : ""}`}>
          <p className="text-[13.5px] text-v2-errorText">{t("inbox.loadError")}</p>
          <button type="button" onClick={() => void query.refetch()} className="rounded-v2-pill bg-v2-ink3 px-4 py-2 text-[13px] font-v2-ui-semibold">
            {t("common.retry")}
          </button>
        </div>
      ) : notifications.length === 0 ? (
        <div className={`flex flex-col items-center gap-2 py-12 text-center ${compact ? "px-6" : ""}`}>
          <span className="grid h-12 w-12 place-items-center rounded-full bg-v2-ink3 text-v2-c70">
            <Icon name="bell" size={20} />
          </span>
          <p className="text-[15px] font-v2-ui-semibold">{t("inbox.empty")}</p>
          <p className="max-w-[300px] text-[13px] text-v2-c50">{t("inbox.emptyHint")}</p>
        </div>
      ) : (
        <ul className={`flex flex-col ${compact ? "overflow-y-auto px-2 pb-2" : "gap-1"}`}>
          {notifications.map((n) => (
            <li key={n.id} className="group relative">
              <button
                type="button"
                onClick={() => open(n)}
                className={`flex w-full items-start gap-3 rounded-v2-md px-2 py-2.5 pr-10 text-left hover:bg-v2-ink3 ${n.href ? "" : "cursor-default"}`}
              >
                {n.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- event flyer thumbnail
                  <img src={n.image} alt="" width={44} height={44} loading="lazy" className="h-11 w-11 shrink-0 rounded-v2-sm object-cover" />
                ) : (
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-v2-sm bg-v2-ink3 text-v2-c90">
                    <Icon name={TYPE_ICON[n.type] ?? "bell"} size={18} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <b className={`truncate text-[14px] ${n.read ? "font-v2-ui-medium text-v2-c90" : "font-v2-ui-semibold text-v2-cream"}`}>{n.title}</b>
                    {!n.read && <span aria-label="unread" className="h-2 w-2 shrink-0 rounded-full bg-v2-flame" />}
                  </span>
                  <span className={`block text-[13px] leading-snug text-v2-c70 ${n.type === "organization_rejected" ? "" : "line-clamp-2"}`}>{n.body}</span>
                  <span className="mt-0.5 block text-[12px] text-v2-c50">{timeAgo(n.created_at, locale)}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => remove.mutate({ ids: [n.id] })}
                aria-label={`${t("inbox.remove")}: ${n.title}`}
                className="absolute right-2 top-2.5 grid h-8 w-8 place-items-center rounded-full text-v2-c50 opacity-100 hover:bg-v2-ink4 hover:text-v2-cream lg:opacity-0 lg:focus:opacity-100 lg:group-hover:opacity-100"
              >
                <Icon name="close" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmClear}
        message={t("inbox.clearAllTitle")}
        detail={t("inbox.clearAllUnread", { count: unreadCount })}
        confirmLabel={t("inbox.clearAll")}
        onConfirm={clearAll}
        onCancel={() => setConfirmClear(false)}
      />
    </section>
  );
}
