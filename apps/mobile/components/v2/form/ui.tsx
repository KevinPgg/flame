/**
 * Form building blocks for the v2 organizer forms of the app (create / edit event, tier editor) —
 * native counterpart of apps/web/app/v2/organizer/event-form/ui.tsx, prototype "cf-*": section
 * titles in small caps, grouped cards with label rows, big switches, one date picker per row.
 */
import { Children, Fragment, isValidElement, useState, type ComponentProps, type ReactNode } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { flameV2Colors as c, formatEventDateTime, localToUtc, utcToLocal, viewerTimeIfDifferent } from "@project-flame/lib";
import { useI18n } from "../../../lib/i18n";
import { Button, Icon } from "../ui";

export function Section({ title, aside, children }: { title: string; aside?: string | null; children: ReactNode }) {
  return (
    <View className="mt-7">
      <View className="mb-2.5 flex-row items-baseline justify-between gap-3">
        <Text accessibilityRole="header" className="font-v2-ui-semibold text-[12px] uppercase tracking-[0.7px] text-v2-c50">{title}</Text>
        {aside ? <Text className="shrink font-v2-ui text-[12px] text-v2-c50">{aside}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" className="mt-1.5 font-v2-ui text-[12.5px] text-v2-errorText">
      {message}
    </Text>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text className="mt-1.5 font-v2-ui text-[12.5px] leading-[17px] text-v2-c50">{children}</Text>;
}

/** Grouped card (prototype "cf-group"): rows separated by hairlines. */
export function Group({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter((x) => isValidElement(x) || typeof x === "string");
  return (
    <View className="overflow-hidden rounded-v2-card bg-v2-ink2">
      {items.map((child, i) => (
        <Fragment key={i}>
          {i > 0 && <View className="h-px bg-v2-c10" />}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

/** Row of a grouped card: label on the left, control on the right (prototype "cf-row"). */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="min-h-[52px] flex-row items-center gap-3 px-4 py-2">
      <Text className="w-[92px] font-v2-ui text-[13px] text-v2-c70">{label}</Text>
      <View className="min-w-0 flex-1">{children}</View>
    </View>
  );
}

/** Label over a control (two-column tier fields). */
export function Labeled({ label, optional, error, children }: { label: string; optional?: string; error?: string | null; children: ReactNode }) {
  return (
    <View className="min-w-0 flex-1 gap-1.5">
      <Text className="font-v2-ui text-[12.5px] text-v2-c70">
        {label}
        {optional ? <Text className="text-v2-c50"> · {optional}</Text> : null}
      </Text>
      {children}
      <FieldError message={error} />
    </View>
  );
}

/** Text input on ink-3; red ring when invalid. `bare` = inside a row (no own background). */
export function Input({ invalid, bare, dark, className, style, ...props }: ComponentProps<typeof TextInput> & { invalid?: boolean; bare?: boolean; dark?: boolean }) {
  // Multiline grows from a real minimum height (a fixed h-11 let the text spill over the next
  // section — Kevin, 10-26). Single line: no vertical padding, so Android doesn't clip big text.
  const size = props.multiline ? "rounded-v2-md px-4 py-3" : bare ? "h-10 px-1" : "h-11 rounded-v2-md px-4";
  const bg = bare ? "" : dark ? "bg-v2-ink2" : "bg-v2-ink3";
  return (
    <TextInput
      placeholderTextColor={c.c50}
      autoCorrect={false}
      textAlignVertical={props.multiline ? "top" : "center"}
      {...props}
      style={[props.multiline ? { minHeight: 140 } : { paddingVertical: 0 }, style]}
      className={`${size} ${bg} font-v2-ui text-[14px] text-v2-cream ${invalid ? "border border-v2-errorText" : ""} ${
        props.editable === false ? "opacity-60" : ""
      } ${className ?? ""}`}
    />
  );
}

/** Price with the currency symbol in front; keeps digits and one separator ("25,50" ok). */
export function MoneyInput({ symbol, value, onChange, invalid, dark, accessibilityLabel }: { symbol: string; value: string; onChange: (v: string) => void; invalid?: boolean; dark?: boolean; accessibilityLabel: string }) {
  return (
    <View className="justify-center">
      <Text className="absolute left-3.5 z-10 font-v2-ui text-[14px] text-v2-c50">{symbol}</Text>
      <Input
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^\d.,]/g, ""))}
        keyboardType="decimal-pad"
        placeholder="0"
        invalid={invalid}
        dark={dark}
        accessibilityLabel={accessibilityLabel}
        style={{ paddingLeft: 18 + symbol.length * 8 }}
      />
    </View>
  );
}

/** Switch drawn like the prototype (flame track), whole row tappable. */
export function SwitchRow({ title, hint, checked, onChange, disabled }: { title: string; hint?: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => !disabled && onChange(!checked)}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityState={{ checked, disabled: !!disabled }}
      className={`flex-row items-center gap-3 px-4 py-3 ${disabled ? "opacity-60" : ""}`}
    >
      <View className="min-w-0 flex-1">
        <Text className="font-v2-ui-semibold text-[14px] text-v2-cream">{title}</Text>
        {hint ? <Text className="mt-0.5 font-v2-ui text-[12.5px] leading-[17px] text-v2-c50">{hint}</Text> : null}
      </View>
      <Toggle on={checked} />
    </Pressable>
  );
}

export function Toggle({ on, small }: { on: boolean; small?: boolean }) {
  const w = small ? 32 : 40;
  const h = small ? 20 : 24;
  const k = small ? 16 : 20;
  return (
    <View style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: on ? c.flame : c.ink4, justifyContent: "center" }}>
      <View style={{ width: k, height: k, borderRadius: k / 2, backgroundColor: "#fff", marginLeft: on ? w - k - 2 : 2 }} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Dates — values are "YYYY-MM-DDTHH:mm" on the event's clock (same as the web forms).
// ---------------------------------------------------------------------------

const toDate = (local: string, tz: string) => {
  const iso = local ? localToUtc(local, tz) : "";
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
};
const toLocal = (d: Date, tz: string) => utcToLocal(d.toISOString(), tz);

/**
 * Opens the system picker: Android = date, then time (two native dialogs); iOS = a sheet with
 * the date-and-time wheel. Both on the event's time zone.
 */
function usePicker(tz: string, onPick: (local: string) => void, minimumDate?: Date) {
  const [iosValue, setIosValue] = useState<Date | null>(null);
  const open = (current: string) => {
    const start = toDate(current, tz);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: start,
        mode: "date",
        minimumDate,
        timeZoneName: tz,
        onChange: (e, day) => {
          if (e.type !== "set" || !day) return;
          DateTimePickerAndroid.open({
            value: day,
            mode: "time",
            timeZoneName: tz,
            onChange: (e2, time) => {
              if (e2.type === "set" && time) onPick(toLocal(time, tz));
            },
          });
        },
      });
    } else {
      setIosValue(start);
    }
  };
  const sheet =
    Platform.OS === "ios" ? (
      <IosPickerSheet
        value={iosValue}
        tz={tz}
        minimumDate={minimumDate}
        onCancel={() => setIosValue(null)}
        onDone={(d) => {
          setIosValue(null);
          onPick(toLocal(d, tz));
        }}
      />
    ) : null;
  return { open, sheet };
}

