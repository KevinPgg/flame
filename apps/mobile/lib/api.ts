/**
 * Authenticated API client for calling the web app's API routes.
 *
 * Uses Clerk session tokens as Bearer auth. The web app's Clerk middleware
 * already handles Bearer token validation, so no backend changes are needed.
 */

const API_BASE = (
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000"
).replace(/\/+$/, "");

const DEFAULT_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 30_000;

/**
 * Token getter accepted by the authenticated helpers. Optionally takes Clerk's
 * `{ skipCache }` so the 401 retry path can force a fresh session token rather
 * than re-reading a cached one that just went stale (the resume/sign-out race —
 * see W8-M1). Callers that pass a zero-arg getter remain assignable; the extra
 * option is simply ignored by those closures.
 */
type GetTokenFn = (options?: { skipCache?: boolean }) => Promise<string | null>;

export class ApiError extends Error {
  status: number;
  code?: string;
  /** Structured error payload from the API body's `details` field. Used by
   *  callers that need more than a code (e.g. the tier force-reduce flow reads
   *  `details.{requested_quantity,quantity_sold,quantity_reserved}` from the
   *  PATCH /api/ticket-tiers QUANTITY_BELOW_RESERVED response). */
  details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Make an authenticated API call to the web backend.
 *
 * @param endpoint - The API path (e.g., "/api/holds/create")
 * @param options  - Fetch options + getToken from Clerk's useAuth()
 */
async function executeRequest(
  url: string,
  token: string | null,
  fetchOptions: RequestInit,
  customHeaders: Record<string, string> | undefined,
  endpoint: string,
  timeoutMs: number,
): Promise<{ response: Response; data: unknown }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    // When `token` is null we skip the Authorization header — used by
    // `apiPostPublic` for endpoints that accept their own credential (an event
    // access code on the public QR scanner flow). Bearer auth callers always
    // pass a non-null token via `apiClient`, which has its own null-token guard.
    const authHeaders: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};
    response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...customHeaders,
      },
    });
  } catch (networkError) {
    if (networkError instanceof Error && networkError.name === "AbortError") {
      throw new ApiError(
        0,
        `Request timed out for ${endpoint}. Check that EXPO_PUBLIC_API_URL (${API_BASE}) is reachable.`,
      );
    }
    if (__DEV__) {
      console.error(
        `[api] Network error: ${(fetchOptions.method as string) ?? "GET"} ${url}`,
        networkError instanceof Error ? networkError.message : networkError,
      );
    }
    throw new ApiError(
      0,
      `Network request failed for ${endpoint}. Is the web server running and reachable?`,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  let data: any = undefined;
  if (
    response.status !== 204 &&
    response.status !== 205 &&
    response.headers.get("content-length") !== "0" &&
    response.headers.get("content-type")?.includes("application/json")
  ) {
    data = await response.json().catch(() => null);
  }
  return { response, data };
}

export async function apiClient<T>(
  endpoint: string,
  options: Omit<RequestInit, "headers"> & {
    getToken: GetTokenFn;
    headers?: Record<string, string>;
    /** Calls that do slow work before answering (e.g. sending tickets by e-mail). Default 15 s. */
    timeoutMs?: number;
  },
): Promise<T> {
  const { getToken, headers: customHeaders, timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;

  let token: string | null;
  try {
    token = await getToken();
  } catch (error) {
    throw new ApiError(
      401,
      `Failed to get authentication token for ${endpoint}.`,
      "AUTH_ERROR",
    );
  }
  if (!token) {
    throw new ApiError(401, "Not authenticated. Please sign in.");
  }

  const url = `${API_BASE}${endpoint}`;

  let { response, data } = await executeRequest(
    url,
    token,
    fetchOptions,
    customHeaders,
    endpoint,
    timeoutMs,
  );

  if (response.status === 401) {
    let freshToken: string | null;
    try {
      // skipCache forces Clerk to mint a fresh token instead of returning the
      // cached one that just 401'd — covers the resume/sign-out race (W8-M1).
      freshToken = await getToken({ skipCache: true });
    } catch (error) {
      throw new ApiError(
        401,
        `Failed to refresh authentication token for ${endpoint}.`,
        "SESSION_EXPIRED",
      );
    }
    if (freshToken && freshToken !== token) {
      ({ response, data } = await executeRequest(
        url,
        freshToken,
        fetchOptions,
        customHeaders,
        endpoint,
        timeoutMs,
      ));
    }
    if (response.status === 401) {
      throw new ApiError(
        401,
        "Your session has expired. Please sign in again.",
        "SESSION_EXPIRED",
      );
    }
  }

  if (!response.ok) {
    const errorMessage =
      (data as Record<string, string> | null)?.error ??
      (data as Record<string, string> | null)?.message ??
      "Request failed";
    const errorCode = (data as Record<string, string> | null)?.code;
    const errorDetails = (data as Record<string, unknown> | null)?.details;
    throw new ApiError(response.status, errorMessage, errorCode, errorDetails);
  }

  if (data === null) {
    throw new ApiError(response.status, "Failed to parse response body");
  }

  return data as T;
}

/**
 * GET helper — convenience wrapper around apiClient.
 */
export function apiGet<T>(
  endpoint: string,
  getToken: () => Promise<string | null>,
): Promise<T> {
  return apiClient<T>(endpoint, {
    method: "GET",
    getToken,
  });
}

/**
 * POST helper — convenience wrapper around apiClient.
 */
export function apiPost<T>(
  endpoint: string,
  body: Record<string, unknown>,
  getToken: () => Promise<string | null>,
): Promise<T> {
  return apiClient<T>(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
    getToken,
  });
}

/**
 * POST without authentication — for endpoints that accept their own credential
 * (e.g. an access code) instead of a Clerk session token.
 *
 * Currently used by the public QR scanner flow accessible from the mobile
 * settings screen, where staff with an access code can scan tickets without
 * signing into Flame. The matching web endpoints (verify, checkin, and
 * validate-code) accept access-code authorization in lieu of a Bearer token.
 *
 * Delegates to `executeRequest` with `token = null` so it shares the same
 * timeout, content-type guard, and error-mapping behavior as authenticated
 * requests — future fixes to the request pipeline propagate here for free.
 */
export async function apiPostPublic<T>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const { response, data } = await executeRequest(
    url,
    null,
    { method: "POST", body: JSON.stringify(body) },
    undefined,
    endpoint,
    DEFAULT_TIMEOUT_MS,
  );

  if (!response.ok) {
    const errorMessage =
      (data as Record<string, string> | null)?.error ??
      (data as Record<string, string> | null)?.message ??
      "Request failed";
    const errorCode = (data as Record<string, string> | null)?.code;
    const errorDetails = (data as Record<string, unknown> | null)?.details;
    throw new ApiError(response.status, errorMessage, errorCode, errorDetails);
  }

  // Match `apiClient`'s contract: only `null` indicates an actual JSON parse
  // failure (`.json().catch(() => null)` in executeRequest). `undefined` is the
  // legitimate result for 204/205, `content-length: 0`, or non-JSON responses
  // — those should pass through as `T` (e.g. `void` callers) instead of being
  // converted into spurious errors.
  if (data === null) {
    throw new ApiError(response.status, "Failed to parse response body");
  }

  return data as T;
}

