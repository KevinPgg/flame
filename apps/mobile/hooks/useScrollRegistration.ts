import { useRef, useCallback, useEffect } from "react";
import { useFocusEffect } from "expo-router";
import type { ScrollView } from "react-native";

/** ScrollView or FlatList (has scrollToOffset) — both support scroll-to-top. */
type ScrollableRef = ScrollView | { scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void } | null;

interface UseScrollRegistrationOptions {
  registerScrollRef: (ref: ScrollableRef) => void;
  isLoading: boolean;
  isError: boolean;
  hasData: boolean;
}

export function useScrollRegistration({
  registerScrollRef,
  isLoading,
  isError,
  hasData,
}: UseScrollRegistrationOptions) {
  const scrollRef = useRef<ScrollableRef>(null);

  const setScrollRef = useCallback(
    (node: ScrollableRef) => {
      scrollRef.current = node;
      registerScrollRef(node);
    },
    [registerScrollRef],
  );

  useFocusEffect(
    useCallback(() => {
      registerScrollRef(scrollRef.current);
      return () => registerScrollRef(null);
    }, [registerScrollRef]),
  );

  useEffect(() => {
    if ((isLoading && !hasData) || (isError && !hasData)) {
      registerScrollRef(null);
    }
  }, [isLoading, isError, hasData, registerScrollRef]);

  return { scrollRef: setScrollRef };
}
