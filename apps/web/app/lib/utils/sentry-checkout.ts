/**
 * Sentry Checkout Error Tracking
 *
 * Centralized error tracking for all checkout-related issues.
 * Categories help with Sentry alerts and dashboards.
 */
import * as Sentry from "@sentry/nextjs";
import * as crypto from "crypto";

// Error categories for Sentry tagging and alerting
export const CheckoutErrorCategory = {
  // Token & Session errors
  TOKEN_INVALID: "token_invalid",
  TOKEN_EXPIRED: "token_expired",
  TOKEN_USER_MISMATCH: "token_user_mismatch",
  HOLD_INVALID: "hold_invalid",
  HOLD_EXPIRED: "hold_expired",

  // Datafast errors
  DATAFAST_CHECKOUT_FAILED: "datafast_checkout_failed",
  DATAFAST_VERIFICATION_FAILED: "datafast_verification_failed",
  DATAFAST_SESSION_EXPIRED: "datafast_session_expired",
  DATAFAST_NETWORK_ERROR: "datafast_network_error",
  DATAFAST_CONFIGURATION_ERROR: "datafast_configuration_error",

  // Payment errors
  PAYMENT_DECLINED: "payment_declined",
  PAYMENT_FRAUD_BLOCKED: "payment_fraud_blocked", // ReD Shield
  PAYMENT_INSUFFICIENT_FUNDS: "payment_insufficient_funds",

  // Purchase completion errors
  PURCHASE_COMPLETION_FAILED: "purchase_completion_failed",
  TICKET_CREATION_FAILED: "ticket_creation_failed",

  // Critical - potential ghost payments
  GHOST_PAYMENT_RISK: "ghost_payment_risk",
} as const;

export type CheckoutErrorCategoryType =
  (typeof CheckoutErrorCategory)[keyof typeof CheckoutErrorCategory];

// Severity levels for prioritization
export const CheckoutSeverity = {
  LOW: "low", // User error, can retry
  MEDIUM: "medium", // System issue, needs investigation
  HIGH: "high", // Payment issue, urgent
  CRITICAL: "critical", // Ghost payment risk, immediate action
} as const;

export type CheckoutSeverityType =
  (typeof CheckoutSeverity)[keyof typeof CheckoutSeverity];

interface CheckoutErrorContext {
  category: CheckoutErrorCategoryType;
  severity?: CheckoutSeverityType;
  userId?: string;
  userIdHash?: string;
  eventId?: string;
  eventName?: string;
  rsvpId?: string;
  holdId?: string;
  checkoutId?: string;
  tokenPrefix?: string;
  errorCode?: string;
  errorMessage?: string;
  amount?: number;
  extra?: Record<string, unknown>;
}

/**
 * Capture a checkout error to Sentry with structured context
 */
export function captureCheckoutError(
  error: Error | string,
  context: CheckoutErrorContext
): void {
  const errorObj = typeof error === "string" ? new Error(error) : error;

  // Determine severity based on category if not provided
  const severity = context.severity ?? getSeverityForCategory(context.category);

  // Set Sentry level based on severity
  const sentryLevel = mapSeverityToSentryLevel(severity);

  Sentry.captureException(errorObj, {
    level: sentryLevel,
    tags: {
      checkout_category: context.category,
      checkout_severity: severity,
      ...(context.errorCode && { error_code: context.errorCode }),
    },
    extra: {
      // Never log full user IDs or tokens - use prefixes/hashes only
      ...(context.userIdHash && { user_id_hash: context.userIdHash }),
      ...(context.eventId && { event_id: context.eventId }),
      ...(context.eventName && { event_name: context.eventName }),
      ...(context.rsvpId && { rsvp_id_prefix: context.rsvpId.substring(0, 8) }),
      ...(context.holdId && { hold_id_prefix: context.holdId.substring(0, 8) }),
      ...(context.checkoutId && { checkout_id: context.checkoutId }),
      ...(context.tokenPrefix && { token_prefix: context.tokenPrefix }),
      ...(context.errorMessage && { error_message: context.errorMessage }),
      ...(context.amount && { amount_cents: context.amount }),
      ...context.extra,
    },
  });

  // Also log to console for Vercel logs
  const logPrefix = `[SENTRY-CHECKOUT] [${severity.toUpperCase()}] [${context.category}]`;
  console.error(
    logPrefix,
    errorObj.message,
    context.errorCode ? `(${context.errorCode})` : ""
  );
}

/**
 * Capture a warning (not an exception) for monitoring
 */
