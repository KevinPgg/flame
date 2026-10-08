import { Modal, View, Pressable, ScrollView, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameText, colors } from "@project-flame/ui";

interface OrgOption {
  name: string;
  slug: string;
}

interface FilterBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  cities: string[];
  selectedCity: string | null;
  onCityChange: (city: string | null) => void;
  organizers?: OrgOption[];
  selectedOrganizer?: string | null;
  onOrganizerChange?: (slug: string | null) => void;
  onReset: () => void;
}

function FilterOption({
  label,
  isSelected,
  onPress,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`px-4 py-3 rounded-pill mr-2 mb-2 ${
        isSelected ? "bg-white-100" : "bg-white-10"
      }`}
    >
      <Text
        className={`text-sm leading-5 ${
          isSelected ? "text-dark font-poppins-medium" : "text-white-80 font-poppins"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function FilterBottomSheet({
  visible,
  onClose,
  cities,
  selectedCity,
  onCityChange,
  organizers,
  selectedOrganizer,
  onOrganizerChange,
  onReset,
}: FilterBottomSheetProps) {
  const hasActiveFilters =
    selectedCity !== null || (selectedOrganizer !== null && selectedOrganizer !== undefined);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        {/* Backdrop */}
        <Pressable className="flex-1" onPress={onClose} />

        {/* Sheet */}
        <View className="bg-surface rounded-t-[24px] px-4 pt-4 pb-10 max-h-[70%]">
          {/* Handle + Header */}
          <View className="items-center mb-4">
            <View className="w-10 h-1 rounded-full bg-white-30 mb-4" />
            <View className="w-full flex-row items-center justify-between">
              <FlameText variant="h4" className="text-white-100">
                Filters
              </FlameText>
              <View className="flex-row items-center gap-4">
                {hasActiveFilters && (
                  <Pressable onPress={onReset}>
                    <FlameText
                      variant="subtitle1"
                      className="text-white-100 font-poppins-medium"
                    >
                      Reset
                    </FlameText>
                  </Pressable>
                )}
                <Pressable onPress={onClose} hitSlop={10}>
                  <Ionicons
                    name="close"
                    size={24}
                    color={colors["white-100"]}
                  />
                </Pressable>
              </View>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* City Filter */}
            <View className="mb-6">
              <FlameText
                variant="subtitle1"
                className="text-white-50 font-poppins-medium uppercase mb-3"
              >
                City
              </FlameText>
              <View className="flex-row flex-wrap">
                <FilterOption
                  label="All Cities"
                  isSelected={selectedCity === null}
                  onPress={() => onCityChange(null)}
                />
                {cities.map((city) => (
                  <FilterOption
                    key={city}
                    label={city}
                    isSelected={selectedCity === city}
                    onPress={() =>
                      onCityChange(selectedCity === city ? null : city)
                    }
                  />
                ))}
              </View>
            </View>

            {/* Organizer Filter (optional) */}
            {organizers && organizers.length > 0 && onOrganizerChange && (
              <View className="mb-6">
                <FlameText
                  variant="subtitle1"
                  className="text-white-50 font-poppins-medium uppercase mb-3"
                >
                  Organizer
                </FlameText>
                <View className="flex-row flex-wrap">
                  <FilterOption
                    label="All Organizers"
                    isSelected={!selectedOrganizer}
                    onPress={() => onOrganizerChange(null)}
                  />
                  {organizers.map((org) => (
                    <FilterOption
                      key={org.slug}
                      label={org.name}
                      isSelected={selectedOrganizer === org.slug}
                      onPress={() =>
                        onOrganizerChange(
                          selectedOrganizer === org.slug ? null : org.slug,
                        )
                      }
                    />
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Apply Button */}
          <Pressable
            onPress={onClose}
            className="bg-white-100 rounded-pill py-3 items-center mt-4"
          >
            <Text className="text-dark text-base leading-[22px] font-poppins-medium">
              Apply Filters
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
