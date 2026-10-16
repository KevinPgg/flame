"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  EVENT_DESCRIPTION_MAX,
  MAX_TICKET_TIERS_PER_EVENT,
  SUPPORTED_CURRENCIES,
  SUPPORTED_TIMEZONES,
  buildCreateEventPayload,
  emptyEventForm,
  firstErrorPath,
  getNowInTimezone,
  newTierDraft,
  reusableQuestions,
  slugify,
  suggestEnd,
  validateEventForm,
  type EventFormState,
  type OrgMemberRole,
  type TierDraft,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { CityAutocompleteField } from "../../../components/organizer/CityAutocompleteField";
import { Icon } from "../../components/Icon";
import { apiErrorMessage } from "../../lib/api-error";
import { routes } from "../../lib/routes";
import { OrganizerShell, type ShellUser } from "../OrganizerShell";
import { useOrganizerModel, type Org } from "../useOrganizerModel";
import { FlyerPicker, type FlyerValue } from "../event-form/FlyerPicker";
import { TierFields } from "../event-form/TierFields";
import { ViewerTimeHint, FieldError, Group, Labeled, Row, Section, SwitchRow, fieldCls, fieldId } from "../event-form/ui";

type Stage = "idle" | "publishing" | "flyer";

/** While typing the link: same characters the server accepts, accents stripped. */
const slugTyping = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .slice(0, 100);

/**
 * Create event v2 (prototype "ow:create"): one phone-first form in the order organizers think —
 * flyer → name → when → where → about → tiers → guests → settings — then "Publish event".
 * Same API and rules as v1 (POST /api/events, then flyer upload + PATCH image_url).
 */