export function captureCheckoutWarning(
  message: string,
  context: Partial<CheckoutErrorContext>
): void {
  Sentry.captureMessage(message, {
    level: "warning",
    tags: {
      checkout_category: context.category ?? "checkout_warning",
    },
    extra: {
      ...(context.userIdHash && { user_id_hash: context.userIdHash }),
      ...(context.eventId && { event_id: context.eventId }),
      ...(context.rsvpId && { rsvp_id_prefix: context.rsvpId.substring(0, 8) }),
      ...(context.checkoutId && { checkout_id: context.checkoutId }),
      ...context.extra,
    },
  });

  console.warn(`[SENTRY-CHECKOUT] [WARNING] ${message}`);
}

/**
 * Map Datafast error codes to our categories
 * 
 * @param errorCode - The Datafast error code (can be undefined/null for unknown errors)
 * @returns Category and severity for the error code
 */
export function categorizeDatafastError(errorCode: string | undefined | null): {
  category: CheckoutErrorCategoryType;
  severity: CheckoutSeverityType;
} {
  // Handle undefined/null/empty error codes
  if (!errorCode || typeof errorCode !== "string") {
    return {
      category: CheckoutErrorCategory.DATAFAST_VERIFICATION_FAILED,
      severity: CheckoutSeverity.MEDIUM,
    };
  }

  // ReD Shield / Fraud blocking
  if (errorCode === "100.400.142") {
    return {
      category: CheckoutErrorCategory.PAYMENT_FRAUD_BLOCKED,
      severity: CheckoutSeverity.HIGH,
    };
  }

  // Session expired (30-min timeout)
  if (errorCode === "200.300.404") {
    return {
      category: CheckoutErrorCategory.DATAFAST_SESSION_EXPIRED,
      severity: CheckoutSeverity.LOW,
    };
  }

  // Insufficient funds
  if (errorCode === "800.100.155") {
    return {
      category: CheckoutErrorCategory.PAYMENT_INSUFFICIENT_FUNDS,
      severity: CheckoutSeverity.LOW,
    };
  }

  // Amount mismatch (700.100.200) - Technical/Configuration error
  if (errorCode === "700.100.200") {
    return {
      category: CheckoutErrorCategory.DATAFAST_CONFIGURATION_ERROR,
      severity: CheckoutSeverity.HIGH,
    };
  }

  // Generic declined
  if (errorCode.startsWith("800.")) {
    return {
      category: CheckoutErrorCategory.PAYMENT_DECLINED,
      severity: CheckoutSeverity.MEDIUM,
    };
  }

  // Network/gateway errors
  if (errorCode.startsWith("900.")) {
    return {
      category: CheckoutErrorCategory.DATAFAST_NETWORK_ERROR,
      severity: CheckoutSeverity.HIGH,
    };
  }

  // Default
  return {
    category: CheckoutErrorCategory.DATAFAST_VERIFICATION_FAILED,
    severity: CheckoutSeverity.MEDIUM,
  };
}

function getSeverityForCategory(
  category: CheckoutErrorCategoryType
): CheckoutSeverityType {
  switch (category) {
    case CheckoutErrorCategory.GHOST_PAYMENT_RISK:
    case CheckoutErrorCategory.TICKET_CREATION_FAILED:
      return CheckoutSeverity.CRITICAL;

    case CheckoutErrorCategory.PAYMENT_FRAUD_BLOCKED:
    case CheckoutErrorCategory.DATAFAST_NETWORK_ERROR:
    case CheckoutErrorCategory.PURCHASE_COMPLETION_FAILED:
      return CheckoutSeverity.HIGH;

    case CheckoutErrorCategory.PAYMENT_DECLINED:
    case CheckoutErrorCategory.TOKEN_USER_MISMATCH:
      return CheckoutSeverity.MEDIUM;

    default:
      return CheckoutSeverity.LOW;
  }
}

function mapSeverityToSentryLevel(
  severity: CheckoutSeverityType
): Sentry.SeverityLevel {
  switch (severity) {
    case CheckoutSeverity.CRITICAL:
      return "fatal";
    case CheckoutSeverity.HIGH:
      return "error";
    case CheckoutSeverity.MEDIUM:
      return "warning";
    case CheckoutSeverity.LOW:
      // Use "warning" instead of "info" to ensure LOW severity errors are visible
      // in Sentry alerts. Info level events are often filtered out by default.
      return "warning";
    default:
      return "error";
  }
}

/**
 * Create a user ID hash for privacy-compliant logging
 * 
 * Uses SHA-256 to create a non-reversible hash of the user ID.
 * Returns the first 12 characters of the hex-encoded hash for correlation
 * without exposing the full user ID.
 */
export function hashUserId(userId: string): string {
  const hash = crypto.createHash("sha256").update(userId).digest("hex");
  return hash.substring(0, 12);
}

