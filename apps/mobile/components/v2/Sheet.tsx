/**
 * Bottom sheet (prototype "sheet"): title, scrollable body, optional footer; rises above the
 * keyboard on Android (useKeyboardLift) and iOS (KeyboardAvoidingView).
 */
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "../../lib/i18n";
import { useKeyboardLift } from "../../hooks/v2/useKeyboardVisible";
import { Icon } from "./ui";

export function Sheet({ open, title, subtitle, onClose, children, footer }: { open: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { lift, onLayout } = useKeyboardLift();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined} enabled={Platform.OS === "ios"} onLayout={onLayout}>
        <Pressable className="flex-1 bg-black/60" onPress={onClose} accessibilityLabel={t("common.close")} />
        <View style={{ paddingBottom: (lift > 0 ? 12 : insets.bottom + 12), marginBottom: lift }} className="max-h-[85%] rounded-t-v2-sheet bg-v2-ink2 px-4 pt-3">
          <View className="mb-3 h-1 w-10 self-center rounded-full bg-v2-c30" />
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text accessibilityRole="header" className="font-v2-display-bold text-[20px] text-v2-cream">{title}</Text>
              {subtitle ? <Text numberOfLines={1} className="font-v2-ui text-[13px] text-v2-c50">{subtitle}</Text> : null}
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8} className="h-9 w-9 items-center justify-center rounded-full active:bg-v2-ink3">
              <Icon name="close" size={20} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}>
            {children}
          </ScrollView>
          {footer ? <View className="pt-2">{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
