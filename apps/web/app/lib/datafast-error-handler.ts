/**
 * Datafast Error Handler
 *
 * Categorizes Datafast error codes into actionable categories
 * Based on Datafast Implementation Guide Tables 5, 6, 7, 8, 10
 */

export type ErrorCategory = "NON_RECOVERABLE" | "RETRYABLE" | "TECHNICAL";

export interface DatafastError {
  code: string;
  description: string;
  category: ErrorCategory;
  userMessage: string;
  action: "RETRY" | "NEW_TRANSACTION" | "CONTACT_SUPPORT";
  showCard?: boolean; // Show affected card info to user
}

/**
 * Non-recoverable errors - User needs to use different payment method or card
 * Action: Redirect back to /events with error message
 */
const NON_RECOVERABLE_CODES: Record<string, string> = {
  // Card status issues
  "800.100.165": "Card reported as lost. Please use a different card.",
  "800.100.159": "Card reported as stolen. Please use a different card.",
  "800.100.168": "Card is restricted. Please contact your bank.",
  "800.100.171": "Card has been flagged. Please contact your bank.",

  // Insufficient funds
  "800.100.155": "Insufficient funds. Please use a different payment method.",
  "51": "Insufficient funds. Please use a different payment method.",

  // Card validity issues
  "100.100.303": "Card has expired. Please use a valid card.",
  "54": "Card has expired. Please use a valid card.",
  "76": "Invalid account. Please contact your bank.",

  // Transaction restrictions
  "800.100.170": "Transaction not permitted with this card type.",
  "57": "Transaction not permitted with this card.",
  "800.100.179": "Transaction limit exceeded for this card.",
  "800.100.162": "Transaction limit exceeded.",
  "62": "Card is restricted for this type of transaction.",

  // Duplicate/Blocked
  "800.110.100": "Duplicate transaction detected.",
  "800.100.501":
    "You have blocked recurring payments. Please enable them or use a different card.",

  // Configuration/Fraud/System errors
  "600.200.201": "Payment method not available. Please try a different card.",
  "600.200.500": "Card brand not supported.",
  "100.400.142":
    "Transaction declined by security system. Please try a different card or contact support if this persists.",
  "100.400.147": "Transaction denied by security rules.",
  "100.400.149": "Transaction blocked by security system.",
  "80": "Transaction cannot be processed at this time. Please use a different payment method.",
  "800.100.174":
    "Invalid amount. Please go back to the event listing and create a new reservation. Contact support if the problem persists.",

  // Response codes
  "41": "Card reported as lost. Please use a different card.",
  "43": "Card reported as stolen. Please use a different card.",
};

/**
 * Retryable errors - User can try again with same or corrected information
 * Action: Stay on /purchase page, allow retry
 */
const RETRYABLE_CODES: Record<string, string> = {
  // Payment session expired (Datafast checkout session has 30 min limit)
  "200.300.404":
    "Your payment session has expired (30 minute limit). Please click 'Try Again' to restart the payment process.",

  // Generic declines (can retry)
  "800.100.152":
    "Transaction declined. Please verify your card details and try again.",
  "05": "Transaction declined. Please try again or use a different card.",

  // User cancelled
  "800.100.197":
    "Transaction cancelled. Please try again if you wish to proceed.",

  // Temporary availability
  "800.100.176":
    "Card temporarily unavailable. Please try again in a few minutes.",
  "19": "Please try your transaction again.",
  "88": "Please try your transaction again.",
  "91": "Bank is temporarily offline. Please try again.",

  // Input errors (user can correct)
  "100.400.311": "Invalid format. Please check your card details.",
  "800.100.157": "Invalid expiration date. Please check your card details.",
  "800.100.151": "Invalid card number. Please check and try again.",
  "800.100.402": "Invalid cardholder name. Please check and try again.",
  "100.100.402": "Invalid cardholder information.",
  "100.100.400": "Cardholder name is required.",
  "100.100.100": "Card information is incomplete.",

  // Too many attempts (temporary block)
  "800.300.500":
    "Too many incorrect CVV attempts. Please try again in 48 hours or use a different card.",
  "800.300.501":
    "Too many incorrect expiration date attempts. Please try again in 48 hours or use a different card.",

  // Connection/timeout (temporary)
  "900.100.100": "Connection error. Please try again.",
  "900.100.200": "Request timeout. Please try again.",

  // 3DS errors
  "100.380.401": "3D Secure verification failed. Please try again.",
  "100.380.501": "3D Secure verification timeout. Please try again.",
  "100.396.103": "3D Secure verification timeout. Please try again.",
};

