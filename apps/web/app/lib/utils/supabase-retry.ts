/**
 * Checks if an error is related to network/fetch failures.
 * Handles both returned error objects and thrown exceptions.
 * Uses case-insensitive matching for broader error coverage.
 *
 * @param err - The error object to check
 * @returns true if the error is fetch/network related
 */
function isFetchRelatedError(err: any): boolean {
  const message = (err?.message || "").toLowerCase();
  const details = (err?.details || "").toLowerCase();
  const causeMessage = (err?.cause?.message || "").toLowerCase();

  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("connection") ||
    details.includes("fetch failed") ||
    details.includes("network") ||
    causeMessage.includes("fetch failed")
  );
}

/**
 * Retries a Supabase operation if it fails with a fetch error.
 *
 * @param operation - A function that returns a Supabase promise (like .select(), .rpc(), etc.)
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param initialDelayMs - Initial delay in milliseconds (default: 500)
 * @returns The result of the operation
 */
export async function retrySupabaseOperation<T>(
  operation: () => Promise<{ data: T | null; error: any }>,
  maxRetries = 3,
  initialDelayMs = 500
): Promise<{ data: T | null; error: any }> {
  let lastError: any;
  let delayMs = initialDelayMs;

  // Perform maxRetries + 1 total attempts
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      const { error } = result;

      // If success or error is not a fetch failure, return immediately
      if (!error) {
        return result;
      }

      // Check if it's a fetch failure (network issue)
      if (!isFetchRelatedError(error)) {
        return result;
      }

      lastError = error;

      // If this was the last attempt, break
      if (attempt === maxRetries) break;

      // Log retry
      console.warn(
        `[Supabase Retry] Fetch failed (attempt ${attempt + 1}/${
          maxRetries + 1
        }). Retrying in ${delayMs}ms...`
      );

      // Wait with exponential backoff + jitter to prevent thundering herd
      const jitter = Math.random() * delayMs * 0.3; // 0-30% jitter
      await new Promise(resolve => setTimeout(resolve, delayMs + jitter));
      delayMs *= 2;
    } catch (err: any) {
      // Catch unexpected exceptions (like network crash throwing directly)
      // Note: Unlike result errors which are returned, thrown exceptions are
      // re-thrown for non-fetch errors to preserve stack traces
      lastError = err;

      if (!isFetchRelatedError(err) || attempt === maxRetries) {
        throw err;
      }

      console.warn(
        `[Supabase Retry] Exception caught (attempt ${attempt + 1}/${
          maxRetries + 1
        }): ${err.message}. Retrying...`
      );

      // Wait with exponential backoff + jitter to prevent thundering herd
      const jitter = Math.random() * delayMs * 0.3; // 0-30% jitter
      await new Promise(resolve => setTimeout(resolve, delayMs + jitter));
      delayMs *= 2;
    }
  }

  // If we exhausted retries, return the last error result (mimicking Supabase response)
  return { data: null, error: lastError };
}
