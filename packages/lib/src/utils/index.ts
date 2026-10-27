/**
 * Utils Module Exports
 */

// Format utilities
export {
  DEFAULT_DISPLAY_TIMEZONE,
  formatCurrency,
  formatCentsAsCurrency,
  formatPrice,
  formatCentsAsPrice,
  formatEventDate,
  formatEventTime,
  buildTimeRange,
  formatDay,
  formatMonth,
  getTimezoneAbbr,
  isValidIanaTimezone,
  ZERO_DECIMAL_CURRENCIES,
  SUPPORTED_CURRENCIES,
  STRIPE_MINIMUM_CENTS,
  centsToAmount,
  validateMinimumAmount,
} from "./format";

// Timezone utilities
export {
  utcToEcuadorLocal,
  ecuadorLocalToUtc,
  getEcuadorNow,
  formatEcuadorDate,
  localToUtc,
  utcToLocal,
  getNowInTimezone,
  SUPPORTED_TIMEZONES,
} from "./timezone";

// Availability utilities
export type { EnrichedStage } from "./availability";
export {
  isTierAvailable,
  hasNotStartedTiers,
  findFirstAvailableStage,
  enrichTicketStagesWithWaterfall,
  getLowestPrice,
} from "./availability";

// Event filtering utilities
export type { ActiveEvent, OrgFilterableEvent } from "./event-filters";
export {
  isEventActive,
  filterActiveEvents,
  filterPastEvents,
  separateEventsByDate,
  filterEventsByCity,
  filterEventsByOrganizer,
  extractUniqueCities,
  extractUniqueOrganizers,
  DEFAULT_CATALOG_CITY,
} from "./event-filters";

// Slug utilities
export { generateSlug } from "./slug";

// Permission helpers
export {
  canManageMembers,
  canCreateEvents,
  canViewAllEvents,
  canManageAssignedEvents,
  canActOnEvent,
  canAccessOrgSettings,
  canManagePayouts,
  canManageAccessCodes,
} from "./permissions";

// RSVP export (sheet data only; consumers load xlsx on demand)
export {
  buildPendingRsvpExportAoa,
  buildPurchaseExportAoa,
  formatRegistrationValueForExport,
  normalizeRegistrationExportColumns,
  purchaseExportColumnWidths,
  registrationValuesForExportColumns,
} from "./pending-rsvp-export";
export type {
  PendingRsvpExportSheetRow,
  PurchaseExportSheetRow,
  RegistrationExportColumn,
} from "./pending-rsvp-export";

// Internal org IDs (hidden from production surfaces)
export { INTERNAL_ORG_IDS } from "./internal";

// Registration form helpers (per-tier field filtering)
export {
  isFieldVisibleForTier,
  filterFieldsForTier,
  getActiveEventFormFields,
} from "./registration-form";
export { dayKeyIn, groupEventsByDay, cityCounts, priceSummary, feedWhen, feedDayTitle } from "./home-feed";
export type { FeedDay, FeedEventTime, PriceSummary } from "./home-feed";
export {
  buildWallet,
  walletWhen,
  eventTicketSlides,
  ticketPrice,
  ticketStage,
  ticketQr,
  isDoorTicket,
  walletOrganizer,
  directionsUrl,
  walletDayTime,
} from "./wallet";
export { normalizeSearch, searchExplore, featuredFirst } from "./explore";
export type { Wallet, WalletEvent, WalletRequest, WalletRequestState, WalletWhen, WalletEventInfo, TicketPrice, TicketQr } from "./wallet";
export { lowestPriceInfo } from "./availability";
export type { LowestPriceInfo, PriceableTier } from "./availability";