/**
 * Technical errors - System/configuration issues, requires support intervention
 * Action: Show "Contact Support" message
 */
const TECHNICAL_CODES: Record<string, string> = {
  // Request format errors
  "200.100.101": "System error. Please contact support. [ERR-REQ-INVALID]",
  "200.100.103": "System error. Please contact support. [ERR-REQ-STRUCT]",

  // Configuration errors
  "800.100.190":
    "Payment system configuration error. Please contact support. [ERR-CONFIG]",
  "800.100.199": "Tax calculation error. Please contact support. [ERR-TAX]",
  ER: "System configuration error. Please contact support. [ERR-MERCHANT]",

  // Reversal/Refund errors
  "700.300.700":
    "Transaction reversal failed. Please contact support. [ERR-REVERSAL]",
  "700.100.200": "Amount mismatch error. Please contact support. [ERR-AMOUNT]",
  "700.400.200":
    "Refund processing error. Please contact support. [ERR-REFUND]",

  // Gateway errors
  "900.100.201":
    "Gateway connection lost. Please contact support. [ERR-GATEWAY]",
  "900.100.300":
    "No response from payment gateway. Please contact support. [ERR-TIMEOUT]",

  // Risk/Security system errors
  "100.400.325":
    "Security system unavailable. Please contact support. [ERR-RISK]",
  "100.390.108":
    "Merchant 3DS configuration error. Please contact support. [ERR-3DS-CFG]",
  "100.390.112":
    "3D Secure system error. Please contact support. [ERR-3DS-TECH]",

  // Data validation
  "100.700.801":
    "Invalid identification information. Please contact support. [ERR-ID]",
};

/**
 * Categorize and handle a Datafast error code
 */
export function categorizeDatafastError(
  code: string,
  description?: string
): DatafastError {
  // Check non-recoverable errors
  if (code in NON_RECOVERABLE_CODES) {
    return {
      code,
      description: description || NON_RECOVERABLE_CODES[code],
      category: "NON_RECOVERABLE",
      userMessage: NON_RECOVERABLE_CODES[code],
      action: "NEW_TRANSACTION",
      showCard: true,
    };
  }

  // Check retryable errors
  if (code in RETRYABLE_CODES) {
    return {
      code,
      description: description || RETRYABLE_CODES[code],
      category: "RETRYABLE",
      userMessage: RETRYABLE_CODES[code],
      action: "RETRY",
      showCard: true,
    };
  }

  // Check technical errors
  if (code in TECHNICAL_CODES) {
    return {
      code,
      description: description || TECHNICAL_CODES[code],
      category: "TECHNICAL",
      userMessage: TECHNICAL_CODES[code],
      action: "CONTACT_SUPPORT",
    };
  }

  // Unknown error - default to technical (safest option)
  // Include error code in message so support can help diagnose
  return {
    code,
    description: description || "Unknown error occurred",
    category: "TECHNICAL",
    userMessage: `An unexpected error occurred (code: ${code}). Please contact support and provide this error code.`,
    action: "CONTACT_SUPPORT",
  };
}

/**
 * Get user-friendly error message and action based on error response
 */
export function handleDatafastError(errorData: {
  code?: string;
  description?: string;
  resultDetails?: {
    Response?: string;
    ExtendedDescription?: string;
  };
}): DatafastError {
  // Try result code first
  if (errorData.code) {
    return categorizeDatafastError(errorData.code, errorData.description);
  }

  // Try Response code from resultDetails
  if (errorData.resultDetails?.Response) {
    return categorizeDatafastError(
      errorData.resultDetails.Response,
      errorData.resultDetails.ExtendedDescription || errorData.description
    );
  }

  // Fallback to generic technical error
  return {
    code: "UNKNOWN",
    description: errorData.description || "Unknown error",
    category: "TECHNICAL",
    userMessage: "An unexpected error occurred. Please contact support.",
    action: "CONTACT_SUPPORT",
  };
}
