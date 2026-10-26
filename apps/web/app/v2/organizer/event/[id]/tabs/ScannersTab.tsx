"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isValidAccessCode, normalizeAccessCode, normalizeEmail, personName } from "@project-flame/lib";
import type { Event as OrganizerEvent } from "../../../../../lib/hooks/useOrganizerData";
import { useI18n } from "../../../../../lib/i18n";
import { PeoplePicker, type Person } from "../../../../components/PeoplePicker";
import { Icon } from "../../../../components/Icon";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { ErrorBox } from "../../../../components/ErrorBox";
import { Skeleton } from "../../../../components/Skeleton";

type Scanner = { id: string; user_id: string; email: string | null; first_name: string | null; last_name: string | null };

/**
 * Who scans this event at the door (decisions 2026-10-16). Scanning itself happens only in the
 * phone app; the web just configures it. Two separate ways in:
 *  1. Accounts: every member of the organization (and co-hosts) by default, plus anyone designated
 *     here by the e-mail of their Flame account.
 *  2. Access code: a phone without an account enters the event's code in the app (owner/admin).
 */
export default function ScannersTab({
  event,
  organization,
  organizationName,
  canEdit,
  canManageCode,
  onCodeChanged,
}: {
  event: OrganizerEvent;
  organization: { id: string; name: string };
  organizationName: string;
  canEdit: boolean;
  canManageCode: boolean;
  onCodeChanged?: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const key = ["event-scanners", event.id];
  // Restricted people search (10-23); remounting the picker clears it after adding.
  const [pickerKey, setPickerKey] = useState(0);
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

  const add = async (person: Person) => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/organizer/events/${event.id}/scanners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizeEmail(person.email) }),
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
      setPickerKey((k) => k + 1);
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
    <div className="flex max-w-[720px] flex-col gap-7">
      <div className="flex items-start gap-3 rounded-v2-card bg-v2-ink2 p-4 sm:items-center sm:p-5">
        <Icon name="scan" size={22} className="shrink-0 text-v2-c70" />
        <p className="flex-1 text-[14px] leading-relaxed text-v2-c70">{t("scanners.appOnly")}</p>
      </div>

      <section aria-labelledby="sc-accounts" className="flex flex-col gap-4">
      <div>
        <h2 id="sc-accounts" className="text-[17px] font-v2-ui-semibold">{t("scanners.accountsTitle")}</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-v2-c70">{t("scanners.lede", { org: organizationName })}</p>
      </div>
      {!canEdit ? (
        <p className="text-[13px] text-v2-c50">{t("scanners.readOnly")}</p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <PeoplePicker key={pickerKey} id="sc-person" organization={organization} value={null} onChange={(p) => p && void add(p)} disabled={busy} />
            {busy && !removing && <p className="text-[13px] text-v2-c50">{t("scanners.adding")}</p>}
            {error && <p role="alert" className="text-[13px] text-v2-errorText">{error}</p>}
          </div>

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
      </section>

      <AccessCodeSection
        eventId={event.id}
        initialCode={event.qr_scanner_code ?? null}
        canManage={canManageCode}
        onChanged={onCodeChanged}
      />

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

type CodeConfirm = "regenerate" | "remove" | null;

/** The event's access code, separate from accounts: show, copy, create, replace, choose, remove. */
function AccessCodeSection({
  eventId,
  initialCode,
  canManage,
  onChanged,
}: {
  eventId: string;
  initialCode: string | null;
  canManage: boolean;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState<string | null>(initialCode);
  const [custom, setCustom] = useState<string | null>(null); // null = not editing
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<CodeConfirm>(null);
  const [copied, setCopied] = useState(false);

  const send = async (body: Record<string, unknown>) => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/organizer/events/${eventId}/scanner-code`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { code?: string | null; error?: string } | null;
      if (!res.ok) {
        setError(
          json?.code === "CODE_TAKEN" ? t("scanners.codeTaken") : json?.code === "INVALID" ? t("scanners.codeInvalid") : t("errors.generic")
        );
        return false;
      }
      setCode(json?.code ?? null);
      setCopied(false);
      onChanged?.();
      return true;
    } catch {
      setError(t("errors.generic"));
      return false;
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const saveCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = normalizeAccessCode(custom ?? "");
    if (!isValidAccessCode(value)) return setError(t("scanners.codeInvalid"));
    if (await send({ action: "set", code: value })) setCustom(null);
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* clipboard blocked: the code is on screen anyway */
    }
  };

  const ghost =
    "inline-flex h-10 items-center gap-2 rounded-v2-pill bg-v2-ink3 px-4 text-[13.5px] font-v2-ui-semibold text-v2-c90 hover:bg-v2-ink4 disabled:opacity-50";
  const primary =
    "inline-flex h-10 items-center gap-2 rounded-v2-pill bg-v2-cream px-4 text-[13.5px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper disabled:opacity-50";

  return (
    <section aria-labelledby="sc-code" className="flex flex-col gap-4">
      <div>
        <h2 id="sc-code" className="text-[17px] font-v2-ui-semibold">{t("scanners.codeTitle")}</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-v2-c70">{t("scanners.codeLede")}</p>
      </div>

      {!canManage ? (
        <p className="text-[13px] text-v2-c50">{t("scanners.codeReadOnly")}</p>
      ) : (
        <div className="flex flex-col gap-4 rounded-v2-card bg-v2-ink2 p-4 sm:p-5">
          {code ? (
            <div className="flex flex-wrap items-center gap-3">
              <span
                data-testid="access-code"
                className="rounded-v2-md bg-v2-ink3 px-4 py-2 font-mono text-[26px] font-semibold tracking-[0.18em] text-v2-cream"
              >
                {code}
              </span>
              <button type="button" onClick={() => void copy()} className={ghost}>
                <Icon name={copied ? "check" : "copy"} size={16} />
                {copied ? t("scanners.codeCopied") : t("scanners.codeCopy")}
              </button>
            </div>
          ) : (
            <p className="text-[14px] text-v2-c70">{t("scanners.codeNone")}</p>
          )}

          {custom !== null ? (
            <form onSubmit={saveCustom} noValidate className="flex flex-col gap-2">
              <label htmlFor="sc-code-input" className="text-[12.5px] text-v2-c70">
                {t("scanners.codeCustomLabel")}
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="sc-code-input"
                  value={custom}
                  onChange={(e) => {
                    setCustom(e.target.value.toUpperCase());
                    setError(null);
                  }}
                  maxLength={12}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="h-11 w-[180px] rounded-v2-md bg-v2-ink3 px-4 font-mono text-[16px] tracking-[0.12em] text-v2-cream focus:outline-none focus:ring-1 focus:ring-v2-c30"
                />
                <button type="submit" disabled={busy || !custom.trim()} className={primary}>
                  {busy ? t("scanners.codeSaving") : t("scanners.codeSave")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustom(null);
                    setError(null);
                  }}
                  className={ghost}
                >
                  {t("scanners.codeCancel")}
                </button>
              </div>
              {code && <p className="text-[12.5px] text-v2-c50">{t("scanners.codeChangeDetail")}</p>}
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              {code ? (
                <button type="button" disabled={busy} onClick={() => setConfirm("regenerate")} className={ghost}>
                  <Icon name="refresh" size={16} />
                  {t("scanners.codeRegenerate")}
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => void send({ action: "generate" })} className={primary}>
                  <Icon name="plus" size={16} strokeWidth={2.2} />
                  {busy ? t("scanners.codeSaving") : t("scanners.codeGenerate")}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setCustom(code ?? "");
                  setError(null);
                }}
                className={ghost}
              >
                {t("scanners.codeCustom")}
              </button>
              {code && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirm("remove")}
                  className="inline-flex h-10 items-center gap-2 rounded-v2-pill px-4 text-[13.5px] font-v2-ui-semibold text-v2-errorText hover:bg-v2-ink3 disabled:opacity-50"
                >
                  <Icon name="trash" size={16} />
                  {t("scanners.codeRemove")}
                </button>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="text-[13px] text-v2-errorText">
              {error}
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        message={confirm === "remove" ? t("scanners.codeRemoveConfirm") : t("scanners.codeChangeConfirm")}
        detail={confirm === "remove" ? t("scanners.codeRemoveDetail") : t("scanners.codeChangeDetail")}
        confirmLabel={confirm === "remove" ? t("scanners.codeRemove") : t("scanners.codeRegenerate")}
        busy={busy}
        onConfirm={() => void send({ action: confirm === "remove" ? "clear" : "generate" })}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
