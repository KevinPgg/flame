/**
 * Edit event details tab — wired to PATCH /api/events.
 *
 * Ported from: apps/web/app/api/events/route.ts (PATCH handler)
 * Editable fields: starts_at, ends_at, venue, city, description, image_url.
 * Uses event.timezone for timezone-aware date conversion (utcToLocal/localToUtc).
 *
 * Web Parity Gate (Section 9.1):
 * - Web source: apps/web/app/api/events/route.ts (PATCH handler, updateEventSchema)
 * - API: PATCH /api/events — same fields (starts_at, ends_at, venue, city, description, image_url)
 * - Helpers: utcToLocal, localToUtc from @project-flame/lib
 * - Image upload: POST /api/upload-image (FormData: file, eventSlug) → PATCH with image_url
 * - Edge cases: overnight events, DST, missing timezone (→ America/Guayaquil), invalid dates → Alert
 */

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameImage, colors } from "@project-flame/ui";
import { utcToLocal, localToUtc } from "@project-flame/lib";
import { z } from "zod";
import { useUpdateEvent } from "../../hooks/useUpdateEvent";
import { DateTimePickerField } from "../create-event/DateTimePickerField";
import { CityAutocompleteField } from "../create-event/CityAutocompleteField";
import { RegistrationFormBuilder } from "../create-event/RegistrationFormBuilder";
import { LinkableText } from "../LinkableText";
import { FormFieldSchema } from "../../hooks/useRsvpManagement";
import type { FormField } from "../../hooks/useRsvpManagement";
import type { UpdateEventInput } from "../../hooks/useUpdateEvent";
import type { OrgEvent } from "../../hooks/useOrgEvents";
import * as ImagePicker from "expo-image-picker";
import { apiUploadFormData } from "../../lib/api";
import { processEventImageTo4x5 } from "../../lib/event-image";
import { useOptionalAuth } from "../../hooks/useOptionalAuth";

function FilledInput({
  label,
  value,
  icon,
  editable,
  onChangeText,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  editable?: boolean;
  onChangeText?: (text: string) => void;
}) {
  return (
    <View className="bg-white-5 border border-white-30 rounded-pill flex-row items-center gap-4 px-4 py-2">
      {icon}
      <View className="flex-1 gap-0">
        <Text className="text-white-70 text-xs leading-4 font-poppins">
          {label}
        </Text>
        {editable ? (
          <TextInput
            className="text-white-100 text-sm leading-5 font-poppins p-0"
            value={value}
            onChangeText={onChangeText}
          />
        ) : (
          <Text className="text-white-100 text-sm leading-5 font-poppins">
            {value}
          </Text>
        )}
      </View>
    </View>
  );
}

interface EditEventDetailsTabProps {
  event: OrgEvent | null;
  readOnly?: boolean;
}

const SUPPORTED_TYPES = "JPEG, JPG, PNG, WEBP";

