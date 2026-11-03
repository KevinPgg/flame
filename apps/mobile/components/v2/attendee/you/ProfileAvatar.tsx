/** The person's avatar: photo, or initials on their colour (Edit profile, 2026-11-02). */
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { profileColor, profileInitials } from "@project-flame/lib";

export function ProfileAvatar({ name, email, photo, color, size = 84 }: { name: string; email?: string | null; photo: string | null; color: string | null; size?: number }) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: photo ? "#1c1c1c" : profileColor(color, name || email) }}
      className="items-center justify-center overflow-hidden"
    >
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: size, height: size }} contentFit="cover" accessibilityIgnoresInvertColors />
      ) : (
        <Text style={{ fontSize: Math.round(size / 3) }} className="font-v2-display-bold text-v2-cream">
          {profileInitials(name, email)}
        </Text>
      )}
    </View>
  );
}
