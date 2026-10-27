import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Dimensions,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, CustomRefreshControl } from "@project-flame/ui";
import { resolveNotificationDeepLink } from "../../lib/notification-deep-links";
import type { NotificationRecord } from "../../hooks/useNotifications";
import { NotificationCard } from "./NotificationCard";
import { InboxRow } from "../v2/attendee/InboxCard";
import { attendeeV2Enabled } from "../../lib/v2/flags";
import { useI18n } from "../../lib/i18n";
import { ConfirmDialog } from "../v2/ui";

export interface NotificationsOverlayState {
  notifications: NotificationRecord[];
  isLoading: boolean;
  isInitialLoad: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismiss: (notificationId: string) => Promise<void>;
  dismissAll: () => Promise<void>;
  unreadCount: number;
}

interface NotificationsOverlayProps {
  visible: boolean;
  onClose: () => void;
  notificationsState: NotificationsOverlayState;
}

const OPEN_SPRING = { damping: 22, stiffness: 250, mass: 0.8 };
const CLOSE_SPRING = { damping: 24, stiffness: 300, mass: 0.8 };
/** Snap row back after short swipe or failed server dismiss — match OPEN feel */
const ROW_SNAP_SPRING = OPEN_SPRING;
const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;
const VELOCITY_THRESHOLD = 800;

const ROW_HEIGHT = 80;

function SwipeableNotificationRow({
  item,
  onPress,
  onDismiss,
}: {
  item: NotificationRecord;
  onPress: () => void;
  onDismiss: (id: string) => Promise<void>;
}) {
  const translateX = useSharedValue(0);
  // -1 is the "natural height" sentinel — rowStyle renders height: undefined when < 0
  const rowHeight = useSharedValue(-1);
  const rowOpacity = useSharedValue(1);
  // Stores the actual measured height so the collapse starts from the real value,
  // not a hardcoded constant. Shared value so it is accessible from UI-thread worklets.
  const measuredHeight = useSharedValue(ROW_HEIGHT);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      measuredHeight.value = e.nativeEvent.layout.height;
    },
    [measuredHeight],
  );

  const doDismiss = useCallback(async () => {
    try {
      await onDismiss(item.id);
    } catch (err) {
      if (__DEV__) console.error("[SwipeableNotificationRow] dismiss failed — reverting", err);
      // Server rejected the dismiss: spring the row back to its visible state
      translateX.value = withSpring(0, ROW_SNAP_SPRING);
      rowHeight.value = withTiming(measuredHeight.value, { duration: 200 });
      rowOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [item.id, onDismiss, translateX, rowHeight, rowOpacity, measuredHeight]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      const shouldDismiss =
        Math.abs(e.translationX) > SWIPE_THRESHOLD ||
        Math.abs(e.velocityX) > VELOCITY_THRESHOLD;

      if (shouldDismiss) {
        const direction = e.translationX > 0 ? 1 : -1;
        translateX.value = withTiming(direction * SCREEN_WIDTH, { duration: 200 });
        // Anchor to measured height before animating to 0 so the collapse
        // starts from the real content height rather than an arbitrary constant.
        rowHeight.value = measuredHeight.value;
        rowHeight.value = withTiming(0, { duration: 250 });
        rowOpacity.value = withTiming(0, { duration: 250 }, (finished) => {
          if (finished) runOnJS(doDismiss)();
        });
      } else {
        translateX.value = withSpring(0, ROW_SNAP_SPRING);
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    // Use natural (undefined) height while the row is at rest; switch to an
    // explicit value only during the collapse / expand animation.
    height: rowHeight.value < 0 ? undefined : rowHeight.value,
    opacity: rowOpacity.value,
    overflow: "hidden" as const,
  }));

  const actionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_THRESHOLD * 0.5, SWIPE_THRESHOLD],
      [0, 0.5, 1],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <View>
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          styles.dismissBackground,
          actionStyle,
        ]}
      >
        <View className="flex-1 flex-row items-center justify-between px-6">
          <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
          <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
        </View>
      </Animated.View>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={rowStyle}>
          {/* Inner view reports its natural height via onLayout so measuredHeight
              stays accurate; the outer Animated.View drives the collapse animation. */}
          <View onLayout={handleLayout}>
            {attendeeV2Enabled() ? <InboxRow item={item} onPress={onPress} /> : <NotificationCard item={item} onPress={onPress} />}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}


