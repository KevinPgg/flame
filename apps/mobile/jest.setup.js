/* eslint-disable no-undef */
jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);
// Keep the Clerk-free fallback of useOptionalAuth in tests; screens mock what they need.
delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
delete process.env.EXPO_PUBLIC_ORGANIZER_V1;
delete process.env.EXPO_PUBLIC_ATTENDEE_V1;
