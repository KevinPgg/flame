/**
 * Tier editor v2 in the app (prototype "ow:tier"; same as the web TierEditor): one tier at a time,
 * opened from the Tiers tab ("new" or a tier id). Same draft, validation and save plan as the web
 * (@project-flame/lib tier-editor): new event questions are added to the event first (other
 * "every question" tiers pinned), PATCH sends only what changed, force-reduce when pending
 * checkouts / RSVPs don't fit, delete when nothing sold. Removing a saved question only takes it
 * off this tier — the event keeps it and its answers (the v1 app deleted it).
 */
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  SUPPORTED_CURRENCIES,
  buildTierSave,
  canForceReduce,
  canManageAssignedEvents,
  getNowInTimezone,
  newTierEditor,
  reusableEventQuestions,
  tierEditorFromTier,
  utcToLocal,
  validateTierEditor,
  type EditorEvent,
  type EditorTier,
  type TierEditorState,
  type TierSavePlan,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiClient } from "../../../lib/api";
import { routes } from "../../../lib/v2/routes";
import { apiErrorText, type MyOrganization } from "../../../lib/v2/organizer-api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { useOrganizerModel } from "../../../hooks/v2/useOrganizerModel";
import { OrganizerShell } from "../OrganizerShell";
import { Button, ConfirmDialog, ErrorBox, Skeleton } from "../ui";
import { FormScreen } from "../form/FormScreen";
import { TierFields } from "../form/TierFields";
import { Hint } from "../form/ui";

type ForcePrompt = { sold: number; reserved: number; requested: number; allowed: boolean };
type Err = { status?: number; code?: string; details?: unknown; message?: string };

/** The API rejected a sales date (zod issue on sales_start / sales_end) → say which, not "Invalid input". */
const isSalesDateIssue = (e: Err) =>
  Array.isArray(e.details) && (e.details as Array<{ path?: unknown[] }>).some((i) => Array.isArray(i.path) && (i.path[0] === "sales_start" || i.path[0] === "sales_end"));