/**
 * Unauthenticated GET (same pipeline as apiPostPublic). Used for the promoter-code check
 * (B10, fase 3.1): `/api/promoter-validate` is public and a promoter link can be opened before
 * signing in.
 */
export async function apiGetPublic<T>(endpoint: string): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const { response, data } = await executeRequest(url, null, { method: "GET" }, undefined, endpoint, DEFAULT_TIMEOUT_MS);
  if (!response.ok) {
    const body = data as Record<string, string> | null;
    throw new ApiError(response.status, body?.error ?? body?.message ?? "Request failed", body?.code);
  }
  if (data === null) throw new ApiError(response.status, "Failed to parse response body");
  return data as T;
}

/**
 * PATCH helper — convenience wrapper around apiClient.
 */
export function apiPatch<T>(
  endpoint: string,
  body: Record<string, unknown>,
  getToken: () => Promise<string | null>,
): Promise<T> {
  return apiClient<T>(endpoint, {
    method: "PATCH",
    body: JSON.stringify(body),
    getToken,
  });
}

/**
 * DELETE helper — convenience wrapper around apiClient.
 */
export function apiDelete<T>(
  endpoint: string,
  getToken: () => Promise<string | null>,
): Promise<T> {
  return apiClient<T>(endpoint, {
    method: "DELETE",
    getToken,
  });
}

/**
 * POST FormData (e.g. file upload). Omits Content-Type so fetch sets multipart boundary.
 */
async function executeUpload(
  url: string,
  token: string,
  formData: FormData,
  endpoint: string,
): Promise<{ response: Response; data: unknown }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
  } catch (networkError) {
    if (networkError instanceof Error && networkError.name === "AbortError") {
      throw new ApiError(
        0,
        `Upload timed out for ${endpoint}. Check that EXPO_PUBLIC_API_URL (${API_BASE}) is reachable.`,
      );
    }
    if (__DEV__) {
      console.error(
        `[api] Upload network error: POST ${url}`,
        networkError instanceof Error ? networkError.message : networkError,
      );
    }
    throw new ApiError(
      0,
      `Network request failed for ${endpoint}. Is the web server running and reachable?`,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  let data: any = undefined;
  if (
    response.status !== 204 &&
    response.status !== 205 &&
    response.headers.get("content-length") !== "0" &&
    response.headers.get("content-type")?.includes("application/json")
  ) {
    data = await response.json().catch(() => null);
  }
  return { response, data };
}

export async function apiUploadFormData<T>(
  endpoint: string,
  formData: FormData,
  getToken: GetTokenFn,
): Promise<T> {
  let token: string | null;
  try {
    token = await getToken();
  } catch {
    throw new ApiError(
      401,
      `Failed to get authentication token for ${endpoint}.`,
      "AUTH_ERROR",
    );
  }
  if (!token) {
    throw new ApiError(401, "Not authenticated. Please sign in.");
  }

  const url = `${API_BASE}${endpoint}`;

  let { response, data } = await executeUpload(url, token, formData, endpoint);

  if (response.status === 401) {
    let freshToken: string | null;
    try {
      // skipCache forces a fresh token rather than the cached one that 401'd —
      // covers the resume/sign-out race (W8-M1).
      freshToken = await getToken({ skipCache: true });
    } catch {
      throw new ApiError(
        401,
        `Failed to refresh authentication token for ${endpoint}.`,
        "SESSION_EXPIRED",
      );
    }
    if (freshToken && freshToken !== token) {
      ({ response, data } = await executeUpload(
        url,
        freshToken,
        formData,
        endpoint,
      ));
    }
    if (response.status === 401) {
      throw new ApiError(
        401,
        "Your session has expired. Please sign in again.",
        "SESSION_EXPIRED",
      );
    }
  }

  if (!response.ok) {
    const errorMessage =
      (data as Record<string, string> | null)?.error ??
      (data as Record<string, string> | null)?.message ??
      "Upload failed";
    throw new ApiError(response.status, errorMessage);
  }

  // undefined is valid for 2xx no-content responses (204/205 or no JSON body);
  // null means JSON parsing failed for a response that claimed JSON content.
  if (data === null) {
    throw new ApiError(response.status, "Empty or unparseable response body");
  }

  return data as T;
}
