import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  ScrollView,
  Alert,
  ActivityIndicator,
  Text,
  Pressable,
} from "react-native";
import { colors } from "@project-flame/ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { getTabBarPaddingBottom } from "../../components/navigation/CustomTabBar";
import { DashboardBar } from "../../components/dashboard/DashboardBar";
import {
  CreateEventTabs,
  type CreateEventTab,
} from "../../components/create-event/CreateEventTabs";
import { EventDetailsTab } from "../../components/create-event/EventDetailsTab";
import { TicketTiersTab } from "../../components/create-event/TicketTiersTab";
import { KeyboardDoneBar } from "../../components/create-event/KeyboardDoneBar";
import { useOrgData } from "../../hooks/useOrgData";
import {
  useCreateEvent,
  type CreateEventTierInput,
} from "../../hooks/useCreateEvent";
import { RequireAuthGate } from "../../hooks/useRequireAuth";
import {
  generateSlug,
  localToUtc,
  normalizeOptionalTicketTierSecretCode,
  normalizeTicketTierSecretCode,
} from "@project-flame/lib";
import { useMemberRoleContext } from "../../contexts/MemberRoleContext";
import type { FormField } from "../../hooks/useRsvpManagement";
import { apiUploadFormData, apiPatch } from "../../lib/api";
import { useOptionalAuth } from "../../hooks/useOptionalAuth";
import { useQueryClient } from "@tanstack/react-query";

const DASHBOARD_BAR_HEIGHT = 62;
const TABS_HEIGHT = 42;

export interface EventFormData {
  name: string;
  slug: string;
  city: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  description: string;
  image_url: string;
  requires_rsvp: boolean;
  currency: string;
  timezone: string;
  registration_form_config: FormField[];
}

const DEVICE_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Guayaquil";

const INITIAL_EVENT_FORM: EventFormData = {
  name: "",
  slug: "",
  city: "",
  venue: "",
  starts_at: "",
  ends_at: "",
  description: "",
  image_url: "",
  requires_rsvp: true,
  currency: "USD",
  timezone: DEVICE_TIMEZONE,
  registration_form_config: [],
};

