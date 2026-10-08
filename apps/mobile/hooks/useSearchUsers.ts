/**
 * Search users by email hook.
 *
 * Ported from: apps/web/app/api/organizer/search-users/route.ts
 * Uses web API via lib/api.ts (read needing org membership verification).
 */

import { useState, useCallback } from "react";
import { apiGet, ApiError } from "../lib/api";
import { useOptionalAuth } from "./useOptionalAuth";

export interface SearchUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

interface SearchUsersResponse {
  users: SearchUser[];
}

export function useSearchUsers() {
  const { getToken } = useOptionalAuth();
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const searchByEmail = useCallback(async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setSearchError("Please enter a valid email address");
      return;
    }

    try {
      setSearching(true);
      setSearchError(null);
      const data = await apiGet<SearchUsersResponse>(
        `/api/organizer/search-users?email=${encodeURIComponent(trimmed)}`,
        getToken
      );
      setUsers(data.users);
      if (data.users.length === 0) {
        setSearchError("No user found with that email");
      }
    } catch (err) {
      console.error("[useSearchUsers] search failed:", err);
      setSearchError(
        err instanceof ApiError ? err.message : "Search failed. Please try again."
      );
      setUsers([]);
    } finally {
      setSearching(false);
    }
  }, [getToken]);

  const clearResults = useCallback(() => {
    setUsers([]);
    setSearchError(null);
  }, []);

  return { users, searching, searchError, searchByEmail, clearResults };
}
