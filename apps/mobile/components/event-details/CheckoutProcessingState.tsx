import { View, Modal } from "react-native";
import { ActivityIndicator } from "react-native";
import { FlameText, colors } from "@project-flame/ui";
import type { CheckoutStep } from "../../hooks/useCheckout";

const stepLabels: Record<CheckoutStep, string> = {
  idle: "",
  creating_hold: "Reserving your tickets...",
  creating_payment_intent: "Preparing payment...",
  presenting_sheet: "Complete your payment",
  submitting_rsvp: "Submitting your RSVP...",
  completing_free: "Claiming your tickets...",
  success: "",
  error: "",
};

interface CheckoutProcessingStateProps {
  visible: boolean;
  step: CheckoutStep;
}

export function CheckoutProcessingState({
  visible,
  step,
}: CheckoutProcessingStateProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={() => {
        // Don't allow dismiss during processing
      }}
    >
      <View className="flex-1 justify-end bg-[rgba(0,0,0,0.6)]">
        <View className="bg-surface rounded-t-[24px] px-6 pt-4 pb-10">
          <View className="self-center w-[40px] h-[4px] rounded-full bg-white-20 mb-6" />
          <View className="items-center gap-4 py-12">
            <ActivityIndicator size="large" color="#FFFFFF" />
            <FlameText variant="subtitle1" className="text-white-70">
              {stepLabels[step]}
            </FlameText>
          </View>
        </View>
      </View>
    </Modal>
  );
}
