/**
 * @project-flame/lib
 *
 * Shared business logic, types, and utilities for Project Flame.
 * This package is used by both the web (Next.js) and mobile (Expo) applications.
 */

// ============================================================================
// TYPES
// ============================================================================
export type {
  Event,
  TicketStage,
  TicketTier,
  TicketTierWithStage,
  TicketTierAvailability,
  QRCodeData,
  QRCodeValidationResult,
  RSVPStatus,
  TicketStatus,
  UserTicket,
  UserTicketsResponse,
  UserProfile,
  OrganizationPublic,
  OrgMemberRole,
  OrganizationMember,
  EventAssignment,
  NotificationType,
  FormField,
  FormFieldType,
} from "./types";

export { validateQRCodeFormat, EventSchema, NON_DISMISSABLE_NOTIFICATION_TYPES } from "./types";

// ============================================================================
// EVENT LIMITS (organizer / ticketing)
// ============================================================================
export { MAX_TICKET_TIERS_PER_EVENT, TIER_DESCRIPTION_MAX_LENGTH } from "./constants/event-limits";

// ============================================================================
// PRICING
// ============================================================================
export {
  // Constants
  FLAME_MARKUP_PERCENT,
  ECUADOR_IVA_RATE,
  MARKUP_HISTORY,
  STRIPE_CONNECT_MIGRATION_DATE,
  DEFAULT_PLATFORM_FEE_PERCENT,
  DEFAULT_FIXED_FEE_CENTS,
  DEFAULT_FIXED_FEE_BY_CURRENCY,
  // Functions
  getDefaultFixedFeeCents,
  calculateFinalPrice,
  extractBasePrice,
  extractBasePriceHistorical,
  formatPrice,
  isFreePrice,
  getBasePriceFromTicket,
  getOrderDisplayCents,
  calculateFeeBreakdownFromTotal,
  calculateOrganizerBasePrice,
} from "./pricing";

export type { PriceBreakdown } from "./pricing";

// ============================================================================
// STRIPE
// ============================================================================
export {
  // Constants
  CANCELLABLE_PAYMENT_INTENT_STATUSES,
  isCancellableStatus,
  // Fee Calculations
  calculateFee,
  calculateUnitPrice,
  // Connect onboarding countries / service agreement
  STRIPE_CONNECT_COUNTRIES,
  DEFAULT_CONNECT_COUNTRY,
  isSupportedConnectCountry,
  getConnectCountryDefaultCurrency,
} from "./stripe";

export type {
  CancellablePaymentIntentStatus,
  FeeCalculation,
  MarkupSettings,
  StripeConnectCountry,
} from "./stripe";

// ============================================================================
// VALIDATORS
// ============================================================================
export {
  sanitizeAccessCodeInput,
  validateAccessCode,
  normalizeTicketTierSecretCode,
  normalizeOptionalTicketTierSecretCode,
  validateCedula,
  formatCedula,
  cleanCedula,
  validateAndParseQuantity,
} from "./validators";

export type {
  AccessCodeValidationResult,
  CedulaValidationResult,
  QuantityValidationResult,
} from "./validators";

// ============================================================================
// UTILS
// ============================================================================
export {
  // Format
  DEFAULT_DISPLAY_TIMEZONE,
  formatCurrency,
  formatCentsAsCurrency,
  formatCentsAsPrice,
  formatEventDate,
  formatEventTime,
  buildTimeRange,
  formatDay,
  formatMonth,
  getTimezoneAbbr,
  isValidIanaTimezone,
  // Currency
  ZERO_DECIMAL_CURRENCIES,
  SUPPORTED_CURRENCIES,
  STRIPE_MINIMUM_CENTS,
  centsToAmount,
  validateMinimumAmount,
  // Timezone
  utcToEcuadorLocal,
  ecuadorLocalToUtc,
  getEcuadorNow,
  formatEcuadorDate,
  localToUtc,
  utcToLocal,
  getNowInTimezone,
  SUPPORTED_TIMEZONES,
  // Availability
  isTierAvailable,
  hasNotStartedTiers,
  findFirstAvailableStage,
  enrichTicketStagesWithWaterfall,
  getLowestPrice,
  // Event filtering
  isEventActive,
  filterActiveEvents,
  filterPastEvents,
  separateEventsByDate,
  filterEventsByCity,
  filterEventsByOrganizer,
  extractUniqueCities,
  extractUniqueOrganizers,
  DEFAULT_CATALOG_CITY,
  // Slug
  generateSlug,
  // RSVP / purchase export sheet rows (no xlsx)
  buildPendingRsvpExportAoa,
  buildPurchaseExportAoa,
  formatRegistrationValueForExport,
  normalizeRegistrationExportColumns,
  purchaseExportColumnWidths,
  registrationValuesForExportColumns,
  // Permissions
  canManageMembers,
  canCreateEvents,
  canViewAllEvents,
  canManageAssignedEvents,
  canAccessOrgSettings,
  canManagePayouts,
  canManageAccessCodes,
  // Internal content gating
  INTERNAL_ORG_IDS,
  // Registration form (per-tier field filtering)
  isFieldVisibleForTier,
  filterFieldsForTier,
  getActiveEventFormFields,
} from "./utils";

export type {
  PendingRsvpExportSheetRow,
  PurchaseExportSheetRow,
  RegistrationExportColumn,
} from "./utils";

export type { ActiveEvent, OrgFilterableEvent } from "./utils";

export type { EnrichedStage } from "./utils";

// ============================================================================
// CONTENT
// ============================================================================
export { faqs } from "./content/faqs";
export type { FAQItem } from "./content/faqs";

// ============================================================================
// DESIGN TOKENS (raw CSS strings — mirror packages/ui/tailwind.config.js)
// ============================================================================
export { flameColors, flameColorWhite } from "./design-tokens/flame-colors";
export { flameRadii } from "./design-tokens/flame-layout";
export {
  flameV2Colors,
  flameV2Fonts,
  flameV2FontWeights,
  flameV2FontSizes,
  flameV2Tracking,
  flameV2Radii,
  flameV2Layout,
} from "./design-tokens/flame-v2";
export type { FlameV2Color } from "./design-tokens/flame-v2";

// ============================================================================
// I18N (en default, es) — see src/i18n/index.ts
// ============================================================================
export {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LOCALE_BY_LANGUAGE,
  MESSAGES,
  isLanguage,
  resolveLanguage,
  translate,
  createTranslator,
} from "./i18n";
export type {
  Language,
  Messages,
  PluralMessage,
  TranslationKey,
  TranslationParams,
  Translator,
} from "./i18n";

// ============================================================================
// SUPABASE
// ============================================================================
export {
  createSupabaseClient,
  createSupabaseAdmin,
  isSupabaseConfigured,
  isSupabaseAdminConfigured,
} from "./supabase";

export type {
  SupabaseClient,
  SupabaseClientConfig,
  SupabaseAdminConfig,
} from "./supabase";
