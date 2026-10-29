import type { TicketTierWithStatus, EventDetail } from "../../hooks/useEventDetails";
import type { CheckoutStep, CheckoutResult, PromoterValidationStatus } from "../../hooks/useCheckout";
import { CheckoutSuccessState } from "./CheckoutSuccessState";
import { CheckoutProcessingState } from "./CheckoutProcessingState";
import { CheckoutMainSheet } from "./CheckoutMainSheet";
import { RsvpSheet } from "../v2/attendee/event/RsvpSheet";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CheckoutSheetProps {
  visible: boolean;
  onClose: () => void;
  event: EventDetail;
  tier: TicketTierWithStatus;
  quantity: number;
  isRsvp: boolean;
  step: CheckoutStep;
  error: string | null;
  errorCode: string | null;
  isProcessing: boolean;
  isFree: boolean;
  result: CheckoutResult | null;
  displayAmounts: {
    subtotal: number;
    fee: number;
    total: number;
    discount: number;
  };
  promoCode: string;
  onApplyPromo: (code: string) => void;
  onClearPromo: () => void;
  promoApplied: boolean;
  isValidatingPromo?: boolean;
  // Secret code (access code)
  requiresSecretCode?: boolean;
  secretCode: string;
  onSecretCodeChange: (code: string) => void;
  // Registration form data
  registrationData: Record<string, unknown> | null;
  onRegistrationDataChange: (data: Record<string, unknown> | null) => void;
  promoterCode: string;
  promoterStatus: PromoterValidationStatus;
  onPromoterChange: (code: string) => void;
  onValidatePromoter: (code: string) => void;
  onClearPromoter: () => void;
  onCheckout: (opts?: { registrationData?: Record<string, unknown> | null }) => void;
  onReset: () => void;
  onViewTickets: () => void;
  /** Flame 2.0 (fase 3.4): RSVPs use the new request sheet (questions per guest). */
  v2Rsvp?: { maxQuantity: number; onQuantity: (n: number) => void };
}

// ---------------------------------------------------------------------------
// Component — thin coordinator
// ---------------------------------------------------------------------------

export function CheckoutSheet({
  visible,
  onClose,
  event,
  tier,
  quantity,
  isRsvp,
  step,
  error,
  errorCode,
  isProcessing,
  isFree,
  result,
  displayAmounts,
  promoCode,
  onApplyPromo,
  onClearPromo,
  promoApplied,
  isValidatingPromo,
  requiresSecretCode,
  secretCode,
  onSecretCodeChange,
  registrationData,
  onRegistrationDataChange,
  promoterCode,
  promoterStatus,
  onPromoterChange,
  onValidatePromoter,
  onClearPromoter,
  onCheckout,
  onReset,
  onViewTickets,
  v2Rsvp,
}: CheckoutSheetProps) {
  if (step === "success" && result) {
    return (
      <CheckoutSuccessState
        visible={visible}
        isRsvp={isRsvp}
        result={result}
        onDone={() => {
          onReset();
          onClose();
        }}
        onViewTickets={() => {
          onReset();
          onClose();
          onViewTickets();
        }}
      />
    );
  }

  if (isProcessing) {
    return (
      <CheckoutProcessingState visible={visible} step={step} />
    );
  }

  if (v2Rsvp && isRsvp) {
    return (
      <RsvpSheet
        visible={visible}
        onClose={onClose}
        event={event}
        tier={tier}
        quantity={quantity}
        maxQuantity={v2Rsvp.maxQuantity}
        onQuantity={v2Rsvp.onQuantity}
        promoterCode={promoterCode}
        promoterStatus={promoterStatus}
        onValidatePromoter={(code) => {
          onPromoterChange(code);
          onValidatePromoter(code);
        }}
        onClearPromoter={onClearPromoter}
        secretCode={secretCode}
        error={error}
        busy={!!isProcessing}
        promo={{ applied: promoApplied, code: promoCode, busy: !!isValidatingPromo, onApply: onApplyPromo, onClear: onClearPromo }}
        onSend={(answers) => {
          onRegistrationDataChange(answers);
          onCheckout({ registrationData: answers });
        }}
      />
    );
  }

  return (
    <CheckoutMainSheet
      visible={visible}
      onClose={onClose}
      event={event}
      tier={tier}
      quantity={quantity}
      isRsvp={isRsvp}
      error={error}
      errorCode={errorCode}
      isFree={isFree}
      displayAmounts={displayAmounts}
      promoCode={promoCode}
      onApplyPromo={onApplyPromo}
      onClearPromo={onClearPromo}
      promoApplied={promoApplied}
      isValidatingPromo={isValidatingPromo}
      requiresSecretCode={requiresSecretCode}
      secretCode={secretCode}
      onSecretCodeChange={onSecretCodeChange}
      registrationData={registrationData}
      onRegistrationDataChange={onRegistrationDataChange}
      promoterCode={promoterCode}
      promoterStatus={promoterStatus}
      onPromoterChange={onPromoterChange}
      onValidatePromoter={onValidatePromoter}
      onClearPromoter={onClearPromoter}
      onCheckout={onCheckout}
    />
  );
}
