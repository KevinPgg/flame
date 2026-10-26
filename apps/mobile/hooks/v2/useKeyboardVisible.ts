import { useCallback, useEffect, useRef, useState } from "react";
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

/**
 * Height of the on-screen keyboard (0 when closed). Needed on Android for sheets inside a
 * `Modal`: with edge-to-edge (Expo SDK 54) the modal window isn't resized and
 * `KeyboardAvoidingView` doesn't move it, so the co-hosts sheet stayed under the keyboard
 * (Kevin, 2026-10-23). The sheet lifts itself by this height instead.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e) => setHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/**
 * How much a full-screen view must lift its bottom (Android) so it isn't under the keyboard:
 * the keyboard height minus whatever the window already shrank (some devices still resize it).
 * Put `onLayout` on the view's root; apply `lift` as bottom padding/margin. iOS → 0 (use
 * KeyboardAvoidingView there).
 */
/** Breathing room between the focused field and the keyboard (Kevin, 10-26: "unos 5px"). */
export const KEYBOARD_GAP = 8;

export function useKeyboardLift(): { lift: number; onLayout: (e: { nativeEvent: { layout: { height: number } } }) => void } {
  const keyboard = useKeyboardHeight();
  const fullHeight = useRef(0);
  const [height, setHeight] = useState(0);
  const shrunk = fullHeight.current > 0 && height > 0 ? Math.max(0, fullHeight.current - height) : 0;
  const lift = Platform.OS === "android" && keyboard > 0 ? Math.max(0, keyboard - shrunk) + KEYBOARD_GAP : 0;
  const onLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
    const h = e.nativeEvent.layout.height;
    fullHeight.current = Math.max(fullHeight.current, h);
    setHeight(h);
  }, []);
  return { lift, onLayout };
}
