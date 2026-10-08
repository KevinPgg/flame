import { View, FlatList, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { FlameText, CategoryPill, type CategoryData } from "@project-flame/ui";
import { Ionicons } from "@expo/vector-icons";
import { useOrganizations } from "../../hooks/useOrganizations";

const DEFAULT_ORG_IMAGE = "https://jaoqfvugxmtomdufhswa.supabase.co/storage/v1/object/public/organization-images/default.jpg";
// Mirrors `.limit(30)` on the web discover-page organizers query for parity.
// Bumped from 10 in v1.0.13 (see CHANGELOG_IOS_VERSIONS.md).
const MAX_VISIBLE = 30;

export function ExploreOrganizers() {
  const router = useRouter();
  const { data: organizations } = useOrganizations();

  if (!organizations || organizations.length === 0) return null;

  const visible = organizations.slice(0, MAX_VISIBLE);

  const asCategoryData = (org: (typeof organizations)[number]): CategoryData => ({
    id: org.id,
    name: org.name,
    imageUrl: org.logo_url ?? DEFAULT_ORG_IMAGE,
  });

  const renderItem = ({ item }: { item: CategoryData }) => (
    <CategoryPill
      category={item}
      onPress={() => {
        const org = organizations.find((o) => o.id === item.id);
        if (org) router.push(`/organizer/${org.slug}`);
      }}
    />
  );

  return (
    <View className="gap-6">
      <View className="px-4">
        <FlameText variant="h4" className="text-white-100 text-center">
          Explore Organizers
        </FlameText>
      </View>
      <FlatList
        data={visible.map(asCategoryData)}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      />
    </View>
  );
}
