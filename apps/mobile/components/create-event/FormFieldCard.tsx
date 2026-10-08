/**
 * Individual form field editor card for the registration form builder.
 *
 * Matches the FormField interface from web:
 * apps/web/app/components/modals/RegistrationFormModal.tsx
 */

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActionSheetIOS,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, SelectionListModal } from "@project-flame/ui";
import type { FormField } from "../../hooks/useRsvpManagement";

const FIELD_TYPES: { label: string; value: FormField["type"] }[] = [
  { label: "Text", value: "text" },
  { label: "Email", value: "email" },
  { label: "Date", value: "date" },
  { label: "Number", value: "number" },
  { label: "Checkbox", value: "checkbox" },
];

interface FormFieldCardProps {
  field: FormField;
  index: number;
  onChange: (updated: FormField) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export function FormFieldCard({
  field,
  index,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: FormFieldCardProps) {
  const [typeModalVisible, setTypeModalVisible] = useState(false);

  const typeLabel =
    FIELD_TYPES.find((t) => t.value === field.type)?.label ?? field.type;

  const showTypePicker = () => {
    if (Platform.OS === "ios") {
      const options = FIELD_TYPES.map((t) => t.label);
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...options, "Cancel"],
          cancelButtonIndex: options.length,
          title: "Select Field Type",
        },
        (idx) => {
          if (idx < options.length) {
            onChange({ ...field, type: FIELD_TYPES[idx].value });
          }
        },
      );
    } else {
      setTypeModalVisible(true);
    }
  };

  const handleRemove = () => {
    Alert.alert(
      "Remove Field",
      `Remove "${field.label || `Field ${index + 1}`}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: onRemove },
      ],
    );
  };

  const isArchived = field.archived === true;

  return (
    <View
      className={`bg-white-5 border border-white-10 rounded-card p-4 gap-3 ${
        isArchived ? "opacity-60" : ""
      }`}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Text className="text-white-70 text-xs font-poppins-medium">
            Field {index + 1}
          </Text>
          {isArchived && (
            <Text className="text-white-50 text-xs font-poppins-light">
              · archived
            </Text>
          )}
        </View>
        <View className="flex-row items-center gap-2">
          {onMoveUp && (
            <Pressable onPress={onMoveUp} hitSlop={8}>
              <Ionicons name="chevron-up" size={18} color={colors["white-50"]} />
            </Pressable>
          )}
          {onMoveDown && (
            <Pressable onPress={onMoveDown} hitSlop={8}>
              <Ionicons name="chevron-down" size={18} color={colors["white-50"]} />
            </Pressable>
          )}
          <Pressable
            onPress={() => onChange({ ...field, archived: !isArchived })}
            hitSlop={8}
          >
            <Ionicons
              name={isArchived ? "refresh-outline" : "archive-outline"}
              size={18}
              color={colors["white-50"]}
            />
          </Pressable>
          <Pressable onPress={handleRemove} hitSlop={8}>
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
          </Pressable>
        </View>
      </View>

      {isArchived && (
        <Text className="text-white-50 text-xs font-poppins-light">
          Hidden from new registrations. Previous answers still appear in RSVP
          details and exports.
        </Text>
      )}

      <TextInput
        placeholder="Question text (e.g. Full Name)"
        placeholderTextColor="rgba(255,255,255,0.4)"
        className="bg-white-5 border border-white-20 rounded-pill px-4 py-3 text-white-100 text-sm font-poppins"
        value={field.label}
        onChangeText={(v) => onChange({ ...field, label: v })}
      />

      <TextInput
        placeholder="Placeholder text (optional)"
        placeholderTextColor="rgba(255,255,255,0.4)"
        className="bg-white-5 border border-white-20 rounded-pill px-4 py-3 text-white-100 text-sm font-poppins"
        value={field.placeholder ?? ""}
        onChangeText={(v) =>
          onChange({ ...field, placeholder: v || undefined })
        }
      />

      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={showTypePicker}
          className="flex-1 bg-white-5 border border-white-20 rounded-pill px-4 py-3 flex-row items-center justify-between"
        >
          <Text className="text-white-100 text-sm font-poppins">
            {typeLabel}
          </Text>
          <Ionicons
            name="chevron-down"
            size={14}
            color="rgba(255,255,255,0.5)"
          />
        </Pressable>

        <Pressable
          onPress={() => onChange({ ...field, required: !field.required })}
          className="flex-row items-center gap-[6px]"
        >
          <Ionicons
            name={field.required ? "checkbox" : "square-outline"}
            size={20}
            color={field.required ? "#F9FBFE" : "rgba(255,255,255,0.5)"}
          />
          <Text className="text-white-80 text-sm font-poppins">Required</Text>
        </Pressable>
      </View>

      <SelectionListModal
        visible={typeModalVisible}
        title="Select Field Type"
        items={FIELD_TYPES.map((t) => ({ label: t.label, value: t.value }))}
        onSelect={(value) =>
          onChange({ ...field, type: value as FormField["type"] })
        }
        onClose={() => setTypeModalVisible(false)}
      />
    </View>
  );
}