function IosPickerSheet({ value, tz, minimumDate, onCancel, onDone }: { value: Date | null; tz: string; minimumDate?: Date; onCancel: () => void; onDone: (d: Date) => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Date | null>(null);
  const current = draft ?? value ?? new Date();
  return (
    <Modal visible={value !== null} transparent animationType="slide" onRequestClose={onCancel} onShow={() => setDraft(null)}>
      <Pressable className="flex-1 bg-black/60" onPress={onCancel} accessibilityLabel={t("common.close")} />
      <View style={{ paddingBottom: insets.bottom + 12 }} className="rounded-t-v2-sheet bg-v2-ink2 px-4 pt-3">
        <DateTimePicker value={current} mode="datetime" display="spinner" themeVariant="dark" timeZoneName={tz} minimumDate={minimumDate} onChange={(_, d) => d && setDraft(d)} />
        <View className="flex-row justify-end gap-2">
          <Button label={t("common.cancel")} variant="ghost" onPress={onCancel} />
          <Button label={t("common.done")} variant="primary" onPress={() => onDone(current)} />
        </View>
      </View>
    </Modal>
  );
}

function useDisplay(local: string, tz: string) {
  const { locale } = useI18n();
  if (!local) return "";
  const iso = localToUtc(local, tz);
  const { date, time } = formatEventDateTime(iso, tz, locale);
  return `${date} · ${time}`;
}

/** "Starts / Ends" row: shows the date on the event's clock; tap → system picker. */
export function DateTimeRow({
  label,
  value,
  onChange,
  tz,
  invalid,
  disabled,
  minimumDate,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (local: string) => void;
  tz: string;
  invalid?: boolean;
  disabled?: boolean;
  minimumDate?: Date;
  placeholder?: string;
}) {
  const { t } = useI18n();
  const shown = useDisplay(value, tz);
  const { open, sheet } = usePicker(tz, onChange, minimumDate);
  return (
    <View className="px-4 py-2">
      <View className="min-h-[40px] flex-row items-center gap-3">
        <Text className="w-[92px] font-v2-ui text-[13px] text-v2-c70">{label}</Text>
        <Pressable
          onPress={() => !disabled && open(value)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${shown || placeholder || t("eventForm.pickDate")}`}
          className={`h-10 min-w-0 flex-1 flex-row items-center justify-between gap-2 rounded-v2-md bg-v2-ink3 px-3 ${invalid ? "border border-v2-errorText" : ""} ${disabled ? "opacity-60" : "active:bg-v2-ink4"}`}
        >
          <Text numberOfLines={1} className={`flex-1 font-v2-ui text-[14px] ${shown ? "text-v2-cream" : "text-v2-c50"}`}>
            {shown || placeholder || t("eventForm.pickDate")}
          </Text>
          <Icon name="cal" size={16} color={c.c50} />
        </Pressable>
      </View>
      <ViewerTimeHint local={value} eventTimezone={tz} />
      {sheet}
    </View>
  );
}

/** Sales start / end: shows the default ("Now", "When the event ends") until the organizer picks a date; × goes back. */
export function OptionalDateRow({
  label,
  emptyLabel,
  value,
  fallback,
  onChange,
  tz,
  invalid,
}: {
  label: string;
  emptyLabel: string;
  value: string;
  fallback: string;
  onChange: (local: string) => void;
  tz: string;
  invalid?: boolean;
}) {
  const { t } = useI18n();
  const shown = useDisplay(value, tz);
  const { open, sheet } = usePicker(tz, onChange);
  return (
    <View className="min-h-[52px] flex-row items-center gap-3 px-4 py-2">
      <Text className="w-[92px] font-v2-ui text-[13px] text-v2-c70">{label}</Text>
      {value ? (
        <View className="min-w-0 flex-1 flex-row items-center gap-1">
          <Pressable
            onPress={() => open(value)}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${shown}`}
            className={`h-10 min-w-0 flex-1 justify-center rounded-v2-md bg-v2-ink3 px-3 active:bg-v2-ink4 ${invalid ? "border border-v2-errorText" : ""}`}
          >
            <Text numberOfLines={1} className="font-v2-ui text-[14px] text-v2-cream">{shown}</Text>
          </Pressable>
          <Pressable onPress={() => onChange("")} accessibilityRole="button" accessibilityLabel={`${t("eventForm.useDefault")} · ${label}`} hitSlop={6} className="h-8 w-8 items-center justify-center rounded-full active:bg-v2-ink4">
            <Icon name="close" size={16} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => open(fallback)}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${emptyLabel}`}
          className="min-w-0 flex-1 flex-row items-center justify-end gap-1"
        >
          <Text numberOfLines={1} className="shrink font-v2-ui text-[14px] text-v2-c50">{emptyLabel}</Text>
          <Icon name="chev" size={16} color={c.c50} />
        </Pressable>
      )}
      {sheet}
    </View>
  );
}

/** Same moment on the organizer's own clock when it differs from the event's time zone. */
export function ViewerTimeHint({ local, eventTimezone }: { local: string; eventTimezone: string }) {
  const { t, locale } = useI18n();
  let viewerTz = "";
  try {
    viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    viewerTz = "";
  }
  const iso = viewerTimeIfDifferent(local, eventTimezone, viewerTz);
  if (!iso) return null;
  let time = "";
  try {
    time = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: viewerTz }).format(new Date(iso));
  } catch {
    return null;
  }
  return <Text className="mt-1 pl-[104px] font-v2-ui text-[12px] text-v2-c50">{t("eventForm.yourTime", { time, tz: viewerTz.replace(/_/g, " ") })}</Text>;
}

// ---------------------------------------------------------------------------
// Pick one option (currency, time zone) in a bottom sheet.
// ---------------------------------------------------------------------------

export function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${current}`} className="min-h-[52px] flex-row items-center gap-3 px-4 py-2 active:bg-v2-ink3">
        <Text className="w-[92px] font-v2-ui text-[13px] text-v2-c70">{label}</Text>
        <Text numberOfLines={1} className="flex-1 text-right font-v2-ui text-[14px] text-v2-cream">{current}</Text>
        <Icon name="chev" size={16} color={c.c50} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable className="flex-1 bg-black/60" onPress={() => setOpen(false)} accessibilityLabel={t("common.close")} />
        <View style={{ paddingBottom: insets.bottom + 12 }} className="max-h-[70%] rounded-t-v2-sheet bg-v2-ink2 px-3 pt-3">
          <View className="mb-2 h-1 w-10 self-center rounded-full bg-v2-c30" />
          <Text className="px-2 pb-2 font-v2-ui-semibold text-[12px] uppercase tracking-[1px] text-v2-c50">{label}</Text>
          <ScrollView>
            {options.map((o) => {
              const on = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  className={`flex-row items-center gap-3 rounded-v2-md p-3 ${on ? "bg-v2-c10" : "active:bg-v2-c06"}`}
                >
                  <Text className="flex-1 font-v2-ui text-[15px] text-v2-cream">{o.label}</Text>
                  {on && <Icon name="check" size={18} color={c.cream} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