export function NotificationsOverlay({
  visible,
  onClose,
  notificationsState,
}: NotificationsOverlayProps) {
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const [shouldRender, setShouldRender] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearError, setClearError] = useState(false);
  const router = useRouter();
  const { t } = useI18n();

  const {
    notifications,
    isLoading,
    isInitialLoad,
    error,
    refresh,
    markAsRead,
    markAllAsRead,
    dismiss,
    dismissAll,
    unreadCount,
  } = notificationsState;

  const hide = useCallback(() => setShouldRender(false), []);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      progress.value = withSpring(1, OPEN_SPRING);
    } else if (shouldRender) {
      progress.value = withSpring(0, CLOSE_SPRING, finished => {
        if (finished) runOnJS(hide)();
      });
    }
  }, [visible, shouldRender, hide]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: progress.value }],
    opacity: interpolate(
      progress.value,
      [0, 0.35],
      [0, 1],
      Extrapolation.CLAMP,
    ),
    borderRadius: interpolate(
      progress.value,
      [0, 0.6, 1],
      [120, 28, 24],
      Extrapolation.CLAMP,
    ),
  }));

  const handleNotificationPress = useCallback(
    async (item: NotificationRecord) => {
      if (!item.read) {
        try {
          await markAsRead(item.id);
        } catch (err) {
          if (__DEV__) console.error("[NotificationsOverlay] markAsRead", err);
        }
      }
      const path = resolveNotificationDeepLink(
        item.type,
        item.data?.deepLink,
        item.data as Record<string, string> | undefined,
      );
      if (path) {
        onClose();
        setTimeout(() => {
          try {
            router.push(path as never);
          } catch (err) {
            if (__DEV__) console.error("[NotificationsOverlay] openDeepLink", err);
          }
        }, 300);
      }
    },
    [markAsRead, onClose, router],
  );

  // Clear all (2026-10-27): read ones go right away; with unread ones, ask first.
  const clearAll = useCallback(async () => {
    setConfirmClear(false);
    setClearError(false);
    try {
      await dismissAll();
    } catch (err) {
      if (__DEV__) console.error("[NotificationsOverlay] dismissAll", err);
      setClearError(true);
    }
  }, [dismissAll]);
  const onClearAll = useCallback(() => {
    if (unreadCount > 0) setConfirmClear(true);
    else void clearAll();
  }, [unreadCount, clearAll]);

  const handleDismiss = useCallback(
    (id: string): Promise<void> => dismiss(id),
    [dismiss],
  );

  if (!shouldRender) return null;

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        { transformOrigin: "right top", zIndex: 50, overflow: "hidden" },
        animatedStyle,
      ]}
    >
      <View
        style={{ paddingTop: insets.top + 8 }}
        className="flex-1 bg-surface"
      >
        <View className="flex-row items-center justify-between px-4 pb-4">
          <Text className="text-white-100 text-lg font-poppins-semibold">
            {t("inbox.title")}
          </Text>
          <View className="flex-row items-center gap-3">
            {notifications.length > 0 && (
              <Pressable onPress={onClearAll} hitSlop={10} accessibilityRole="button">
                <Text className="text-white-50 text-xs font-poppins-medium">
                  {t("inbox.clearAll")}
                </Text>
              </Pressable>
            )}
            {unreadCount > 0 && (
              <Pressable
                onPress={() =>
                  markAllAsRead().catch(err => {
                    if (__DEV__) console.error("[NotificationsOverlay] markAllAsRead", err);
                  })
                }
                hitSlop={10}
              >
                <Text className="text-white-100 text-xs font-poppins-medium">
                  {t("inbox.markAllRead")}
                </Text>
              </Pressable>
            )}
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors["white-100"]} />
            </Pressable>
          </View>
        </View>
        {clearError ? (
          <Text accessibilityRole="alert" className="px-4 pb-3 text-xs font-poppins text-primary">
            {t("inbox.clearAllError")}
          </Text>
        ) : null}
        <ConfirmDialog
          open={confirmClear}
          message={t("inbox.clearAllTitle")}
          detail={t("inbox.clearAllUnread", { count: unreadCount })}
          confirmLabel={t("inbox.clearAll")}
          onConfirm={() => void clearAll()}
          onCancel={() => setConfirmClear(false)}
        />

        {isInitialLoad && notifications.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        ) : error && notifications.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6 gap-4">
            <Ionicons
              name="alert-circle-outline"
              size={48}
              color={colors["white-30"]}
            />
            <Text className="text-white-80 text-base font-poppins mt-2 text-center">
              Failed to load notifications
            </Text>
            <Text className="text-white-50 text-sm font-poppins text-center">
              {error}
            </Text>
            <Pressable
              onPress={async () => {
                setRefreshing(true);
                try { await refresh(); } catch (err) { if (__DEV__) console.error("[NotificationsOverlay] retry refresh failed", err); } finally { setRefreshing(false); }
              }}
              className="bg-white-10 rounded-pill px-6 py-2 mt-2"
            >
              <Text className="text-white-100 text-sm font-poppins-medium">
                {refreshing ? "Retrying..." : "Retry"}
              </Text>
            </Pressable>
          </View>
        ) : notifications.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <Ionicons
              name="notifications-off-outline"
              size={48}
              color={colors["white-30"]}
            />
            <Text className="text-white-80 text-base font-poppins mt-4 text-center">
              No notifications yet
            </Text>
            <Text className="text-white-50 text-sm font-poppins mt-2 text-center">
              You'll see updates about your events and tickets here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <SwipeableNotificationRow
                item={item}
                onPress={() => handleNotificationPress(item)}
                onDismiss={handleDismiss}
              />
            )}
            ItemSeparatorComponent={() => (
              <View className="h-[1px] bg-white-10 mx-4" />
            )}
            refreshControl={
              <CustomRefreshControl
                refreshing={refreshing}
                onRefresh={async () => {
                  setRefreshing(true);
                  try {
                    await refresh();
                  } catch (err) {
                    if (__DEV__) console.error("[NotificationsOverlay] refresh", err);
                  } finally {
                    setRefreshing(false);
                  }
                }}
              />
            }
            contentContainerStyle={{
              flexGrow: 1,
              paddingBottom: insets.bottom + 16,
            }}
          />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dismissBackground: {
    backgroundColor: colors.primary,
    justifyContent: "center",
  },
});
