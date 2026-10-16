import { Platform } from "react-native";

/**
 * Tickets are scanned only on phones (decision 2026-10-16). Expo web (the browser build used to
 * iterate on UI) hides every scanner entry and the /scanner route sends you home, same as the
 * web app, which has no scanner at all.
 */
export const SCANNING_SUPPORTED = Platform.OS !== "web";
