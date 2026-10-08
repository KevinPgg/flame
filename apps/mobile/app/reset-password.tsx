import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams, useNavigation } from "expo-router";
import { useSignIn } from "@clerk/expo";
import { navigateToTabs } from "../lib/navigation";
import { FlameText, PillButton, colors } from "@project-flame/ui";
import { Feather } from "@expo/vector-icons";

const CODE_LENGTH = 6;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { signIn, setActive, isLoaded } = useSignIn();

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleDigitChange = (text: string, index: number) => {
    if (text.length > 1) {
      const pasted = text.replace(/[^0-9]/g, "").slice(0, CODE_LENGTH);
      const newDigits = [...digits];
      for (let i = 0; i < pasted.length && index + i < CODE_LENGTH; i++) {
        newDigits[index + i] = pasted[i];
      }
      setDigits(newDigits);
      const firstEmpty = newDigits.findIndex((d) => !d);
      const focusIndex = firstEmpty >= 0 ? firstEmpty : CODE_LENGTH - 1;
      inputRefs.current[focusIndex]?.focus();
      return;
    }

    const cleaned = text.replace(/[^0-9]/g, "");
    const newDigits = [...digits];
    newDigits[index] = cleaned;
    setDigits(newDigits);

    if (cleaned && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (
    e: { nativeEvent: { key: string } },
    index: number,
  ) => {
    if (e.nativeEvent.key === "Backspace" && !digits[index] && index > 0) {
      const newDigits = [...digits];
      newDigits[index - 1] = "";
      setDigits(newDigits);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const onSubmit = useCallback(async () => {
    if (loading || !isLoaded || !signIn) return;

    const code = digits.join("");
    if (code.length !== CODE_LENGTH) {
      setError("Please enter the 6-digit code.");
      return;
    }
    if (!newPassword) {
      setError("Please enter a new password.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
      });

      if (result.status === "needs_new_password") {
        const resetResult = await signIn.resetPassword({
          password: newPassword,
        });

        if (
          resetResult.status === "complete" &&
          resetResult.createdSessionId
        ) {
          await setActive({ session: resetResult.createdSessionId });
          navigateToTabs(navigation);
          return;
        }
      }

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        navigateToTabs(navigation);
        return;
      }

      setError("Password reset incomplete. Please try again.");
    } catch (err: unknown) {
      if (err !== null && typeof err === "object" && "errors" in err) {
        const errors = (err as { errors?: { message: string }[] }).errors;
        if (Array.isArray(errors) && errors[0]?.message) {
          setError(errors[0].message);
          return;
        }
      }
      setError("Password reset failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [loading, isLoaded, signIn, digits, newPassword, setActive, navigation]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View className="flex-1 px-6 justify-center">
        <Pressable
          onPress={() => router.back()}
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
            <Feather name="mail" size={48} color={colors["white-50"]} />
          </View>
          <FlameText variant="h4" className="text-white-100 text-center mb-2">
            Reset your password
          </FlameText>
          <FlameText
            variant="subtitle1"
            className="text-white-50 text-center"
          >
            Enter the 6-digit code sent to
          </FlameText>
          {email ? (
            <FlameText
              variant="subtitle1"
              className="text-white-80 text-center"
            >
              {email}
            </FlameText>
          ) : null}
        </View>

        <View className="flex-row justify-center gap-1 mb-6">
          {digits.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => {
                inputRefs.current[index] = ref;
              }}
              className="w-[50px] h-[64px] px-2 py-3 bg-white-5 border border-white-20 rounded-card text-center text-white-100 font-poppins-semibold text-xl"
              value={digit}
              onChangeText={(text) => handleDigitChange(text, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              keyboardType="number-pad"
              maxLength={CODE_LENGTH}
              editable={!loading}
              selectTextOnFocus
            />
          ))}
        </View>

        <View className="mb-6">
          <FlameText
            variant="subtitle2"
            className="text-white-70 mb-2 uppercase"
          >
            New Password
          </FlameText>
          <View className="relative">
            <TextInput
              className="bg-white-5 border border-white-20 rounded-card px-4 py-3.5 text-white-100 font-poppins text-base pr-12"
              placeholder="Enter new password"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="new-password"
              editable={!loading}
              onSubmitEditing={onSubmit}
              returnKeyType="go"
            />
            <Pressable
              onPress={() => setShowPassword((prev) => !prev)}
              className="absolute right-4 top-3.5"
            >
              <Feather
                name={showPassword ? "eye-off" : "eye"}
                size={20}
                color={colors["white-50"]}
              />
            </Pressable>
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
              label="Reset Password"
              variant="solid"
              onPress={onSubmit}
              className="w-full"
            />
          )}
        </View>

        <FlameText
          variant="subtitle2-light"
          className="text-white-30 text-center"
        >
          Didn&apos;t receive the code? Check your spam folder.
        </FlameText>
      </View>
    </KeyboardAvoidingView>
  );
}
