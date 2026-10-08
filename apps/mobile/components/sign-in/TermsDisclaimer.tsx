import { View, Text } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { FlameText } from "@project-flame/ui";

const TERMS_URL = "https://flme.co/terms-of-use";
const PRIVACY_URL = "https://flme.co/privacy-policy";

// Clickwrap legal disclaimer. Single consent surface for every auth path on
// the sign-in screen (Apple, Google, email sign-in, email sign-up), visible
// on both sign-in and sign-up modes. Tapping any auth button constitutes
// acceptance of the linked Terms + Privacy Policy.
//
// Industry standard (Luma, Eventbrite, Airbnb, Ticketmaster, Uber, Spotify):
// no separate checkbox for SSO or email — one visible disclaimer adjacent
// to the affirmative action is legally sufficient under US / EU / GDPR and
// Apple HIG / App Store 4.8. Replaces the previous explicit <TermsCheckbox>
// (removed in fix #127). For SSO new-user sign-ups, `legalAccepted: true`
// is passed programmatically in runSSOFlow.
export function TermsDisclaimer() {
  const openUrl = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      console.error(`[TermsDisclaimer] Failed to open external URL: ${url}`, err);
    }
  };

  return (
    <View className="mb-4 px-1">
      <FlameText variant="subtitle2" className="text-white-50 text-center leading-4">
        By continuing, you agree to our{" "}
        <Text
          onPress={() => {
            void openUrl(TERMS_URL);
          }}
          className="text-white-70 font-poppins-medium underline"
        >
          Terms of Use
        </Text>{" "}
        and{" "}
        <Text
          onPress={() => {
            void openUrl(PRIVACY_URL);
          }}
          className="text-white-70 font-poppins-medium underline"
        >
          Privacy Policy
        </Text>
        .
      </FlameText>
    </View>
  );
}
