import { useState, useCallback } from "react";
import {
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSignIn } from "@clerk/expo";
import { FlameText, PillButton, colors } from "@project-flame/ui";
import { Feather } from "@expo/vector-icons";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { signIn, isLoaded } = useSignIn();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = useCallback(async () => {
    if (loading || !isLoaded || !signIn) return;
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });

      router.push({
        pathname: "/reset-password",
        params: { email: email.trim() },
      } as never);
    } catch (err: unknown) {
      if (err !== null && typeof err === "object" && "errors" in err) {
        const errors = (err as { errors?: { message: string }[] }).errors;
        if (Array.isArray(errors) && errors[0]?.message) {
          setError(errors[0].message);
          return;
        }
      }
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [loading, isLoaded, signIn, email, router]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View className="flex-1 px-6 justify-center">
        <Pressable
          onPress={() => router.back()}
          className="absolute top-16 left-6 flex-row items-center gap-2 z-10"
        >
          <Feather name="arrow-left" size={24} color={colors["white-100"]} />
          <FlameText variant="subtitle1" className="text-white-100">
            Back
          </FlameText>
        </Pressable>

        <View className="items-center mb-8">
          <View className="mb-4">
            <Feather name="lock" size={48} color={colors["white-50"]} />
          </View>
          <FlameText variant="h4" className="text-white-100 text-center mb-2">
            Forgot your password?
          </FlameText>
          <FlameText
            variant="subtitle1"
            className="text-white-50 text-center"
          >
            Enter your email and we'll send you a code to reset it.
          </FlameText>
        </View>

        <View className="mb-4">
          <FlameText
            variant="subtitle2"
            className="text-white-70 mb-2 uppercase"
          >
            Email
          </FlameText>
          <TextInput
            className="bg-white-5 border border-white-20 rounded-card px-4 py-3.5 text-white-100 font-poppins text-base"
            placeholder="you@example.com"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            editable={!loading}
            onSubmitEditing={onSubmit}
            returnKeyType="go"
            autoFocus
          />
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
              label="Send Reset Code"
              variant="solid"
              onPress={onSubmit}
              className="w-full"
            />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
