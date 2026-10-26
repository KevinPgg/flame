/**
 * Create event v2 in the app (prototype "ow:create"; same as apps/web/app/v2/organizer/create):
 * flyer → name → when → where → about → tiers → guests → settings, "Publish event" fixed at the
 * bottom. Same payload and rules as the web (@project-flame/lib event-form): POST /api/events,
 * then the flyer (POST /api/upload-image + PATCH image_url). If only the flyer fails, the event
 * exists: say so and offer "Go to event".
 */
import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import {
  EVENT_DESCRIPTION_MAX,
  MAX_TICKET_TIERS_PER_EVENT,
  SUPPORTED_CURRENCIES,
  SUPPORTED_TIMEZONES,
  buildCreateEventPayload,
  canCreateEvents,
  emptyEventForm,
  firstErrorPath,
  flameV2Colors as c,
  getNowInTimezone,
  newTierDraft,
  reusableQuestions,
  slugify,
  suggestEnd,
  validateEventForm,
  type EventFormState,
  type TierDraft,
} from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { apiClient, apiPost } from "../../../lib/api";
import { routes } from "../../../lib/v2/routes";
import { PUBLIC_SITE_URL, apiErrorText, type MyOrganization } from "../../../lib/v2/organizer-api";
import { useOptionalAuth } from "../../../hooks/useOptionalAuth";
import { useOrganizerModel } from "../../../hooks/v2/useOrganizerModel";
import { OrganizerShell } from "../OrganizerShell";
import { Button, ErrorBox, Icon } from "../ui";
import { FormScreen } from "../form/FormScreen";
import { FlyerPicker, uploadFlyer as uploadFlyerFile, type FlyerFile } from "../form/FlyerPicker";
import { CityField } from "../form/CityField";
import { TierFields } from "../form/TierFields";
import { DateTimeRow, FieldError, Group, Hint, Input, Row, Section, SelectRow, SwitchRow } from "../form/ui";

type Stage = "idle" | "publishing" | "flyer";

/** While typing the link: same characters the server accepts, accents stripped (as the web). */
const slugTyping = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .slice(0, 100);

