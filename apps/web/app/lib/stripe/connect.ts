import type Stripe from "stripe";
import { getConnectCountryDefaultCurrency } from "@project-flame/lib";
import { stripe } from "./stripe";
import { getBaseUrl } from "@/app/lib/utils/url";

/**
 * Creates a new Stripe Express Connect account for an organization.
 * Sets payouts to manual by default.
 * @param email - The email address for the Connect account owner
 * @param options.country - Optional ISO 3166-1 alpha-2 country code (e.g., 'US', 'EC', 'MX'). If not provided, the user selects it during Stripe-hosted onboarding (recipient/transfers-only default).
 * @param options.businessName - Optional organization name. Shown in the platform's Connected Accounts list on the Stripe Dashboard.
 * @returns The created Stripe account object
 * @throws {Stripe.errors.StripeError} If account creation fails (e.g., invalid email, Stripe API error)
 */
export async function createExpressAccount(
  email: string,
  options?: { country?: string; businessName?: string }
) {
  const accountParams: Stripe.AccountCreateParams = {
    type: "express",
    email,
    settings: {
      payouts: {
        schedule: {
          interval: "manual",
        },
      },
    },
  };

  // Capabilities are intentionally omitted by default so Stripe's Dashboard
  // configuration automatically requests the correct capabilities based on the
  // account's country (recipient/transfers-only for the markets we serve).
  // Hardcoding card_payments + transfers for ALL countries previously restricted
  // the country selector to only countries supporting both (e.g. US), excluding
  // LATAM countries that only support transfers (Ecuador, Colombia, etc.).

  if (options?.country) {
    accountParams.country = options.country;

    // Once `country` is set, Stripe no longer infers the account's currency from
    // hosted onboarding and requires `default_currency` explicitly (e.g. Ecuador
    // → "You must provide a value for 'default_currency'."). Set the country's
    // local settlement currency. See JUNE_2026_FIXES.md.
    const defaultCurrency = getConnectCountryDefaultCurrency(options.country);
    if (defaultCurrency) {
      accountParams.default_currency = defaultCurrency;
    }
  }

  if (options?.businessName) {
    accountParams.business_profile = {
      name: options.businessName,
    };
  }

  const account = await stripe.accounts.create(accountParams);
  return account;
}

/**
 * Generates an Account Link for onboarding an Express Connect account.
 * NOTE: Only "account_onboarding" is valid for Express accounts.
 * "account_update" is exclusive to Custom accounts and will throw a
 * StripeInvalidRequestError if called on an Express account.
 * For fully-connected Express accounts use createExpressDashboardLoginLink instead.
 * @param accountId - The Stripe Connect account ID
 * @param returnPath - The path to redirect to after onboarding (default: /api/stripe/connect/return)
 * @returns The Account Link object containing the onboarding URL
 * @throws {Stripe.errors.StripeError} If account link creation fails (e.g., invalid account ID)
 */
export async function createAccountLink(
  accountId: string,
  returnPath: string = "/api/stripe/connect/return"
) {
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${getBaseUrl()}/api/stripe/connect/refresh?account_id=${accountId}`,
    return_url: `${getBaseUrl()}${returnPath}`,
    type: "account_onboarding",
  });
  return accountLink;
}

/**
 * Creates a login link for a fully-connected Stripe Express account.
 * Express accounts cannot use AccountLinks for dashboard access — they must use
 * Login Links, which redirect the account holder to their Stripe Express Dashboard.
 * @param accountId - The Stripe Express Connect account ID
 * @returns The Login Link object containing the dashboard URL
 * @throws {Stripe.errors.StripeError} If login link creation fails
 */
export async function createExpressDashboardLoginLink(accountId: string) {
  const loginLink = await stripe.accounts.createLoginLink(accountId);
  return loginLink;
}

/**
 * Retrieves the status of a Connect account to check if charges/payouts are enabled.
 * @param accountId - The Stripe Connect account ID
 * @returns Object with chargesEnabled, payoutsEnabled, detailsSubmitted booleans
 *   and transfersActive (whether the `transfers` capability is `active`).
 * @throws {Stripe.errors.StripeError} If account retrieval fails (e.g., invalid account ID)
 *
 * NOTE on `transfersActive`: our funds flow is a destination charge
 * (`transfer_data[destination]`), which requires the connected account's
 * `transfers` capability to be `active`. This is the ONLY reliable readiness
 * signal for our recipient/transfers-only markets (Ecuador, Mexico, etc.), where
 * `charges_enabled` is `false` by design — those accounts never process card
 * charges themselves, they only receive transfers. So do NOT gate charging on
 * `chargesEnabled`/`payoutsEnabled`; gate on `transfersActive`.
 */
export async function getAccountStatus(accountId: string) {
  const account = await stripe.accounts.retrieve(accountId);
  return {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    transfersActive: account.capabilities?.transfers === "active",
  };
}
