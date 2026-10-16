"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isLikelyEmail, normalizeEmail, personName } from "@project-flame/lib";
import type { Event as OrganizerEvent } from "../../../../../lib/hooks/useOrganizerData";
import { useI18n } from "../../../../../lib/i18n";
import { Icon } from "../../../../components/Icon";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { ErrorBox } from "../../../../components/ErrorBox";
import { Skeleton } from "../../../../components/Skeleton";
import { routes } from "../../../../lib/routes";

type Scanner = { id: string; user_id: string; email: string | null; first_name: string | null; last_name: string | null };

/**
 * Who scans this event at the door (decision 2026-10-16): every member of the organization (and
 * co-hosts) by default, plus anyone designated here by the e-mail of their Flame account.
 */
export default function ScannersTab({
  event,
  organizationName,
  canEdit,
}: {
  event: OrganizerEvent;
  organizationName: string;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const key = ["event-scanners", event.id];
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Scanner | null>(null);

  const list = useQuery<{ scanners: Scanner[] }>({
    queryKey: key,
    enabled: canEdit,
    queryFn: async () => {
      const res = await fetch(`/api/organizer/events/${event.id}/scanners`);
      if (!res.ok) throw new Error(`scanners ${res.status}`);
      return res.json();
    },
  });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isLikelyEmail(email)) return setError(t("scanners.invalidEmail"));
    setBusy(true);
    try {
      const res = await fetch(`/api/organizer/events/${event.id}/scanners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizeEmail(email) }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { code?: string; error?: string } | null;
        setError(
          json?.code === "NOT_FOUND"
            ? t("scanners.notFound")
            : json?.code === "ALREADY_MEMBER"
              ? t("scanners.alreadyMember")
              : json?.code === "ALREADY_SCANNER"
                ? t("scanners.alreadyScanner")
                : res.status < 500 && json?.error
                  ? json.error
                  : t("errors.generic")
        );
        return;
      }
      setEmail("");
      await queryClient.invalidateQueries({ queryKey: key });
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/organizer/events/${event.id}/scanners?scannerId=${encodeURIComponent(removing.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setRemoving(null);
      await queryClient.invalidateQueries({ queryKey: key });
    } catch {
      setError(t("errors.generic"));
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  };

  const name = (s: Scanner) => personName({ first_name: s.first_name, last_name: s.last_name, email: s.email ?? "—" });

  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-v2-card bg-v2-ink2 p-4 sm:flex-row sm:items-center sm:p-5">
        <Icon name="scan" size={22} className="shrink-0 text-v2-c70" />
        <p className="flex-1 text-[14px] leading-relaxed text-v2-c70">{t("scanners.lede", { org: organizationName })}</p>
        <Link
          href={routes.scanner(event.id)}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-v2-pill bg-v2-cream px-4 text-[13px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper"
        >
          {t("scanners.openScanner")}
        </Link>
      </div>

      {!canEdit ? (
        <p className="text-[13px] text-v2-c50">{t("scanners.readOnly")}</p>
      ) : (
        <>
          <form onSubmit={add} noValidate className="flex flex-col gap-2">
            <label htmlFor="sc-email" className="text-[12.5px] text-v2-c70">
              {t("scanners.emailLabel")}
            </label>
            <div className="flex gap-2">
              <input
                id="sc-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder={t("scanners.emailPlaceholder")}
                autoComplete="off"
                className="h-11 min-w-0 flex-1 rounded-v2-md bg-v2-ink3 px-4 text-[14px] text-v2-cream placeholder:text-v2-c50 focus:outline-none focus:ring-1 focus:ring-v2-c30"
              />
              <button
                type="submit"
                disabled={busy || !email.trim()}
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-v2-pill bg-v2-cream px-4 text-[14px] font-v2-ui-semibold text-v2-ink disabled:opacity-50"
              >
                <Icon name="plus" size={16} strokeWidth={2.2} />
                {busy && !removing ? t("scanners.adding") : t("scanners.add")}
              </button>
            </div>
            {error && <p role="alert" className="text-[13px] text-v2-errorText">{error}</p>}
          </form>

          <div>
            <h3 className="mb-2 text-[12px] font-v2-ui-semibold uppercase tracking-[0.06em] text-v2-c50">{t("scanners.listTitle")}</h3>
            {list.isError ? (
              <ErrorBox onRetry={() => void list.refetch()} />
            ) : list.isLoading ? (
              <Skeleton className="h-16 rounded-v2-card" />
            ) : (list.data?.scanners ?? []).length === 0 ? (
              <p className="rounded-v2-card bg-v2-ink2 px-4 py-8 text-center text-[14px] text-v2-c50">{t("scanners.none")}</p>
            ) : (
              <ul className="divide-y divide-v2-c06 overflow-hidden rounded-v2-card bg-v2-ink2">
                {(list.data?.scanners ?? []).map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[14px] font-v2-ui-semibold">{name(s)}</b>
                      {s.email && <small className="block truncate text-[12.5px] text-v2-c50">{s.email}</small>}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRemoving(s)}
                      aria-label={`${t("scanners.remove")} ${name(s)}`}
                      className="inline-flex h-9 items-center rounded-v2-pill px-3 text-[13px] font-v2-ui-semibold text-v2-errorText hover:bg-v2-ink3"
                    >
                      {t("scanners.remove")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={removing !== null}
        message={removing ? t("scanners.removeConfirm", { name: name(removing) }) : ""}
        detail={t("scanners.removeDetail")}
        confirmLabel={t("scanners.remove")}
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
