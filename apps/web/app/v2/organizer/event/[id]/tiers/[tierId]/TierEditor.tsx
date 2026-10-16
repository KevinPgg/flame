"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  SUPPORTED_CURRENCIES,
  buildTierSave,
  canForceReduce,
  getNowInTimezone,
  newTierEditor,
  reusableEventQuestions,
  tierEditorFromTier,
  utcToLocal,
  validateTierEditor,
  type EditorEvent,
  type EditorTier,
  type OrgMemberRole,
  type TierEditorState,
  type TierSavePlan,
} from "@project-flame/lib";
import type { Event as OrganizerEvent } from "../../../../../../lib/hooks/useOrganizerData";
import { useI18n } from "../../../../../../lib/i18n";
import { Icon } from "../../../../../components/Icon";
import { ConfirmDialog } from "../../../../../components/ConfirmDialog";
import { ErrorBox } from "../../../../../components/ErrorBox";
import { Skeleton } from "../../../../../components/Skeleton";
import { routes } from "../../../../../lib/routes";
import { OrganizerShell, type ShellUser } from "../../../../OrganizerShell";
import { useOrganizerModel, type Org } from "../../../../useOrganizerModel";
import { TierFields } from "../../../../event-form/TierFields";
import { fieldId } from "../../../../event-form/ui";

type ForcePrompt = { sold: number; reserved: number; requested: number; allowed: boolean };

async function errorOf(res: Response, generic: string): Promise<{ message: string; code?: string; details?: Record<string, number> }> {
  const json = (await res.json().catch(() => null)) as { error?: string; code?: string; details?: Record<string, number> } | null;
  const message = res.status < 500 && typeof json?.error === "string" && json.error ? json.error : generic;
  return { message, code: json?.code, details: json?.details };
}

/**
 * Tier editor v2 (prototype "ow:tier"): one tier at a time, opened from the Tiers tab — the
 * same tier card as Create event plus what only exists once tickets sell: sold counts, the
 * sold-out switch, existing stages, delete, and the force-reduce confirmation when pending
 * checkouts / RSVPs don't fit the new capacity.
 */
