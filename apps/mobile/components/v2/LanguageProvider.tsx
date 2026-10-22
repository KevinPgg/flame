/**
 * Flame 2.0 language for the app (decision D4): read from users.language through the web API
 * (GET /api/me/language) once signed in, saved with PUT. English when signed out or on any error.
 * Only v2 screens translate; v1 screens ignore it.
 */
import { useCallback, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Language } from "@project-flame/lib";
import { I18nProvider } from "../../lib/i18n";
import { apiClient, apiGet } from "../../lib/api";
import { useOptionalAuth } from "../../hooks/useOptionalAuth";

export const LANGUAGE_QUERY_KEY = ["me-language"] as const;

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, getToken } = useOptionalAuth();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: LANGUAGE_QUERY_KEY,
    queryFn: () => apiGet<{ language: string }>("/api/me/language", getToken),
    enabled: !!isSignedIn,
    staleTime: Infinity,
    retry: 1,
  });

  const save = useCallback(
    (language: Language) => {
      queryClient.setQueryData(LANGUAGE_QUERY_KEY, { language });
      apiClient("/api/me/language", { method: "PUT", body: JSON.stringify({ language }), getToken }).catch((err) =>
        console.warn("[i18n] Failed to save language:", err),
      );
    },
    [getToken, queryClient],
  );

  return (
    <I18nProvider initialLanguage={isSignedIn ? data?.language : undefined} onLanguageChange={save}>
      {children}
    </I18nProvider>
  );
}
