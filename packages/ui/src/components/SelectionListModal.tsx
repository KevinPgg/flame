import { Modal, View, Pressable, FlatList, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

export interface SelectionItem {
  label: string;
  value: string;
}

export interface SelectionListModalProps {
  visible: boolean;
  title: string;
  items: SelectionItem[];
  onSelect: (value: string) => void;
  onClose: () => void;
  className?: string;
}

/**
 * Scrollable selection modal for Android (and optionally iOS) when the option list
 * exceeds Alert.alert's three-button limit. Renders a list of items; tapping one
 * calls onSelect and closes. Cancel/backdrop closes without selection.
 */
export function SelectionListModal({
  visible,
  title,
  items,
  onSelect,
  onClose,
  className = "",
}: SelectionListModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View className={`flex-1 justify-end ${className}`.trim()}>
        <Pressable className="flex-1" onPress={onClose} />
        <View className="bg-surface rounded-t-[24px] px-4 pt-4 pb-10 max-h-[70%]">
          <View className="items-center mb-4">
            <View className="w-10 h-1 rounded-full bg-white-30 mb-4" />
            <View className="w-full flex-row items-center justify-between">
              <Text className="text-white-100 text-lg font-poppins-semibold">
                {title}
              </Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons
                  name="close"
                  size={24}
                  color={colors["white-100"]}
                />
              </Pressable>
            </View>
          </View>
          <FlatList
            data={items}
            keyExtractor={(item) => item.value}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelect(item.value);
                  onClose();
                }}
                className="py-3 border-b border-white-10"
              >
                <Text className="text-white-100 text-sm leading-5 font-poppins">
                  {item.label}
                </Text>
              </Pressable>
            )}
          />
          <Pressable
            onPress={onClose}
            className="bg-white-10 rounded-pill py-3 items-center mt-4"
          >
            <Text className="text-white-100 text-sm font-poppins-medium">
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
