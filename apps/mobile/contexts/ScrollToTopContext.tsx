/**
 * Context for communicating tab-press scroll-to-top events.
 *
 * The CustomTabBar calls `triggerScrollToTop()` when the user taps the
 * active Home tab. The Home screen registers its ScrollView ref so the
 * context can call `scrollTo({ y: 0, animated: true })`.
 */

import React, { createContext, useContext, useRef, useCallback } from "react";
import type { ScrollView } from "react-native";

type ScrollableRef = ScrollView | { scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void } | null;

interface ScrollToTopContextValue {
  registerScrollRef: (ref: ScrollableRef) => void;
  triggerScrollToTop: () => void;
}

const ScrollToTopCtx = createContext<ScrollToTopContextValue>({
  registerScrollRef: () => {},
  triggerScrollToTop: () => {},
});

export function ScrollToTopProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const scrollRef = useRef<ScrollableRef>(null);

  const registerScrollRef = useCallback((ref: ScrollableRef) => {
    scrollRef.current = ref;
  }, []);

  const triggerScrollToTop = useCallback(() => {
    const ref = scrollRef.current;
    if (!ref) return;
    if (typeof (ref as ScrollView).scrollTo === "function") {
      (ref as ScrollView).scrollTo({ y: 0, animated: true });
    } else if (typeof (ref as { scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void }).scrollToOffset === "function") {
      (ref as { scrollToOffset: (opts: { offset: number; animated?: boolean }) => void }).scrollToOffset({ offset: 0, animated: true });
    }
  }, []);

  return (
    <ScrollToTopCtx.Provider value={{ registerScrollRef, triggerScrollToTop }}>
      {children}
    </ScrollToTopCtx.Provider>
  );
}

export function useScrollToTop() {
  return useContext(ScrollToTopCtx);
}
