import { View, type ViewStyle } from "react-native";
import { colors } from "@project-flame/ui";

interface DropdownMenuProps {
  open: boolean;
  children: React.ReactNode;
  top?: number;
  right?: number;
  style?: ViewStyle;
}

export function DropdownMenu({
  open,
  children,
  top = 28,
  right = 0,
  style,
}: DropdownMenuProps) {
  if (!open) return null;

  return (
    <View
      style={[
        {
          position: "absolute",
          top,
          right,
          backgroundColor: colors.surface,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.1)",
          paddingVertical: 4,
          minWidth: 160,
          zIndex: 100,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
