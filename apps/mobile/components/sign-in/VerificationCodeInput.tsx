import { useState, useRef, useEffect } from "react";
import { View, TextInput, ActivityIndicator, Pressable } from "react-native";
import { FlameText, PillButton, colors } from "@project-flame/ui";
import { Feather } from "@expo/vector-icons";

interface VerificationCodeInputProps {
  email: string;
  error: string;
  loading: boolean;
  onVerify: (code: string) => void;
  onBack: () => void;
}

const CODE_LENGTH = 6;

export function VerificationCodeInput({
  email,
  error,
  loading,
  onVerify,
  onBack,
}: VerificationCodeInputProps) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (text: string, index: number) => {
    const previouslyAllFilled =
      digits.length === CODE_LENGTH && digits.every((d) => d && /\d/.test(d));

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
      const allFilled =
        newDigits.length === CODE_LENGTH &&
        newDigits.every((d) => d && /\d/.test(d));
      if (!previouslyAllFilled && allFilled) {
        onVerify(newDigits.join(""));
      }
      return;
    }

    const cleaned = text.replace(/[^0-9]/g, "");
    const newDigits = [...digits];
    newDigits[index] = cleaned;
    setDigits(newDigits);

    if (cleaned && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    const allFilled =
      newDigits.length === CODE_LENGTH &&
      newDigits.every((d) => d && /\d/.test(d));
    if (!previouslyAllFilled && allFilled) {
      onVerify(newDigits.join(""));
    }
  };

  const handleKeyPress = (
    e: { nativeEvent: { key: string } },
    index: number
  ) => {
    if (e.nativeEvent.key === "Backspace" && !digits[index] && index > 0) {
      const newDigits = [...digits];
      newDigits[index - 1] = "";
      setDigits(newDigits);
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <View className="flex-1 px-6 justify-center">
      <Pressable onPress={onBack} disabled={loading} className="absolute top-16 left-6 flex-row items-center gap-2 z-10">
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
          Check your email
        </FlameText>
        <FlameText variant="subtitle1" className="text-white-50 text-center">
          We sent a 6-digit code to
        </FlameText>
        <FlameText variant="subtitle1" className="text-white-80 text-center">
          {email}
        </FlameText>
      </View>

      <View className="flex-row justify-center gap-1 mb-6">
        {digits.map((digit, index) => (
          <TextInput
            key={index}
            ref={(ref) => { inputRefs.current[index] = ref; }}
            className="w-[50px] h-[64px] px-2 py-3 bg-white-5 border border-white-20 rounded-card text-center text-white-100 font-poppins-semibold text-xl"
            value={digit}
            onChangeText={(text) => handleChange(text, index)}
            onKeyPress={(e) => handleKeyPress(e, index)}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            editable={!loading}
            selectTextOnFocus
          />
        ))}
      </View>

      {error ? (
        <View className="mb-4 bg-error/10 rounded-card px-4 py-3">
          <FlameText variant="subtitle2" className="text-error">
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
            label="Verify"
            variant="solid"
            onPress={() => onVerify(digits.join(""))}
            className="w-full"
          />
        )}
      </View>

      <FlameText variant="subtitle2-light" className="text-white-30 text-center">
        Didn&apos;t receive the code? Check your spam folder.
      </FlameText>
    </View>
  );
}
