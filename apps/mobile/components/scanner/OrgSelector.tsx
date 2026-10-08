import { View, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { FlameText, FlameImage, colors } from "@project-flame/ui";
import { canManageMembers } from "@project-flame/lib";
import type { UserOrg } from "../../hooks/useUserOrgs";
import type { OrgMemberRole } from "@project-flame/lib";

const DEFAULT_ORG_IMAGE = "https://jaoqfvugxmtomdufhswa.supabase.co/storage/v1/object/public/organization-images/default.jpg";

interface OrgSelectorProps {
  orgs: UserOrg[];
  selectedOrgId: string | null;
  onSelect: (orgId: string) => void;
  /** Current user's role in the selected org — used to show/hide "Manage" button */
  memberRole?: OrgMemberRole | null;
}

function OrgCircle({
  org,
  isSelected,
  onPress,
}: {
  org: UserOrg;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="items-center gap-2 w-[80px]">
      <View
        className={`rounded-full ${isSelected ? "border-2 border-white-100 p-[2px]" : "p-[2px]"}`}
      >
        <View className="w-[52px] h-[52px] rounded-full overflow-hidden bg-white-10">
          <FlameImage
            source={{ uri: org.logoUrl || DEFAULT_ORG_IMAGE }}
            className="w-full h-full"
            contentFit="cover"
            transition={300}
          />
        </View>
      </View>
      <FlameText
        variant="subtitle2-light"
        className={`text-center ${isSelected ? "text-white-100 font-poppins-medium" : "text-white-50"}`}
        numberOfLines={2}
      >
        {org.organizationName}
      </FlameText>
    </Pressable>
  );
}

export function OrgSelector({ orgs, selectedOrgId, onSelect, memberRole }: OrgSelectorProps) {
  const router = useRouter();
  const showManage = canManageMembers(memberRole ?? null);
  const hasMultipleOrgs = orgs.length > 1;

  // Always render the section (header + optional org circles)
  // so single-org users still see the Manage button
  if (orgs.length === 0) return null;

  return (
    <View className="gap-3 mt-4">
      {/* Header row: title + Manage button */}
      <View className="flex-row items-center justify-between px-6">
        <FlameText variant="subtitle1" className="text-white-80">
          {hasMultipleOrgs ? "Select Organization" : "Organization"}
        </FlameText>
        {showManage && (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/org-members",
                params: { orgId: selectedOrgId ?? orgs[0]?.organizationId },
              })
            }
            hitSlop={8}
          >
            <FlameText
              variant="subtitle2"
              className="font-poppins-medium"
              style={{ color: "#238FDA" }}
            >
              Manage
            </FlameText>
          </Pressable>
        )}
      </View>

      {/* Org circles — always shown so users see which org they belong to */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 16 }}
      >
        {orgs.map((org) => (
          <OrgCircle
            key={org.organizationId}
            org={org}
            isSelected={selectedOrgId === org.organizationId}
            onPress={() => onSelect(org.organizationId)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
