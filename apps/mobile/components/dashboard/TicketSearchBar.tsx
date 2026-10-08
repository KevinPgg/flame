import { View, Text, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@project-flame/ui";

interface TicketSearchBarProps {
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
}

export function TicketSearchBar({
  value,
  onChangeText,
  placeholder = "Search by event name",
}: TicketSearchBarProps) {
  return (
    <View className="flex-row items-center gap-[10px]">
      <View className="flex-1 flex-row items-center gap-4 bg-white-5 border border-white-10 rounded-pill p-4">
        <Ionicons name="search" size={20} color={colors["white-50"]} />
        {onChangeText ? (
          <TextInput
            className="flex-1 text-sm text-white-100 font-poppins"
            placeholder={placeholder}
            placeholderTextColor={colors["white-50"]}
            value={value}
            onChangeText={onChangeText}
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : (
          <Text className="flex-1 text-sm text-white-50 font-poppins">
            {placeholder}
          </Text>
        )}
      </View>
    </View>
  );
}
