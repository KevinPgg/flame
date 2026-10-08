import { View, Text, TextInput } from "react-native";

interface SettingsTextAreaProps {
  label: string;
  value: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  maxLength?: number;
}

export function SettingsTextArea({
  label,
  value,
  onChangeText,
  placeholder,
  maxLength,
}: SettingsTextAreaProps) {
  return (
    <View className="bg-white-5 border border-white-10 rounded-card px-4 py-2 h-[148px]">
      <View className="flex-row justify-between items-center">
        <Text className="text-white-70 text-xs leading-4 font-poppins-medium">
          {label}
        </Text>
        {maxLength != null && (
          <Text className="text-white-50 text-xs font-poppins-light">
            {value.length}/{maxLength}
          </Text>
        )}
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline
        textAlignVertical="top"
        placeholder={placeholder}
        maxLength={maxLength}
        className="flex-1 text-white-100 text-sm leading-5 font-poppins"
        placeholderTextColor="rgba(255,255,255,0.5)"
      />
    </View>
  );
}