export function CreateEvent({ organization }: { organization: MyOrganization }) {
  const { t } = useI18n();
  const router = useRouter();
  const { getToken } = useOptionalAuth();
  const { model, invalidate } = useOrganizerModel(organization);

  const [form, setForm] = useState<EventFormState>(() => emptyEventForm({ firstTierName: "" }));
  const [endAuto, setEndAuto] = useState(true);
  const [flyer, setFlyer] = useState<FlyerFile | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const [createdWithoutFlyer, setCreatedWithoutFlyer] = useState<{ id: string } | null>(null);
  const scroll = useRef<ScrollView>(null);
  /** y of each section (and of each tier, by key) so "Publish" can scroll to the first problem. */
  const positions = useRef<Record<string, number>>({});
  const at = (key: string) => ({ onLayout: (e: { nativeEvent: { layout: { y: number } } }) => (positions.current[key] = e.nativeEvent.layout.y) });

  const back = () => (router.canGoBack() ? router.back() : router.replace(routes.dashboard(organization) as Href));
  const shell = (children: React.ReactNode) => (
    <OrganizerShell organization={organization} pending={model?.pending ?? 0} title={t("eventForm.titleCreate")} onBack={back} hideTabbar>
      {children}
    </OrganizerShell>
  );

  const errors = validateEventForm(form, new Date());
  const errorCount = Object.keys(errors).length;
  const errorText = (path: string) => (showErrors && errors[path] ? t(`eventForm.errors.${errors[path]!}`) : null);
  const inv = (path: string) => showErrors && Boolean(errors[path]);
  const busy = stage !== "idle" || createdWithoutFlyer !== null;
  const tierDefaults = useMemo(
    () => ({ salesStart: getNowInTimezone(form.timezone), salesEnd: form.endsAt || form.startsAt || getNowInTimezone(form.timezone, 24) }),
    [form.timezone, form.endsAt, form.startsAt],
  );

  if (!canCreateEvents(organization.role)) {
    return shell(
      <View className="px-4 pt-6">
        <ErrorBox message={t("eventForm.notAllowedCreate")} onRetry={back} retryLabel={t("common.back")} />
      </View>,
    );
  }

  const update = (patch: Partial<EventFormState>) => setForm((f) => ({ ...f, ...patch }));
  const setTier = (i: number, tier: TierDraft) => update({ tiers: form.tiers.map((x, j) => (j === i ? tier : x)) });
  const currency = SUPPORTED_CURRENCIES.find((x) => x.code === form.currency);
  const tzLabel = SUPPORTED_TIMEZONES.find((z) => z.value === form.timezone)?.label ?? form.timezone;
  const host = PUBLIC_SITE_URL.replace(/^https?:\/\//, "");

  const scrollToFirstError = (path: string | null) => {
    if (!path) return;
    const key = path.startsWith("tiers.") ? `tier:${path.split(".")[1]}` : ["startsAt", "endsAt"].includes(path) ? "when" : ["venue", "city"].includes(path) ? "where" : path === "tiers" ? "tiersSection" : path;
    const y = positions.current[key];
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  };

  const uploadFlyer = async (event: { id: string; slug: string }): Promise<boolean> => {
    if (!flyer) return true;
    try {
      const url = await uploadFlyerFile(flyer, event, getToken);
      if (!url) return false;
      await apiClient("/api/events", { method: "PATCH", body: JSON.stringify({ id: event.id, image_url: url }), getToken });
      return true;
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
      scrollToFirstError(firstErrorPath(form, current));
      return;
    }
    setStage("publishing");
    let created: { id: string; slug: string };
    try {
      created = (await apiPost<{ event: { id: string; slug: string } }>("/api/events", buildCreateEventPayload(form, organization.id) as unknown as Record<string, unknown>, getToken)).event;
    } catch (e) {
      setServerError(apiErrorText(e, t("errors.generic")));
      setStage("idle");
      return;
    }
    void invalidate();
    if (flyer) {
      setStage("flyer");
      const ok = await uploadFlyer(created);
      if (!ok) {
        setCreatedWithoutFlyer({ id: created.id });
        setStage("idle");
        return;
      }
    }
    setStage("idle");
    router.replace(routes.event(created.id, organization) as Href);
  };

  return shell(
    <FormScreen
      scrollRef={scroll}
      backdrop={flyer?.uri ?? null}
      actions={
        createdWithoutFlyer ? (
          <View className="gap-2">
            <Text accessibilityRole="alert" className="text-center font-v2-ui text-[13px] text-v2-warn">{t("eventForm.flyerUploadFailed")}</Text>
            <Button variant="primary" label={t("eventForm.goToEvent")} onPress={() => router.replace(routes.event(createdWithoutFlyer.id, organization) as Href)} />
          </View>
        ) : (
          <View className="gap-2">
            {showErrors && errorCount > 0 && <Text accessibilityRole="alert" className="text-center font-v2-ui text-[13px] text-v2-errorText">{t("eventForm.fixFields", { count: errorCount })}</Text>}
            {form.tiers.length > 0 && form.tiers.every((x) => x.hidden) && <Text className="text-center font-v2-ui text-[13px] text-v2-warn">{t("eventForm.allHiddenWarning")}</Text>}
            {serverError && <Text accessibilityRole="alert" className="text-center font-v2-ui text-[13px] text-v2-errorText">{serverError}</Text>}
            <Button
              variant="primary"
              label={stage === "publishing" ? t("eventForm.publishing") : stage === "flyer" ? t("eventForm.uploadingFlyer") : t("eventForm.publish")}
              onPress={() => void publish()}
              disabled={busy}
            />
          </View>
        )
      }
    >
      <FlyerPicker value={flyer} onChange={setFlyer} disabled={busy} />

      <View {...at("name")}>
        <Section title={t("eventForm.name")}>
          <Input
            value={form.name}
            onChangeText={(name) => update(form.slugEdited ? { name } : { name, slug: slugify(name) })}
            placeholder={t("eventForm.namePlaceholder")}
            accessibilityLabel={t("eventForm.name")}
            invalid={inv("name")}
            editable={!busy}
            className="h-12 font-v2-ui-semibold text-[17px]"
          />
          <FieldError message={errorText("name")} />
        </Section>
      </View>

      <View {...at("when")}>
        <Section title={t("eventForm.when")} aside={t("eventForm.timesIn", { tz: tzLabel })}>
          <Group>
            <DateTimeRow
              label={t("eventForm.starts")}
              value={form.startsAt}
              onChange={(startsAt) => update(endAuto && startsAt ? { startsAt, endsAt: suggestEnd(startsAt) } : { startsAt })}
              tz={form.timezone}
              invalid={inv("startsAt")}
              disabled={busy}
              minimumDate={new Date()}
            />
            <DateTimeRow
              label={t("eventForm.ends")}
              value={form.endsAt}
              onChange={(endsAt) => {
                setEndAuto(false);
                update({ endsAt });
              }}
              tz={form.timezone}
              invalid={inv("endsAt")}
              disabled={busy}
              minimumDate={new Date()}
            />
          </Group>
          <FieldError message={errorText("startsAt")} />
          <FieldError message={errorText("endsAt")} />
        </Section>
      </View>

      <View {...at("where")}>
        <Section title={t("eventForm.where")}>
          <Group>
            <Row label={t("eventForm.venue")}>
              <Input bare value={form.venue} onChangeText={(venue) => update({ venue })} placeholder={t("eventForm.venuePlaceholder")} invalid={inv("venue")} editable={!busy} accessibilityLabel={t("eventForm.venue")} />
            </Row>
            <Row label={t("eventForm.city")}>
              <CityField value={form.city} onChange={(city) => update({ city })} placeholder={t("eventForm.cityPlaceholder")} invalid={inv("city")} editable={!busy} accessibilityLabel={t("eventForm.city")} />
            </Row>
          </Group>
          <FieldError message={errorText("venue")} />
          <FieldError message={errorText("city")} />
        </Section>
      </View>

      <View {...at("description")}>
        <Section title={t("eventForm.about")} aside={`${form.description.length}/${EVENT_DESCRIPTION_MAX}`}>
          <Input
            value={form.description}
            onChangeText={(description) => update({ description })}
            maxLength={EVENT_DESCRIPTION_MAX}
            placeholder={t("eventForm.aboutPlaceholder")}
            accessibilityLabel={t("eventForm.about")}
            invalid={inv("description")}
            editable={!busy}
            multiline
            className="leading-[20px]"
          />
          <FieldError message={errorText("description")} />
        </Section>
      </View>

      <View {...at("tiersSection")}>
        <Section title={t("eventForm.tiers")} aside={t("eventForm.tiersHint")}>
          <View className="gap-3">
            {form.tiers.map((tier, i) => (
              <View key={tier.key} onLayout={(e) => (positions.current[`tier:${tier.key}`] = (positions.current.tiersSection ?? 0) + 40 + e.nativeEvent.layout.y)}>
                <TierFields
                  tier={tier}
                  index={i}
                  canRemove={form.tiers.length > 1}
                  currencySymbol={currency?.symbol ?? "$"}
                  defaults={tierDefaults}
                  tz={form.timezone}
                  requiresRsvp={form.requiresRsvp}
                  reusable={reusableQuestions(form.tiers, i)}
                  errors={showErrors ? errors : {}}
                  errorText={errorText}
                  onChange={(next) => setTier(i, next)}
                  onRemove={() => update({ tiers: form.tiers.filter((_, j) => j !== i) })}
                />
              </View>
            ))}
          </View>
          <FieldError message={errorText("tiers")} />
          {form.tiers.length < MAX_TICKET_TIERS_PER_EVENT && (
            <Pressable
              onPress={() => update({ tiers: [...form.tiers, newTierDraft()] })}
              disabled={busy}
              accessibilityRole="button"
              className="mt-3 h-12 flex-row items-center justify-center gap-2 rounded-v2-card border border-dashed border-v2-c30 active:bg-v2-ink2"
            >
              <Icon name="plus" size={16} color={c.c70} />
              <Text className="font-v2-ui-semibold text-[14px] text-v2-c70">{t("eventForm.addTier", { n: form.tiers.length + 1 })}</Text>
            </Pressable>
          )}
        </Section>
      </View>

      <Section title={t("eventForm.guests")}>
        <Group>
          <SwitchRow title={t("eventForm.rsvp")} hint={t("eventForm.rsvpHint")} checked={form.requiresRsvp} onChange={(requiresRsvp) => update({ requiresRsvp })} disabled={busy} />
        </Group>
      </Section>

      <View {...at("slug")}>
        <Section title={t("eventForm.settings")}>
          <Group>
            <View className="px-4 py-3">
              <Text className="font-v2-ui text-[13px] text-v2-c70">{t("eventForm.link")}</Text>
              <View className={`mt-1.5 flex-row items-center rounded-v2-md bg-v2-ink3 pl-3 ${inv("slug") ? "border border-v2-errorText" : ""}`}>
                <Text numberOfLines={1} className="max-w-[48%] font-v2-ui text-[13px] text-v2-c50">{`${host}/events/`}</Text>
                <View className="min-w-0 flex-1">
                  <Input
                    bare
                    value={form.slug}
                    onChangeText={(v) => update({ slug: slugTyping(v), slugEdited: true })}
                    onBlur={() => update({ slug: slugify(form.slug) })}
                    autoCapitalize="none"
                    editable={!busy}
                    accessibilityLabel={t("eventForm.link")}
                  />
                </View>
              </View>
              <FieldError message={errorText("slug")} />
            </View>
            <SelectRow label={t("eventForm.currency")} value={form.currency} options={SUPPORTED_CURRENCIES.map((x) => ({ value: x.code, label: `${x.code} - ${x.name}` }))} onChange={(v) => update({ currency: v })} />
            <SelectRow label={t("eventForm.timezone")} value={form.timezone} options={SUPPORTED_TIMEZONES.map((z) => ({ value: z.value, label: z.label }))} onChange={(v) => update({ timezone: v })} />
          </Group>
          <Hint>{t("eventForm.fixedAfterPublish")}</Hint>
        </Section>
      </View>
    </FormScreen>,
  );
}
