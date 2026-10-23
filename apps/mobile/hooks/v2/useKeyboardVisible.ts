import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * True while the on-screen keyboard is open. Android resizes the window (adjustResize), so the
 * floating bottom bar rides up over the fields and their buttons; the organizer shell hides it
 * while typing (Kevin, 2026-10-23: "se tapan las opciones con el teclado").
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setVisible(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}