export function EditEventDetailsTab({ event, readOnly = false }: EditEventDetailsTabProps) {
  const updateEvent = useUpdateEvent();
  const { getToken } = useOptionalAuth();

  const [startsAtLocal, setStartsAtLocal] = useState("");
  const [endsAtLocal, setEndsAtLocal] = useState("");
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [formEnabled, setFormEnabled] = useState(false);
  const [formConfigParseError, setFormConfigParseError] = useState<string | null>(null);

  const tz = event?.timezone ?? "America/Guayaquil";

  const minimumEndDate = useMemo(() => {
    if (!startsAtLocal) return undefined;
    const utc = localToUtc(startsAtLocal, tz);
    return utc ? new Date(utc) : undefined;
  }, [startsAtLocal, tz]);

  useEffect(() => {
    if (event) {
      const tzEvent = event.timezone ?? "America/Guayaquil";
      setStartsAtLocal(event.starts_at ? utcToLocal(event.starts_at, tzEvent) : "");
      setEndsAtLocal(event.ends_at ? utcToLocal(event.ends_at, tzEvent) : "");
      setVenue(event.venue ?? "");
      setCity(event.city ?? "");
      setDescription(event.description ?? "");

      const configParse = z
        .array(FormFieldSchema)
        .nullable()
        .safeParse(event.registration_form_config ?? null);
      if (!configParse.success) {
        console.error("[EditEventDetailsTab] registration_form_config parse failed", {
          eventId: event.id,
          action: "load event",
          error: configParse.error.message,
        });
        setFormConfigParseError(configParse.error.message);
        setFormFields([]);
        setFormEnabled(false);
        return;
      }
      setFormConfigParseError(null);
      const parsed = configParse.data;
      if (parsed && parsed.length > 0) {
        setFormFields(parsed);
        // Only treat the form as "enabled" if there is at least one non-archived
        // field. An event whose config contains only archived entries has its
        // form effectively disabled (new registrants see no fields) — the toggle
        // should reflect that so the organizer sees the correct state when
        // reopening the edit page. Mirrors web fix #139.
        const hasActiveField = parsed.some((f) => !f.archived);
        setFormEnabled(hasActiveField);
      } else {
        setFormFields([]);
        setFormEnabled(false);
      }
    }
  }, [event]);

  if (!event) {
    return (
      <View className="px-4 py-12 items-center">
        <Text className="text-white-50 text-sm font-poppins">No event selected.</Text>
      </View>
    );
  }

  const handlePickImage = async () => {
    if (readOnly || !event?.slug || !getToken) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission required",
          "Permission to access the photo library is required to add an event image."
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled || !result.assets[0]) return;

      setIsUploadingImage(true);
      const asset = result.assets[0];
      const { uri: finalUri, mime, ext } = await processEventImageTo4x5({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
      });

      const formData = new FormData();
      formData.append("file", {
        uri: finalUri,
        name: `image.${ext}`,
        type: mime,
      } as unknown as Blob);
      // Prefer eventId (UUID) — avoids slug-ambiguity in multi-org users.
      // Keep eventSlug for backward-compat during server rollout.
      formData.append("eventId", event.id);
      formData.append("eventSlug", event.slug);

      const { url } = await apiUploadFormData<{ url: string }>(
        "/api/upload-image",
        formData,
        getToken
      );
      if (!url) throw new Error("Image upload failed: no URL returned");
      await updateEvent.mutateAsync({ id: event.id, image_url: url });
      Alert.alert("Success", "Event image updated successfully.");
    } catch (err) {
      console.error("[EditEventDetailsTab] upload image failed", {
        action: "upload image",
        eventId: event.id,
        eventSlug: event.slug,
        error: err,
      });
      const message = err instanceof Error ? err.message : "Failed to update image";
      Alert.alert("Error", message);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSave = async () => {
    const changes: Record<string, string | null> = {};
    const startsAtUtc = startsAtLocal ? localToUtc(startsAtLocal, tz) : "";
    const endsAtUtc = endsAtLocal ? localToUtc(endsAtLocal, tz) : "";
    if (startsAtLocal && !startsAtUtc) {
      Alert.alert("Invalid Date", "Could not convert start date to UTC. Please check the format.");
      return;
    }
    if (endsAtLocal && !endsAtUtc) {
      Alert.alert("Invalid Date", "Could not convert end date to UTC. Please check the format.");
      return;
    }
    // Save-time guard: minimumDate only affects picker UI; prevent inverted range from being saved
    if (startsAtUtc && endsAtUtc && new Date(startsAtUtc) > new Date(endsAtUtc)) {
      Alert.alert(
        "Invalid Date Range",
        "End date must be after start date. Please correct the end date."
      );
      return;
    }
    if (startsAtLocal === "" || startsAtLocal === null) {
      if (event.starts_at) changes.starts_at = null;
    } else if (startsAtUtc !== event.starts_at) {
      changes.starts_at = startsAtUtc;
    }
    if (endsAtLocal === "" || endsAtLocal === null) {
      if (event.ends_at) changes.ends_at = null;
    } else if (endsAtUtc !== event.ends_at) {
      changes.ends_at = endsAtUtc;
    }
    if (venue !== event.venue) changes.venue = venue;
    if (city !== event.city) changes.city = city;
    if (description !== (event.description ?? "")) changes.description = description.trim() || "";

    // If the form is enabled, keep all non-blank fields (active + archived).
    // If disabled, preserve archived fields so historical RSVP answers remain
    // labeled in RSVP detail views and exports — mirrors web fix #138.
    // EventDetail.tsx / CheckoutMainSheet.tsx filter out archived fields before
    // rendering, so an all-archived config correctly shows no form to new
    // registrants.
    const cleanedFields = formEnabled
      ? formFields.filter((f) => f.label.trim() !== "")
      : formFields.filter((f) => f.archived && f.label.trim() !== "");
    const configParse = z
      .array(FormFieldSchema)
      .nullable()
      .safeParse(event.registration_form_config ?? null);
    const existingConfig = configParse.success ? configParse.data : null;
    const newConfigJson = JSON.stringify(cleanedFields.length > 0 ? cleanedFields : null);
    const oldConfigJson = JSON.stringify(existingConfig);
    let formConfigChanged = false;
    if (newConfigJson !== oldConfigJson) {
      formConfigChanged = true;
    }

    if (Object.keys(changes).length === 0 && !formConfigChanged) {
      Alert.alert("No Changes", "No changes to save.");
      return;
    }

    try {
      const payload: UpdateEventInput = {
        id: event.id,
        ...changes,
      };
      if (formConfigChanged && !formConfigParseError) {
        payload.registration_form_config =
          cleanedFields.length > 0
            ? cleanedFields.map((f) => ({
                id: f.id,
                label: f.label,
                type: f.type,
                required: f.required,
                placeholder: f.placeholder,
                ...(f.archived ? { archived: true } : {}),
              }))
            : null;
      }
      await updateEvent.mutateAsync(payload);
      Alert.alert("Success", "Event updated successfully.");
    } catch (err) {
      console.error("[EditEventDetailsTab] update event details failed", {
        action: "update event details",
        eventId: event.id,
        eventSlug: event.slug,
        error: err,
      });
      const message = err instanceof Error ? err.message : "Failed to update event";
      Alert.alert("Error", message);
    }
  };

  return (
    <View className="gap-[14px]">
      {event.image_url ? (
        <View className="px-4">
          <Pressable
            onPress={readOnly || isUploadingImage ? undefined : handlePickImage}
            disabled={isUploadingImage}
            className="rounded-card overflow-hidden w-full aspect-[4/5] relative"
          >
            <FlameImage
              source={{ uri: event.image_url }}
              className="w-full h-full"
              contentFit="cover"
            />
            {isUploadingImage && (
              <View className="absolute inset-0 bg-black/50 items-center justify-center">
                <ActivityIndicator size="large" color="#FFFFFF" />
                <Text className="text-white-100 text-sm font-poppins-medium mt-2">Updating image...</Text>
              </View>
            )}
            {!readOnly && !isUploadingImage && (
              <View className="absolute bottom-2 right-2 bg-black/50 rounded-pill px-3 py-1.5 flex-row items-center gap-2">
                <Ionicons name="camera-outline" size={16} color="#F9FBFE" />
                <Text className="text-white-100 text-xs font-poppins-medium">Change image</Text>
              </View>
            )}
          </Pressable>
        </View>
      ) : (
        <View className="px-4">
          <Pressable
            onPress={readOnly || isUploadingImage ? undefined : handlePickImage}
            disabled={isUploadingImage}
            className="bg-white-5 border border-white-30 rounded-card w-full aspect-[4/5] items-center justify-center gap-2"
          >
            {isUploadingImage ? (
              <>
                <ActivityIndicator size="large" color="#FFFFFF" />
                <Text className="text-white-100 text-sm font-poppins-medium">Updating image...</Text>
              </>
            ) : !readOnly ? (
              <>
                <Ionicons name="cloud-upload-outline" size={36} color="rgba(255,255,255,0.5)" />
                <Text className="text-white-50 text-xs font-poppins-medium">Tap to add image</Text>
                <Text className="text-white-30 text-xs font-poppins-light">{SUPPORTED_TYPES}</Text>
              </>
            ) : (
              <>
                <Ionicons name="image-outline" size={36} color="rgba(255,255,255,0.3)" />
                <Text className="text-white-50 text-xs font-poppins-medium mt-2">No image</Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      <View className="px-4 flex-row items-center gap-2">
        <View className="w-[3px] h-[22px] bg-white-100 rounded-full" />
        <Text className="text-white-100 text-base leading-[22px] font-poppins-semibold uppercase">
          {event.name}
        </Text>
      </View>

      <View className="px-4">
        <View className="bg-white-5 border border-white-10 rounded-card px-4 py-2">
          <Text className="text-white-70 text-xs leading-4 font-poppins-medium">
            Short description
          </Text>
          {readOnly ? (
            description ? (
              <LinkableText className="text-white-80 text-sm leading-5 font-poppins mt-1">
                {description}
              </LinkableText>
            ) : (
              <Text className="text-white-50 text-sm font-poppins mt-1">No description</Text>
            )
          ) : (
            <TextInput
              multiline
              className="text-white-100 text-sm leading-5 font-poppins mt-1 min-h-[80px] p-0"
              value={description}
              onChangeText={(v) => setDescription(v.slice(0, 520))}
              placeholder="Tell people about your event..."
              placeholderTextColor="rgba(255,255,255,0.5)"
            />
          )}
          {!readOnly && (
            <Text className="text-white-50 text-xs font-poppins mt-1">
              {description.length}/520 characters
            </Text>
          )}
        </View>
      </View>

      <View className="px-4 gap-2">
        {readOnly ? (
          <>
            <FilledInput
              label="Start Date and Time"
              value={startsAtLocal}
              editable={false}
              icon={<Ionicons name="calendar-outline" size={24} color={colors["white-50"]} />}
            />
            <FilledInput
              label="End Date and Time"
              value={endsAtLocal}
              editable={false}
              icon={<Ionicons name="calendar-outline" size={24} color={colors["white-50"]} />}
            />
          </>
        ) : (
          <>
            <DateTimePickerField
              title="Event start date"
              placeholder="Start date and time"
              value={startsAtLocal}
              onChange={setStartsAtLocal}
              timezone={tz}
            />
            <DateTimePickerField
              title="Event end date"
              placeholder="End date and time"
              value={endsAtLocal}
              onChange={setEndsAtLocal}
              minimumDate={minimumEndDate}
              timezone={tz}
            />
          </>
        )}
        <FilledInput
          label="Venue"
          value={venue}
          editable={!readOnly}
          onChangeText={setVenue}
        />
        {readOnly ? (
          <FilledInput
            label="City"
            value={city}
            editable={false}
            icon={
              <Ionicons
                name="location-outline"
                size={24}
                color={colors["white-50"]}
              />
            }
          />
        ) : (
          <CityAutocompleteField
            value={city}
            onCitySelect={setCity}
          />
        )}
        <FilledInput
          label="Currency"
          value={event.currency || "USD"}
          editable={false}
          icon={
            <Ionicons
              name="cash-outline"
              size={24}
              color={colors["white-50"]}
            />
          }
        />
      </View>

      <View className="px-4 flex-row items-center gap-[6px]">
        <Ionicons
          name={event.requires_rsvp ? "checkbox" : "square-outline"}
          size={20}
          color={event.requires_rsvp ? colors["white-100"] : colors["white-50"]}
        />
        <Text className="text-white-80 text-sm leading-5 font-poppins">
          RSVP required {event.requires_rsvp ? "(yes)" : "(no)"}
        </Text>
      </View>

      {formConfigParseError && (
        <View className="px-4 py-2 bg-primary/20 border border-primary/50 rounded-card">
          <Text className="text-white-100 text-sm font-poppins">
            Registration form config could not be loaded (invalid data). Editing the form is disabled until the data is repaired.
          </Text>
        </View>
      )}
      {event.requires_rsvp && !readOnly && (
        <View className={`px-4 gap-4 ${formConfigParseError ? "opacity-60" : ""}`}>
          <Pressable
            className="flex-row items-center gap-[6px]"
            disabled={!!formConfigParseError}
            onPress={() => {
              if (formConfigParseError) return;
              if (formEnabled) {
                setFormFields([]);
                setFormEnabled(false);
              } else {
                setFormEnabled(true);
                if (formFields.length === 0) {
                  setFormFields([
                    {
                      id: `field-${Date.now()}`,
                      label: "",
                      type: "text",
                      required: false,
                    },
                  ]);
                }
              }
            }}
          >
            <Ionicons
              name={formEnabled ? "checkbox" : "square-outline"}
              size={20}
              color={formEnabled ? "#F9FBFE" : "rgba(255,255,255,0.5)"}
            />
            <Text className="text-white-80 text-sm leading-5 font-poppins">
              Include registration form
            </Text>
          </Pressable>

          {formEnabled && (
            <RegistrationFormBuilder
              fields={formFields}
              onChange={setFormFields}
            />
          )}
        </View>
      )}

      {event.requires_rsvp && readOnly && (() => {
        const configParse = z
          .array(FormFieldSchema)
          .nullable()
          .safeParse(event.registration_form_config ?? null);
        const parsed = configParse.success ? configParse.data : null;
        if (!parsed || parsed.length === 0) return null;
        return (
          <View className="px-4 gap-2">
            <Text className="text-white-70 text-xs font-poppins-medium uppercase">
              Registration Form ({parsed.length} field{parsed.length !== 1 ? "s" : ""})
            </Text>
            {parsed.map((f, i) => (
              <View
                key={f.id}
                className="bg-white-5 border border-white-10 rounded-card px-4 py-3 flex-row items-center gap-3"
              >
                <Text className="text-white-100 text-sm font-poppins flex-1">
                  {f.label || `Field ${i + 1}`}
                </Text>
                <Text className="text-white-50 text-xs font-poppins">{f.type}</Text>
                {f.required && (
                  <Text className="text-primary text-xs font-poppins-medium">Required</Text>
                )}
              </View>
            ))}
          </View>
        );
      })()}

      {!readOnly && (
      <View className="px-4">
        <View className="items-end">
          <Pressable
            onPress={handleSave}
            disabled={updateEvent.isPending}
            className={`bg-white-100 rounded-pill py-[10px] px-6 w-[160px] items-center justify-center flex-row gap-2 ${
              updateEvent.isPending ? "opacity-60" : ""
            }`}
          >
            {updateEvent.isPending && (
              <ActivityIndicator size="small" color="#041C2B" />
            )}
            <Text className="text-dark text-sm leading-[22px] font-poppins-medium">
              {updateEvent.isPending ? "Saving..." : "Save"}
            </Text>
          </Pressable>
        </View>
      </View>
      )}
    </View>
  );
}
