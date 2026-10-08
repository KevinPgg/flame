import { View, Modal } from "react-native";
import { Feather } from "@expo/vector-icons";
import { FlameText, PillButton } from "@project-flame/ui";
import type { CheckoutResult } from "../../hooks/useCheckout";

interface CheckoutSuccessStateProps {
  visible: boolean;
  isRsvp: boolean;
  result: CheckoutResult;
  onDone: () => void;
  onViewTickets: () => void;
}

function getSuccessMessage(isRsvp: boolean, result: CheckoutResult): string {
  if (result.message?.trim()) return result.message;
  if (isRsvp) return "RSVP submitted! Awaiting approval.";
  return "Payment successful! Your tickets are being prepared. Once ready you will find them in your tickets section.";
}

export function CheckoutSuccessState({
  visible,
  isRsvp,
  result,
  onDone,
  onViewTickets,
}: CheckoutSuccessStateProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDone}
    >
      <View className="flex-1 justify-end bg-[rgba(0,0,0,0.6)]">
        <View className="bg-surface rounded-t-[24px] px-6 pt-4 pb-10">
          <View className="self-center w-[40px] h-[4px] rounded-full bg-white-20 mb-6" />
          <View className="items-center gap-3 py-8">
            <View className="size-[64px] rounded-full bg-[#5DDBB1]/20 items-center justify-center mb-1">
              <Feather name="check" size={32} color="#5DDBB1" />
            </View>
            <FlameText
              variant="h4"
              className="text-white-100 text-center"
              numberOfLines={2}
            >
              {isRsvp ? "RSVP Submitted!" : "Payment Successful!"}
            </FlameText>
            <FlameText
              variant="subtitle1"
              className="text-white-70 text-center px-2 mt-1"
            >
              {getSuccessMessage(isRsvp, result)}
            </FlameText>
          </View>
          <PillButton label="View My Tickets" variant="solid" onPress={onViewTickets} />
        </View>
      </View>
    </Modal>
  );
}
