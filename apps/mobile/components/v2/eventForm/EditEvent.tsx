/**
 * Edit event v2 in the app (prototype "ow:edit"; same as apps/web/app/v2/organizer/event/[id]/edit):
 * flyer with "Change", name (fixed), WHEN with separate Starts / Ends rows, WHERE venue / city,
 * ABOUT with counter, tiers → Tiers tab, fixed settings; "Save changes" always at the bottom.
 * Only what changed is sent (PATCH /api/events); a date change asks first (ticket holders are
 * notified). Rules from @project-flame/lib (validateEditEventForm, buildUpdateEventPayload).
 */
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  EVENT_DESCRIPTION_MAX,
  SUPPORTED_TIMEZONES,
  buildUpdateEventPayload,
  canManageAssignedEvents,
  datesLocked,
  editFormFromEvent,
  eventFormToUtc,
  flameV2Colors as c,
  tiersSellingPastEnd,
  validateEditEventForm,
  type EditEventFormState,
  type EditableEvent,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiClient } from "../../../lib/api";
import { routes } from "../../../lib/v2/routes";
import { PUBLIC_SITE_URL, apiErrorText, type MyOrganization, type OrgEventV2 } from "../../../lib/v2/organizer-api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { useOrganizerModel } from "../../../hooks/v2/useOrganizerModel";
import { OrganizerShell } from "../OrganizerShell";
import { Button, ConfirmDialog, ErrorBox, Icon, Skeleton } from "../ui";
import { FormScreen } from "../form/FormScreen";
import { FlyerPicker, uploadFlyer, type FlyerFile } from "../form/FlyerPicker";
import { CityField } from "../form/CityField";
import { DateTimeRow, FieldError, Group, Hint, Input, Row, Section } from "../form/ui";
import { LineupFields } from "../form/LineupFields";

