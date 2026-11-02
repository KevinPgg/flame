"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EVENT_DESCRIPTION_MAX,
  SUPPORTED_TIMEZONES,
  buildUpdateEventPayload,
  datesLocked,
  editFormFromEvent,
  eventFormToUtc,
  tiersSellingPastEnd,
  validateEditEventForm,
  type EditEventFormState,
  type EditableEvent,
  type OrgMemberRole,
} from "@project-flame/lib";
import type { Event as OrganizerEvent } from "../../../../../lib/hooks/useOrganizerData";
import { useI18n } from "../../../../../lib/i18n";
import { CityAutocompleteField } from "../../../../../components/organizer/CityAutocompleteField";
import { Icon } from "../../../../components/Icon";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { ErrorBox } from "../../../../components/ErrorBox";
import { Skeleton } from "../../../../components/Skeleton";
import { apiErrorMessage } from "../../../../lib/api-error";
import { routes } from "../../../../lib/routes";
import { OrganizerShell, type ShellUser } from "../../../OrganizerShell";
import { useOrganizerModel, type Org } from "../../../useOrganizerModel";
import { FlyerPicker, type FlyerValue } from "../../../event-form/FlyerPicker";
import { LineupFields } from "../../../event-form/LineupFields";
import { ViewerTimeHint, FieldError, Group, Row, Section, fieldCls, fieldId } from "../../../event-form/ui";

const EDIT_ORDER = ["startsAt", "endsAt", "venue", "city", "description"] as const;

/**
 * Edit event v2 (prototype "ow:edit"): the create form pre-filled with what the API lets change
 * after publishing — flyer, dates, venue, city, description. Name, link, currency, timezone and
 * RSVP are shown read-only; tiers (and their registration questions) are edited in the Tiers tab.
 * Only changed fields are sent; a date change asks first because ticket holders get notified.
 */
