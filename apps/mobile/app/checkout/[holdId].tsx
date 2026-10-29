/**
 * Flame 2.0 payment screen (fase 3.3): opened by the event screen right after reserving the
 * tickets (the hold). Signed-in only — the event screen sends signed-out people to sign in first.
 */
import { useLocalSearchParams } from "expo-router";
import { PaymentScreen } from "../../components/v2/attendee/checkout/PaymentScreen";

export default function CheckoutRoute() {
  const { holdId } = useLocalSearchParams<{ holdId: string }>();
  return <PaymentScreen holdId={String(holdId ?? "")} />;
}
