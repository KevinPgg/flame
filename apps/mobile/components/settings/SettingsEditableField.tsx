import { View, Text, TextInput } from "react-native";

interface SettingsEditableFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  error?: string;
  editable?: boolean;
}

export function SettingsEditableField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  editable = true,
}: SettingsEditableFieldProps) {
  return (
    <View className="gap-1">
      <Text className="text-white-70 text-xs leading-4 font-poppins">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.4)"
        editable={editable}
        className="bg-white-5 border border-white-30 rounded-pill px-4 py-2 text-white-100 text-sm leading-5 font-poppins"
      />
      {error ? (
        <Text className="text-[#EA3370] text-xs font-poppins">{error}</Text>
      ) : null}
    </View>
  );
}
