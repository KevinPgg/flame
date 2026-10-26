/**
 * Flame 2.0 language for the app (decision D4): read from users.language through the web API
 * (GET /api/me/language) once per app start after sign-in, saved with PUT. English when signed
 * out or on any error (logged as `[i18n] Failed to read the saved language`).
 * Only v2 screens translate; v1 screens ignore it.
 */
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Language } from "@project-flame/lib";
import { I18nProvider } from "../../lib/i18n";
import { apiClient, apiGet } from "../../lib/api";
import { useOptionalAuth } from "../../hooks/useOptionalAuth";

export const LANGUAGE_QUERY_KEY = ["me-language"] as const;

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  // Read once per app start (Kevin, 10-23): a change made on the web shows after reopening the app.
  const { data, error } = useQuery({
    queryKey: LANGUAGE_QUERY_KEY,
    queryFn: () => apiGet<{ language: string }>("/api/me/language", getToken),
    enabled: !!isSignedIn,
    staleTime: Infinity,
    retry: 1,
  });

  useEffect(() => {
    if (error) console.warn("[i18n] Failed to read the saved language (showing English):", error);
  }, [error]);

  // Stable callback: Clerk's getToken may change identity; keep the latest in a ref.
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const save = useCallback(
    (language: Language) => {
      queryClient.setQueryData(LANGUAGE_QUERY_KEY, { language });
      apiClient("/api/me/language", { method: "PUT", body: JSON.stringify({ language }), getToken: (o) => tokenRef.current(o) }).catch((err) =>
        console.warn("[i18n] Failed to save language:", err),
      );
    },
    [queryClient],
  );

  return (
    <I18nProvider initialLanguage={isSignedIn ? data?.language : undefined} onLanguageChange={save}>
      {children}
    </I18nProvider>
  );
}
