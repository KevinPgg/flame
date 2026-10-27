import { LegacyHomeContent } from "../components/home/LegacyHomeContent";
import { attendeeV2Enabled } from "../lib/v2/flags";
import { Explore } from "../components/v2/attendee/explore/Explore";

/** Explore: Flame 2.0 (fase 2.5) unless EXPO_PUBLIC_ATTENDEE_V1=true. */
export default function DiscoverScreen() {
  return attendeeV2Enabled() ? <Explore /> : <LegacyHomeContent />;
}
