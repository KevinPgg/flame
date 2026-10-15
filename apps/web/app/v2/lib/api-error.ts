/**
 * Message to show after a failed API call: the server's own message for 4xx (it explains what
 * to fix, e.g. "code already exists"), the translated generic message for 5xx / network errors.
 */
export async function apiErrorMessage(res: Response, generic: string): Promise<string> {
  if (res.status >= 500) return generic;
  const json = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof json?.error === "string" && json.error.trim() ? json.error : generic;
}
