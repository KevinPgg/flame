import { type ReactNode, useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameImage, SelectionListModal } from "@project-flame/ui";
import * as ImagePicker from "expo-image-picker";
import type { EventFormData } from "../../app/(tabs)/create-event";
import { DateTimePickerField } from "./DateTimePickerField";
import { CityAutocompleteField } from "./CityAutocompleteField";
import { RegistrationFormBuilder } from "./RegistrationFormBuilder";
import { processEventImageTo4x5 } from "../../lib/event-image";
import { getNowInTimezone, localToUtc, SUPPORTED_CURRENCIES, SUPPORTED_TIMEZONES } from "@project-flame/lib";

const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Guayaquil";

const SUPPORTED_TYPES = "JPEG, JPG, PNG, WEBP";

function FormInput({
  placeholder,
  icon,
  value,
  onChangeText,
}: {
  placeholder: string;
  icon?: ReactNode;
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <View className="bg-white-5 border border-white-10 rounded-pill flex-row items-center gap-4 p-4">
      {icon}
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.5)"
        className="flex-1 text-white-100 text-sm leading-5 font-poppins"
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

interface EventDetailsTabProps {
  form: EventFormData;
  onFieldChange: <K extends keyof EventFormData>(
    key: K,
    value: EventFormData[K]
  ) => void;
  onNextStep: () => void;
  tiersCount: number;
  imageUri: string | null;
  onImageChange: (uri: string | null) => void;
}

export function EventDetailsTab({
  form,
  onFieldChange,
  onNextStep,
  tiersCount,
  imageUri,
  onImageChange,
}: EventDetailsTabProps) {
  const tz = form.timezone || DEFAULT_TIMEZONE;
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [timezoneModalVisible, setTimezoneModalVisible] = useState(false);
  const [stepError, setStepError] = useState("");

  useEffect(() => {
    setStepError("");
  }, [form.name, form.venue, form.city, form.starts_at, form.ends_at]);

  const showCurrencyPicker = () => {
    if (Platform.OS === "ios") {
      const options = SUPPORTED_CURRENCIES.map((c) => `${c.code} — ${c.name}`);
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options, "Cancel"], cancelButtonIndex: options.length, title: "Select Currency" },
        (idx) => { if (idx < options.length) onFieldChange("currency", SUPPORTED_CURRENCIES[idx].code); }
      );
    } else {
      setCurrencyModalVisible(true);
    }
  };

  const showTimezonePicker = () => {
    if (Platform.OS === "ios") {
      const options = SUPPORTED_TIMEZONES.map((t) => t.label);
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options, "Cancel"], cancelButtonIndex: options.length, title: "Select Timezone" },
        (idx) => { if (idx < options.length) onFieldChange("timezone", SUPPORTED_TIMEZONES[idx].value); }
      );
    } else {
      setTimezoneModalVisible(true);
    }
  };
  const minStartDate = (() => {
    const minLocal = getNowInTimezone(tz, 2);
    if (!minLocal) return undefined;
    const utc = localToUtc(minLocal, tz);
    return utc ? new Date(utc) : undefined;
  })();

  const handlePickImage = async () => {
    try {
      if (!form.name.trim()) {
        Alert.alert(
          "Event name required",
          "Please enter an event name first before uploading an image."
        );
        return;
      }

      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
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

      const asset = result.assets[0];
      const processed = await processEventImageTo4x5({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
      });
      onImageChange(processed.uri);
    } catch (err) {
      console.error("[EventDetailsTab] handlePickImage failed:", err);
      Alert.alert(
        "Error",
        "Something went wrong while selecting the image. Please try again."
      );
    }
  };

  const handleRemoveImage = () => {
    onImageChange(null);
  };

  return (
    <View className="gap-[14px]">
      <View className="gap-2 px-4">
        <FormInput
          placeholder="Event Name"
          value={form.name}
          onChangeText={(v) => onFieldChange("name", v)}
        />
      </View>

      <View className="px-4 items-center">
        <Pressable
          onPress={handlePickImage}
          className="bg-white-5 border border-white-30 rounded-card w-full aspect-[4/5] items-center justify-center gap-[5px] overflow-hidden"
        >
          {imageUri ? (
            <View className="absolute inset-0 bg-background">
              <FlameImage
                source={{ uri: imageUri }}
                className="w-full h-full"
                contentFit="cover"
              />
              <Pressable
                onPress={handleRemoveImage}
                className="absolute top-2 right-2 bg-black/50 rounded-full p-1"
              >
                <Ionicons name="close" size={20} color="#F9FBFE" />
              </Pressable>
            </View>
          ) : (
            <>
              <Ionicons
                name="cloud-upload-outline"
                size={36}
                color="rgba(255,255,255,0.5)"
              />
              <Text className="text-white-50 text-xs leading-4 font-poppins-medium text-center">
                Supported file types: {SUPPORTED_TYPES}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      <View className="gap-2 px-4">
        <View className="bg-white-5 border border-white-10 rounded-pill flex-row items-center gap-4 p-4 opacity-80">
          <Ionicons
            name="link-outline"
            size={24}
            color="rgba(255,255,255,0.5)"
          />
          <Text
            className={`flex-1 text-sm leading-5 font-poppins ${
              form.slug ? "text-white-70" : "text-white-50"
            }`}
          >
            {form.slug || "URL slug (auto-generated from name)"}
          </Text>
        </View>
        <FormInput
          placeholder="Venue"
          value={form.venue}
          onChangeText={(v) => onFieldChange("venue", v)}
        />
        <CityAutocompleteField
          value={form.city}
          onCitySelect={(city) => onFieldChange("city", city)}
        />
        <Pressable
          onPress={showCurrencyPicker}
          className="bg-white-5 border border-white-10 rounded-pill flex-row items-center gap-2 p-4"
        >
          <Ionicons name="cash-outline" size={24} color="rgba(255,255,255,0.5)" />
          <Text className="text-white-50 text-sm font-poppins flex-1">Currency</Text>
          <View className="flex-row items-center gap-1 bg-white-10 rounded-pill px-3 py-1">
            <Text className="text-white-100 text-xs font-poppins-medium">
              {SUPPORTED_CURRENCIES.find((c) => c.code === form.currency)?.code ?? form.currency}
            </Text>
            <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.5)" />
          </View>
        </Pressable>
        <Pressable
          onPress={showTimezonePicker}
          className="bg-white-5 border border-white-10 rounded-pill flex-row items-center gap-2 p-4"
        >
          <Ionicons name="globe-outline" size={24} color="rgba(255,255,255,0.5)" />
          <Text className="text-white-50 text-sm font-poppins flex-1">Timezone</Text>
          <View className="flex-row items-center gap-1 bg-white-10 rounded-pill px-3 py-1">
            <Text className="text-white-100 text-xs font-poppins-medium">
              {SUPPORTED_TIMEZONES.find((t) => t.value === tz)?.label ?? tz}
            </Text>
            <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.5)" />
          </View>
        </Pressable>
        <DateTimePickerField
          title="Event start date"
          placeholder="Start date and time"
          value={form.starts_at}
          onChange={(v) => onFieldChange("starts_at", v)}
          minimumDate={minStartDate}
          timezone={tz}
        />
        <DateTimePickerField
          title="Event end date"
          placeholder="End date and time"
          value={form.ends_at}
          onChange={(v) => onFieldChange("ends_at", v)}
          minimumDate={
            form.starts_at
              ? (() => {
                  const utc = localToUtc(form.starts_at, tz);
                  return utc ? new Date(utc) : minStartDate;
                })()
              : minStartDate
          }
          timezone={tz}
        />

        <View className="bg-white-5 border border-white-10 rounded-card px-4 py-2 h-[148px]">
          <Text className="text-white-70 text-xs leading-4 font-poppins-medium">
            Short description
          </Text>
          <TextInput
            multiline
            className="flex-1 text-white-100 text-sm leading-5 font-poppins"
            value={form.description}
            onChangeText={(v) => onFieldChange("description", v)}
            placeholderTextColor="rgba(255,255,255,0.5)"
          />
        </View>
      </View>

      <View className="px-4 gap-4">
        <Pressable
          className="flex-row items-center gap-[6px]"
          onPress={() => {
            const next = !form.requires_rsvp;
            onFieldChange("requires_rsvp", next);
            if (!next) {
              onFieldChange("registration_form_config", []);
            }
          }}
        >
          <Ionicons
            name={form.requires_rsvp ? "checkbox" : "square-outline"}
            size={20}
            color={form.requires_rsvp ? "#F9FBFE" : "rgba(255,255,255,0.5)"}
          />
          <Text className="text-white-80 text-sm leading-5 font-poppins">
            RSVP required
          </Text>
        </Pressable>

        <View className="gap-2">
          <Text className="text-white-80 text-sm leading-5 font-poppins-medium">
            RSVP Mode:
          </Text>
          <Text className="text-white-80 text-xs leading-4 font-poppins">
            Attendees must submit a request and wait for your approval before
            they can purchase tickets. This gives you control over who can attend
            your event.
          </Text>
        </View>

        {form.requires_rsvp && (
          <>
            <Pressable
              className="flex-row items-center gap-[6px]"
              onPress={() => {
                if (form.registration_form_config.length > 0) {
                  onFieldChange("registration_form_config", []);
                } else {
                  onFieldChange("registration_form_config", [
                    {
                      id: `field-${Date.now()}`,
                      label: "",
                      type: "text",
                      required: false,
                    },
                  ]);
                }
              }}
            >
              <Ionicons
                name={
                  form.registration_form_config.length > 0
                    ? "checkbox"
                    : "square-outline"
                }
                size={20}
                color={
                  form.registration_form_config.length > 0
                    ? "#F9FBFE"
                    : "rgba(255,255,255,0.5)"
                }
              />
              <Text className="text-white-80 text-sm leading-5 font-poppins">
                Include registration form
              </Text>
            </Pressable>

            {form.registration_form_config.length > 0 && (
              <RegistrationFormBuilder
                fields={form.registration_form_config}
                onChange={(fields) =>
                  onFieldChange("registration_form_config", fields)
                }
              />
            )}
          </>
        )}
      </View>

      {tiersCount === 0 && (
        <View className="px-4">
          <Text className="text-[#EAB308] text-xs leading-4 font-poppins">
            No ticket tiers added yet. Add at least one in the &quot;Ticket
            Tiers&quot; tab before creating.
          </Text>
        </View>
      )}

      <View className="px-4 gap-3">
        {!!stepError && (
          <Text className="text-red-400 text-sm leading-5 font-poppins text-center">
            {stepError}
          </Text>
        )}
        <Pressable
          onPress={() => {
            const rules: { check: () => boolean; message: string }[] = [
              { check: () => !form.name.trim(), message: "Event name is required." },
              { check: () => !form.venue.trim(), message: "Venue is required." },
              { check: () => !form.city.trim(), message: "City is required." },
              { check: () => !form.starts_at, message: "Start date and time is required." },
              { check: () => !form.ends_at, message: "End date and time is required." },
            ];
            const failing = rules.find(r => r.check());
            if (failing) {
              setStepError(failing.message);
              return;
            }
            setStepError("");
            onNextStep();
          }}
          className="bg-white-100 rounded-pill py-[10px] px-6 items-center justify-center w-full flex-row gap-2"
        >
          <Text className="text-dark text-sm leading-[22px] font-poppins-medium">
            Next Step
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#041C2B" />
        </Pressable>
      </View>

      <SelectionListModal
        visible={currencyModalVisible}
        title="Select Currency"
        items={SUPPORTED_CURRENCIES.map((c) => ({ label: `${c.code} — ${c.name}`, value: c.code }))}
        onSelect={(code) => onFieldChange("currency", code)}
        onClose={() => setCurrencyModalVisible(false)}
      />
      <SelectionListModal
        visible={timezoneModalVisible}
        title="Select Timezone"
        items={SUPPORTED_TIMEZONES.map((t) => ({ label: t.label, value: t.value }))}
        onSelect={(value) => onFieldChange("timezone", value)}
        onClose={() => setTimezoneModalVisible(false)}
      />
    </View>
  );
}
