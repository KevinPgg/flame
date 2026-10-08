import { View, Text, TextInput, Pressable, Linking } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { FlameText, FlameImage, colors } from "@project-flame/ui";

const DEFAULT_ORG_IMAGE = "https://jaoqfvugxmtomdufhswa.supabase.co/storage/v1/object/public/organization-images/default.jpg";

interface EventsHeroProps {
  searchQuery: string;
  onSearchChange: (text: string) => void;
  onFilterPress?: () => void;
  selectedCity?: string | null;
  title?: string;
  subtitle?: string;
  profileImageUrl?: string | null;
  onShare?: () => void;
  description?: string | null;
  instagramHandle?: string | null;
  city?: string | null;
}

/**
 * Events page hero section.
 * Search bar + filter button over transparent background (GlowBlob provided by parent).
 * Optionally shows an organizer profile pic (circular) above the title and a share button.
 */
export function EventsHero({
  searchQuery,
  onSearchChange,
  onFilterPress,
  selectedCity,
  title = "Discover Events",
  subtitle = "Find extraordinary moments happening near you",
  profileImageUrl,
  onShare,
  description,
  instagramHandle,
  city,
}: EventsHeroProps) {
  const normalizedInstagram = instagramHandle?.trim().replace(/^@+/, "") || "";
  const truncatedDescription =
    description && description.length > 500
      ? `${description.slice(0, 500)}...`
      : description;
  return (
    <View className={`w-full px-4 ${title ? "pt-[51px] pb-4" : "pt-4 pb-2"}`}>
      {onShare && (
        <View className="flex-row justify-end mb-2">
          <Pressable
            onPress={onShare}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Share"
            accessibilityHint="Shares the current page"
            className="w-[36px] h-[36px] rounded-full bg-white-10 items-center justify-center"
          >
            <Ionicons name="share-outline" size={20} color={colors["white-100"]} />
          </Pressable>
        </View>
      )}

      {(title || subtitle || profileImageUrl !== undefined) && (
        <View className="items-center gap-[11px]">
          {profileImageUrl !== undefined && (
            <View className="w-[67px] h-[67px] rounded-full overflow-hidden bg-white-10 mb-2">
              <FlameImage
                source={{ uri: profileImageUrl || DEFAULT_ORG_IMAGE }}
                className="w-full h-full"
                contentFit="cover"
                transition={300}
              />
            </View>
          )}

          {title ? (
            <FlameText
              variant="h3"
              className="text-white-100 text-center font-poppins-medium"
            >
              {title}
            </FlameText>
          ) : null}
          {subtitle ? (
            <FlameText
              variant="body"
              className="text-white-100 text-center w-[311px]"
            >
              {subtitle}
            </FlameText>
          ) : null}

          {truncatedDescription ? (
            <FlameText
              variant="body"
              className="text-white-80 text-center px-2 mt-1"
            >
              {truncatedDescription}
            </FlameText>
          ) : null}

          {(city || normalizedInstagram) && (
            <View className="flex-row items-center gap-3 mt-1">
              {city ? (
                <View className="flex-row items-center gap-1">
                  <Ionicons name="location-outline" size={14} color={colors["white-50"]} />
                  <FlameText variant="subtitle1" className="text-white-50">
                    {city}
                  </FlameText>
                </View>
              ) : null}
              {normalizedInstagram ? (
                <Pressable
                  onPress={() =>
                    Linking.openURL(`https://instagram.com/${normalizedInstagram}`)
                  }
                  accessibilityRole="link"
                  accessibilityLabel={`Instagram @${normalizedInstagram}`}
                >
                  <View className="flex-row items-center gap-1">
                    <Ionicons name="logo-instagram" size={14} color={colors["white-50"]} />
                    <FlameText variant="subtitle1" className="text-white-50">
                      @{normalizedInstagram}
                    </FlameText>
                  </View>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      )}

      <View className={`flex-row gap-[10px] items-start ${(title || subtitle) ? (subtitle ? "mt-[23px]" : "mt-[35px]") : "mt-0"}`}>
        <View className="flex-1 flex-row items-center bg-white-5 border border-white-10 rounded-pill px-4 py-3 gap-[10px]">
          <Feather name="search" size={20} color={colors["white-50"]} />
          <TextInput
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder="Search by event name"
            placeholderTextColor={colors["white-50"]}
            className="flex-1 text-sm text-white-100 font-poppins leading-[1.4]"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <Pressable
          onPress={onFilterPress}
          className={`rounded-pill px-4 h-[44px] items-center justify-center flex-row gap-1 ${
            selectedCity ? "bg-white-100" : "bg-white-10"
          }`}
        >
          <Ionicons
            name="location-outline"
            size={16}
            color={selectedCity ? colors.dark : colors["white-80"]}
          />
          {selectedCity ? (
            <Text
              style={{ color: colors.dark }}
              className="text-xs leading-4 font-poppins-medium"
            >
              {selectedCity}
            </Text>
          ) : (
            <FlameText variant="subtitle2" className="text-white-80 font-poppins-medium">
              All cities
            </FlameText>
          )}
        </Pressable>
      </View>
    </View>
  );
}
