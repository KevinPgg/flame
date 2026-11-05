"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FiCheckCircle,
  FiAlertCircle,
  FiClock,
  FiArrowRight,
} from "react-icons/fi";
import {
  STRIPE_CONNECT_COUNTRIES,
  DEFAULT_CONNECT_COUNTRY,
  CONNECT_COUNTRY_NOT_LISTED,
  CONNECT_COUNTRY_NOT_LISTED_LABEL,
  toConnectOnboardCountry,
} from "@project-flame/lib";

interface StripeConnectStatusProps {
  organizationId: string;
  organizationName: string;
}

interface ConnectStatus {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  accountId: string | null;
}

export default function StripeConnectStatus({
  organizationId,
  organizationName,
}: StripeConnectStatusProps) {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string>(
    DEFAULT_CONNECT_COUNTRY,
  );

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(
        `/api/stripe/connect/status?organizationId=${encodeURIComponent(
          organizationId,
        )}`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch Stripe status");
      }

      const data = await response.json();
      setStatus(data);
    } catch (err) {
      console.error("Error fetching Stripe status:", err);
      setError(err instanceof Error ? err.message : "Failed to load status");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Reset the pre-creation country selection when the active org changes so a
  // new org never inherits the previous org's market (this component stays
  // mounted across org switches, e.g. via ?orgId=). Only relevant before the
  // connected account is created.
  useEffect(() => {
    setSelectedCountry(DEFAULT_CONNECT_COUNTRY);
  }, [organizationId]);

  // `country` is only sent when creating a brand-new connected account (the
  // "Connect with Stripe" button). For existing accounts (Complete Setup /
  // Manage) the onboard route skips creation, so country is omitted/ignored.
  const handleConnect = async (country?: string) => {
    try {
      setOnboarding(true);
      setError(null);

      const response = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organizationId,
          ...(country ? { country } : {}),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.details
          ? `${errorData.error}\n\nMissing: ${
              errorData.details.currently_due?.join(", ") || "None"
            }`
          : errorData.error || "Failed to create onboarding link";
        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Redirect to Stripe Connect onboarding
      window.location.href = data.url;
    } catch (err) {
      console.error("Error starting onboarding:", err);
      setError(
        err instanceof Error ? err.message : "Failed to start onboarding",
      );
      setOnboarding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-4">
        <div className="animate-spin rounded-full w-5 h-5 border-2 border-white-20 border-t-white-100" />
        <p className="text-white-50 text-sm font-poppins">
          Loading payment status...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 p-4 bg-card border border-white-30 rounded-card">
        <FiAlertCircle size={24} className="text-red-400 shrink-0 mt-0.5" />
        <div className="flex flex-col gap-2">
          <h4 className="text-white-100 font-poppins-semibold text-sm">
            Error Loading Payment Status
          </h4>
          <p className="text-white-50 text-xs font-poppins whitespace-pre-wrap">
            {error}
          </p>
          <button
            onClick={fetchStatus}
            className="bg-white-100 text-dark font-poppins-medium rounded-pill px-4 py-1.5 text-xs hover:opacity-90 transition-opacity w-fit"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Not connected yet
  if (!status?.connected || !status?.accountId) {
    return (
      <div className="flex flex-col gap-6">
        <div className="bg-card border border-white-30 rounded-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white-100 font-poppins-semibold text-base">
              Payment Setup Required
            </h3>
            <div className="flex items-center gap-1.5 bg-yellow-500/20 text-yellow-400 px-2.5 py-1 rounded-pill text-xs font-poppins-medium">
              <FiClock size={14} />
              Not Connected
            </div>
          </div>
          <p className="text-white-50 text-sm font-poppins mb-4">
            Connect your Stripe account to accept payments for{" "}
            {organizationName}. This is required to sell tickets and receive
            payouts.
          </p>

          <div className="mb-4">
            <label
              htmlFor="connect-country"
              className="block text-white-80 text-xs font-poppins-medium mb-2"
            >
              Country of operation
            </label>
            <select
              id="connect-country"
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              disabled={onboarding}
              className="w-full bg-white-5 border border-white-10 text-white-100 font-poppins text-sm rounded-pill px-4 py-3 focus:outline-none focus:border-white-30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {STRIPE_CONNECT_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code} className="bg-surface">
                  {c.name}
                </option>
              ))}
              <option value={CONNECT_COUNTRY_NOT_LISTED} className="bg-surface">
                {CONNECT_COUNTRY_NOT_LISTED_LABEL}
              </option>
            </select>
            <p className="text-white-50 text-xs font-poppins mt-2">
              {selectedCountry === CONNECT_COUNTRY_NOT_LISTED
                ? "You'll choose your country on Stripe's secure setup page. It can't be changed after setup begins."
                : "Select where your organization legally operates. This can't be changed after setup begins."}
            </p>
          </div>

          <div>
            <button
              onClick={() => handleConnect(toConnectOnboardCountry(selectedCountry))}
              disabled={onboarding}
              className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-3 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
            >
              {onboarding ? (
                <>
                  <div className="animate-spin rounded-full w-4 h-4 border-2 border-dark/20 border-t-dark" />
                  Opening Stripe...
                </>
              ) : (
                <>
                  Connect with Stripe
                  <FiArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </div>

        <PayoutsInfoSection />
      </div>
    );
  }

  // Connected but onboarding incomplete
  if (!status.chargesEnabled || !status.payoutsEnabled) {
    return (
      <div className="flex flex-col gap-6">
        <div className="bg-card border border-white-30 rounded-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white-100 font-poppins-semibold text-base">
              Complete Payment Setup
            </h3>
            <div className="flex items-center gap-1.5 bg-yellow-500/20 text-yellow-400 px-2.5 py-1 rounded-pill text-xs font-poppins-medium">
              <FiClock size={14} />
              Action Required
            </div>
          </div>
          <p className="text-white-50 text-sm font-poppins mb-4">
            Your Stripe account is connected but needs additional information to
            accept payments.
          </p>
          <div className="flex flex-col gap-2 mb-4">
            <div className="flex items-center gap-2">
              {status.chargesEnabled ? (
                <FiCheckCircle size={18} className="text-green-400" />
              ) : (
                <FiAlertCircle size={18} className="text-yellow-400" />
              )}
              <span className="text-white-80 text-sm font-poppins">
                Charges: {status.chargesEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {status.payoutsEnabled ? (
                <FiCheckCircle size={18} className="text-green-400" />
              ) : (
                <FiAlertCircle size={18} className="text-yellow-400" />
              )}
              <span className="text-white-80 text-sm font-poppins">
                Payouts: {status.payoutsEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
          <div>
            <button
              onClick={() => handleConnect()}
              disabled={onboarding}
              className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-3 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
            >
              {onboarding ? (
                <>
                  <div className="animate-spin rounded-full w-4 h-4 border-2 border-dark/20 border-t-dark" />
                  Opening Stripe...
                </>
              ) : (
                <>
                  Complete Setup
                  <FiArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </div>

        <PayoutsInfoSection />
      </div>
    );
  }

  // Fully connected and enabled
  return (
    <div className="flex flex-col gap-6">
      <div className="bg-card border border-white-30 rounded-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white-100 font-poppins-semibold text-base">
            Payment Account
          </h3>
          <div className="flex items-center gap-1.5 bg-green-500/20 text-green-400 px-2.5 py-1 rounded-pill text-xs font-poppins-medium">
            <FiCheckCircle size={14} />
            Connected
          </div>
        </div>
        <p className="text-white-50 text-sm font-poppins mb-4">
          Your Stripe account is fully connected and ready to accept payments.
        </p>
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex items-center gap-2">
            <FiCheckCircle size={18} className="text-green-400" />
            <span className="text-white-80 text-sm font-poppins">
              Charges Enabled
            </span>
          </div>
          <div className="flex items-center gap-2">
            <FiCheckCircle size={18} className="text-green-400" />
            <span className="text-white-80 text-sm font-poppins">
              Payouts Enabled
            </span>
          </div>
        </div>
        {/* Manage Stripe (connected only): keep secondary / muted treatment — border + text-white-50, not the
            solid white primary pill used for Connect / Complete Setup. Matches mobile PayoutsSettingsTab
            ConnectButton variant="secondary" intent; do not switch to bg-white-100 / text-dark here. */}
        <div>
          <button
            onClick={() => handleConnect()}
            disabled={onboarding}
            className="border border-white-30 text-white-50 font-poppins-medium rounded-pill px-7 py-3 hover:bg-white-10 hover:text-white-80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
          >
            {onboarding ? (
              <>
                <div className="animate-spin rounded-full w-4 h-4 border-2 border-white-20 border-t-white-50" />
                Opening Stripe...
              </>
            ) : (
              <>
                Manage Stripe Account
                <FiArrowRight size={18} className="text-white-50" aria-hidden />
              </>
            )}
          </button>
        </div>
      </div>

      <PayoutsInfoSection />
    </div>
  );
}

function PayoutsInfoSection() {
  return (
    <div className="bg-card border border-white-30 rounded-card p-4 flex flex-col gap-3">
      <h4 className="text-white-100 text-base font-poppins-semibold m-0">
        About Payouts
      </h4>
      <p className="text-white-50 text-sm font-poppins m-0">
        Payouts are processed through Stripe Connect. Once your account is fully
        set up, ticket revenue will be available for payout according to your
        Stripe payout schedule.
      </p>
      <div className="flex flex-col gap-2 mt-1">
        <div className="flex items-start gap-2">
          <FiCheckCircle size={16} className="text-white-50 mt-0.5 shrink-0" />
          <span className="text-white-50 text-xs font-poppins">
            Secure payments powered by Stripe
          </span>
        </div>
        <div className="flex items-start gap-2">
          <FiClock size={16} className="text-white-50 mt-0.5 shrink-0" />
          <span className="text-white-50 text-xs font-poppins">
            Payouts are managed directly through your Stripe dashboard
          </span>
        </div>
      </div>
    </div>
  );
}
