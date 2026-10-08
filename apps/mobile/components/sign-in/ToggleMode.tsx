import { Pressable } from "react-native";
import { FlameText } from "@project-flame/ui";

interface ToggleModeProps {
  mode: "sign-in" | "sign-up";
  onToggle: () => void;
}

export function ToggleMode({ mode, onToggle }: ToggleModeProps) {
  return (
    <Pressable onPress={onToggle} className="items-center">
      <FlameText variant="subtitle1" className="text-white-50">
        {mode === "sign-in" ? (
          <>
            Don&apos;t have an account?{" "}
            <FlameText variant="subtitle1" className="text-white-100">
              Sign Up
            </FlameText>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <FlameText variant="subtitle1" className="text-white-100">
              Sign In
            </FlameText>
          </>
        )}
      </FlameText>
    </Pressable>
  );
}
