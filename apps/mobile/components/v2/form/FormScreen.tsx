/**
 * Full-screen organizer form: scrolling content plus a fixed action bar at the bottom
 * (prototype: "Save changes" / "Publish event" always reachable). No bottom tab bar. On Android
 * the view lifts itself above the keyboard (useKeyboardLift) and the action bar hides while typing
 * so the field being edited has room.
 */
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { flameV2Colors as c } from "@project-flame/lib";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardLift, useKeyboardVisible } from "../../../hooks/v2/useKeyboardVisible";

/**
 * `backdrop`: the event flyer, blurred behind the top of the form (same look as the event
 * detail header — Kevin, 10-26: "usar el fondo difuminado").
 */
export function FormScreen({ children, actions, scrollRef, backdrop }: { children: ReactNode; actions: ReactNode; scrollRef?: React.Ref<ScrollView>; backdrop?: string | null }) {
  const insets = useSafeAreaInsets();
  const { lift, onLayout } = useKeyboardLift();
  const typing = useKeyboardVisible();
  return (
    <View className="flex-1" onLayout={onLayout} style={{ paddingBottom: lift }}>
      {backdrop ? (
        <View pointerEvents="none" testID="form-backdrop" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 420 }}>
          <Image source={{ uri: backdrop }} style={{ width: "100%", height: "100%", opacity: 0.45 }} blurRadius={50} contentFit="cover" />
          <LinearGradient colors={["rgba(0,0,0,0.3)", c.ink]} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
        </View>
      ) : null}
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
