"use client";

/**
 * Follow / Following (prototype `follow-btn`), fase 4.2: white pill "Follow"; once following,
 * dark pill "Following" (tap again to unfollow).
 */
import { useI18n } from "../../lib/i18n";
import { useFollowing, type FollowedOrg } from "./useFollowing";

export function FollowButton({
  org,
  baseCount,
  className = "",
}: {
  org: { id: string; name: string } & Partial<FollowedOrg>;
  /** Follower count the page shows, to move it at once. */
  baseCount?: number;
  className?: string;
}) {
  const { t } = useI18n();
  const { isFollowing, toggle } = useFollowing();
  const on = isFollowing(org.id);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? t("follow.unfollowName", { name: org.name }) : t("follow.followName", { name: org.name })}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle(org, !on, baseCount);
      }}
      className={`inline-flex h-9 shrink-0 items-center justify-center rounded-v2-pill px-4 text-[13.5px] font-v2-ui-semibold transition-colors ${
        on ? "bg-v2-ink3 text-v2-cream hover:bg-v2-ink4" : "bg-v2-cream text-v2-ink hover:bg-v2-paper"
      } ${className}`}
    >
      {on ? t("follow.following") : t("follow.follow")}
    </button>
  );
}
