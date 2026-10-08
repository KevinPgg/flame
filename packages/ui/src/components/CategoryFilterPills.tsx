import { View, Pressable, Text } from "react-native";
import type { FilterCategory } from "../types/events";

export type { FilterCategory };

export interface CategoryFilterPillsProps {
  categories: FilterCategory[];
  activeId: string;
  onSelect: (id: string) => void;
}

/**
 * Category filter pills in two rows.
 * Matches Figma node 172:851 — "All" active (white bg, red text),
 * others inactive (white bg, border, dark text).
 * Row 1: first 3 items. Row 2: remaining items.
 * Pills: rounded-[40px], px-24, py-10, Poppins Medium 14px.
 */
export function CategoryFilterPills({
  categories,
  activeId,
  onSelect,
}: CategoryFilterPillsProps) {
  // Split into rows: first 3 in row 1, rest in row 2
  const row1 = categories.slice(0, 3);
  const row2 = categories.slice(3);

  return (
    <View className="gap-2 px-4">
      {/* Row 1 */}
      <View className="flex-row gap-2 items-center">
        {row1.map((cat, index) => (
          <FilterPill
            key={cat.id}
            label={cat.label}
            isActive={cat.id === activeId}
            onPress={() => onSelect(cat.id)}
            // First pill (All) does not flex, others flex-1
            flex={index > 0}
          />
        ))}
      </View>

      {/* Row 2 */}
      {row2.length > 0 && (
        <View className="flex-row gap-2 items-center">
          {row2.map((cat) => (
            <FilterPill
              key={cat.id}
              label={cat.label}
              isActive={cat.id === activeId}
              onPress={() => onSelect(cat.id)}
              flex
            />
          ))}
        </View>
      )}
    </View>
  );
}

export interface FilterPillProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  flex?: boolean;
}

export function FilterPill({ label, isActive, onPress, flex = false }: FilterPillProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-[40px] px-6 py-[10px] items-center justify-center ${
        flex ? "flex-1" : ""
      } ${
        isActive
          ? "bg-white-100"
          : "bg-white-100 border border-white-50"
      }`}
    >
      <Text
        className={`text-sm leading-[22px] font-poppins-medium ${
          isActive ? "text-primary-900" : "text-[#292D32]"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
