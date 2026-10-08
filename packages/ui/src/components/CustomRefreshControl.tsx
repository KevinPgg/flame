/**
 * RefreshControl with a visible white spinner on dark backgrounds.
 *
 * Workaround for RN 0.81+ iOS bug: tintColor is ignored at mount (New Architecture).
 * See https://github.com/facebook/react-native/issues/53987
 *
 * Strategy: start with "transparent" so the 500ms change to #FFFFFF is a genuine
 * UIColor transition. Starting with "white" fails because React Native normalises both
 * "white" and "#FFFFFF" to the same 32-bit int (0xFFFFFFFF), so the bridge skips the
 * native update and the spinner stays dark.
 */
import { useEffect, useState } from "react";
import {
  Platform,
  RefreshControl,
  type RefreshControlProps,
} from "react-native";

const WHITE = "#FFFFFF";

type Props = Omit<
  RefreshControlProps,
  "tintColor" | "colors" | "progressBackgroundColor"
>;

export function CustomRefreshControl(props: Props) {
  // RN #53987: tintColor is ignored at mount on iOS (New Architecture).
  // Start with "transparent" so the 500ms change to #FFFFFF is a genuine
  // UIColor transition — if both values normalise to the same 32-bit int
  // (e.g. "white" → #FFFFFF → 0xFFFFFFFF) the bridge skips the update.
  const [tintColor, setTintColor] = useState<string>(
    Platform.OS === "ios" ? "transparent" : WHITE
  );

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const id = setTimeout(() => setTintColor(WHITE), 500);
    return () => clearTimeout(id);
  }, []);

  return (
    <RefreshControl
      {...props}
      tintColor={tintColor}
      colors={[WHITE]}
      progressBackgroundColor={Platform.OS === "android" ? "#08131A" : undefined}
    />
  );
}
