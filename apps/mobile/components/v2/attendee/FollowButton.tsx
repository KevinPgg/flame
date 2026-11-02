/**
 * Follow / Following (prototype `follow-btn`), fase 4.2: white pill "Follow"; once following,
 * dark pill "Following" (tap again to unfollow).
 */
import { Pressable, Text } from "react-native";
import { useI18n } from "../../../lib/i18n";
import { useFollowing, type FollowedOrg } from "../../../hooks/useFollowing";

export function FollowButton({ org }: { org: { id: string; name: string } & Partial<FollowedOrg> }) {
  const { t } = useI18n();
  const { isFollowing, toggle } = useFollowing();
  const on = isFollowing(org.id);
  return (
    <Pressable
      onPress={() => void toggle(org, !on)}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={on ? t("follow.unfollowName", { name: org.name }) : t("follow.followName", { name: org.name })}
      hitSlop={4}
      className={`h-9 items-center justify-center rounded-v2-pill px-4 ${on ? "bg-v2-ink3 active:bg-v2-ink4" : "bg-v2-cream active:bg-v2-paper"}`}
    >
      <Text className={`font-v2-ui-semibold text-[13.5px] ${on ? "text-v2-cream" : "text-v2-ink"}`}>{on ? t("follow.following") : t("follow.follow")}</Text>
    </Pressable>
  );
}