function makeTierId(): string {
  return `tier-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Default tier for new events. Return a fresh object to avoid shared mutation. */
function makeDefaultTier(): CreateEventTierInput {
  return {
    id: makeTierId(),
    name: "General Admission",
    price_cents: 0,
    quantity_total: 500,
    per_user_limit: 20,
    sales_start: "",
    sales_end: "",
    secret_code: null,
    useStages: false,
    stages: undefined,
  };
}

export default function CreateEventScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<CreateEventTab>("event-details");
  const routeParams = useLocalSearchParams<{ orgId?: string | string[] }>();
  const routeOrgId = Array.isArray(routeParams.orgId)
    ? routeParams.orgId[0]
    : routeParams.orgId;
  const { selectedOrgId, setSelectedOrgId } = useMemberRoleContext();

  // Create Event is entered from Screen 3 with ?orgId=X. Sync the context so
  // useOrgData always resolves the exact org the user opened — avoids the old
  // "global Create tab flickered between orgs" bug. Ref-keyed to prevent loops.
  const syncedOrgIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (routeOrgId && syncedOrgIdRef.current !== routeOrgId) {
      syncedOrgIdRef.current = routeOrgId;
      setSelectedOrgId(routeOrgId);
    }
  }, [routeOrgId, setSelectedOrgId]);

  const effectiveOrgId = routeOrgId ?? selectedOrgId;
  const {
    data: orgData,
    isLoading: orgLoading,
    isError: orgError,
    refetch: refetchOrg,
  } = useOrgData(effectiveOrgId);
  const createEvent = useCreateEvent();

  const [eventForm, setEventForm] = useState<EventFormData>(INITIAL_EVENT_FORM);
  const [tiers, setTiers] = useState<CreateEventTierInput[]>(() => [
    makeDefaultTier(),
  ]);

  const { getToken, userId } = useOptionalAuth();
  const queryClient = useQueryClient();
  const isSubmittingRef = useRef(false);

  // Sanitize draft event-form fields before forwarding to the per-tier picker so
  // blank-label placeholders the organizer is still typing in the Event Details
  // tab don't leak into the per-tier registration sheet on the Ticket Tiers tab.
  // Mirrors the submit-time sanitization at line 346 (`.filter(f => f.label.trim() !== "")`).
  const sanitizedEventFormFields = useMemo(
    () =>
      eventForm.registration_form_config.filter((f) => f.label.trim() !== ""),
    [eventForm.registration_form_config],
  );

  const updateEventField = useCallback(
    <K extends keyof EventFormData>(key: K, value: EventFormData[K]) => {
      setEventForm(prev => {
        const next = { ...prev, [key]: value };
        if (key === "name") {
          next.slug = generateSlug(String(value));
        }
        return next;
      });
    },
    [],
  );

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleAddTier = useCallback(() => {
    setTiers(prev => [
      ...prev,
      {
        id: makeTierId(),
        name: `Tier ${prev.length + 1}`,
        price_cents: 0,
        quantity_total: 500,
        per_user_limit: 20,
        sales_start: "",
        sales_end: "",
        secret_code: null,
        useStages: false,
        stages: undefined,
      },
    ]);
  }, []);

  const handleUpdateTier = useCallback(
    (tierId: string, tier: CreateEventTierInput) => {
      setTiers(prev =>
        prev.map(t => (t.id === tierId ? { ...tier, id: tierId } : t)),
      );
    },
    [],
  );

  const handleRemoveTier = useCallback((tierId: string) => {
    setTiers(prev => prev.filter(t => t.id !== tierId));
  }, []);

  const isCreateEventDisabled =
    !eventForm.name.trim() ||
    !eventForm.city.trim() ||
    !eventForm.venue.trim() ||
    !eventForm.starts_at ||
    !eventForm.ends_at ||
    tiers.length === 0 ||
    tiers.some(t => {
      if (!t.name?.trim() || !t.sales_end) return true;
      if (t.sales_start && t.sales_end) {
        const start = new Date(t.sales_start).getTime();
        const end = new Date(t.sales_end).getTime();
        if (!isNaN(start) && !isNaN(end) && end <= start) return true;
      }
      if (!t.useStages) return t.quantity_total == null || t.quantity_total < 1;
      return !t.stages || t.stages.length === 0;
    });

  const handleSubmit = useCallback(async () => {
    if (isSubmittingRef.current) return;
    setSubmitError("");
    if (!orgData?.organizationId) {
      Alert.alert("Error", "No organization found. Please check your account.");
      return;
    }

    if (!eventForm.name.trim()) {
      setSubmitError("Event name is required. Go to the Event Details tab.");
      return;
    }
    const slug = eventForm.slug.trim() || generateSlug(eventForm.name);
    const sanitizedSlug = slug
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!sanitizedSlug) {
      setSubmitError("Event name must contain at least one letter or number.");
      return;
    }
    if (!eventForm.venue.trim()) {
      setSubmitError("Venue is required. Go to the Event Details tab.");
      return;
    }
    if (!eventForm.city.trim()) {
      setSubmitError("City is required. Go to the Event Details tab.");
      return;
    }
    if (!eventForm.starts_at) {
      setSubmitError("Start date and time is required. Go to the Event Details tab.");
      return;
    }
    if (!eventForm.ends_at) {
      setSubmitError("End date and time is required. Go to the Event Details tab.");
      return;
    }
    const tz = eventForm.timezone || "America/Guayaquil";
    const startsAtStr = localToUtc(eventForm.starts_at, tz);
    const startsAtDate = startsAtStr ? new Date(startsAtStr) : new Date(NaN);
    if (isNaN(startsAtDate.getTime())) {
      setSubmitError("Start date and time is invalid. Go to the Event Details tab.");
      return;
    }
    const endsAtStr = localToUtc(eventForm.ends_at, tz);
    const endsAtDate = endsAtStr ? new Date(endsAtStr) : new Date(NaN);
    if (isNaN(endsAtDate.getTime())) {
      setSubmitError("End date and time is invalid. Go to the Event Details tab.");
      return;
    }
    if (endsAtDate <= startsAtDate) {
      setSubmitError("End date must be after start date. Go to the Event Details tab.");
      return;
    }
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
    if (startsAtDate < twoHoursFromNow) {
      setSubmitError("Event start time must be at least 2 hours in the future. Go to the Event Details tab.");
      return;
    }
    if (tiers.length === 0) {
      setSubmitError("At least one ticket tier is required.");
      return;
    }
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      if (!t.name?.trim()) {
        setSubmitError(`Tier ${i + 1} must have a name.`);
        return;
      }
      const tierSecret = normalizeTicketTierSecretCode(
        typeof t.secret_code === "string" ? t.secret_code : "",
      );
      if (tierSecret.length > 0 && tierSecret.length < 3) {
        setSubmitError(
          `Tier "${t.name}": Access code must be at least 3 characters or left blank.`,
        );
        return;
      }
      if (!t.sales_end) {
        setSubmitError(`Tier "${t.name}" must have a sale end date.`);
        return;
      }
      if (t.sales_start) {
        const tierSalesStart = new Date(t.sales_start).getTime();
        const tierSalesEnd = new Date(t.sales_end).getTime();
        if (
          !isNaN(tierSalesStart) &&
          !isNaN(tierSalesEnd) &&
          tierSalesEnd <= tierSalesStart
        ) {
          setSubmitError(`Tier "${t.name}": Sale end date must be after sale start date.`);
          return;
        }
      }
      if (!t.useStages && (t.quantity_total == null || t.quantity_total < 1)) {
        setSubmitError(`Tier "${t.name}" must have at least 1 ticket.`);
        return;
      }
      if (t.useStages && (!t.stages || t.stages.length === 0)) {
        setSubmitError(`Tier "${t.name}" must have at least one price stage when using staged pricing.`);
        return;
      }
    }

    const startsAtUtc = localToUtc(eventForm.starts_at, tz);
    const endsAtUtc = localToUtc(eventForm.ends_at, tz);
    if (!startsAtUtc) {
      setSubmitError("Start date and time could not be converted. Please check the format.");
      return;
    }
    if (!endsAtUtc) {
      setSubmitError("End date and time could not be converted. Please check the format.");
      return;
    }
    const ticketTiersForApi = tiers.map(t => {
      const rawSalesStart = t.sales_start ? localToUtc(t.sales_start, tz) : null;
      const sales_start = rawSalesStart || null; // "" fallback → null (optional field)
      const sales_end = localToUtc(t.sales_end, tz);
      const secret_code = normalizeOptionalTicketTierSecretCode(
        typeof t.secret_code === "string" ? t.secret_code : undefined,
      );
      // W4-C2 (May 2026): forward the tier-level description (trim, empty → null).
      // Per-stage descriptions ride along inside `t.stages` below; this is the
      // tier-level field which the explicit mapping previously dropped.
      const trimmedDescription =
        typeof t.description === "string" ? t.description.trim() : "";
      const description =
        trimmedDescription.length === 0 ? null : trimmedDescription;
      return {
        name: t.name,
        price_cents: t.price_cents,
        quantity_total: t.quantity_total,
        per_user_limit: t.per_user_limit,
        sales_start,
        sales_end,
        secret_code,
        description,
        useStages: t.useStages ?? false,
        ...(t.useStages && t.stages && t.stages.length > 0
          ? { stages: t.stages }
          : {}),
      };
    });
    const invalidTierIndex = ticketTiersForApi.findIndex(
      t => !t.sales_end,
    );
    if (invalidTierIndex >= 0) {
      setSubmitError(
        `Ticket tier "${tiers[invalidTierIndex]?.name ?? "unknown"}" has an invalid sale end date. Please check the format.`,
      );
      return;
    }

    isSubmittingRef.current = true;
    try {
      const validFormFields = eventForm.registration_form_config.filter(
        (f) => f.label.trim() !== "",
      );
      const data = await createEvent.mutateAsync({
        event: {
          organization_id: orgData.organizationId,
          name: eventForm.name.trim(),
          slug: sanitizedSlug,
          city: eventForm.city.trim(),
          venue: eventForm.venue.trim(),
          starts_at: startsAtUtc,
          ends_at: endsAtUtc,
          description: eventForm.description.trim() || undefined,
          image_url: undefined,
          requires_rsvp: eventForm.requires_rsvp,
          currency: eventForm.currency,
          timezone: tz,
          ...(eventForm.requires_rsvp &&
            validFormFields.length > 0 && {
              registration_form_config: validFormFields,
            }),
        },
        ticket_tiers: ticketTiersForApi,
      });

      let imageUploadSucceeded = true;
      if (imageUri && data?.event?.slug && getToken) {
        setIsUploadingImage(true);
        try {
          const formData = new FormData();
          // React Native FormData accepts { uri, name, type } for file uploads; TS lib doesn't declare it
          formData.append("file", {
            uri: imageUri,
            name: "image.jpg",
            type: "image/jpeg",
          } as unknown as Blob);
          // Prefer eventId (UUID, globally unique) over eventSlug so the
          // server never hits cross-org slug ambiguity. See upload-image
          // route for rationale. eventSlug retained as a fallback for older
          // server versions during rollout.
          formData.append("eventId", data.event.id);
          formData.append("eventSlug", data.event.slug);

          const { url } = await apiUploadFormData<{ url: string }>(
            "/api/upload-image",
            formData,
            getToken,
          );

          if (!url) {
            throw new Error("Image upload failed: no URL returned");
          }
          await apiPatch(
            "/api/events",
            { id: data.event.id, image_url: url },
            getToken,
          );
          queryClient.invalidateQueries({ queryKey: ["events"] });
          queryClient.invalidateQueries({ queryKey: ["org-events"] });
        } catch (uploadErr) {
          imageUploadSucceeded = false;
          console.error("[create-event] Image upload failed", {
            action: "image_upload",
            userId: userId ?? undefined,
            eventId: data?.event?.id ?? undefined,
            err:
              uploadErr instanceof Error
                ? uploadErr.message
                : String(uploadErr),
          });
          Alert.alert(
            "Image Upload Failed",
            "Your event was created, but the image could not be uploaded. You can add an image later by editing the event.",
            [{ text: "OK" }],
          );
        } finally {
          setIsUploadingImage(false);
        }
      }

      if (imageUploadSucceeded) {
        Alert.alert("Success", "Event created successfully!", [
          {
            text: "OK",
            onPress: () => {
              setEventForm({ ...INITIAL_EVENT_FORM, registration_form_config: [] });
              setTiers([makeDefaultTier()]);
              setImageUri(null);
              setActiveTab("event-details");
            },
          },
        ]);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create event";
      console.error("[create-event] createEvent failed", {
        userId: userId ?? undefined,
        eventId: undefined,
        action: "createEvent",
        err: err instanceof Error ? (err.stack ?? err.message) : String(err),
      });
      Alert.alert("Error", message);
    } finally {
      isSubmittingRef.current = false;
      setIsUploadingImage(false);
    }
  }, [orgData, eventForm, tiers, imageUri, createEvent, getToken, userId]);

  if (orgLoading) {
    return (
      <RequireAuthGate>
        <View className="flex-1 bg-background items-center justify-center">
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text className="text-white-50 mt-4 text-sm font-poppins">
            Loading organization...
          </Text>
        </View>
      </RequireAuthGate>
    );
  }

  if (orgError) {
    return (
      <RequireAuthGate>
        <View className="flex-1 bg-background items-center justify-center px-6 gap-3">
          <Text className="text-white-100 text-lg font-poppins-semibold text-center">
            Unable to load organization
          </Text>
          <Text className="text-white-80 text-sm font-poppins text-center">
            Please check your connection and try again.
          </Text>
          <Pressable
            onPress={() => refetchOrg()}
            className="mt-4 bg-white-100 rounded-pill px-6 py-2"
          >
            <Text className="text-dark font-poppins-medium">Retry</Text>
          </Pressable>
        </View>
      </RequireAuthGate>
    );
  }

  if (!orgData?.organizationId) {
    return (
      <RequireAuthGate>
        <View className="flex-1 bg-background items-center justify-center px-6">
          <Text className="text-white-100 text-lg font-poppins-semibold text-center">
            No organization found
          </Text>
          <Text className="text-white-80 mt-2 text-sm font-poppins text-center">
            You need to be part of an organization to create events. Please
            check your account.
          </Text>
        </View>
      </RequireAuthGate>
    );
  }

  return (
    <RequireAuthGate>
      <View className="flex-1 bg-background">
        <View className="absolute w-full z-10">
          <DashboardBar title="Create Event" avatarUrl={orgData?.logoUrl} />
          <CreateEventTabs activeTab={activeTab} onTabChange={setActiveTab} />
        </View>
        <ScrollView
          className="flex-1 bg-background"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop: DASHBOARD_BAR_HEIGHT + TABS_HEIGHT,
            paddingBottom: getTabBarPaddingBottom(insets.bottom),
          }}
        >
          <KeyboardDoneBar />
          {orgData?.organizationName ? (
            <Text className="text-white-50 text-sm font-poppins text-center px-4 py-4">
              Creating under {orgData.organizationName}
            </Text>
          ) : null}
          {activeTab === "event-details" ? (
            <EventDetailsTab
              form={eventForm}
              onFieldChange={updateEventField}
              onNextStep={() => setActiveTab("ticket-tiers")}
              tiersCount={tiers.length}
              imageUri={imageUri}
              onImageChange={setImageUri}
            />
          ) : (
            <TicketTiersTab
              tiers={tiers}
              onAddTier={handleAddTier}
              onUpdateTier={handleUpdateTier}
              onRemoveTier={handleRemoveTier}
              onCreateEvent={handleSubmit}
              isCreating={createEvent.isPending || isUploadingImage}
              isCreateEventDisabled={isCreateEventDisabled}
              eventEndsAt={eventForm.ends_at}
              eventTimezone={eventForm.timezone}
              eventFormFields={sanitizedEventFormFields}
              submitError={submitError}
            />
          )}
        </ScrollView>
      </View>
    </RequireAuthGate>
  );
}
