import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NotificationRecord } from "../../hooks/useNotifications";

const TYPE_CONFIG: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; color: string; iconBg: string }
> = {
  rsvp_pending: { icon: "time-outline", color: "#4A90E2", iconBg: "rgba(74,144,226,0.15)" },
  rsvp_approved: { icon: "checkmark-circle-outline", color: "#5DDBB1", iconBg: "rgba(93,219,177,0.15)" },
  rsvp_rejected: { icon: "close-circle-outline", color: "#EA3370", iconBg: "rgba(234,51,112,0.15)" },
  event_date_changed: { icon: "calendar-outline", color: "#F7931E", iconBg: "rgba(247,147,30,0.15)" },
  event_reminder: { icon: "alarm-outline", color: "#F7931E", iconBg: "rgba(247,147,30,0.15)" },
  new_rsvp_request: { icon: "person-add-outline", color: "#4A90E2", iconBg: "rgba(74,144,226,0.15)" },
  ticket_sold: { icon: "cash-outline", color: "#5DDBB1", iconBg: "rgba(93,219,177,0.15)" },
  auth_expiry_warning: { icon: "warning-outline", color: "#FF6B35", iconBg: "rgba(255,107,53,0.15)" },
  organization_approved: { icon: "checkmark-circle-outline", color: "#5DDBB1", iconBg: "rgba(93,219,177,0.15)" },
  organization_rejected: { icon: "close-circle-outline", color: "#EA3370", iconBg: "rgba(234,51,112,0.15)" },
  followed_org_event: { icon: "sparkles-outline", color: "#F7931E", iconBg: "rgba(247,147,30,0.15)" },
};

const DEFAULT_CONFIG = { icon: "notifications-outline" as const, color: "#9CA3AF", iconBg: "rgba(156,163,175,0.15)" };

function formatTimeAgo(dateString: string): string {
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return "";

  const diffMs = Math.max(0, Date.now() - parsed.getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

interface NotificationCardProps {
  item: NotificationRecord;
  onPress?: () => void;
}

export function NotificationCard({ item, onPress }: NotificationCardProps) {
  const config = TYPE_CONFIG[item.type] ?? DEFAULT_CONFIG;

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-start gap-3 px-4 py-3 ${!item.read ? "bg-white-5" : "bg-surface"}`}
    >
      <View
        style={{ backgroundColor: config.iconBg }}
        className="rounded-full size-[40px] items-center justify-center mt-[2px]"
      >
        <Ionicons name={config.icon} size={20} color={config.color} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text
            className={`text-sm leading-5 ${!item.read ? "font-poppins-semibold" : "font-poppins-medium"} text-white-100`}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {!item.read && (
            <View className="size-2 rounded-full bg-primary ml-2" />
          )}
        </View>
        {/* A rejection carries support's reason and opens nothing else: show it whole. */}
        <Text
          className="text-xs leading-4 font-poppins text-white-80 mt-[2px]"
          numberOfLines={item.type === "organization_rejected" ? undefined : 2}
        >
          {item.body}
        </Text>
        <Text className="text-xs leading-4 font-poppins-light text-white-50 mt-1">
          {formatTimeAgo(item.created_at)}
        </Text>
      </View>
    </Pressable>
  );
}