export function TierEditor({ eventId, tierId, organization }: { eventId: string; tierId: string; organization: MyOrganization }) {
  const { t } = useI18n();
  const router = useRouter();
  const { getToken } = useOptionalAuth();
  const { data, model, failed, refetch, invalidate } = useOrganizerModel(organization);

  const event = (data?.events ?? []).find((e) => e.id === eventId) as unknown as (EditorEvent & { currency?: string | null; name: string }) | undefined;
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

  const backHref = routes.event(eventId, organization, "tiers");
  const back = () => (router.canGoBack() ? router.back() : router.replace(backHref as Href));
  const title = isNew ? t("eventForm.titleNewTier") : t("eventForm.titleEditTier", { name: original?.name ?? "" });
  const shell = (children: React.ReactNode) => (
    <OrganizerShell organization={organization} pending={model?.pending ?? 0} title={title} onBack={back} hideTabbar>
      {children}
    </OrganizerShell>
  );
  const notice = (text: string) =>
    shell(
      <View className="px-4 pt-6">
        <ErrorBox message={text} onRetry={back} retryLabel={t("common.back")} />
      </View>,
    );

  if (failed) return shell(<View className="px-4 pt-6"><ErrorBox onRetry={refetch} /></View>);
  if (!data) return shell(<View className="px-4 pt-6"><Skeleton width="100%" height={420} radius={16} /></View>);
  if (!event) {
    const cohosted = (data.cohost_events ?? []).some((x) => x.event.id === eventId);
    return notice(cohosted ? t("eventForm.notEditable") : t("eventForm.notFound"));
  }
  if (!canManageAssignedEvents(organization.role)) return notice(t("eventForm.notEditable"));
  if (!isNew && !original) return notice(t("eventForm.tierNotFound"));
  if (!state) return shell(null);

  const tz = event.timezone || "America/Guayaquil";
  const errors = validateTierEditor(state, event, original);
  const errorText = (path: string) => (showErrors && errors[path] ? t(`eventForm.errors.${errors[path]!}`) : null);
  const sold = original?.quantity_sold ?? 0;
  const stageSold = (original?.ticket_stages ?? []).some((s) => (s.sold_quantity ?? 0) > 0);
  const onlyTier = (event.ticket_tiers?.length ?? 0) <= 1;
  const deleteBlocked = sold > 0 || stageSold ? t("eventForm.deleteBlockedSold") : onlyTier ? t("eventForm.deleteBlockedLast") : null;
  const currencySymbol = SUPPORTED_CURRENCIES.find((x) => x.code === (event.currency || "USD"))?.symbol ?? "$";
  const errorCount = Object.keys(errors).length;
  const allHidden = state.draft.hidden && (event.ticket_tiers ?? []).every((x) => x.id === original?.id || x.is_hidden === true);

  const done = async () => {
    await invalidate();
    router.replace(backHref as Href);
  };

  const send = async (plan: TierSavePlan) => {
    if (plan.eventConfig) {
      try {
        for (const pin of plan.pinTiers) await apiClient("/api/ticket-tiers", { method: "PATCH", body: JSON.stringify(pin), getToken });
        await apiClient("/api/events", { method: "PATCH", body: JSON.stringify({ id: event.id, registration_form_config: plan.eventConfig }), getToken });
      } catch {
        throw new Error(t("eventForm.questionsSaveFailed"));
      }
    }
    await apiClient("/api/ticket-tiers", { method: plan.method, body: JSON.stringify(plan.body), getToken });
  };

  /** API errors (have a status) → server's 4xx message or generic; our own Error (questions) → its text. */
  const explain = (e: unknown) => {
    if (isSalesDateIssue(e as Err)) return t("eventForm.errors.salesDatesRejected");
    if (typeof (e as Err).status === "number") return apiErrorText(e, t("errors.generic"));
    return e instanceof Error && e.message ? e.message : t("errors.generic");
  };

  const save = async () => {
    if (saving) return;
    setShowErrors(true);
    setMessage(null);
    if (Object.keys(validateTierEditor(state, event, original)).length > 0) return;
    const plan = buildTierSave(state, event, original);
    if (!plan.changed) {
      setMessage(t("eventForm.noChanges"));
      return;
    }
    setSaving(true);
    try {
      await send(plan);
      await done();
    } catch (e) {
      const err = e as Err;
      if (err.code === "QUANTITY_BELOW_RESERVED" && err.details && !Array.isArray(err.details)) {
        const d = err.details as Record<string, number>;
        setForce({ sold: d.quantity_sold ?? sold, reserved: d.quantity_reserved ?? 0, requested: plan.quantityTotal, allowed: canForceReduce(state, original) });
      } else {
        setMessage(explain(e));
      }
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
      await apiClient(`/api/organizer/tiers/${original.id}/force-reduce`, { method: "POST", body: JSON.stringify({ new_quantity_total: force.requested }), getToken });
      setForce(null);
      const plan = buildTierSave(state, event, original);
      const rest = { ...plan.body };
      delete rest.quantity_total;
      if (Object.keys(rest).length > 1) {
        try {
          await send({ ...plan, body: rest });
        } catch (e) {
          await invalidate();
          setMessage(explain(e));
          return;
        }
      }
      await done();
    } catch (e) {
      setMessage(explain(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!original) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiClient(`/api/ticket-tiers?id=${encodeURIComponent(original.id)}`, { method: "DELETE", getToken });
      await done();
    } catch (e) {
      setConfirmDelete(false);
      setMessage(explain(e));
    } finally {
      setSaving(false);
    }
  };

  return shell(
    <>
      <FormScreen
        actions={
          <View className="gap-2">
            {showErrors && errorCount > 0 && <Text accessibilityRole="alert" className="text-center font-v2-ui text-[13px] text-v2-errorText">{t("eventForm.fixFields", { count: errorCount })}</Text>}
            {force && !force.allowed && <Text accessibilityRole="alert" className="text-center font-v2-ui text-[13px] text-v2-warn">{t("eventForm.forceStaged", { sold: force.sold, reserved: force.reserved, count: force.requested })}</Text>}
            {allHidden && <Text className="text-center font-v2-ui text-[13px] text-v2-warn">{t("eventForm.allHiddenWarning")}</Text>}
            {message && <Text accessibilityRole="alert" className="text-center font-v2-ui text-[13px] text-v2-c90">{message}</Text>}
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button label={t("common.cancel")} onPress={back} disabled={saving} />
              </View>
              <View className="flex-[2]">
                <Button variant="primary" label={saving ? t("eventForm.saving") : isNew ? t("eventForm.createTier") : t("eventForm.saveTier")} onPress={() => void save()} disabled={saving} />
              </View>
            </View>
          </View>
        }
      >
        <TierFields
          tier={state.draft}
          index={isNew ? event.ticket_tiers?.length ?? 0 : Math.max(0, (event.ticket_tiers ?? []).findIndex((x) => x.id === original?.id))}
          canRemove={false}
          currencySymbol={currencySymbol}
          defaults={{ salesStart: getNowInTimezone(tz), salesEnd: utcToLocal(event.ends_at, tz) }}
          tz={tz}
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
          <View className="mt-6 items-start">
            <Button variant="danger" icon="trash" label={t("eventForm.deleteTier")} onPress={() => setConfirmDelete(true)} disabled={Boolean(deleteBlocked) || saving} />
            {deleteBlocked && <Hint>{deleteBlocked}</Hint>}
          </View>
        )}
      </FormScreen>

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
    </>,
  );
}
