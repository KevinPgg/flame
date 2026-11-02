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
export {
  NOTIFICATION_PREFERENCE_ITEMS,
  mergeNotificationPreferences,
  notificationPreferencesUpdate,
  type NotificationPreferences,
} from "./utils/notification-preferences";

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
  withGuestExportColumns,
  // Permissions
  canManageMembers,
  canCreateEvents,
  canViewAllEvents,
  canManageAssignedEvents,
  canActOnEvent,
  canAccessOrgSettings,
  canManagePayouts,
  canManageAccessCodes,
  // Internal content gating
  INTERNAL_ORG_IDS,
  // Registration form (per-tier field filtering)
  isFieldVisibleForTier,
  filterFieldsForTier,
  validateRsvpGuests,
  RSVP_GUESTS_KEY,
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
// ORGANIZER (Flame 2.0 dashboard model, shared web/mobile)
// ============================================================================
export {
  buildOrganizerEventList,
  revenueByCurrency,
  searchEventsByName,
  foldForSearch,
  splitEventsByTime,
  totalPendingRsvps,
  formatEventDateTime,
} from "./organizer/dashboard";
export type {
  DashboardEvent,
  CohostEntry,
  OwnerCohostAssignmentRef,
  OrganizerEventListInput,
  OrganizerEventList,
  CurrencyTotal,
} from "./organizer/dashboard";

export {
  summarizeEventSales,
  tierStats,
  eventBreakdown,
  salesByTier,
  promoterLeaderboard,
  promoterLinkUrl,
  validatePromoterCode,
  parsePromoterNames,
  promoterCodeFor,
  buildPromoterBatch,
  PROMOTER_BATCH_MAX,
  validatePromoCode,
  promoCodeStatus,
  bankOrderNetCents,
  PROMO_DISCOUNT_OPTIONS,
} from "./organizer/event-detail";
export type {
  PurchaseRow,
  TierRow,
  TierStat,
  BankTransferRow,
  CompRow,
  PromoterLinkRow,
  PromoCodeRow,
  CodeValidationError,
} from "./organizer/event-detail";

export {
  sendOptions,
  defaultSendOption,
  isValidSendQuantity,
  parseCustomPrice,
  normalizeEmail,
  isLikelyEmail,
  personName,
  initialsOf,
  sentHistory,
  SEND_MAX_QUANTITY,
  SEND_MAX_CUSTOM_PRICE_CENTS,
} from "./organizer/send-tickets";
export type {
  SendMode,
  SendStageRow,
  SendTierRow,
  SendOption,
  CustomPriceError,
  SentCompRow,
  SentBankRow,
  SentEntry,
} from "./organizer/send-tickets";

export {
  RSVP_TABS,
  rsvpStatusKey,
  rsvpTabOf,
  rsvpTabCounts,
  filterRsvps,
  defaultRsvpTab,
  rsvpAmountCents,
  rsvpGuestName,
  rsvpTicketLabel,
  canDecideRsvp,
  approveAllPlan,
  registrationEntries,
  rsvpGuestBlocks,
  rsvpEventLists,
} from "./organizer/rsvps";
export type {
  RsvpStatus as OrganizerRsvpStatus,
  RsvpUser,
  OrganizerRsvp,
  RegistrationField,
  RsvpTab,
  RegistrationValue,
  RegistrationEntry,
} from "./organizer/rsvps";

