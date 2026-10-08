/**
 * Per-tier registration form field picker (mobile).
 *
 * Web parity:
 *   - Source: apps/web/app/components/organizer/RegistrationFormFieldsModal.tsx
 *   - Same state shape: `"all" | "custom"` mode + `Set<string>` of selected IDs.
 *   - Same save semantics: mode === "all" → null; mode === "custom" → ordered string[]
 *     (preserving event field order, possibly empty).
 *   - Same warning when a required event-level field is unchecked.
 *
 * Pattern: mirrors `CheckoutMainSheet`'s bottom-sheet — React Native `<Modal>`
 * with `animationType="slide"` + `transparent`. No external sheet library
 * (`@gorhom/bottom-sheet` is not installed; see plan).
 */

import { useEffect, useMemo, useState } from "react";
import {
  View,
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Text,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { FlameText, colors } from "@project-flame/ui";

/**
 * Loose structural shape so this sheet works with both the lib `FormField` and the
 * mobile-local Zod `FormField` (which has a wider `type` string). The picker only
 * needs `id`, `label`, `required`, and `archived`.
 */
export interface TierFormFieldLike {
  id: string;
  label: string;
  required?: boolean;
  archived?: boolean;
  /** Optional field type ("text"/"email"/"checkbox"/...) — rendered as a small
   *  caption under the field label for organizer context. */
  type?: string;
}

interface Props {
  visible: boolean;
  eventFormFields: TierFormFieldLike[];
  /** Current saved selection: `null` = inherit all, `string[]` = explicit subset. */
  value: string[] | null;
  onChange: (next: string[] | null) => void;
  onClose: () => void;
}

export function TierRegistrationFormSheet({
  visible,
  eventFormFields,
  value,
  onChange,
  onClose,
}: Props) {
  const visibleFields = useMemo(
    () => eventFormFields.filter((f) => !f.archived),
    [eventFormFields],
  );

  const [draftMode, setDraftMode] = useState<"all" | "custom">(
    value === null ? "all" : "custom",
  );
  const [draftSelected, setDraftSelected] = useState<Set<string>>(
    new Set(value ?? visibleFields.map((f) => f.id)),
  );

  // Reset draft every time the sheet opens so cancel = revert to saved.
  useEffect(() => {
    if (!visible) return;
    setDraftMode(value === null ? "all" : "custom");
    setDraftSelected(new Set(value ?? visibleFields.map((f) => f.id)));
  }, [visible, value, visibleFields]);

  const toggle = (id: string) => {
    setDraftSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = () => {
    if (draftMode === "all") {
      onChange(null);
    } else {
      const ordered = visibleFields
        .map((f) => f.id)
        .filter((id) => draftSelected.has(id));
      onChange(ordered);
    }
    onClose();
  };

  const requiredButUnchecked = visibleFields.filter(
    (f) => f.required && draftMode === "custom" && !draftSelected.has(f.id),
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable
          className="flex-1 bg-[rgba(0,0,0,0.6)]"
          onPress={onClose}
        />
        <View className="bg-surface rounded-t-[24px] px-6 pt-4 pb-10 max-h-[85%]">
          <View className="self-center w-[40px] h-[4px] rounded-full bg-white-20 mb-4" />

          <View className="flex-row items-center justify-between mb-4">
            <FlameText variant="h4" className="text-white-100">
              Registration form
            </FlameText>
            <Pressable onPress={onClose} className="p-1">
              <Feather name="x" size={24} color={colors["white-100"]} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View className="gap-3 mb-4">
              <Pressable
                onPress={() => setDraftMode("all")}
                className="flex-row items-start gap-3"
              >
                <View className="mt-[2px]">
                  <Feather
                    name={
                      draftMode === "all" ? "check-circle" : "circle"
                    }
                    size={20}
                    color={colors["white-100"]}
                  />
                </View>
                <View className="flex-1">
                  <FlameText variant="subtitle1" className="text-white-100">
                    Collect all event fields
                  </FlameText>
                  <FlameText
                    variant="subtitle2-light"
                    className="text-white-50 mt-0.5"
                  >
                    Use every non-archived field configured at the event level.
                  </FlameText>
                </View>
              </Pressable>

              <Pressable
                onPress={() => setDraftMode("custom")}
                className="flex-row items-start gap-3"
              >
                <View className="mt-[2px]">
                  <Feather
                    name={draftMode === "custom" ? "check-circle" : "circle"}
                    size={20}
                    color={colors["white-100"]}
                  />
                </View>
                <View className="flex-1">
                  <FlameText variant="subtitle1" className="text-white-100">
                    Customize for this tier
                  </FlameText>
                  <FlameText
                    variant="subtitle2-light"
                    className="text-white-50 mt-0.5"
                  >
                    Pick exactly which fields registrants on this tier will
                    fill in.
                  </FlameText>
                </View>
              </Pressable>
            </View>

            {draftMode === "custom" && (
              <View className="gap-2 mb-4">
                {visibleFields.length === 0 ? (
                  <FlameText
                    variant="subtitle1"
                    className="text-white-50 italic"
                  >
                    No event-level fields to choose from.
                  </FlameText>
                ) : (
                  visibleFields.map((field) => {
                    const checked = draftSelected.has(field.id);
                    return (
                      <Pressable
                        key={field.id}
                        onPress={() => toggle(field.id)}
                        className="flex-row items-center gap-3 bg-white-5 border border-white-10 rounded-card px-3 py-3"
                      >
                        <View
                          className={`w-5 h-5 rounded border items-center justify-center ${checked ? "bg-white-100 border-white-100" : "border-white-30"}`}
                        >
                          {checked && (
                            <Feather name="check" size={14} color="#041C2B" />
                          )}
                        </View>
                        <View className="flex-1">
                          <View className="flex-row items-center gap-2 flex-wrap">
                            <FlameText
                              variant="subtitle1"
                              className="text-white-100"
                            >
                              {field.label || field.id}
                            </FlameText>
                            {field.required && (
                              <View className="border border-white-30 rounded-pill px-2 py-0.5">
                                <FlameText
                                  variant="subtitle2"
                                  className="text-white-80 uppercase"
                                >
                                  Required
                                </FlameText>
                              </View>
                            )}
                          </View>
                          {field.type && (
                            <FlameText
                              variant="subtitle2-light"
                              className="text-white-50 uppercase mt-0.5"
                            >
                              {field.type}
                            </FlameText>
                          )}
                        </View>
                      </Pressable>
                    );
                  })
                )}

                {requiredButUnchecked.length > 0 && (
                  <FlameText
                    variant="subtitle2-light"
                    className="text-white-80 mt-2"
                  >
                    Heads up: {requiredButUnchecked.length} field
                    {requiredButUnchecked.length === 1 ? " is" : "s are"} required
                    at the event level but unchecked for this tier. Registrants
                    on this tier will skip{" "}
                    {requiredButUnchecked.length === 1 ? "it" : "them"} entirely.
                  </FlameText>
                )}
              </View>
            )}
          </ScrollView>

          <View className="flex-row gap-3 justify-end pt-2 border-t border-white-10">
            <Pressable
              onPress={onClose}
              className="border border-white-30 rounded-pill px-6 py-3"
            >
              <FlameText variant="subtitle1" className="text-white-100">
                Cancel
              </FlameText>
            </Pressable>
            <Pressable
              onPress={save}
              className="bg-white-100 rounded-pill px-6 py-3"
            >
              {/* FlameText hardcodes text-white-100 — use raw Text with style for dark labels on white CTAs. */}
              <Text
                style={{ color: colors.dark }}
                className="text-sm leading-5 font-poppins-medium"
              >
                Save
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
