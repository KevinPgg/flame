import { useState } from "react";
import { View, Text, Pressable, Platform, Modal } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import {
  ecuadorLocalToUtc,
  utcToEcuadorLocal,
  localToUtc,
  utcToLocal,
} from "@project-flame/lib";

const DEFAULT_TZ = "America/Guayaquil";

/**
 * Converts YYYY-MM-DDTHH:mm (local in given timezone) to JS Date.
 * When timezone is provided, uses timezone-aware conversion; otherwise Ecuador.
 * On invalid timezone, falls back to DEFAULT_TZ and logs the error.
 */
function localStringToDate(localStr: string, timezone?: string): Date {
  if (!localStr) return new Date();
  const tz = timezone ?? DEFAULT_TZ;
  try {
    const utc = timezone
      ? localToUtc(localStr, tz)
      : ecuadorLocalToUtc(localStr);
    return utc ? new Date(utc) : new Date();
  } catch (err) {
    if (__DEV__) {
      console.warn("[DateTimePickerField] localStringToDate failed, using fallback", {
        action: "localStringToDate",
        timezone: tz,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    try {
      const utc = ecuadorLocalToUtc(localStr);
      return utc ? new Date(utc) : new Date();
    } catch {
      return new Date();
    }
  }
}

/**
 * Converts JS Date to YYYY-MM-DDTHH:mm (local in given timezone) for form state.
 * On invalid timezone, falls back to DEFAULT_TZ and logs the error.
 */
function dateToLocalString(d: Date, timezone?: string): string {
  const tz = timezone ?? DEFAULT_TZ;
  try {
    return timezone
      ? utcToLocal(d.toISOString(), tz)
      : utcToEcuadorLocal(d.toISOString());
  } catch (err) {
    if (__DEV__) {
      console.warn("[DateTimePickerField] dateToLocalString failed, using fallback", {
        action: "dateToLocalString",
        timezone: tz,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    try {
      return utcToEcuadorLocal(d.toISOString());
    } catch {
      return utcToEcuadorLocal(new Date().toISOString());
    }
  }
}

function getFormatOptions(timezone?: string): Intl.DateTimeFormatOptions {
  return {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone ?? DEFAULT_TZ,
  };
}

function formatDisplay(date: Date, timezone?: string): string {
  const tz = timezone ?? DEFAULT_TZ;
  try {
    return new Intl.DateTimeFormat("en-US", getFormatOptions(timezone)).format(date);
  } catch (err) {
    if (__DEV__) {
      console.warn("[DateTimePickerField] formatDisplay failed, using fallback", {
        action: "formatDisplay",
        timezone: tz,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return new Intl.DateTimeFormat("en-US", getFormatOptions()).format(date);
  }
}

interface DateTimePickerFieldProps {
  value: string; // YYYY-MM-DDTHH:mm (local in timezone, or Ecuador if timezone omitted)
  onChange: (value: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  /** Shown in modal header (iOS) / picker context; e.g. "Event start date", "Sale end date" */
  title?: string;
  /** IANA timezone for display/conversion; when omitted, uses America/Guayaquil (Ecuador) */
  timezone?: string;
}

export function DateTimePickerField({
  value,
  onChange,
  placeholder = "Select date and time",
  minimumDate,
  title,
  timezone,
}: DateTimePickerFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  const date = localStringToDate(value, timezone);

  const handleChange = (_evt: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === "android") setShowPicker(false);
    if (selectedDate) {
      onChange(dateToLocalString(selectedDate, timezone));
    }
  };

  const tz = timezone ?? DEFAULT_TZ;
  const openAndroidPicker = () => {
    const openDatePicker = () => {
      DateTimePickerAndroid.open({
        value: date,
        mode: "date",
        minimumDate,
        timeZoneName: tz,
        onChange: (evt, selectedDate) => {
          if (evt.type === "set" && selectedDate) {
            openTimePicker(selectedDate);
          }
        },
      });
    };
    const openTimePicker = (pendingDate: Date) => {
      DateTimePickerAndroid.open({
        value: pendingDate,
        mode: "time",
        timeZoneName: tz,
        onChange: (evt, selectedDate) => {
          if (evt.type === "set" && selectedDate) {
            onChange(dateToLocalString(selectedDate, timezone));
          }
        },
      });
    };
    openDatePicker();
  };

  const handleDone = () => {
    setShowPicker(false);
  };

  const pickerEl = (
    <DateTimePicker
      value={date}
      mode="datetime"
      display={Platform.OS === "ios" ? "spinner" : "default"}
      onChange={handleChange}
      minimumDate={minimumDate}
      timeZoneName={tz}
      {...(Platform.OS === "ios" && { textColor: "#F9FBFE" })}
    />
  );

  return (
    <View className="bg-white-5 border border-white-10 rounded-pill flex-row items-center gap-4 p-4">
      <Ionicons
        name="calendar-outline"
        size={24}
        color="rgba(255,255,255,0.5)"
      />
      <Pressable
        onPress={() =>
          Platform.OS === "android" ? openAndroidPicker() : setShowPicker(true)
        }
        className="flex-1"
      >
        <Text
          className={
            value
              ? "text-white-100 text-sm leading-5 font-poppins"
              : "text-white-50 text-sm leading-5 font-poppins"
          }
        >
          {value ? formatDisplay(date, timezone) : placeholder}
        </Text>
      </Pressable>
      {Platform.OS === "ios" && showPicker && (
        <Modal
          visible
          transparent
          animationType="slide"
        >
          <Pressable
            className="flex-1 justify-end bg-black/50"
            onPress={handleDone}
          >
            <Pressable
              className="bg-surface rounded-t-3xl p-4"
              onPress={(e) => e.stopPropagation()}
            >
              <View className="flex-row justify-between items-center mb-2">
                {title ? (
                  <Text className="text-white-80 text-base font-poppins-medium">
                    {title}
                  </Text>
                ) : (
                  <View />
                )}
                <Pressable onPress={handleDone}>
                  <Text className="text-white-100 text-base font-poppins-semibold">
                    Done
                  </Text>
                </Pressable>
              </View>
              {pickerEl}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
