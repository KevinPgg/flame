/**
 * Full-screen organizer form: scrolling content plus a fixed action bar at the bottom
 * (prototype: "Save changes" / "Publish event" always reachable). No bottom tab bar. On Android
 * the view lifts itself above the keyboard (useKeyboardLift) and the action bar hides while typing
 * so the field being edited has room.
 */
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardLift, useKeyboardVisible } from "../../../hooks/v2/useKeyboardVisible";

export function FormScreen({ children, actions, scrollRef }: { children: ReactNode; actions: ReactNode; scrollRef?: React.Ref<ScrollView> }) {
  const insets = useSafeAreaInsets();
  const { lift, onLayout } = useKeyboardLift();
  const typing = useKeyboardVisible();
  return (
    <View className="flex-1" onLayout={onLayout} style={{ paddingBottom: lift }}>
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }}>
        {children}
      </ScrollView>
      {!typing && (
        <View style={{ paddingBottom: Math.max(insets.bottom, 12) }} className="border-t border-v2-c10 bg-v2-ink px-4 pt-3">
          {actions}
        </View>
      )}
    </View>
  );
}