export default function TierEditor({
  eventId,
  tierId,
  organization,
  organizations,
  role,
  me = null,
}: {
  eventId: string;
  tierId: string;
  organization: Org;
  organizations: Org[];
  role: OrgMemberRole | null;
  me?: ShellUser | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { data, model, failed, refetch, invalidate } = useOrganizerModel(organization, role);

  const event = (data?.events ?? []).find((e) => e.id === eventId) as (OrganizerEvent & EditorEvent) | undefined;
  const isNew = tierId === "new";
  const original = isNew ? null : ((event?.ticket_tiers ?? []).find((x) => x.id === tierId) as EditorTier | undefined) ?? null;

  const [state, setState] = useState<TierEditorState | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [force, setForce] = useState<ForcePrompt | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Fill once — background refetches (15 s) must not wipe what the organizer typed.
  useEffect(() => {
    if (state || !event) return;
    if (isNew) setState(newTierEditor(t("eventForm.tierN", { n: (event.ticket_tiers?.length ?? 0) + 1 })));
    else if (original) setState(tierEditorFromTier(original, event));
  }, [state, event, original, isNew, t]);

  const backHref = routes.event(eventId, organization.slug, "tiers");
  const title = isNew ? t("eventForm.titleNewTier") : t("eventForm.titleEditTier", { name: original?.name ?? "" });

  const shell = (children: React.ReactNode) => (
    <OrganizerShell
      organization={organization}
      organizations={organizations}
      role={role}
      pending={model?.pending ?? 0}
      currentEvents={model?.current ?? []}
      pastEvents={model?.past ?? []}
      activeEventId={eventId}
      title={title}
      backHref={backHref}
      crumbs={[
        { label: organization.name, href: routes.dashboard(organization.slug) },
        ...(event ? [{ label: event.name, href: backHref }] : []),
        { label: isNew ? t("eventForm.titleNewTier") : t("eventAdmin.tiers.editTier") },
      ]}
      hideTabbar
      me={me}
    >
      <section className="mx-auto max-w-[640px] px-4 pt-6 lg:px-0 lg:pt-8">
        {children}
      </section>
    </OrganizerShell>
  );

  if (failed) return shell(<ErrorBox onRetry={refetch} />);
  if (!data) return shell(<Skeleton className="h-[480px] rounded-v2-card" />);
  if (!event) {
    const cohosted = (data.cohost_events ?? []).some((c) => c.event.id === eventId);
    return shell(
      <p className="rounded-v2-card bg-v2-ink2 px-4 py-10 text-center text-[14px] text-v2-c70">
        {cohosted ? t("eventForm.notEditable") : t("eventForm.notFound")}
      </p>
    );
  }
  if (!isNew && !original) {
    return shell(<p className="rounded-v2-card bg-v2-ink2 px-4 py-10 text-center text-[14px] text-v2-c70">{t("eventForm.tierNotFound")}</p>);
  }
  if (!state) return shell(null);

  const tz = event.timezone || "America/Guayaquil";
  const errors = validateTierEditor(state, event, original);
  const errorText = (path: string) => (showErrors && errors[path] ? t(`eventForm.errors.${errors[path]!}`) : null);
  const sold = original?.quantity_sold ?? 0;
  const stageSold = (original?.ticket_stages ?? []).some((s) => (s.sold_quantity ?? 0) > 0);
  const onlyTier = (event.ticket_tiers?.length ?? 0) <= 1;
  const deleteBlocked = sold > 0 || stageSold ? t("eventForm.deleteBlockedSold") : onlyTier ? t("eventForm.deleteBlockedLast") : null;
  const currencySymbol = SUPPORTED_CURRENCIES.find((c) => c.code === (event.currency || "USD"))?.symbol ?? "$";

  const done = async () => {
    await invalidate();
    router.push(backHref);
  };

  /** Sends the tier request; the event's new questions (and the tiers to pin) go first. */
  const send = async (plan: TierSavePlan) => {
    if (plan.eventConfig) {
      for (const pin of plan.pinTiers) {
        const r = await fetch("/api/ticket-tiers", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pin),
        });
        if (!r.ok) throw new Error(t("eventForm.questionsSaveFailed"));
      }
      const r = await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: event.id, registration_form_config: plan.eventConfig }),
      });
      if (!r.ok) throw new Error(t("eventForm.questionsSaveFailed"));
    }
    return fetch("/api/ticket-tiers", {
      method: plan.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(plan.body),
    });
  };

  const save = async () => {
    if (saving) return;
    setShowErrors(true);
    setMessage(null);
    const current = validateTierEditor(state, event, original);
    const first = Object.keys(current)[0];
    if (first) {
      document.getElementById(fieldId(first))?.focus();
      return;
    }
    const plan = buildTierSave(state, event, original);
    if (!plan.changed) {
      setMessage(t("eventForm.noChanges"));
      return;
    }
    setSaving(true);
    try {
      const res = await send(plan);
      if (res.ok) return await done();
      const err = await errorOf(res, t("errors.generic"));
      if (err.code === "QUANTITY_BELOW_RESERVED" && err.details) {
        setForce({
          sold: err.details.quantity_sold ?? sold,
          reserved: err.details.quantity_reserved ?? 0,
          requested: plan.quantityTotal,
          allowed: canForceReduce(state, original),
        });
        return;
      }
      setMessage(err.message);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("errors.generic"));
    } finally {
      // New questions may already be saved: reload so a retry reuses them instead of duplicating.
      if (plan.eventConfig) void invalidate();
      setSaving(false);
    }
  };

  /** Capacity first (cancels checkouts, rejects RSVPs), then the rest of the edits. */
  const forceReduce = async () => {
    if (!force || !original) return;
    setSaving(true);
    setMessage(null);
    try {
      const r = await fetch(`/api/organizer/tiers/${original.id}/force-reduce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_quantity_total: force.requested }),
      });
      if (!r.ok) {
        setMessage((await errorOf(r, t("errors.generic"))).message);
        return;
      }
      setForce(null);
      const plan = buildTierSave(state, event, original);
      const rest = { ...plan.body };
      delete rest.quantity_total;
      if (Object.keys(rest).length > 1) {
        const res = await send({ ...plan, body: rest });
        if (!res.ok) {
          await invalidate();
          setMessage((await errorOf(res, t("errors.generic"))).message);
          return;
        }
      }
      await done();
    } catch {
      setMessage(t("errors.generic"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!original) return;
    setSaving(true);
    setMessage(null);
    try {
      const r = await fetch(`/api/ticket-tiers?id=${encodeURIComponent(original.id)}`, { method: "DELETE" });
      if (!r.ok) {
        setConfirmDelete(false);
        setMessage((await errorOf(r, t("errors.generic"))).message);
        return;
      }
      await done();
    } catch {
      setMessage(t("errors.generic"));
    } finally {
      setSaving(false);
    }
  };

  return shell(
    <>
      <fieldset disabled={saving} className="min-w-0">
        <TierFields
          tier={state.draft}
          index={isNew ? event.ticket_tiers?.length ?? 0 : Math.max(0, (event.ticket_tiers ?? []).findIndex((x) => x.id === original?.id))}
          canRemove={false}
          currencySymbol={currencySymbol}
          defaults={{ salesStart: getNowInTimezone(tz), salesEnd: utcToLocal(event.ends_at, tz) }}
          requiresRsvp={event.requires_rsvp === true}
          reusable={reusableEventQuestions(event, state.draft)}
          reusableLabel={t("eventForm.reuseEvent")}
          errors={showErrors ? errors : {}}
          errorText={errorText}
          onChange={(draft) => {
            setMessage(null);
            setState((s) => (s ? { ...s, draft } : s));
          }}
          onRemove={() => {}}
          sold={sold}
          stagesLocked={!isNew}
          soldOut={isNew ? undefined : { checked: state.soldOut, onChange: (soldOut) => setState((s) => (s ? { ...s, soldOut } : s)) }}
        />

        {!isNew && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={Boolean(deleteBlocked)}
              className="inline-flex h-10 items-center gap-2 rounded-v2-pill px-3 text-[13px] font-v2-ui-semibold text-v2-errorText hover:bg-v2-ink2 disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <Icon name="trash" size={16} />
              {t("eventForm.deleteTier")}
            </button>
            {deleteBlocked && <p className="px-3 text-[12.5px] text-v2-c50">{deleteBlocked}</p>}
          </div>
        )}
      </fieldset>

      <div className="sticky bottom-0 z-10 -mx-4 mt-6 bg-gradient-to-t from-black from-70% to-transparent px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-6 lg:mx-0 lg:px-0">
        {showErrors && Object.keys(errors).length > 0 && (
          <p role="alert" className="mb-2 text-center text-[13px] text-v2-errorText">
            {t("eventForm.fixFields", { count: Object.keys(errors).length })}
          </p>
        )}
        {force && !force.allowed && (
          <p role="alert" className="mb-2 text-center text-[13px] text-v2-warn">
            {t("eventForm.forceStaged", { sold: force.sold, reserved: force.reserved, count: force.requested })}
          </p>
        )}
        {state.draft.hidden && ((event.ticket_tiers ?? []) as EditorTier[]).every((x) => x.id === original?.id || x.is_hidden === true) && (
          <p role="status" className="mb-2 text-center text-[13px] text-v2-warn">
            {t("eventForm.allHiddenWarning")}
          </p>
        )}
        {message && (
          <p role="alert" className="mb-2 text-center text-[13px] text-v2-c90">
            {message}
          </p>
        )}
        <div className="flex gap-2">
          <Link
            href={backHref}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-v2-pill bg-v2-ink3 px-5 text-[15px] font-v2-ui-semibold text-v2-cream hover:bg-v2-ink4"
          >
            {t("common.cancel")}
          </Link>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex h-12 flex-[2] items-center justify-center rounded-v2-pill bg-v2-cream px-5 text-[15px] font-v2-ui-semibold text-v2-ink disabled:opacity-60"
          >
            {saving ? t("eventForm.saving") : isNew ? t("eventForm.createTier") : t("eventForm.saveTier")}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(force?.allowed)}
        message={t("eventForm.forceTitle", { name: state.draft.name.trim() || original?.name || "", count: force?.requested ?? 0 })}
        detail={t("eventForm.forceDetail", { sold: force?.sold ?? 0, reserved: force?.reserved ?? 0 })}
        confirmLabel={t("eventForm.forceConfirm")}
        busy={saving}
        onConfirm={() => void forceReduce()}
        onCancel={() => setForce(null)}
      />
      <ConfirmDialog
        open={confirmDelete}
        message={t("eventForm.deleteConfirm", { name: original?.name ?? "" })}
        detail={t("eventForm.deleteDetail")}
        confirmLabel={t("eventForm.deleteTier")}
        busy={saving}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
