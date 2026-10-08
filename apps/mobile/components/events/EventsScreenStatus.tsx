import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { FlameText, PillButton, colors } from "@project-flame/ui";

interface EventsScreenStatusProps {
  isError: boolean;
  error: Error | null;
  isLoading: boolean;
  hasData: boolean;
  onRetry: () => void;
}

/**
 * Handles loading and error states for the Events screen.
 * Only shows error UI when isError AND no cached data (so background refetch
 * failures don't replace valid content).
 */
export function EventsScreenStatus({
  isError,
  error,
  isLoading,
  hasData,
  onRetry,
}: EventsScreenStatusProps) {
  useEffect(() => {
    if (isError && !hasData) {
      console.error("[EventsScreen] fetchEvents error", {
        action: "fetchEvents",
        error,
      });
    }
  }, [isError, hasData, error]);

  if (isError && !hasData) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-4">
        <FlameText variant="h4" className="text-white-100 text-center mb-2">
          Unable to load events
        </FlameText>
        <FlameText
          variant="subtitle1"
          className="text-white-70 text-center mb-4"
        >
          {error?.message ?? "Something went wrong. Please try again."}
        </FlameText>
        <PillButton label="Retry" variant="solid" onPress={onRetry} />
      </View>
    );
  }

  if (isLoading && !hasData) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return null;
}