export default function EditEvent({
  eventId,
  organization,
  organizations,
  role,
  me = null,
}: {
  eventId: string;
  organization: Org;
  organizations: Org[];
  role: OrgMemberRole | null;
  me?: ShellUser | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { data, model, loading, failed, refetch, invalidate } = useOrganizerModel(organization, role);

  const owned = (data?.events ?? []).find((e) => e.id === eventId) as OrganizerEvent | undefined;
  const cohosted = !owned && (data?.cohost_events ?? []).some((c) => c.event.id === eventId);
  const event = owned as (OrganizerEvent & EditableEvent) | undefined;

  const [form, setForm] = useState<EditEventFormState | null>(null);
  const [flyer, setFlyer] = useState<FlyerValue | null>(null);
  const [removeFlyer, setRemoveFlyer] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDates, setConfirmDates] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [host, setHost] = useState("");

  useEffect(() => setHost(window.location.host), []);
  // Fill once, when the event first arrives — background refetches must not wipe edits.
  useEffect(() => {
    if (event && !form) setForm(editFormFromEvent(event));
  }, [event, form]);

  const shell = (children: React.ReactNode) => (
    <OrganizerShell
      organization={organization}
      organizations={organizations}
      role={role}
      pending={model?.pending ?? 0}
      currentEvents={model?.current ?? []}
      pastEvents={model?.past ?? []}
      activeEventId={eventId}
      title={t("eventForm.titleEdit")}
      backHref={routes.event(eventId, organization.slug)}
      crumbs={[
        { label: organization.name, href: routes.dashboard(organization.slug) },
        ...(event ? [{ label: event.name, href: routes.event(eventId, organization.slug) }] : []),
        { label: t("common.edit") },
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
  if (!data || (loading && !event)) {
    return shell(
      <div className="flex flex-col gap-4">
        <Skeleton className="mx-auto aspect-[4/5] w-[220px] rounded-v2-card" />
        <Skeleton className="h-12 rounded-v2-md" />
        <Skeleton className="h-28 rounded-v2-card" />
      </div>
    );
  }
  if (!event) {
    return shell(
      <p className="rounded-v2-card bg-v2-ink2 px-4 py-10 text-center text-[14px] text-v2-c70">
        {cohosted ? t("eventForm.notEditable") : t("eventForm.notFound")}
      </p>
    );
  }
  if (!form) return shell(null);

  const tz = event.timezone || "America/Guayaquil";
  const locked = datesLocked(event);
  const errors = validateEditEventForm(form, event);
  const errorText = (path: string) => (showErrors && errors[path] ? t(`eventForm.errors.${errors[path]!}`) : null);
  const inv = (path: string) => (showErrors && errors[path] ? true : undefined);
  const update = (patch: Partial<EditEventFormState>) => {
    setMessage(null);
    setForm((f) => (f ? { ...f, ...patch } : f));
  };
  const blocking =
    errors.endsAt === "tierSalesAfterEnd" ? tiersSellingPastEnd(event, eventFormToUtc(form.endsAt, tz)) : [];
  const flyerIntent = flyer ? "pending" : removeFlyer ? "" : undefined;

  const save = async (confirmed: boolean) => {
    if (saving) return;
    setShowErrors(true);
    setMessage(null);
    const current = validateEditEventForm(form, event);
    if (Object.keys(current).length > 0) {
      const first = EDIT_ORDER.find((k) => current[k]) ?? Object.keys(current).find((k) => k.startsWith("lineup"));
      if (first) (document.getElementById(fieldId(first)) ?? document.getElementById(`${fieldId(first)}-error`))?.focus();
      return;
    }
    const preview = buildUpdateEventPayload(form, event, flyerIntent);
    if (!preview.changed) {
      setMessage(t("eventForm.noChanges"));
      return;
    }
    if (preview.datesChanged && !confirmed) {
      setConfirmDates(true);
      return;
    }
    setConfirmDates(false);
    setSaving(true);
    try {
      let imageUrl: string | undefined = removeFlyer ? "" : undefined;
      if (flyer) {
        const body = new FormData();
        body.append("file", new File([flyer.blob], "flyer.jpg", { type: "image/jpeg" }));
        body.append("eventId", event.id);
        body.append("eventSlug", event.slug);
        const up = await fetch("/api/upload-image", { method: "POST", body });
        const url = up.ok ? ((await up.json()) as { url?: string }).url : undefined;
        if (!url) {
          setMessage(t("eventForm.flyerUploadError"));
          return;
        }
        imageUrl = url;
      }
      const res = await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildUpdateEventPayload(form, event, imageUrl).payload),
      });
      if (!res.ok) {
        setMessage(await apiErrorMessage(res, t("errors.generic")));
        return;
      }
      await invalidate();
      router.push(routes.event(event.id, organization.slug));
    } catch {
      setMessage(t("errors.generic"));
    } finally {
      setSaving(false);
    }
  };

  const currencyLabel = event.currency || "USD";
  const tzLabel = SUPPORTED_TIMEZONES.find((z) => z.value === tz)?.label ?? tz;

  return shell(
    <>
      <fieldset disabled={saving} className="min-w-0">
        <FlyerPicker
          value={flyer}
          onChange={(v) => {
            setMessage(null);
            setFlyer(v);
          }}
          existingUrl={removeFlyer ? null : event.image_url || null}
          onRemoveExisting={() => {
            setMessage(null);
            setRemoveFlyer(true);
          }}
          disabled={saving}
        />

        <Section title={t("eventForm.name")}>
          <p className="rounded-v2-md bg-v2-ink2 px-4 py-3 text-[17px] font-v2-ui-semibold">{event.name}</p>
          <p className="mt-1.5 text-[12.5px] text-v2-c50">{t("eventForm.lockedHint")}</p>
        </Section>

        <Section title={t("eventForm.when")} aside={t("eventForm.timesIn", { tz: tzLabel })}>
          <Group>
            <Row label={t("eventForm.starts")} htmlFor={fieldId("startsAt")}>
              <input
                id={fieldId("startsAt")}
                type="datetime-local"
                value={form.startsAt}
                disabled={locked}
                onChange={(e) => update({ startsAt: e.target.value })}
                aria-invalid={inv("startsAt")}
                className={`${fieldCls} h-10 bg-v2-ink3 [color-scheme:dark] disabled:opacity-60`}
              />
                <ViewerTimeHint local={form.startsAt} eventTimezone={tz} />
            </Row>
            <Row label={t("eventForm.ends")} htmlFor={fieldId("endsAt")}>
              <input
                id={fieldId("endsAt")}
                type="datetime-local"
                value={form.endsAt}
                disabled={locked}
                onChange={(e) => update({ endsAt: e.target.value })}
                aria-invalid={inv("endsAt")}
                className={`${fieldCls} h-10 bg-v2-ink3 [color-scheme:dark] disabled:opacity-60`}
              />
                <ViewerTimeHint local={form.endsAt} eventTimezone={tz} />
            </Row>
          </Group>
          {locked && <p className="mt-1.5 text-[12.5px] text-v2-c50">{t("eventForm.datesLockedHint")}</p>}
          <FieldError path="startsAt" message={errorText("startsAt")} />
          <FieldError path="endsAt" message={errorText("endsAt")} />
          {showErrors && blocking.length > 0 && (
            <p className="mt-1 text-[12.5px] text-v2-errorText">
              {t("eventForm.tiersToFix", { names: blocking.map((b) => b.name).join(", ") })}
            </p>
          )}
        </Section>

        <Section title={t("eventForm.where")}>
          <Group>
            <Row label={t("eventForm.venue")} htmlFor={fieldId("venue")}>
              <input
                id={fieldId("venue")}
                value={form.venue}
                onChange={(e) => update({ venue: e.target.value })}
                placeholder={t("eventForm.venuePlaceholder")}
                aria-invalid={inv("venue")}
                className={`${fieldCls} h-10 bg-v2-ink3`}
              />
            </Row>
            <Row label={t("eventForm.city")} htmlFor={fieldId("city")}>
              <CityAutocompleteField
                id={fieldId("city")}
                value={form.city}
                onChange={(city) => update({ city })}
                placeholder={t("eventForm.cityPlaceholder")}
                disabled={saving}
                className={`${fieldCls} h-10 bg-v2-ink3`}
              />
            </Row>
          </Group>
          <FieldError path="venue" message={errorText("venue")} />
          <FieldError path="city" message={errorText("city")} />
        </Section>

        <Section title={t("eventForm.about")} aside={`${form.description.length}/${EVENT_DESCRIPTION_MAX}`}>
          <textarea
            id={fieldId("description")}
            value={form.description}
            maxLength={EVENT_DESCRIPTION_MAX}
            onChange={(e) => update({ description: e.target.value })}
            placeholder={t("eventForm.aboutPlaceholder")}
            aria-label={t("eventForm.about")}
            aria-invalid={inv("description")}
            rows={4}
            className={`${fieldCls} h-auto resize-y py-3 leading-relaxed`}
          />
          <FieldError path="description" message={errorText("description")} />
        </Section>

        <Section title={t("eventForm.lineup")} aside={t("eventForm.lineupHint")}>
          <LineupFields value={form.lineup ?? []} onChange={(lineup) => update({ lineup })} errorText={errorText} disabled={saving} />
        </Section>

        <Section title={t("eventForm.tiers")}>
          <Link
            href={routes.event(event.id, organization.slug, "tiers")}
            className="flex min-h-[52px] items-center gap-3 rounded-v2-card bg-v2-ink2 px-4 hover:bg-v2-ink3"
          >
            <Icon name="ticket" size={18} className="text-v2-c70" />
            <span className="flex-1 text-[14px] font-v2-ui-semibold">{t("eventForm.tiersLink")}</span>
            <Icon name="chev" size={16} className="text-v2-c50" />
          </Link>
          {event.requires_rsvp && <p className="mt-1.5 text-[12.5px] text-v2-c50">{t("eventForm.questionsInTiers")}</p>}
        </Section>

        <Section title={t("eventForm.settings")}>
          <Group>
            <Row label={t("eventForm.link")}>
              <span className="block truncate text-[14px] text-v2-c90">{`${host ? `${host}/events/` : "/events/"}${event.slug}`}</span>
            </Row>
            <Row label={t("eventForm.currency")}>
              <span className="text-[14px] text-v2-c90">{currencyLabel}</span>
            </Row>
            <Row label={t("eventForm.timezone")}>
              <span className="text-[14px] text-v2-c90">{tzLabel}</span>
            </Row>
            <Row label={t("eventForm.rsvp")}>
              <span className="text-[14px] text-v2-c90">{event.requires_rsvp ? t("eventForm.rsvpYes") : t("eventForm.rsvpNo")}</span>
            </Row>
          </Group>
          <p className="mt-2 text-[12.5px] text-v2-c50">{t("eventForm.lockedHint")}</p>
        </Section>
      </fieldset>

      <div className="sticky bottom-0 z-10 -mx-4 mt-6 bg-gradient-to-t from-black from-70% to-transparent px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-6 lg:mx-0 lg:px-0">
        {showErrors && Object.keys(errors).length > 0 && (
          <p role="alert" className="mb-2 text-center text-[13px] text-v2-errorText">
            {t("eventForm.fixFields", { count: Object.keys(errors).length })}
          </p>
        )}
        {message && (
          <p role="alert" className="mb-2 text-center text-[13px] text-v2-c90">
            {message}
          </p>
        )}
        <div className="flex gap-2">
          <Link
            href={routes.event(event.id, organization.slug)}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-v2-pill bg-v2-ink3 px-5 text-[15px] font-v2-ui-semibold text-v2-cream hover:bg-v2-ink4"
          >
            {t("common.cancel")}
          </Link>
          <button
            type="button"
            onClick={() => void save(false)}
            disabled={saving}
            className="inline-flex h-12 flex-[2] items-center justify-center rounded-v2-pill bg-v2-cream px-5 text-[15px] font-v2-ui-semibold text-v2-ink disabled:opacity-60"
          >
            {saving ? t("eventForm.saving") : t("eventForm.save")}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDates}
        message={t("eventForm.dateChangeTitle")}
        detail={t("eventForm.dateChangeDetail")}
        confirmLabel={t("eventForm.dateChangeConfirm")}
        busy={saving}
        onConfirm={() => void save(true)}
        onCancel={() => setConfirmDates(false)}
      />
    </>
  );
}
