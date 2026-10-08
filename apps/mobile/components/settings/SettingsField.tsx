import { type ReactNode } from "react";
import { View, Text, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface SettingsFieldProps {
  label: string;
  value: string;
  showDropdown?: boolean;
  icon?: ReactNode;
  onChangeText?: (text: string) => void;
  placeholder?: string;
}

export function SettingsField({
  label,
  value,
  showDropdown,
  icon,
  onChangeText,
  placeholder,
}: SettingsFieldProps) {
  return (
    <View className="bg-white-5 border border-white-30 rounded-pill px-4 py-2 flex-row items-center justify-between">
      {icon && <View className="mr-4">{icon}</View>}
      <View className="flex-1 gap-0">
        <Text className="text-white-70 text-xs leading-4 font-poppins">
          {label}
        </Text>
        {onChangeText ? (
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="rgba(255,255,255,0.4)"
            className="text-white-100 text-sm leading-5 font-poppins p-0"
          />
        ) : (
          <Text className="text-white-100 text-sm leading-5 font-poppins">
            {value || placeholder || ""}
          </Text>
        )}
      </View>
      {showDropdown && (
        <Ionicons name="chevron-down" size={24} color="#F9FBFE" />
      )}
    </View>
  );
}