export default function CreateEvent({
  organization,
  organizations,
  role,
  me = null,
}: {
  organization: Org;
  organizations: Org[];
  role: OrgMemberRole | null;
  me?: ShellUser | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { model } = useOrganizerModel(organization, role);

  const [form, setForm] = useState<EventFormState>(() => emptyEventForm({ firstTierName: "" }));
  const [endAuto, setEndAuto] = useState(true);
  const [flyer, setFlyer] = useState<FlyerValue | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  /** Event created but the flyer failed: the form is done, only "go to event" remains. */
  const [createdWithoutFlyer, setCreatedWithoutFlyer] = useState<{ id: string } | null>(null);
  const [host, setHost] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => setHost(window.location.host), []);

  // Don't lose a half-written event to a stray tab close.
  useEffect(() => {
    if (!dirty || createdWithoutFlyer) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, createdWithoutFlyer]);

  const errors = validateEventForm(form, new Date());
  const errorCount = Object.keys(errors).length;
  const errorText = (path: string) => (showErrors && errors[path] ? t(`eventForm.errors.${errors[path]!}`) : null);
  const inv = (path: string) => (showErrors && errors[path] ? true : undefined);
  const busy = stage !== "idle" || createdWithoutFlyer !== null;

  const update = (patch: Partial<EventFormState>) => {
    setDirty(true);
    setForm((f) => ({ ...f, ...patch }));
  };
  const setTier = (i: number, tier: TierDraft) => update({ tiers: form.tiers.map((x, j) => (j === i ? tier : x)) });

  const currency = SUPPORTED_CURRENCIES.find((c) => c.code === form.currency);
  const tz = SUPPORTED_TIMEZONES.find((z) => z.value === form.timezone);
  const tierDefaults = useMemo(
    () => ({ salesStart: getNowInTimezone(form.timezone), salesEnd: form.endsAt || form.startsAt || getNowInTimezone(form.timezone, 24) }),
    [form.timezone, form.endsAt, form.startsAt]
  );

  const focusFirstError = (path: string | null) => {
    if (!path) return;
    const el = document.getElementById(fieldId(path)) ?? document.getElementById(`${fieldId(path)}-error`);
    el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) el.focus({ preventScroll: true });
  };

  const uploadFlyer = async (event: { id: string; slug: string }): Promise<boolean> => {
    if (!flyer) return true;
    try {
      const body = new FormData();
      body.append("file", new File([flyer.blob], "flyer.jpg", { type: "image/jpeg" }));
      body.append("eventId", event.id);
      body.append("eventSlug", event.slug);
      const up = await fetch("/api/upload-image", { method: "POST", body });
      if (!up.ok) return false;
      const { url } = (await up.json()) as { url?: string };
      if (!url) return false;
      const patch = await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: event.id, image_url: url }),
      });
      return patch.ok;
    } catch {
      return false;
    }
  };

  const publish = async () => {
    if (busy) return;
    setShowErrors(true);
    setServerError(null);
    const current = validateEventForm(form, new Date());
    if (Object.keys(current).length > 0) {
      focusFirstError(firstErrorPath(form, current));
      return;
    }
    setStage("publishing");
    let res: Response;
    try {
      res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCreateEventPayload(form, organization.id)),
      });
    } catch {
      setServerError(t("errors.generic"));
      setStage("idle");
      return;
    }
    if (!res.ok) {
      setServerError(await apiErrorMessage(res, t("errors.generic")));
      setStage("idle");
      return;
    }
    const { event } = (await res.json()) as { event: { id: string; slug: string } };
    setDirty(false);
    void queryClient.invalidateQueries({ queryKey: ["organizer-data"], exact: false });

    if (flyer) {
      setStage("flyer");
      const ok = await uploadFlyer(event);
      if (!ok) {
        setCreatedWithoutFlyer({ id: event.id });
        setStage("idle");
        return;
      }
    }
    router.push(routes.event(event.id, organization.slug));
  };

  return (
    <OrganizerShell
      organization={organization}
      organizations={organizations}
      role={role}
      pending={model?.pending ?? 0}
      currentEvents={model?.current ?? []}
      pastEvents={model?.past ?? []}
      title={t("eventForm.titleCreate")}
      backHref={routes.dashboard(organization.slug)}
      crumbs={[
        { label: t("organizer.myOrganizers"), href: routes.organizers() },
        { label: organization.name, href: routes.dashboard(organization.slug) },
        { label: t("organizer.createEvent") },
      ]}
      hideTabbar
      me={me}
    >
      <section className="mx-auto max-w-[640px] px-4 pt-6 lg:px-0 lg:pt-8">

        <fieldset disabled={busy} className="min-w-0">
          <FlyerPicker value={flyer} onChange={(v) => { setDirty(true); setFlyer(v); }} disabled={busy} />

          <Section title={t("eventForm.name")}>
            <input
              id={fieldId("name")}
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                update(form.slugEdited ? { name } : { name, slug: slugify(name) });
              }}
              placeholder={t("eventForm.namePlaceholder")}
              aria-label={t("eventForm.name")}
              aria-invalid={inv("name")}
              className={`${fieldCls} h-12 text-[17px] font-v2-ui-semibold`}
            />
            <FieldError path="name" message={errorText("name")} />
          </Section>

          <Section title={t("eventForm.when")} aside={tz ? t("eventForm.timesIn", { tz: tz.label }) : null}>
            <Group>
              <Row label={t("eventForm.starts")} htmlFor={fieldId("startsAt")}>
                <input
                  id={fieldId("startsAt")}
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => {
                    const startsAt = e.target.value;
                    update(endAuto && startsAt ? { startsAt, endsAt: suggestEnd(startsAt) } : { startsAt });
                  }}
                  aria-invalid={inv("startsAt")}
                  className={`${fieldCls} h-10 bg-v2-ink3 [color-scheme:dark]`}
                />
                <ViewerTimeHint local={form.startsAt} eventTimezone={form.timezone} />
              </Row>
              <Row label={t("eventForm.ends")} htmlFor={fieldId("endsAt")}>
                <input
                  id={fieldId("endsAt")}
                  type="datetime-local"
                  value={form.endsAt}
                  min={form.startsAt || undefined}
                  onChange={(e) => {
                    setEndAuto(false);
                    update({ endsAt: e.target.value });
                  }}
                  aria-invalid={inv("endsAt")}
                  className={`${fieldCls} h-10 bg-v2-ink3 [color-scheme:dark]`}
                />
                <ViewerTimeHint local={form.endsAt} eventTimezone={form.timezone} />
              </Row>
            </Group>
            <FieldError path="startsAt" message={errorText("startsAt")} />
            <FieldError path="endsAt" message={errorText("endsAt")} />
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
                  disabled={busy}
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

          <Section title={t("eventForm.tiers")} aside={t("eventForm.tiersHint")}>
            <div className="flex flex-col gap-3">
              {form.tiers.map((tier, i) => (
                <TierFields
                  key={tier.key}
                  tier={tier}
                  index={i}
                  canRemove={form.tiers.length > 1}
                  currencySymbol={currency?.symbol ?? "$"}
                  defaults={tierDefaults}
                  requiresRsvp={form.requiresRsvp}
                  reusable={reusableQuestions(form.tiers, i)}
                  errors={showErrors ? errors : {}}
                  errorText={errorText}
                  onChange={(next) => setTier(i, next)}
                  onRemove={() => update({ tiers: form.tiers.filter((_, j) => j !== i) })}
                />
              ))}
            </div>
            <FieldError path="tiers" message={errorText("tiers")} />
            {form.tiers.length < MAX_TICKET_TIERS_PER_EVENT && (
              <button
                type="button"
                onClick={() => update({ tiers: [...form.tiers, newTierDraft()] })}
                className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-v2-card border border-dashed border-v2-c30 text-[14px] font-v2-ui-semibold text-v2-c70 hover:bg-v2-ink2 hover:text-v2-cream"
              >
                <Icon name="plus" size={16} />
                {t("eventForm.addTier", { n: form.tiers.length + 1 })}
              </button>
            )}
          </Section>

          <Section title={t("eventForm.guests")}>
            <Group>
              <SwitchRow
                title={t("eventForm.rsvp")}
                hint={t("eventForm.rsvpHint")}
                checked={form.requiresRsvp}
                onChange={(requiresRsvp) => update({ requiresRsvp })}
              />
            </Group>
          </Section>

          <Section title={t("eventForm.settings")}>
            <Group>
              <div className="px-4 py-3">
                <label htmlFor={fieldId("slug")} className="text-[13px] text-v2-c70">
                  {t("eventForm.link")}
                </label>
                <div className="mt-1.5 flex min-w-0 items-center rounded-v2-md bg-v2-ink3 pl-3 focus-within:ring-1 focus-within:ring-v2-c30">
                  <span className="shrink-0 truncate text-[13px] text-v2-c50 max-sm:max-w-[45%]">{host ? `${host}/events/` : "/events/"}</span>
                  <input
                    id={fieldId("slug")}
                    value={form.slug}
                    onChange={(e) => update({ slug: slugTyping(e.target.value), slugEdited: true })}
                    onBlur={() => update({ slug: slugify(form.slug) })}
                    aria-invalid={inv("slug")}
                    autoCapitalize="none"
                    spellCheck={false}
                    className="h-10 min-w-0 flex-1 bg-transparent pr-3 text-[14px] text-v2-cream focus:outline-none"
                  />
                </div>
                <FieldError path="slug" message={errorText("slug")} />
              </div>
              <Row label={t("eventForm.currency")} htmlFor="ef-currency">
                <select
                  id="ef-currency"
                  value={form.currency}
                  onChange={(e) => update({ currency: e.target.value })}
                  className={`${fieldCls} h-10 bg-v2-ink3`}
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
              </Row>
              <Row label={t("eventForm.timezone")} htmlFor="ef-timezone">
                <select
                  id="ef-timezone"
                  value={form.timezone}
                  onChange={(e) => update({ timezone: e.target.value })}
                  className={`${fieldCls} h-10 bg-v2-ink3`}
                >
                  {SUPPORTED_TIMEZONES.map((z) => (
                    <option key={z.value} value={z.value}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </Row>
            </Group>
            <p className="mt-2 text-[12.5px] text-v2-c50">{t("eventForm.fixedAfterPublish")}</p>
          </Section>
        </fieldset>

        <div className="sticky bottom-0 z-10 -mx-4 mt-6 bg-gradient-to-t from-black from-70% to-transparent px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-6 lg:mx-0 lg:px-0">
          {createdWithoutFlyer ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p role="status" className="flex-1 text-[13px] text-v2-warn">{t("eventForm.flyerUploadFailed")}</p>
              <Link
                href={routes.event(createdWithoutFlyer.id, organization.slug)}
                className="inline-flex h-11 items-center justify-center rounded-v2-pill bg-v2-cream px-5 text-[14px] font-v2-ui-semibold text-v2-ink"
              >
                {t("eventForm.goToEvent")}
              </Link>
            </div>
          ) : (
            <>
              {showErrors && errorCount > 0 && (
                <p role="alert" className="mb-2 text-center text-[13px] text-v2-errorText">
                  {t("eventForm.fixFields", { count: errorCount })}
                </p>
              )}
              {form.tiers.length > 0 && form.tiers.every((x) => x.hidden) && (
                <p role="status" className="mb-2 text-center text-[13px] text-v2-warn">
                  {t("eventForm.allHiddenWarning")}
                </p>
              )}
              {serverError && (
                <p role="alert" className="mb-2 text-center text-[13px] text-v2-errorText">
                  {serverError}
                </p>
              )}
              <button
                type="button"
                onClick={() => void publish()}
                disabled={busy}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-v2-pill bg-v2-cream px-5 text-[15px] font-v2-ui-semibold text-v2-ink disabled:opacity-60"
              >
                {stage === "publishing" ? t("eventForm.publishing") : stage === "flyer" ? t("eventForm.uploadingFlyer") : t("eventForm.publish")}
              </button>
            </>
          )}
        </div>
      </section>
    </OrganizerShell>
  );
}