export function EditEvent({ eventId, organization }: { eventId: string; organization: MyOrganization }) {
  const { t } = useI18n();
  const router = useRouter();
  const { getToken } = useOptionalAuth();
  const { data, model, failed, refetch, invalidate } = useOrganizerModel(organization);

  const owned = (data?.events ?? []).find((e) => e.id === eventId);
  const cohosted = !owned && (data?.cohost_events ?? []).some((x) => x.event.id === eventId);
  const event = owned as (OrgEventV2 & EditableEvent & { slug: string }) | undefined;
  const allowed = canManageAssignedEvents(organization.role);

  const [form, setForm] = useState<EditEventFormState | null>(null);
  const [flyer, setFlyer] = useState<FlyerFile | null>(null);
  const [removeFlyer, setRemoveFlyer] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDates, setConfirmDates] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Fill once — the 15 s background refresh must not wipe what the organizer typed.
  useEffect(() => {
    if (event && !form) setForm(editFormFromEvent(event));
  }, [event, form]);

  const back = () => (router.canGoBack() ? router.back() : router.replace(routes.event(eventId, organization) as Href));
  const shell = (children: React.ReactNode) => (
    <OrganizerShell organization={organization} pending={model?.pending ?? 0} title={t("eventForm.titleEdit")} onBack={back} hideTabbar>
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
  if (!data) {
    return shell(
      <View className="items-center gap-4 px-4 pt-6">
        <Skeleton width={200} height={250} radius={16} />
        <Skeleton width="100%" height={48} radius={12} />
        <Skeleton width="100%" height={110} radius={16} />
      </View>,
    );
  }
  if (!event) return notice(cohosted ? t("eventForm.notEditable") : t("eventForm.notFound"));
  if (!allowed) return notice(t("eventForm.notEditable"));
  if (!form) return shell(null);

  const tz = event.timezone || "America/Guayaquil";
  const locked = datesLocked(event);
  const errors = validateEditEventForm(form, event);
  const errorText = (path: string) => (showErrors && errors[path] ? t(`eventForm.errors.${errors[path]!}`) : null);
  const inv = (path: string) => showErrors && Boolean(errors[path]);
  const update = (patch: Partial<EditEventFormState>) => {
    setMessage(null);
    setForm((f) => (f ? { ...f, ...patch } : f));
  };
  const blocking = errors.endsAt === "tierSalesAfterEnd" ? tiersSellingPastEnd(event, eventFormToUtc(form.endsAt, tz)) : [];
  const flyerIntent = flyer ? "pending" : removeFlyer ? "" : undefined;
  const errorCount = Object.keys(errors).length;

  const save = async (confirmed: boolean) => {
    if (saving) return;
    setShowErrors(true);
    setMessage(null);
    if (Object.keys(validateEditEventForm(form, event)).length > 0) return;
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
        try {
          imageUrl = (await uploadFlyer(flyer, event, getToken)) ?? undefined;
        } catch {
          imageUrl = undefined;
        }
        if (!imageUrl) {
          setMessage(t("eventForm.flyerUploadError"));
          return;
        }
      }
      await apiClient("/api/events", { method: "PATCH", body: JSON.stringify(buildUpdateEventPayload(form, event, imageUrl).payload), getToken });
      await invalidate();
      router.replace(routes.event(event.id, organization) as Href);
    } catch (e) {
      setMessage(apiErrorText(e, t("errors.generic")));
    } finally {
      setSaving(false);
    }
  };

  const tzLabel = SUPPORTED_TIMEZONES.find((z) => z.value === tz)?.label ?? tz;
  const host = PUBLIC_SITE_URL.replace(/^https?:\/\//, "");

  return shell(
    <>
      <FormScreen
        backdrop={flyer?.uri ?? (removeFlyer ? null : event.image_url || null)}
        actions={
          <View className="gap-2">
            {showErrors && errorCount > 0 && <Text accessibilityRole="alert" className="text-center font-v2-ui text-[13px] text-v2-errorText">{t("eventForm.fixFields", { count: errorCount })}</Text>}
            {message && <Text accessibilityRole="alert" className="text-center font-v2-ui text-[13px] text-v2-c90">{message}</Text>}
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button label={t("common.cancel")} onPress={back} disabled={saving} />
              </View>
              <View className="flex-[2]">
                <Button variant="primary" label={saving ? t("eventForm.saving") : t("eventForm.save")} onPress={() => void save(false)} disabled={saving} />
              </View>
            </View>
          </View>
        }
      >
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
          <View className="rounded-v2-md bg-v2-ink2 px-4 py-3">
            <Text className="font-v2-ui-semibold text-[17px] text-v2-cream">{event.name}</Text>
          </View>
          <Hint>{t("eventForm.lockedHint")}</Hint>
        </Section>

        <Section title={t("eventForm.when")} aside={t("eventForm.timesIn", { tz: tzLabel })}>
          <Group>
            <DateTimeRow label={t("eventForm.starts")} value={form.startsAt} onChange={(startsAt) => update({ startsAt })} tz={tz} invalid={inv("startsAt")} disabled={locked || saving} />
            <DateTimeRow label={t("eventForm.ends")} value={form.endsAt} onChange={(endsAt) => update({ endsAt })} tz={tz} invalid={inv("endsAt")} disabled={locked || saving} />
          </Group>
          {locked && <Hint>{t("eventForm.datesLockedHint")}</Hint>}
          <FieldError message={errorText("startsAt")} />
          <FieldError message={errorText("endsAt")} />
          {showErrors && blocking.length > 0 && <FieldError message={t("eventForm.tiersToFix", { names: blocking.map((b) => b.name).join(", ") })} />}
        </Section>

        <Section title={t("eventForm.where")}>
          <Group>
            <Row label={t("eventForm.venue")}>
              <Input bare value={form.venue} onChangeText={(venue) => update({ venue })} placeholder={t("eventForm.venuePlaceholder")} invalid={inv("venue")} editable={!saving} accessibilityLabel={t("eventForm.venue")} />
            </Row>
            <Row label={t("eventForm.city")}>
              <CityField value={form.city} onChange={(city) => update({ city })} placeholder={t("eventForm.cityPlaceholder")} invalid={inv("city")} editable={!saving} accessibilityLabel={t("eventForm.city")} />
            </Row>
          </Group>
          <FieldError message={errorText("venue")} />
          <FieldError message={errorText("city")} />
        </Section>

        <Section title={t("eventForm.about")} aside={`${form.description.length}/${EVENT_DESCRIPTION_MAX}`}>
          <Input
            value={form.description}
            onChangeText={(description) => update({ description })}
            maxLength={EVENT_DESCRIPTION_MAX}
            placeholder={t("eventForm.aboutPlaceholder")}
            accessibilityLabel={t("eventForm.about")}
            invalid={inv("description")}
            editable={!saving}
            multiline
            className="leading-[20px]"
          />
          <FieldError message={errorText("description")} />
        </Section>

        <Section title={t("eventForm.lineup")} aside={t("eventForm.lineupHint")}>
          <LineupFields value={form.lineup ?? []} onChange={(lineup) => update({ lineup })} errorText={errorText} disabled={saving} />
        </Section>

        <Section title={t("eventForm.tiers")}>
          <Pressable
            onPress={() => router.push(routes.event(event.id, organization, "tiers") as Href)}
            accessibilityRole="link"
            className="min-h-[52px] flex-row items-center gap-3 rounded-v2-card bg-v2-ink2 px-4 active:bg-v2-ink3"
          >
            <Icon name="ticket" size={18} />
            <Text className="flex-1 font-v2-ui-semibold text-[14px] text-v2-cream">{t("eventForm.tiersLink")}</Text>
            <Icon name="chev" size={16} color={c.c50} />
          </Pressable>
          {event.requires_rsvp && <Hint>{t("eventForm.questionsInTiers")}</Hint>}
        </Section>

        <Section title={t("eventForm.settings")}>
          <Group>
            <Row label={t("eventForm.link")}>
              <Text numberOfLines={1} className="font-v2-ui text-[14px] text-v2-c90">{`${host}/events/${event.slug}`}</Text>
            </Row>
            <Row label={t("eventForm.currency")}>
              <Text className="font-v2-ui text-[14px] text-v2-c90">{event.currency || "USD"}</Text>
            </Row>
            <Row label={t("eventForm.timezone")}>
              <Text className="font-v2-ui text-[14px] text-v2-c90">{tzLabel}</Text>
            </Row>
            <Row label={t("eventForm.rsvp")}>
              <Text className="font-v2-ui text-[14px] text-v2-c90">{event.requires_rsvp ? t("eventForm.rsvpYes") : t("eventForm.rsvpNo")}</Text>
            </Row>
          </Group>
          <Hint>{t("eventForm.lockedHint")}</Hint>
        </Section>
      </FormScreen>

      <ConfirmDialog
        open={confirmDates}
        message={t("eventForm.dateChangeTitle")}
        detail={t("eventForm.dateChangeDetail")}
        confirmLabel={t("eventForm.dateChangeConfirm")}
        busy={saving}
        onConfirm={() => void save(true)}
        onCancel={() => setConfirmDates(false)}
      />
    </>,
  );
}
