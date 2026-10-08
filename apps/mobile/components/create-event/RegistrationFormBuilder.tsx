/**
 * Registration form builder — allows organizers to create/edit
 * registration_form_config fields for RSVP events.
 *
 * Each field follows the FormField interface from web:
 * apps/web/app/components/modals/RegistrationFormModal.tsx
 *
 * Benchmark: Eventbrite and Luma both have inline registration form builders
 * in their event creation flow. We keep it simple — a list of field cards
 * with label, type picker, and required toggle.
 */

import { useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { FormField } from "../../hooks/useRsvpManagement";
import { FormFieldCard } from "./FormFieldCard";

function makeFieldId(): string {
  return `field-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface RegistrationFormBuilderProps {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
}

export function RegistrationFormBuilder({
  fields,
  onChange,
}: RegistrationFormBuilderProps) {
  const handleAddField = useCallback(() => {
    const newField: FormField = {
      id: makeFieldId(),
      label: "",
      type: "text",
      required: false,
    };
    onChange([...fields, newField]);
  }, [fields, onChange]);

  const handleUpdateField = useCallback(
    (index: number, updated: FormField) => {
      const next = [...fields];
      next[index] = updated;
      onChange(next);
    },
    [fields, onChange],
  );

  const handleRemoveField = useCallback(
    (index: number) => {
      onChange(fields.filter((_, i) => i !== index));
    },
    [fields, onChange],
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index === 0) return;
      const next = [...fields];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      onChange(next);
    },
    [fields, onChange],
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= fields.length - 1) return;
      const next = [...fields];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      onChange(next);
    },
    [fields, onChange],
  );

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-white-80 text-sm font-poppins-medium">
          Registration Form Fields
        </Text>
        <Text className="text-white-50 text-xs font-poppins">
          {fields.length} field{fields.length !== 1 ? "s" : ""}
        </Text>
      </View>

      {fields.length === 0 && (
        <View className="bg-white-5 border border-white-10 rounded-card px-4 py-6 items-center">
          <Ionicons
            name="document-text-outline"
            size={28}
            color="rgba(255,255,255,0.3)"
          />
          <Text className="text-white-50 text-xs font-poppins mt-2 text-center">
            No fields yet. Tap the button below to add a question.
          </Text>
        </View>
      )}

      {fields.map((field, index) => (
        <FormFieldCard
          key={field.id}
          field={field}
          index={index}
          onChange={(updated) => handleUpdateField(index, updated)}
          onRemove={() => handleRemoveField(index)}
          onMoveUp={index > 0 ? () => handleMoveUp(index) : undefined}
          onMoveDown={
            index < fields.length - 1
              ? () => handleMoveDown(index)
              : undefined
          }
        />
      ))}

      <Pressable
        onPress={handleAddField}
        className="bg-white-5 border border-white-20 border-dashed rounded-card py-3 flex-row items-center justify-center gap-2"
      >
        <Ionicons name="add-circle-outline" size={20} color="#F9FBFE" />
        <Text className="text-white-100 text-sm font-poppins-medium">
          Add Field
        </Text>
      </Pressable>
    </View>
  );
}
