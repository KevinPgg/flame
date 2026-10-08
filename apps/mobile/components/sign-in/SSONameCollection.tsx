import { useState, useEffect, useRef } from "react";
import { View, TextInput, ActivityIndicator, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { FlameText, PillButton, colors } from "@project-flame/ui";

interface SSONameCollectionProps {
  provider: "apple" | "google";
  error: string;
  loading: boolean;
  onSubmit: (firstName: string, lastName: string) => void;
  onCancel: () => void;
}

// Fallback screen shown when an SSO provider (usually Apple) finishes the
// OAuth hand-off but doesn't release the user's name. Apple only returns
// the name on the FIRST authorization per Apple ID × bundle ID — if the user
// ever authorized this app before (dev build, TestFlight, reinstall), Apple
// returns just the user ID and no name. Clerk's "Require first and last name"
// setting keeps the sign-up in `missing_requirements`. This screen collects
// the name and completes the sign-up via `signUp.update({ firstName, lastName })`.
//
// Industry precedent: Luma, Eventbrite, Airbnb all show an equivalent
// "Complete your profile" screen after Sign in with Apple for the same reason.
export function SSONameCollection({
  provider,
  error,
  loading,
  onSubmit,
  onCancel,
}: SSONameCollectionProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const firstNameRef = useRef<TextInput | null>(null);
  const lastNameRef = useRef<TextInput | null>(null);

  useEffect(() => {
    const t = setTimeout(() => firstNameRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0;
  const providerLabel = provider === "apple" ? "Apple" : "Google";

  const handleSubmit = () => {
    if (!canSubmit || loading) return;
    onSubmit(firstName.trim(), lastName.trim());
  };

  return (
    <View className="flex-1 px-6 justify-center">
      <Pressable
        onPress={onCancel}
        disabled={loading}
        className="absolute top-16 left-6 flex-row items-center gap-2 z-10"
      >
        <Feather name="arrow-left" size={24} color={colors["white-100"]} />
        <FlameText variant="subtitle1" className="text-white-100">
          Back
        </FlameText>
      </Pressable>

      <View className="items-center mb-8">
        <View className="mb-4">
          <Feather name="user" size={48} color={colors["white-50"]} />
        </View>
        <FlameText variant="h4" className="text-white-100 text-center mb-2">
          One more step
        </FlameText>
        <FlameText
          variant="subtitle1"
          className="text-white-50 text-center px-4"
        >
          {providerLabel} didn&apos;t share your name. Please enter it to finish
          creating your account.
        </FlameText>
      </View>

      <View className="flex-row gap-3 mb-6">
        <View className="flex-1">
          <FlameText
            variant="subtitle2"
            className="text-white-70 mb-2 uppercase"
          >
            First Name
          </FlameText>
          <TextInput
            ref={firstNameRef}
            className="bg-white-5 border border-white-20 rounded-card px-4 py-3.5 text-white-100 font-poppins text-base"
            placeholder="First name"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            autoCorrect={false}
            autoComplete="given-name"
            editable={!loading}
            returnKeyType="next"
            onSubmitEditing={() => lastNameRef.current?.focus()}
          />
        </View>
        <View className="flex-1">
          <FlameText
            variant="subtitle2"
            className="text-white-70 mb-2 uppercase"
          >
            Last Name
          </FlameText>
          <TextInput
            ref={lastNameRef}
            className="bg-white-5 border border-white-20 rounded-card px-4 py-3.5 text-white-100 font-poppins text-base"
            placeholder="Last name"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            autoCorrect={false}
            autoComplete="family-name"
            editable={!loading}
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
          />
        </View>
      </View>

      {error ? (
        <View className="mb-4 bg-[rgba(234,51,112,0.1)] rounded-card px-4 py-3">
          <FlameText variant="subtitle2" className="text-[#EA3370]">
            {error}
          </FlameText>
        </View>
      ) : null}

      <View className="items-center mb-6">
        {loading ? (
          <View className="bg-white-100 rounded-pill h-[48px] w-full items-center justify-center opacity-70">
            <ActivityIndicator size="small" color="#041C2B" />
          </View>
        ) : (
          <PillButton
            label="Continue"
            variant="solid"
            onPress={handleSubmit}
            style={!canSubmit ? { opacity: 0.5 } : undefined}
            className="w-full"
          />
        )}
      </View>
    </View>
  );
}
