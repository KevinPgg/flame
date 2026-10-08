// @ts-ignore: @react-navigation/native is a transitive dependency of expo-router
import { CommonActions, type NavigationAction } from "@react-navigation/native";

/**
 * Resets the navigation stack to the tabs root after sign-in.
 *
 * Always uses CommonActions.reset — never router.back() or router.replace().
 * Expo Router's canGoBack() is unreliable inside fullScreenModal stacks:
 * it returns true but the GO_BACK action is not handled by any navigator,
 * causing silent navigation failure in production and "GO_BACK not handled"
 * errors in dev. CommonActions.reset bypasses Expo Router entirely and tells
 * React Navigation to tear down the stack and mount (tabs) as the root.
 */
export function navigateToTabs(navigation: { dispatch: (action: NavigationAction) => void }): void {
  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: "(tabs)" }],
    })
  );
}
