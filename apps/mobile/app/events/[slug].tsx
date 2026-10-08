/**
 * Slug-based event route for deep links (e.g. flme.co/events/{slug}?promoter=CODE).
 *
 * Resolves slug → event ID via Supabase, then redirects to /event/{id}
 * with any promoter query param preserved.
 */

import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FlameText } from "@project-flame/ui";
import { supabase } from "../../lib/supabase";

export default function EventSlugScreen() {
  const { slug, promoter } = useLocalSearchParams<{
    slug: string;
    promoter?: string;
  }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setError("No event slug provided.");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data, error: queryError } = await supabase
          .from("events")
          .select("id")
          .eq("slug", slug)
          .single();

        if (cancelled) return;

        if (queryError || !data) {
          setError("Event not found.");
          return;
        }

        const params = promoter ? `?promoter=${encodeURIComponent(promoter)}` : "";
        router.replace(`/event/${data.id}${params}` as never);
      } catch {
        if (!cancelled) setError("Failed to resolve event.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, promoter, router]);

  if (error) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6 gap-4">
        <FlameText variant="h4" className="text-white-100 text-center">
          {error}
        </FlameText>
        <FlameText variant="subtitle1" className="text-white-50 text-center">
          The link may be invalid or the event may have been removed.
        </FlameText>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background items-center justify-center">
      <ActivityIndicator size="large" color="#FFFFFF" />
    </View>
  );
}