export {
  EVENT_NAME_MAX,
  EVENT_SLUG_MAX,
  EVENT_VENUE_MAX,
  EVENT_CITY_MAX,
  EVENT_DESCRIPTION_MAX,
  TIER_NAME_MAX,
  TIER_ACCESS_CODE_MIN,
  PER_USER_LIMIT_MAX,
  QUESTION_LABEL_MAX,
  QUESTION_PLACEHOLDER_MAX,
  DEFAULT_EVENT_DURATION_HOURS,
  EVENT_MIN_LEAD_MS,
  TIER_MAX_PRICE_CENTS,
  QUESTION_TYPES,
  draftKey,
  questionId,
  newStageDraft,
  newTierDraft,
  newQuestionDraft,
  reusableQuestions,
  copyQuestion,
  moveItem,
  suggestEnd,
  emptyEventForm,
  slugify,
  parsePriceInput,
  parseIntInput,
  defaultStages,
  tierTotalQuantity,
  tierStartingPriceCents,
  toUtc as eventFormToUtc,
  validateEventForm,
  validateTierFields,
  firstErrorPath,
  buildCreateEventPayload,
  editFormFromEvent,
  viewerTimeIfDifferent,
  datesLocked,
  changedDates,
  tiersSellingPastEnd,
  validateEditEventForm,
  buildUpdateEventPayload,
  tierSecretCode,
} from "./organizer/event-form";
export {
  activeEventFields,
  tierQuestions,
  reusableEventQuestions,
  tierEditorFromTier,
  newTierEditor,
  validateTierEditor,
  buildTierSave,
  canForceReduce,
} from "./organizer/tier-editor";
export type { EditorStage, EditorTier, EditorEvent, TierEditorState, TierSavePlan } from "./organizer/tier-editor";
export {
  ASSIGNABLE_ROLES,
  memberName,
  memberInitials,
  sortTeam,
  assignmentCounts,
  assignedEventIds,
  editableRole,
  assignableEvents,
  assignmentsToSave,
  memberHasActions,
} from "./organizer/team";
export type { TeamMember, TeamAssignment, AssignableRole, AssignableEvent } from "./organizer/team";
export {
  parseTicketQr,
  scanResultKind,
  scanErrorKind,
  scannerEventList,
  isHappeningNow,
  ACCESS_CODE_PATTERN,
  ACCESS_CODE_ALPHABET,
  GENERATED_ACCESS_CODE_LENGTH,
  normalizeAccessCode,
  isValidAccessCode,
  generateAccessCode,
} from "./organizer/scanner";
export type { TicketQrData, ScanResultKind, VerifiedTicket, ScannerEvent } from "./organizer/scanner";
export type {
  StageDraft,
  TierDraft,
  QuestionDraft,
  EventFormState,
  EventFormErrors,
  EventFormErrorKey,
  CreateEventPayload,
  EditEventFormState,
  EditableEvent,
  UpdateEventPayload,
} from "./organizer/event-form";

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
export {
  ORG_DESCRIPTION_MAX,
  ORG_CITY_MAX,
  ORG_INSTAGRAM_MAX,
  ORG_LOGO_MAX_BYTES,
  ORG_LOGO_TYPES,
  orgFormFrom,
  normalizeInstagram,
  validateOrgForm,
  orgFormPayload,
  orgFormDirty,
  orgImageStoragePath,
  logoFileProblem,
  LOGO_MIN_SIDE,
  LOGO_MAX_SIDE,
  logoDimensionProblem,
  logoTargetSize,
} from "./organizer/org-settings";
export type { OrgProfile, OrgForm, OrgFormErrors } from "./organizer/org-settings";
export {
  PAYOUT_MINIMUM_CENTS,
  payoutMinimumCents,
  balanceRows,
  payoutTone,
  connectState,
} from "./organizer/payouts";
export type { StripeMoney, BalanceRow, PayoutStatus, PayoutTone, ConnectState } from "./organizer/payouts";
export { attendance } from "./organizer/attendance";
export type { AttendanceOrigin, AttendanceRow, AttendanceSale, AttendanceTransfer, AttendanceComp } from "./organizer/attendance";
// Flame 2.0 Home (fase 2.2)
export { dayKeyIn, groupEventsByDay, cityCounts, priceSummary, feedWhen, feedDayTitle, lowestPriceInfo } from "./utils";
export { splitSavedEvents, toggleSavedId } from "./utils";
export {
  LINEUP_MAX,
  ARTIST_NAME_MAX,
  newArtistDraft,
  normalizeArtistInstagram,
  normalizeSpotify,
  normalizeSoundcloud,
  validateLineup,
  lineupFromDrafts,
  draftsFromLineup,
  parseLineup,
  sanitizeLineup,
  artistLinks,
  sameLineup,
  artistInitials,
  isArtistPhotoUrl,
} from "./organizer/lineup";
export type { LineupArtist, ArtistDraft, LineupErrorKey } from "./organizer/lineup";
export type { SavedEventTime } from "./utils";
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
  myEventState,
  holdCountdown,
} from "./utils";
export { normalizeSearch, searchExplore, featuredFirst, organizerCover, latestFlyers, addRecentSearch, RECENT_SEARCHES_MAX } from "./utils";
export type { ArtistResult } from "./utils";
export type { HoldCountdown, MyEventState, Wallet, WalletEvent, WalletRequest, WalletRequestState, WalletWhen, WalletEventInfo, TicketPrice, TicketQr } from "./utils";
export type { FeedDay, FeedEventTime, PriceSummary, LowestPriceInfo, PriceableTier } from "./utils";
