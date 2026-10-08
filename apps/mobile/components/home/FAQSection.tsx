import { View, Pressable, Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { FlameText, type FAQData } from "@project-flame/ui";
import { AnimatedFAQItem } from "./AnimatedFAQItem";

export interface FAQSectionProps {
  items: FAQData[];
}

const FAQS_URL = "https://flme.co/faqs";

export function FAQSection({ items }: FAQSectionProps) {
  const handleViewAll = async () => {
    try {
      await WebBrowser.openBrowserAsync(FAQS_URL);
    } catch (err) {
      console.error("[FAQSection] Failed to open FAQs URL", { url: FAQS_URL, err });
      Alert.alert("Cannot Open Link", "Unable to open the FAQs page. Please try again.");
    }
  };

  return (
    <View className="px-4 gap-6">
      <View className="gap-4">
        <FlameText variant="h3" className="text-white-100">
          FAQs
        </FlameText>
        <FlameText variant="body" className="text-white-100">
          Do you have any other questions?
        </FlameText>
      </View>

      <View className="gap-2">
        {items.map((faq) => (
          <AnimatedFAQItem key={faq.id} item={faq} />
        ))}
      </View>

      <Pressable onPress={handleViewAll} className="self-center">
        <FlameText
          variant="subtitle1"
          className="text-white-100 underline font-poppins-medium"
        >
          View all FAQs
        </FlameText>
      </Pressable>
    </View>
  );
}
