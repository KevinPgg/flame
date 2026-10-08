import { Pressable } from "react-native";
import { useNavigation } from "expo-router";
// @ts-ignore: @react-navigation/native is a transitive dependency of expo-router
import { CommonActions } from "@react-navigation/native";
import { FlameText, colors } from "@project-flame/ui";
import { Feather } from "@expo/vector-icons";

export function SignInBackButton() {
  const navigation = useNavigation();
  
  return (
    <Pressable
      // Reset the stack to the home tab to break the sign-in back-loop:
      // useRequireAuth pushes sign-in over protected screens, so going back
      // would return to the protected screen which immediately re-pushes the modal.
      // CommonActions.reset tears down the stack and mounts (tabs) as the root,
      // bypassing Expo Router's replace bug for fullScreenModals in production.
      onPress={() => {
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: "(tabs)" }],
          })
        );
      }}
      className="absolute top-16 left-6 flex-row items-center gap-2 z-10"
    >
      <Feather name="arrow-left" size={24} color={colors["white-100"]} />
      <FlameText variant="subtitle1" className="text-white-100">
        Go Back
      </FlameText>
    </Pressable>
  );
}
