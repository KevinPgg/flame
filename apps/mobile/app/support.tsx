import { View, ScrollView, Pressable, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlameText, colors } from "@project-flame/ui";
import { getTabBarPaddingBottom } from "../components/navigation/CustomTabBar";
import { DashboardBar } from "../components/dashboard/DashboardBar";

const BASE_URL = "https://flme.co";

interface SupportLink {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  url: string;
}

const FAN_SUPPORT_LINKS: SupportLink[] = [
  {
    id: "faqs",
    label: "FAQs",
    icon: "help-circle-outline",
    url: `${BASE_URL}/faqs`,
  },
  {
    id: "contact",
    label: "Contact Us",
    icon: "mail-outline",
    url: `${BASE_URL}/contact`,
  },
];

function SupportRow({
  item,
  isLast,
}: {
  item: SupportLink;
  isLast?: boolean;
}) {
  const handlePress = async () => {
    try {
      await WebBrowser.openBrowserAsync(item.url);
    } catch (err) {
      console.error("[Support] openBrowserAsync failed", { url: item.url, error: err });
      Alert.alert("Link Failed", "Unable to open the link. Please try again.");
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      className={`flex-row items-center py-[14px] px-4 ${!isLast ? "border-b border-white-10" : ""}`}
    >
      <Ionicons
        name={item.icon}
        size={22}
        color={colors["white-80"]}
        style={{ marginRight: 14 }}
      />
      <FlameText variant="body" className="text-white-100 flex-1">
        {item.label}
      </FlameText>
      <Ionicons
        name="open-outline"
        size={16}
        color={colors["white-50"]}
      />
    </Pressable>
  );
}

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View className="flex-1 bg-background">
      <DashboardBar title="Support" onBack={() => router.back()} />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: getTabBarPaddingBottom(insets.bottom),
        }}
      >
        {/* Fan Support section */}
        <View className="mt-4 mx-4">
        <FlameText
          variant="subtitle2"
          className="text-white-50 uppercase mb-2 px-1"
        >
          Fan Support
        </FlameText>
        <View className="rounded-card bg-white-5 overflow-hidden">
          {FAN_SUPPORT_LINKS.map((item, i) => (
            <SupportRow
              key={item.id}
              item={item}
              isLast={i === FAN_SUPPORT_LINKS.length - 1}
            />
          ))}
        </View>
        </View>

        {/* Contact info */}
        <View className="mt-6 mx-4 px-1 gap-2">
        <FlameText
          variant="subtitle2"
          className="text-white-50 uppercase mb-1"
        >
          Contact Information
        </FlameText>
        <View className="flex-row items-center gap-2">
          <Ionicons
            name="call-outline"
            size={16}
            color={colors["white-50"]}
          />
          <FlameText variant="subtitle1" className="text-white-80">
            +593 (04) 2510 9060
          </FlameText>
        </View>
        <View className="flex-row items-center gap-2">
          <Ionicons
            name="mail-outline"
            size={16}
            color={colors["white-50"]}
          />
          <FlameText variant="subtitle1" className="text-white-80">
            support@flme.co
          </FlameText>
        </View>
        </View>
      </ScrollView>
    </View>
  );
}
