import { Tabs } from "expo-router";

/**
 * Tab screens layout. The built-in tab bar is hidden because we render a
 * custom persistent CustomTabBar in the root _layout.tsx instead.
 * All tab screen files still live here for Expo Router's file-based routing.
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="create-event" />
      <Tabs.Screen name="events-management" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
