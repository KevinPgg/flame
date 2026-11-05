/**
 * Stripe Connect onboarding countries.
 *
 * The organizer's country must be known BEFORE creating the connected account,
 * because the service agreement is locked at creation time and cannot be
 * changed once Stripe-hosted onboarding begins. Knowing the country also lets us
 * set the account's `default_currency` (required once `country` is passed to
 * `accounts.create`).
 *
 * All countries Flame serves use the recipient/transfers-only model: the
 * platform is merchant of record via destination charges, and the connected
 * account only receives transfers (no `card_payments`). Mexico initially failed
 * with the recipient agreement ("cannot request the recipient service agreement
 * for v2 Accounts"), but Stripe enabled recipient (transfers-only) for our
 * platform's MX accounts on the V1 Accounts API (Jul 2026), so Mexico now
 * behaves identically to Ecuador. See JULY_2026_FIXES.md (supersedes the
 * short-lived full-service-agreement workaround in JUNE_2026_FIXES.md #15).
 */

export interface StripeConnectCountry {
  /** ISO 3166-1 alpha-2 code (uppercase). */
  code: string;
  /** Display name shown in the onboarding country selector. */
  name: string;
  /**
   * ISO 4217 currency code (lowercase) used as the connected account's
   * `default_currency`. Once we pass `country` to `accounts.create`, Stripe
   * requires `default_currency` to be set explicitly (it no longer infers it
   * from Stripe-hosted onboarding). This is the account's local payout/settlement
   * currency (e.g. Ecuador settles in USD, Mexico in MXN).
   */
  currency: string;
}

/**
 * Countries available for organizer Stripe Connect onboarding, curated to the
 * markets Flame serves (LATAM + US/CA). Drives the country selector shown before
 * a connected account is created. Add countries here as Stripe enables them for
 * the platform.
 */
export const STRIPE_CONNECT_COUNTRIES: readonly StripeConnectCountry[] = [
  { code: "EC", name: "Ecuador", currency: "usd" },
  { code: "MX", name: "Mexico", currency: "mxn" },
  { code: "US", name: "United States", currency: "usd" },
  { code: "CO", name: "Colombia", currency: "cop" },
  { code: "PE", name: "Peru", currency: "pen" },
  { code: "CL", name: "Chile", currency: "clp" },
  { code: "AR", name: "Argentina", currency: "ars" },
  { code: "BR", name: "Brazil", currency: "brl" },
  { code: "UY", name: "Uruguay", currency: "uyu" },
  { code: "CA", name: "Canada", currency: "cad" },
] as const;

/** Country pre-selected in the onboarding picker (platform's primary market). */
export const DEFAULT_CONNECT_COUNTRY = "US";

/**
 * Picker value for organizers whose country isn't in STRIPE_CONNECT_COUNTRIES
 * (e.g. Spain). Selecting it omits `country` from the onboard request, so the
 * account is created without one and the organizer picks their country (and its
 * service agreement) on Stripe-hosted onboarding, which lists every country
 * Stripe supports. Never sent to the API.
 */
export const CONNECT_COUNTRY_NOT_LISTED = "NOT_LISTED";

/** Display label for the CONNECT_COUNTRY_NOT_LISTED picker option. */
export const CONNECT_COUNTRY_NOT_LISTED_LABEL = "My country isn't listed";

/**
 * Maps a country picker selection to the `country` sent to the onboard route:
 * the code for a listed country, `undefined` for CONNECT_COUNTRY_NOT_LISTED so
 * Stripe-hosted onboarding asks for the country instead.
 */
export function toConnectOnboardCountry(
  selection: string | null | undefined
): string | undefined {
  if (!selection || selection === CONNECT_COUNTRY_NOT_LISTED) return undefined;
  return selection;
}

/** Whether the given country code is offered in the onboarding selector. */
export function isSupportedConnectCountry(
  code: string | null | undefined
): boolean {
  if (!code) return false;
  const upper = code.toUpperCase();
  return STRIPE_CONNECT_COUNTRIES.some((c) => c.code === upper);
}

/**
 * Default currency (lowercase ISO 4217) for a connected account in the given
 * country, used as `accounts.create#default_currency`. Returns `undefined` for
 * unknown countries so callers can omit the field and let Stripe decide.
 */
export function getConnectCountryDefaultCurrency(
  code: string | null | undefined
): string | undefined {
  if (!code) return undefined;
  const upper = code.toUpperCase();
  return STRIPE_CONNECT_COUNTRIES.find((c) => c.code === upper)?.currency;
}
