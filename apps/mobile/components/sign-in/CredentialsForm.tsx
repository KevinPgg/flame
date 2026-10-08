import { View, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { FlameText, PillButton, colors } from "@project-flame/ui";

interface CredentialsFormProps {
  mode: "sign-in" | "sign-up";
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  showPassword?: boolean;
  error?: string;
  loading?: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onFirstNameChange?: (v: string) => void;
  onLastNameChange?: (v: string) => void;
  onToggleShowPassword: () => void;
  onSubmit: () => void;
}

function ForgotPasswordLink() {
  const router = useRouter();
  return (
    // `as never` is a project-wide workaround for Expo Router's untyped
    // route strings. Same pattern used in CustomTabBar, useNotificationRegistration,
    // and NotificationsOverlay. TODO: adopt typed routes app-wide when Expo Router
    // typed routes are stable (see expo-router typed routes docs).
    <Pressable onPress={() => router.push("/forgot-password" as never)} className="self-end -mt-4 mb-4">
      <FlameText variant="subtitle2" className="text-white-50">
        Forgot password?
      </FlameText>
    </Pressable>
  );
}

export function CredentialsForm({
  mode,
  email,
  password,
  firstName = "",
  lastName = "",
  showPassword = false,
  error = "",
  loading = false,
  onEmailChange,
  onPasswordChange,
  onFirstNameChange = () => {},
  onLastNameChange = () => {},
  onToggleShowPassword,
  onSubmit,
}: CredentialsFormProps) {
  return (
    <>
      {mode === "sign-up" && (
        <View className="flex-row gap-3 mb-4">
          <View className="flex-1">
            <FlameText
              variant="subtitle2"
              className="text-white-70 mb-2 uppercase"
            >
              First Name
            </FlameText>
            <TextInput
              className="bg-white-5 border border-white-20 rounded-card px-4 py-3.5 text-white-100 font-poppins text-base"
              placeholder="First name"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={firstName}
              onChangeText={onFirstNameChange}
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="given-name"
              editable={!loading}
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
              className="bg-white-5 border border-white-20 rounded-card px-4 py-3.5 text-white-100 font-poppins text-base"
              placeholder="Last name"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={lastName}
              onChangeText={onLastNameChange}
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="family-name"
              editable={!loading}
            />
          </View>
        </View>
      )}

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
          onChangeText={onEmailChange}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          editable={!loading}
        />
      </View>

      <View className="mb-6">
        <FlameText
          variant="subtitle2"
          className="text-white-70 mb-2 uppercase"
        >
          Password
        </FlameText>
        <View className="relative">
          <TextInput
            className="bg-white-5 border border-white-20 rounded-card px-4 py-3.5 text-white-100 font-poppins text-base pr-12"
            placeholder={
              mode === "sign-up"
                ? "Create a password"
                : "Enter your password"
            }
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={password}
            onChangeText={onPasswordChange}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="password"
            editable={!loading}
            onSubmitEditing={onSubmit}
            returnKeyType="go"
          />
          <Pressable
            onPress={onToggleShowPassword}
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

      {mode === "sign-in" && <ForgotPasswordLink />}

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
            label={mode === "sign-in" ? "Sign In" : "Create Account"}
            variant="solid"
            onPress={onSubmit}
            className="w-full"
          />
        )}
      </View>
    </>
  );
}
