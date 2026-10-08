import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FlameImage, colors } from "@project-flame/ui";

interface SettingsPhotoSectionProps {
  photoUrl: string | null | undefined;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function SettingsPhotoSection({
  photoUrl,
  onEdit,
  onDelete,
}: SettingsPhotoSectionProps) {
  const hasPhoto = Boolean(photoUrl);

  return (
    <View className="relative">
      {hasPhoto ? (
        <FlameImage
          source={{ uri: photoUrl! }}
          className="w-full h-[254px] rounded-card"
          contentFit="cover"
        />
      ) : (
        <View className="w-full h-[254px] rounded-card bg-white-5 items-center justify-center">
          <Ionicons name="camera-outline" size={48} color={colors["white-30"]} />
        </View>
      )}
      {(onEdit ?? onDelete) && (
        <View className="absolute bottom-3 right-3 flex-row gap-2">
          {onEdit && (
            <Pressable
              onPress={onEdit}
              className="bg-[rgba(82,82,82,0.4)] rounded-[30px] p-[10px]"
              accessibilityLabel="Edit photo"
              accessibilityRole="button"
              accessible={true}
            >
              <Ionicons name="create-outline" size={16} color="#F9FBFE" />
            </Pressable>
          )}
          {onDelete && (
            <Pressable
              onPress={onDelete}
              className="bg-[rgba(82,82,82,0.4)] rounded-[30px] p-[10px]"
              accessibilityLabel="Delete photo"
              accessibilityRole="button"
              accessible={true}
            >
              <Ionicons name="trash-outline" size={16} color="#F9FBFE" />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
