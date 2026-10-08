import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  Text,
} from "react-native";

/**
 * ID for the Done bar above the keyboard. Use this with TextInput's inputAccessoryViewID
 * for numeric/keyboard inputs that don't have a built-in Done (e.g. number-pad on iOS).
 */
export const NUMERIC_KEYBOARD_DONE_ID = "numericKeyboardDone";

export function KeyboardDoneBar() {
  if (Platform.OS !== "ios") return null;

  return (
    <InputAccessoryView nativeID={NUMERIC_KEYBOARD_DONE_ID}>
      <Pressable
        onPress={() => Keyboard.dismiss()}
        className="bg-surface flex-row justify-end px-4 py-3 border-t border-white-20"
      >
        <Text className="text-white-100 text-base font-poppins-semibold">Done</Text>
      </Pressable>
    </InputAccessoryView>
  );
}
