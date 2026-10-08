// Allowed metadata keys that are safe to store (non-PII)
// Used in webhook processing and testing
export const SAFE_METADATA_KEYS = [
  'holdId',
  'rsvpId',
  'eventId',
  'organizationId',
  'userId',
  'basePriceCents',
  'platformFeeCents',
  'markupPercent',
  'markupFixedCents',
  'feePercent',
  'ticketTierId',
  'quantity',
  'promoter_code',
  'stageId',
  'promotionalCodeId',
];

// Redact sensitive PII from metadata
export function redactMetadata(
  metadata: Record<string, any> | null | undefined = {}
): Record<string, string> {
  const safeMetadata: Record<string, string> = {};
  if (!metadata) return safeMetadata;
  for (const key of SAFE_METADATA_KEYS) {
    if (metadata[key] !== undefined) {
      safeMetadata[key] = String(metadata[key]);
    }
  }
  return safeMetadata;
}
