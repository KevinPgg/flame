"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  FiArrowLeft,
  FiCalendar,
  FiMapPin,
  FiPercent,
  FiSend,
  FiLink,
  FiEdit2,
  FiX,
  FiCopy,
  FiCheck,
  FiSearch,
  FiChevronDown,
  FiAlertTriangle,
  FiImage,
  FiUpload,
  FiPlus,
  FiTrash2,
  FiClock,
  FiTag,
  FiDownload,
  FiFileText,
  FiLoader,
} from "react-icons/fi";
import { IoTicketOutline } from "react-icons/io5";
import * as XLSX from "xlsx";
import {
  formatCentsAsPrice,
  getBasePriceFromTicket,
  utcToEcuadorLocal,
  ecuadorLocalToUtc,
  getEcuadorNow,
  MAX_TICKET_TIERS_PER_EVENT,
  buildPurchaseExportAoa,
  normalizeRegistrationExportColumns,
  purchaseExportColumnWidths,
  registrationValuesForExportColumns,
} from "@project-flame/lib";
import {
  useOrganizerData,
  useDeleteTicketTier,
  type Event as OrganizerEvent,
} from "../../../lib/hooks/useOrganizerData";
import type { Purchase } from "../../../lib/utils/purchase-data";
import LoadingSpinner from "../../../components/LoadingSpinner";
import TierInlineForm from "../../../components/organizer/TierInlineForm";
import { resizeImageTo4x5 } from "../../../lib/utils/image-upload.client";
import RegistrationFormBuilder, {
  createEmptyField,
} from "../../../components/forms/RegistrationFormBuilder";
import type { FormField } from "../../../components/modals/RegistrationFormModal";
import CoHostAssignmentModal from "../../../components/organizer/CoHostAssignmentModal";
import { CityAutocompleteField } from "../../../components/organizer/CityAutocompleteField";
import { FiUsers } from "react-icons/fi";
import { useQuery as useTanQuery } from "@tanstack/react-query";

type SectionKey =
  | "promotions"
  | "sendTickets"
  | "promoterLinks"
  | "purchasedDetails";
type SectionVisibility = Record<SectionKey, boolean>;

interface OrgEventDetailClientProps {
  eventId: string;
  orgSlug?: string | null;
}

const DEFAULT_IMAGE =
  "https://placehold.co/600x400/1a1a2e/ffffff?text=No+Image";
const DISCOUNT_OPTIONS = Array.from({ length: 20 }, (_, i) => (i + 1) * 5);

// ─── Promo Codes Section ──────────────────────────────────────────────────────

interface PromoCode {
  id: string;
  code: string;
  discount_percentage: number;
  usage_limit: number;
  usage_count: number;
}

function PromoCodesSection({
  eventId,
  promoCodes,
  onRefresh,
}: {
  eventId: string;
  promoCodes: PromoCode[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [discountPct, setDiscountPct] = useState("10");
  const [usageLimit, setUsageLimit] = useState("1");
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleCreate = async () => {
    setError("");
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || trimmed.length < 3) {
      setError("Code must be at least 3 characters.");
      return;
    }
    if (!/^[A-Z0-9]+$/.test(trimmed)) {
      setError("Code must be alphanumeric only.");
      return;
    }
    const limit = parseInt(usageLimit);
    if (isNaN(limit) || limit < 1) {
      setError("Usage limit must be at least 1.");
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetch("/api/organizer/promotional-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          code: trimmed,
          discount_percentage: parseInt(discountPct),
          usage_limit: limit,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create code.");
        return;
      }
      setSuccess(`Code "${trimmed}" created.`);
      setCode("");
      setDiscountPct("10");
      setUsageLimit("1");
      setShowForm(false);
      onRefresh();
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("An error occurred.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (codeId: string) => {
    setDeletingId(codeId);
    try {
      const res = await fetch(`/api/organizer/promotional-codes/${codeId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to delete.");
        return;
      }
      onRefresh();
    } catch {
      setError("An error occurred.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-red-400 text-xs font-poppins">{error}</p>}
      {success && (
        <p className="text-green-400 text-xs font-poppins">{success}</p>
      )}

      {promoCodes.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {promoCodes.map(p => (
            <div
              key={p.id}
              className="flex items-center gap-2 border border-white-20 rounded-pill px-3 py-1.5"
            >
              <span className="text-white-100 text-xs font-poppins-medium">
                {p.code}
              </span>
              <span className="text-white-50 text-xs font-poppins">
                {p.discount_percentage}% · {p.usage_count}/{p.usage_limit} used
              </span>
              <button
                onClick={() => handleDelete(p.id)}
                disabled={deletingId === p.id}
                className="text-white-50 hover:text-white-100 bg-transparent border-none cursor-pointer p-0 disabled:opacity-40"
              >
                <FiX size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-white-50 text-sm font-poppins">
          No promo codes yet.
        </p>
      )}

      {showForm ? (
        <div className="flex flex-col gap-3 bg-white-5 rounded-card p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-white-50 text-xs font-poppins-medium">
              Code
            </label>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. SAVE20"
              maxLength={20}
              className="bg-white-5 border border-white-20 rounded-pill px-4 py-2.5 text-white-100 text-sm font-poppins placeholder:text-white-50 outline-none focus:border-white-50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-white-50 text-xs font-poppins-medium">
              Discount %
            </label>
            <div className="relative">
              <select
                value={discountPct}
                onChange={e => setDiscountPct(e.target.value)}
                className="w-full appearance-none bg-white-5 border border-white-20 rounded-pill px-4 py-2.5 text-white-100 text-sm font-poppins outline-none focus:border-white-50 cursor-pointer pr-10"
              >
                {DISCOUNT_OPTIONS.map(v => (
                  <option key={v} value={v}>
                    {v}%
                  </option>
                ))}
              </select>
              <FiChevronDown
                size={16}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white-50 pointer-events-none"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-white-50 text-xs font-poppins-medium">
              Usage Limit
            </label>
            <input
              type="number"
              min="1"
              value={usageLimit}
              onChange={e => setUsageLimit(e.target.value)}
              placeholder="50"
              className="bg-white-5 border border-white-20 rounded-pill px-4 py-2.5 text-white-100 text-sm font-poppins placeholder:text-white-50 outline-none focus:border-white-50"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 border border-white-30 rounded-pill py-2.5 text-white-100 text-sm font-poppins-medium bg-transparent cursor-pointer hover:bg-white-10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="flex-1 bg-white-100 rounded-pill py-2.5 text-dark text-sm font-poppins-medium cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60 border-none"
            >
              {isCreating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="text-white-100 text-sm font-poppins bg-transparent border-none cursor-pointer p-0 text-left hover:text-white-80"
        >
          + Add Code
        </button>
      )}
    </div>
  );
}

// ─── Send Tickets Section ─────────────────────────────────────────────────────

interface TicketTier {
  id: string;
  name: string;
  price_cents: number;
  quantity_sold?: number;
  ticket_stages?: Array<{
    id: string;
    name: string;
    price_cents: number;
    quantity: number;
    sold_quantity: number;
    order_index: number;
  }>;
}

interface PromotionalTicket {
  id: string;
  email: string;
  customer_name: string;
  created_at: string;
  is_bank_transfer?: boolean;
  order_quantity?: number;
  order_total_cents?: number;
  quantity?: number;
  ticket_tiers: { name: string; price_cents: number };
  metadata?: { stage_name?: string } | null;
}

interface SearchedUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

function SendTicketsSection({
  eventId,
  ticketTiers,
  promotionalTickets,
  currency,
  onRefresh,
}: {
  eventId: string;
  ticketTiers: TicketTier[];
  promotionalTickets: PromotionalTicket[];
  currency?: string;
  onRefresh: () => void;
}) {
  const [mode, setMode] = useState<"free" | "bank_transfer">("free");
  const [sentExpanded, setSentExpanded] = useState(false);
  const [searchEmail, setSearchEmail] = useState("");
  // W7-H2: the email actually submitted to the most recent search. The
  // no-account CTA references this (not the live input) so editing the field
  // after a "not found" result can't capture an unsearched address.
  const [lastSearchedEmail, setLastSearchedEmail] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchedUser[]>([]);
  const [searchError, setSearchError] = useState("");
  const [selectedUser, setSelectedUser] = useState<SearchedUser | null>(null);
  // W7-H2 (3a): a confirmed recipient email with NO Flame account (comp/free
  // mode only). Mutually exclusive with `selectedUser`.
  const [noAccountRecipient, setNoAccountRecipient] = useState<string | null>(
    null,
  );
  const [selectedTierId, setSelectedTierId] = useState(
    ticketTiers[0]?.id || "",
  );
  const [quantity, setQuantity] = useState("1");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // W0-Q2: scroll the "Step 2: Configure" block into view once a recipient is
  // selected. With only Send Tickets open at the bottom of a long page, the
  // newly-revealed block otherwise appears below the fold with nothing
  // scrolling it into view (mirrors how Eventbrite/Stripe reveal the next step).
  const configureRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedUser || noAccountRecipient) {
      configureRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [selectedUser, noAccountRecipient]);

  const getInitialTierValue = () => {
    if (!ticketTiers.length) return "";
    const first = ticketTiers[0];
    if (first.ticket_stages?.length) {
      const sorted = [...first.ticket_stages].sort(
        (a, b) => a.order_index - b.order_index,
      );
      return `${first.id}:${sorted[0].id}`;
    }
    return first.id;
  };
  const [bankTierId, setBankTierId] = useState(getInitialTierValue);

  // W7-H3: optional custom price for bank-transfer orders. Off by default (uses
  // the tier/stage price); toggling on reveals a dollar input pre-filled with
  // the selected tier/stage price. Server stays authoritative.
  const [bankCustomPrice, setBankCustomPrice] = useState(false);
  const [bankCustomPriceInput, setBankCustomPriceInput] = useState("");

  // Unit price (cents) for the currently-selected bank tier/stage — drives the
  // custom-price default and the computed total.
  const bankUnitPriceCents = useMemo(() => {
    if (!bankTierId) return 0;
    let tierId = bankTierId;
    let stageId: string | undefined;
    if (bankTierId.includes(":")) [tierId, stageId] = bankTierId.split(":");
    const tier = ticketTiers.find(t => t.id === tierId);
    if (!tier) return 0;
    if (stageId) {
      const stage = tier.ticket_stages?.find(s => s.id === stageId);
      return stage?.price_cents ?? tier.price_cents;
    }
    return tier.price_cents;
  }, [bankTierId, ticketTiers]);

  const parsedCustomCents = Math.round(
    parseFloat(bankCustomPriceInput) * 100,
  );
  const customPriceValid =
    !bankCustomPrice ||
    (Number.isFinite(parsedCustomCents) && parsedCustomCents > 0);
  const effectiveBankUnitCents =
    bankCustomPrice && customPriceValid ? parsedCustomCents : bankUnitPriceCents;
  const bankQtyNum = parseInt(quantity, 10);
  const bankTotalCents =
    effectiveBankUnitCents *
    (Number.isFinite(bankQtyNum) && bankQtyNum > 0 ? bankQtyNum : 0);

  const handleToggleCustomPrice = (checked: boolean) => {
    setBankCustomPrice(checked);
    if (checked) {
      // Pre-fill with the selected tier/stage price (only if empty so we don't
      // clobber a price the organizer already typed).
      setBankCustomPriceInput(prev =>
        prev ? prev : (bankUnitPriceCents / 100).toFixed(2),
      );
    } else {
      // Clear on turn-off so a later toggle-on pre-fills fresh from the
      // then-current tier (avoids a stale price after off → tier change → on).
      setBankCustomPriceInput("");
    }
  };

  const resetBankCustomPrice = () => {
    setBankCustomPrice(false);
    setBankCustomPriceInput("");
  };

  const filteredTickets = useMemo(
    () =>
      promotionalTickets
        .filter(t =>
          mode === "free" ? !t.is_bank_transfer : t.is_bank_transfer === true,
        )
        // Sort by purchase date, newest first. The API doesn't guarantee
        // ordering on `promotional_tickets` / `bank_transfer_orders`, so we
        // sort client-side. See MAY_2026_FIXES.md.
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
    [promotionalTickets, mode],
  );

  const handleSearch = async () => {
    setSearchError("");
    setSearchResults([]);
    if (!searchEmail.trim()) {
      setSearchError("Enter an email address.");
      return;
    }
    const term = searchEmail.trim();
    setLastSearchedEmail(term);
    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/organizer/search-users?email=${encodeURIComponent(term)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error || "Failed to search.");
        return;
      }
      const users = Array.isArray(data?.users) ? data.users : [];
      setSearchResults(users);
      if (!users.length) setSearchError("User not found.");
    } catch {
      setSearchError("An error occurred.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSend = async () => {
    setError("");
    setSuccess("");
    // Both modes accept either a selected Flame user or a no-account recipient
    // (comp 3a / bank-transfer 3b).
    const recipientEmail = selectedUser?.email ?? noAccountRecipient;
    if (!selectedUser && !noAccountRecipient) {
      setError("Please select a user first.");
      return;
    }
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1 || qty > 10) {
      setError("Quantity must be 1–10.");
      return;
    }
    setIsSending(true);
    try {
      if (mode === "free") {
        if (!selectedTierId) {
          setError("Select a ticket tier.");
          setIsSending(false);
          return;
        }
        const res = await fetch("/api/organizer/promotional-tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: eventId,
            ticket_tier_id: selectedTierId,
            quantity: qty,
            // user_id for an existing account; recipient_email for no-account.
            ...(selectedUser
              ? { user_id: selectedUser.id }
              : { recipient_email: noAccountRecipient }),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to send ticket.");
          return;
        }
        setSuccess(`Sent ${qty} free ticket(s) to ${recipientEmail}!`);
      } else {
        if (!bankTierId) {
          setError("Select a ticket tier.");
          setIsSending(false);
          return;
        }
        if (bankCustomPrice && !customPriceValid) {
          setError(
            "Custom price must be greater than $0. For free tickets, use Send Free Tickets.",
          );
          setIsSending(false);
          return;
        }
        let tierId = bankTierId,
          stageId: string | undefined;
        if (bankTierId.includes(":")) {
          [tierId, stageId] = bankTierId.split(":");
        }
        const res = await fetch("/api/organizer/bank-transfer-tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: eventId,
            ticket_tier_id: tierId,
            stage_id: stageId,
            quantity: qty,
            // user_id for an existing account; recipient_email for no-account (3b).
            ...(selectedUser
              ? { user_id: selectedUser.id }
              : { recipient_email: noAccountRecipient }),
            // W7-H3: only send the override when the toggle is on.
            ...(bankCustomPrice ? { unit_price_cents: parsedCustomCents } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to create order.");
          return;
        }
        setSuccess(`Bank transfer order created for ${recipientEmail}!`);
      }
      setSelectedUser(null);
      setNoAccountRecipient(null);
      setSearchEmail("");
      setQuantity("1");
      resetBankCustomPrice();
      onRefresh();
      setTimeout(() => setSuccess(""), 4000);
    } catch {
      setError("An error occurred.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Mode tabs */}
      <div className="flex gap-1 bg-white-5 rounded-pill p-1">
        {(["free", "bank_transfer"] as const).map(m => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError("");
              setSuccess("");
              setSelectedUser(null);
              setNoAccountRecipient(null);
              setSearchResults([]);
              setSearchEmail("");
              setSearchError("");
              setLastSearchedEmail("");
              resetBankCustomPrice();
            }}
            className={`flex-1 py-2 rounded-pill text-xs font-poppins-medium transition-colors cursor-pointer border-none ${
              mode === m
                ? "bg-white-100 text-dark"
                : "bg-transparent text-white-50 hover:text-white-80"
            }`}
          >
            {m === "free" ? "Send Free Tickets" : "Bank Transfer Orders"}
          </button>
        ))}
      </div>

      {error && <p className="text-red-400 text-xs font-poppins">{error}</p>}
      {success && (
        <p className="text-green-400 text-xs font-poppins">{success}</p>
      )}

      {/* Step 1: Find user */}
      <div className="flex flex-col gap-2">
        <p className="text-white-50 text-xs font-poppins-medium uppercase">
          Step 1: Find User
        </p>
        {selectedUser ? (
          <div className="flex items-center justify-between bg-white-5 border border-white-20 rounded-card px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-white-100 text-sm font-poppins-medium">
                {selectedUser.first_name} {selectedUser.last_name}
              </span>
              <span className="text-white-50 text-xs font-poppins">
                {selectedUser.email}
              </span>
            </div>
            <button
              onClick={() => {
                setSelectedUser(null);
                setSearchEmail("");
              }}
              className="text-white-50 hover:text-white-100 bg-transparent border-none cursor-pointer p-1"
            >
              <FiX size={16} />
            </button>
          </div>
        ) : noAccountRecipient ? (
          <div className="flex items-center justify-between bg-white-5 border border-white-20 rounded-card px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-white-100 text-sm font-poppins-medium">
                {noAccountRecipient}
              </span>
              <span className="text-white-50 text-xs font-poppins">
                No Flame account — ticket will be sent by email
              </span>
            </div>
            <button
              onClick={() => {
                setNoAccountRecipient(null);
                setSearchEmail("");
              }}
              className="text-white-50 hover:text-white-100 bg-transparent border-none cursor-pointer p-1"
            >
              <FiX size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="user@example.com"
                value={searchEmail}
                onChange={e => setSearchEmail(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !isSearching) handleSearch();
                }}
                disabled={isSearching}
                className="flex-1 bg-white-5 border border-white-20 rounded-pill px-4 py-2.5 text-white-100 text-sm font-poppins placeholder:text-white-50 outline-none focus:border-white-50 disabled:opacity-50"
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchEmail.trim()}
                className="bg-white-10 border border-white-20 text-white-100 text-sm font-poppins-medium rounded-pill px-4 py-2.5 cursor-pointer hover:bg-white-20 transition-colors disabled:opacity-50 border-none flex items-center gap-2"
              >
                <FiSearch size={16} />
                {isSearching ? "..." : "Search"}
              </button>
            </div>
            {searchError && (
              <p className="text-red-400 text-xs font-poppins">{searchError}</p>
            )}
            {/* W7-H2 (3a/3b): offer a no-account send when the email isn't a
                Flame user — works for both comp (free) and bank-transfer modes.
                Keyed off the last *searched* email, not the live input, so
                editing the field after a "not found" can't capture an
                unsearched address. */}
            {searchError === "User not found." && lastSearchedEmail && (
              <div className="flex flex-col gap-2 bg-white-5 border border-white-10 rounded-card p-3">
                <p className="text-white-70 text-xs font-poppins leading-4">
                  No Flame account found for{" "}
                  <span className="text-white-100 font-poppins-medium">
                    {lastSearchedEmail}
                  </span>
                  . You can still{" "}
                  {mode === "free" ? "send the ticket" : "create the order"} by
                  email — they scan the PDF QR at the door. (They won&apos;t see
                  it in &quot;My Tickets&quot; unless they sign up with that
                  email.)
                </p>
                <button
                  onClick={() => {
                    setNoAccountRecipient(lastSearchedEmail.toLowerCase());
                    setSearchError("");
                    setSearchResults([]);
                    setSearchEmail("");
                  }}
                  className="self-start bg-white-100 text-dark text-xs font-poppins-medium rounded-pill px-4 py-2 cursor-pointer hover:opacity-90 transition-opacity border-none"
                >
                  {mode === "free"
                    ? "Send without a Flame account"
                    : "Create order without a Flame account"}
                </button>
              </div>
            )}
            {searchResults.length > 0 && (
              <div className="flex flex-col gap-1 bg-white-5 rounded-card p-2">
                {searchResults.map(u => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setSelectedUser(u);
                      setSearchResults([]);
                      setSearchEmail("");
                    }}
                    className="flex items-center justify-between px-3 py-2 rounded-card hover:bg-white-10 transition-colors cursor-pointer bg-transparent border-none text-left"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-white-100 text-sm font-poppins-medium">
                        {u.first_name} {u.last_name}
                      </span>
                      <span className="text-white-50 text-xs font-poppins">
                        {u.email}
                      </span>
                    </div>
                    <span className="text-white-80 text-xs font-poppins-medium">
                      Select
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Step 2: Configure */}
      {(selectedUser || noAccountRecipient) && (
        <div ref={configureRef} className="flex flex-col gap-3">
          <p className="text-white-50 text-xs font-poppins-medium uppercase">
            Step 2: Configure Ticket
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-white-50 text-xs font-poppins-medium">
              Ticket Tier
            </label>
            <div className="relative">
              {mode === "free" ? (
                <select
                  value={selectedTierId}
                  onChange={e => setSelectedTierId(e.target.value)}
                  className="w-full appearance-none bg-white-5 border border-white-20 rounded-pill px-4 py-2.5 text-white-100 text-sm font-poppins outline-none focus:border-white-50 cursor-pointer pr-10"
                >
                  {ticketTiers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={bankTierId}
                  onChange={e => setBankTierId(e.target.value)}
                  className="w-full appearance-none bg-white-5 border border-white-20 rounded-pill px-4 py-2.5 text-white-100 text-sm font-poppins outline-none focus:border-white-50 cursor-pointer pr-10"
                >
                  {ticketTiers.flatMap(t => {
                    if (t.ticket_stages?.length) {
                      return [...t.ticket_stages]
                        .sort((a, b) => a.order_index - b.order_index)
                        .map(s => (
                          <option
                            key={`${t.id}:${s.id}`}
                            value={`${t.id}:${s.id}`}
                          >
                            {t.name} - {s.name} (
                            {formatCentsAsPrice(
                              s.price_cents,
                              currency || "USD",
                            )}
                            )
                          </option>
                        ));
                    }
                    return [
                      <option key={t.id} value={t.id}>
                        {t.name} (
                        {formatCentsAsPrice(t.price_cents, currency || "USD")})
                      </option>,
                    ];
                  })}
                </select>
              )}
              <FiChevronDown
                size={16}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white-50 pointer-events-none"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-white-50 text-xs font-poppins-medium">
              Quantity (1–10)
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              className="bg-white-5 border border-white-20 rounded-pill px-4 py-2.5 text-white-100 text-sm font-poppins outline-none focus:border-white-50 w-32"
            />
          </div>

          {/* W7-H3: custom price (bank-transfer only) */}
          {mode === "bank_transfer" && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={bankCustomPrice}
                  onChange={e => handleToggleCustomPrice(e.target.checked)}
                  className="accent-white-100 cursor-pointer"
                />
                <span className="text-white-80 text-xs font-poppins-medium">
                  Set custom price
                </span>
              </label>
              {bankCustomPrice && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-white-50 text-xs font-poppins-medium">
                    Price per ticket
                  </label>
                  <div className="relative w-32">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white-50 text-sm font-poppins pointer-events-none">
                      $
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={bankCustomPriceInput}
                      onChange={e => setBankCustomPriceInput(e.target.value)}
                      className="bg-white-5 border border-white-20 rounded-pill pl-7 pr-4 py-2.5 text-white-100 text-sm font-poppins outline-none focus:border-white-50 w-full"
                    />
                  </div>
                  {!customPriceValid && (
                    <p className="text-red-400 text-xs font-poppins">
                      Enter a price greater than $0 (use Send Free Tickets for
                      free tickets).
                    </p>
                  )}
                </div>
              )}
              {customPriceValid && bankTotalCents > 0 && (
                <p className="text-white-50 text-xs font-poppins">
                  Total:{" "}
                  <span className="text-white-100 font-poppins-medium">
                    {formatCentsAsPrice(bankTotalCents, currency || "USD")}
                  </span>
                </p>
              )}
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={
              isSending ||
              (mode === "bank_transfer" && bankCustomPrice && !customPriceValid)
            }
            className="bg-white-100 rounded-pill py-2.5 text-dark text-sm font-poppins-medium cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60 border-none"
          >
            {isSending
              ? "Sending..."
              : mode === "free"
                ? "Send Free Ticket"
                : "Create Bank Transfer Order"}
          </button>
        </div>
      )}

      {/* List of sent tickets — accordion toggle */}
      {filteredTickets.length > 0 && (
        <div className="pt-3 mt-3 border-t border-white-10">
          <button
            type="button"
            onClick={() => setSentExpanded(prev => !prev)}
            aria-expanded={sentExpanded}
            aria-controls="org-send-tickets-sent-panel"
            className="flex items-center justify-between w-full bg-transparent border-none cursor-pointer p-0 py-0.5"
          >
            <span className="text-white-100 text-xs font-poppins-medium">
              {mode === "free" ? "Sent" : "Sent"} ({filteredTickets.length})
            </span>
            <span className="text-white-80 text-lg">
              {sentExpanded ? "▲" : "▼"}
            </span>
          </button>
          <div
            id="org-send-tickets-sent-panel"
            role="region"
            aria-label={
              mode === "free"
                ? "Sent complimentary tickets"
                : "Sent bank transfer tickets"
            }
            hidden={!sentExpanded}
            className="flex flex-col gap-1.5 mt-1.5"
          >
            {filteredTickets.map(t => {
                const qty = t.is_bank_transfer
                  ? t.order_quantity || 1
                  : t.quantity || 1;
                // Modern bank-transfer orders (post-2026-01-15) store
                // `total_cents` as the base subtotal — no platform fees are
                // baked in. `getBasePriceFromTicket` returns the value as-is in
                // that case, falling back to `extractBasePriceHistorical` only
                // for legacy rows that did roll fees into `total_cents`. See
                // MAY_2026_FIXES.md for the bug this replaced.
                const cost = t.is_bank_transfer
                  ? t.order_total_cents
                    ? formatCentsAsPrice(
                        getBasePriceFromTicket(
                          t.order_total_cents,
                          t.created_at,
                        ),
                        currency || "USD",
                      )
                    : formatCentsAsPrice(0, currency || "USD")
                  : "Complimentary";
                return (
                  <div
                    key={t.id}
                    className="border border-white-20 rounded-card p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white-100 text-sm font-poppins-semibold m-0 truncate">
                        {t.customer_name}
                      </p>
                      <p className="text-white-50 text-xs font-poppins-light m-0 mt-0.5">
                        {t.ticket_tiers.name}
                        {t.metadata?.stage_name
                          ? ` - ${t.metadata.stage_name}`
                          : ""}
                      </p>
                      <p className="text-white-50 text-xs font-poppins-light m-0 mt-0.5">
                        {qty}x · {t.email}
                      </p>
                    </div>
                    <span className="text-white-50 text-xs font-poppins shrink-0">
                      {cost}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Promoter Links Section ───────────────────────────────────────────────────

interface PromoterLink {
  id: string;
  promoter_code: string;
  promoter_name?: string | null;
  total_tickets_sold: number;
  total_revenue_cents: number;
}

function PromoterLinksSection({
  eventId,
  eventSlug,
  promoterLinks,
  currency,
  onRefresh,
}: {
  eventId: string;
  eventSlug: string;
  promoterLinks: PromoterLink[];
  currency?: string;
  onRefresh: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleCreate = async () => {
    setError("");
    setSuccess("");
    if (!code.trim() || code.trim().length < 3) {
      setError("Code must be at least 3 characters.");
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetch("/api/organizer/promoter-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          promoter_code: code.trim().toUpperCase(),
          promoter_name: name.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create link.");
        return;
      }
      setSuccess(`Link "${data.promoter_link.promoter_code}" created.`);
      setCode("");
      setName("");
      onRefresh();
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("An error occurred.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (linkId: string) => {
    if (confirmDeleteId !== linkId) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setConfirmDeleteId(linkId);
      timerRef.current = setTimeout(() => setConfirmDeleteId(null), 3000);
      return;
    }
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/organizer/promoter-links/${linkId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to delete.");
        return;
      }
      onRefresh();
    } catch {
      setError("An error occurred.");
    }
  };

  const handleCopy = async (pCode: string, linkId: string) => {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/events/${eventSlug}?promoter=${encodeURIComponent(pCode)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(linkId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for browsers where clipboard API is unavailable
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedId(linkId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-red-400 text-xs font-poppins">{error}</p>}
      {success && (
        <p className="text-green-400 text-xs font-poppins">{success}</p>
      )}

      {/* Create form */}
      <div className="flex flex-col gap-3 bg-white-5 rounded-card p-4">
        <p className="text-white-50 text-xs font-poppins-medium uppercase m-0">
          Create Promoter Link
        </p>
        <input
          value={code}
          onChange={e =>
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
          }
          placeholder="PROMOTER2025"
          maxLength={50}
          className="bg-white-5 border border-white-20 rounded-pill px-4 py-2.5 text-white-100 text-sm font-poppins placeholder:text-white-50 outline-none focus:border-white-50"
        />
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Promoter Name (optional)"
          maxLength={255}
          className="bg-white-5 border border-white-20 rounded-pill px-4 py-2.5 text-white-100 text-sm font-poppins placeholder:text-white-50 outline-none focus:border-white-50"
        />
        <button
          onClick={handleCreate}
          disabled={isCreating || !code.trim()}
          className="bg-white-100 rounded-pill py-2.5 text-dark text-sm font-poppins-medium cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60 border-none"
        >
          {isCreating ? "Creating..." : "Generate Link"}
        </button>
      </div>

      {/* Links list */}
      {promoterLinks.length > 0 ? (
        <div className="flex flex-col gap-2">
          {promoterLinks.map(link => {
            const url = `${typeof window !== "undefined" ? window.location.origin : ""}/events/${eventSlug}?promoter=${encodeURIComponent(link.promoter_code)}`;
            return (
              <div
                key={link.id}
                className="bg-white-5 border border-white-20 rounded-card p-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-white-100 text-sm font-poppins-semibold">
                      {link.promoter_code}
                    </span>
                    {link.promoter_name && (
                      <span className="text-white-50 text-xs font-poppins">
                        {link.promoter_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopy(link.promoter_code, link.id)}
                      className="w-8 h-8 rounded-full bg-white-10 flex items-center justify-center text-white-100 hover:bg-white-20 transition-colors bg-transparent border-none cursor-pointer"
                    >
                      {copiedId === link.id ? (
                        <FiCheck size={14} />
                      ) : (
                        <FiCopy size={14} />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(link.id)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-poppins-medium transition-colors cursor-pointer border-none ${
                        confirmDeleteId === link.id
                          ? "bg-red-500/20 text-red-400 text-[10px]"
                          : "bg-white-10 text-white-50 hover:bg-white-20"
                      }`}
                    >
                      {confirmDeleteId === link.id ? "?" : <FiX size={14} />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-white-50 text-xs font-poppins">
                    Sold:{" "}
                    <span className="text-white-100 font-poppins-medium">
                      {link.total_tickets_sold}
                    </span>
                  </span>
                  <span className="text-white-50 text-xs font-poppins">
                    Revenue:{" "}
                    <span className="text-white-100 font-poppins-medium">
                      {formatCentsAsPrice(
                        link.total_revenue_cents,
                        currency || "USD",
                      )}
                    </span>
                  </span>
                </div>
                <p className="text-white-30 text-[10px] font-poppins truncate m-0">
                  {url}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-white-50 text-sm font-poppins">
          No promoter links yet.
        </p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OrgEventDetailClient({
  eventId,
  orgSlug,
}: OrgEventDetailClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, error, isRefetching } = useOrganizerData(orgSlug);
  const deleteTicketTierMutation = useDeleteTicketTier();

  // Look up the event in primary events first, then fall back to cohost_events
  // for users whose org is a cohost (not owner) of this event. Without the
  // fallback, cohost org members hit "event not found" even though W3-B1 grants
  // them RSVP-management access.
  const event = useMemo(() => {
    const primary = data?.events?.find(e => e.id === eventId);
    if (primary) return primary;
    const cohosted = data?.cohost_events?.find(c => c.event.id === eventId);
    return (cohosted?.event as OrganizerEvent | undefined) ?? null;
  }, [data, eventId]);

  // True when the currently selected org owns this event. Cohost views see the
  // event via `data.cohost_events`, where `event.organization_id` is the owner
  // org's id — different from `data.organization.id`. Owner-only UI (add /
  // remove cohosts, etc.) must be gated on this so cohost orgs don't see
  // actions the API will reject.
  const isOwnerOrg = Boolean(
    event &&
      data?.organization?.id &&
      event.organization_id === data.organization.id,
  );

  const [sections, setSections] = useState<SectionVisibility>({
    promotions: false,
    sendTickets: false,
    promoterLinks: false,
    purchasedDetails: false,
  });

  // ── Edit mode state (ported from OrganizerDashboard) ──────────────────────
  const [editingEventData, setEditingEventData] = useState<{
    eventId: string;
    eventSlug: string;
    originalStartsAt: string;
    startsAt: string;
    endsAt: string;
    venue: string;
    city: string;
    dateChanged: boolean;
    tiersNeedUpdate: string[];
    imageUrl: string;
    originalImageUrl: string;
    /** Whether this event requires RSVP approval. Read-only in the edit UI —
     *  registration-form editing only applies to RSVP events. */
    requiresRsvp: boolean;
    /** Toggle mirror of whether a registration form is attached to the event. */
    registrationFormEnabled: boolean;
    /** Editable copy of the event's `registration_form_config`. */
    registrationFields: FormField[];
    /** Stable string snapshot of the original config so we only send a PATCH
     *  for `registration_form_config` when it actually changed. */
    originalRegistrationConfigJson: string;
  } | null>(null);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [savingEventId, setSavingEventId] = useState<string | null>(null);
  const [editingImagePreview, setEditingImagePreview] = useState<string>("");
  const [editingImageFile, setEditingImageFile] = useState<File | null>(null);
  const [pendingImageBlob, setPendingImageBlob] = useState<Blob | null>(null);
  const [hasPendingImageUpload, setHasPendingImageUpload] = useState(false);
  const imageUploadAbortController = useRef<AbortController | null>(null);
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [showingAddForm, setShowingAddForm] = useState<string | null>(null);
  const [confirmDeleteTierId, setConfirmDeleteTierId] = useState<string | null>(
    null,
  );
  const deleteConfirmationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isTierOperationInProgress, setIsTierOperationInProgress] =
    useState(false);
  const [cohostModalOpen, setCohostModalOpen] = useState(false);

  // Current cohosts count for this event (shown in the inline trigger card).
  // Returns the array directly (matches useEventCohosts inside the modal so
  // both share the same React Query cache entry under the same queryKey).
  const cohostsQuery = useTanQuery<Array<{ id: string }>>({
    queryKey: ["cohost-assignments", data?.organization?.id, eventId],
    queryFn: async () => {
      const res = await fetch(
        `/api/organizations/${data!.organization.id}/cohost-assignments?event_id=${eventId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch cohosts");
      const json = await res.json();
      return (json.assignments ?? []) as Array<{ id: string }>;
    },
    enabled: Boolean(data?.organization?.id && eventId),
    staleTime: 30 * 1000,
  });
  const currentCohostCount = cohostsQuery.data?.length ?? 0;

  useEffect(() => {
    return () => {
      if (deleteConfirmationTimerRef.current)
        clearTimeout(deleteConfirmationTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isTierOperationInProgress && !isRefetching)
      setIsTierOperationInProgress(false);
  }, [isRefetching, isTierOperationInProgress]);

  // ── Edit handlers ─────────────────────────────────────────────────────────

  const handleEditEvent = useCallback((ev: OrganizerEvent) => {
    const ticketTiers = [...(ev.ticket_tiers || [])].sort(
      (a, b) => a.price_cents - b.price_cents,
    );
    const eventEndDate = new Date(ev.ends_at);
    const tiersNeedUpdate: string[] = [];
    for (const tier of ticketTiers) {
      if (tier.sales_end && new Date(tier.sales_end) > eventEndDate)
        tiersNeedUpdate.push(tier.id);
    }
    const existingFields: FormField[] = Array.isArray(
      ev.registration_form_config,
    )
      ? ev.registration_form_config
      : [];
    // Derive the toggle from non-archived fields only. An event whose config
    // contains only archived entries has its form effectively disabled (new
    // registrants see no fields); the toggle should reflect that so the organizer
    // doesn't see the builder as "on" for a disabled-but-historically-labelled
    // config. registrationFields keeps the full set (including archived) so the
    // builder can display archived cards and the save path can preserve them.
    const activeFields = existingFields.filter(f => !f.archived);
    setEditingEventData({
      eventId: ev.id,
      eventSlug: ev.slug,
      originalStartsAt: ev.starts_at,
      startsAt: utcToEcuadorLocal(ev.starts_at),
      endsAt: utcToEcuadorLocal(ev.ends_at),
      venue: ev.venue,
      city: ev.city,
      dateChanged: false,
      tiersNeedUpdate,
      imageUrl: ev.image_url || "",
      originalImageUrl: ev.image_url || "",
      requiresRsvp: ev.requires_rsvp === true,
      registrationFormEnabled: activeFields.length > 0,
      registrationFields: existingFields,
      originalRegistrationConfigJson: JSON.stringify(
        existingFields.length > 0 ? existingFields : null,
      ),
    });
    setEditingImagePreview(ev.image_url || "");
    setEditingImageFile(null);
  }, []);

  const handleEventDataChange = useCallback(
    (field: "startsAt" | "endsAt" | "venue" | "city", value: string) => {
      if (!editingEventData) return;
      const newData = { ...editingEventData, [field]: value };
      if (field === "startsAt") {
        const originalDate = new Date(editingEventData.originalStartsAt);
        const newDateUtc = ecuadorLocalToUtc(value);
        if (!newDateUtc) {
          setEditingEventData(newData);
          return;
        }
        const newDate = new Date(newDateUtc);
        if (isNaN(newDate.getTime())) {
          setEditingEventData(newData);
          return;
        }
        newData.dateChanged = originalDate.getTime() !== newDate.getTime();
      }
      if (field === "endsAt") {
        const newEndsAtUtc = ecuadorLocalToUtc(value);
        if (newEndsAtUtc) {
          const newEndsAt = new Date(newEndsAtUtc);
          if (!isNaN(newEndsAt.getTime())) {
            const ticketTiers = [...(event?.ticket_tiers || [])].sort(
              (a, b) => a.price_cents - b.price_cents,
            );
            const tiersNeedUpdate: string[] = [];
            for (const tier of ticketTiers) {
              if (!tier.sales_end) continue;
              const tierSalesEnd = new Date(tier.sales_end);
              if (isNaN(tierSalesEnd.getTime())) continue;
              if (tierSalesEnd.getTime() > newEndsAt.getTime()) tiersNeedUpdate.push(tier.id);
            }
            newData.tiersNeedUpdate = tiersNeedUpdate;
          }
        }
      }
      setEditingEventData(newData);
    },
    [editingEventData, event],
  );

  const handleTierUpdated = useCallback(
    async (tierId: string) => {
      if (!editingEventData) return;
      try {
        const startsAt = ecuadorLocalToUtc(editingEventData.startsAt);
        if (!startsAt) return;
        const res = await fetch(
          `/api/ticket-tiers?event_id=${editingEventData.eventId}`,
        );
        if (!res.ok) return;
        const { tiers } = await res.json();
        const updatedTier = tiers.find(
          (t: { id: string; sales_end?: string }) => t.id === tierId,
        );
        if (!updatedTier?.sales_end) return;
        if (new Date(updatedTier.sales_end) < new Date(startsAt)) {
          setEditingEventData(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              tiersNeedUpdate: prev.tiersNeedUpdate.filter(
                id => id !== tierId,
              ),
            };
          });
        }
      } catch {
        // Silently fail — tier stays in tiersNeedUpdate list
      }
    },
    [editingEventData],
  );

  const handleDiscardEventChanges = useCallback(() => {
    if (imageUploadAbortController.current) {
      imageUploadAbortController.current.abort();
      imageUploadAbortController.current = null;
    }
    if (editingImagePreview?.startsWith("blob:"))
      URL.revokeObjectURL(editingImagePreview);
    setEditingEventData(null);
    setEditingImagePreview("");
    setEditingImageFile(null);
    setSavingEventId(null);
    setPendingImageBlob(null);
    setHasPendingImageUpload(false);
    setEditingTierId(null);
    setShowingAddForm(null);
  }, [editingImagePreview]);

  const handleEditingImageUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        alert("Please select a valid image file");
        return;
      }
      if (file.size > 4.5 * 1024 * 1024) {
        alert("Image size must be less than 4.5MB");
        return;
      }
      if (imageUploadAbortController.current) {
        imageUploadAbortController.current.abort();
        imageUploadAbortController.current = null;
      }
      try {
        setEditingImageFile(file);
        const resizedBlob = await resizeImageTo4x5(file);
        if (editingImagePreview?.startsWith("blob:"))
          URL.revokeObjectURL(editingImagePreview);
        const previewUrl = URL.createObjectURL(resizedBlob);
        setEditingImagePreview(previewUrl);
        setPendingImageBlob(resizedBlob);
        setHasPendingImageUpload(true);
        if (editingEventData)
          setEditingEventData({ ...editingEventData, imageUrl: previewUrl });
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to process image.");
        if (editingImagePreview?.startsWith("blob:"))
          URL.revokeObjectURL(editingImagePreview);
        setEditingImageFile(null);
        setEditingImagePreview(editingEventData?.originalImageUrl || "");
        setPendingImageBlob(null);
        setHasPendingImageUpload(false);
        if (editingEventData)
          setEditingEventData({
            ...editingEventData,
            imageUrl: editingEventData.originalImageUrl,
          });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [editingEventData, editingImagePreview],
  );

  const handleEditingImageRemove = useCallback(() => {
    if (imageUploadAbortController.current) {
      imageUploadAbortController.current.abort();
      imageUploadAbortController.current = null;
    }
    if (editingImagePreview?.startsWith("blob:"))
      URL.revokeObjectURL(editingImagePreview);
    setEditingImageFile(null);
    setEditingImagePreview("");
    setPendingImageBlob(null);
    setHasPendingImageUpload(false);
    if (editingEventData)
      setEditingEventData({ ...editingEventData, imageUrl: "" });
  }, [editingEventData, editingImagePreview]);

  const handleEditingImageDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("dragover");
  };
  const handleEditingImageDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("dragover");
  };
  const handleEditingImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("dragover");
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleEditingImageUpload(files[0]);
  };

  const handleSaveEventChanges = useCallback(async () => {
    if (!editingEventData) return;
    setSavingEventId(editingEventData.eventId);
    const startsAtUtc = ecuadorLocalToUtc(editingEventData.startsAt);
    const endsAtUtc = ecuadorLocalToUtc(editingEventData.endsAt);
    if (!startsAtUtc || !endsAtUtc) {
      alert("Invalid date format. Please check your date inputs.");
      setSavingEventId(null);
      return;
    }
    const startsAt = new Date(startsAtUtc);
    const endsAt = new Date(endsAtUtc);
    if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
      alert("Invalid date format. Please check your date inputs.");
      setSavingEventId(null);
      return;
    }
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
    if (startsAt < twoHoursFromNow) {
      alert("Event start time must be at least 2 hours in the future");
      setSavingEventId(null);
      return;
    }
    if (endsAt <= startsAt) {
      alert("End date must be after start date");
      setSavingEventId(null);
      return;
    }
    if (editingEventData.tiersNeedUpdate.length > 0) {
      alert("Please update all ticket tier sales times before saving.");
      setSavingEventId(null);
      return;
    }
    setIsSavingEvent(true);
    try {
      const tiersResponse = await fetch(
        `/api/ticket-tiers?event_id=${editingEventData.eventId}`,
      );
      if (!tiersResponse.ok) throw new Error("Failed to fetch ticket tiers");
      const { tiers: ticketTiers } = await tiersResponse.json();
      for (const tier of ticketTiers) {
        if (new Date(tier.sales_end) > endsAt) {
          alert(
            `Ticket tier "${tier.name}" sales must end before the event ends.`,
          );
          setIsSavingEvent(false);
          setSavingEventId(null);
          return;
        }
      }
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Error validating ticket tiers",
      );
      setIsSavingEvent(false);
      setSavingEventId(null);
      return;
    }
    try {
      let finalImageUrl = editingEventData.imageUrl;
      if (hasPendingImageUpload && pendingImageBlob && editingImageFile) {
        imageUploadAbortController.current = new AbortController();
        if (!editingEventData.eventSlug)
          throw new Error("Event slug is missing.");
        const resizedFile = new File(
          [pendingImageBlob],
          editingImageFile.name,
          { type: "image/jpeg" },
        );
        const uploadFormData = new FormData();
        uploadFormData.append("file", resizedFile);
        // Prefer eventId (UUID) — slug is only unique per-org; a cross-org
        // draft collision would make a slug-only lookup ambiguous. See
        // /api/upload-image route for rationale.
        uploadFormData.append("eventId", editingEventData.eventId);
        uploadFormData.append("eventSlug", editingEventData.eventSlug);
        const uploadResponse = await fetch("/api/upload-image", {
          method: "POST",
          body: uploadFormData,
          signal: imageUploadAbortController.current.signal,
        });
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json();
          throw new Error(errorData.error || "Failed to upload image");
        }
        const { url } = await uploadResponse.json();
        finalImageUrl = url;
        setPendingImageBlob(null);
        setHasPendingImageUpload(false);
        imageUploadAbortController.current = null;
      }
      const updatePayload: any = {
        id: editingEventData.eventId,
        starts_at: startsAtUtc,
        ends_at: endsAtUtc,
        venue: editingEventData.venue,
        city: editingEventData.city,
      };
      if (finalImageUrl !== editingEventData.originalImageUrl)
        updatePayload.image_url = finalImageUrl;

      // Only include registration_form_config in the PATCH when it changed.
      // Drop blank-label drafts before diffing — creating the empty field is a
      // UI affordance and shouldn't touch the DB unless the organizer filled
      // something in.
      //
      // Archived-field preservation rule: if the organizer disables the form
      // toggle, we must NOT send `null` when there are archived fields — that
      // would wipe the field definitions and break their labels in historical
      // RSVP detail views and exports (#132). Instead we keep only the archived
      // entries in the config. `hasFormConfig` in EventDetail.tsx already
      // filters for non-archived fields, so a config that is all-archived will
      // correctly not show the form to new registrants.
      if (editingEventData.requiresRsvp) {
        let cleaned: typeof editingEventData.registrationFields;
        if (editingEventData.registrationFormEnabled) {
          // Normal path: keep all non-blank fields (archived + active).
          cleaned = editingEventData.registrationFields.filter(
            f => f.label.trim() !== "",
          );
        } else {
          // Form disabled: drop active fields but preserve archived ones so
          // historical RSVP answers remain labeled.
          cleaned = editingEventData.registrationFields.filter(
            f => f.archived && f.label.trim() !== "",
          );
        }
        const nextJson = JSON.stringify(cleaned.length > 0 ? cleaned : null);
        if (nextJson !== editingEventData.originalRegistrationConfigJson) {
          updatePayload.registration_form_config =
            cleaned.length > 0 ? cleaned : null;
        }
      }
      const response = await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update event");
      }
      if (editingImagePreview?.startsWith("blob:"))
        URL.revokeObjectURL(editingImagePreview);
      setEditingEventData(null);
      setEditingImagePreview("");
      setEditingImageFile(null);
      setPendingImageBlob(null);
      setHasPendingImageUpload(false);
      imageUploadAbortController.current = null;
      setEditingTierId(null);
      setShowingAddForm(null);
      await queryClient.refetchQueries({ queryKey: ["organizer-data"] });
      router.refresh();
      setSavingEventId(null);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "An error occurred while saving",
      );
      setSavingEventId(null);
      imageUploadAbortController.current = null;
    } finally {
      setIsSavingEvent(false);
    }
  }, [
    editingEventData,
    hasPendingImageUpload,
    pendingImageBlob,
    editingImageFile,
    editingImagePreview,
    queryClient,
    router,
  ]);

  const handleEditTier = useCallback((tier: any) => {
    setEditingTierId(tier.id);
    setShowingAddForm(null);
  }, []);

  const handleAddTier = useCallback((evId: string) => {
    setShowingAddForm(evId);
    setEditingTierId(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingTierId(null);
    setShowingAddForm(null);
  }, []);

  const handleModalSuccess = useCallback(async () => {
    setEditingTierId(null);
    setShowingAddForm(null);
    setIsTierOperationInProgress(true);
    await queryClient.refetchQueries({ queryKey: ["organizer-data"] });
    router.refresh();
  }, [queryClient, router]);

  const handleDeleteTier = useCallback(
    (tierId: string, tier?: TicketTier) => {
      const hasTicketsSold =
        (tier?.quantity_sold ?? 0) > 0 ||
        (tier?.ticket_stages &&
          tier.ticket_stages.some(
            (s: NonNullable<TicketTier["ticket_stages"]>[number]) =>
              s.sold_quantity > 0,
          ));
      if (hasTicketsSold) {
        alert("Cannot delete a tier with sold tickets.");
        return;
      }
      if (confirmDeleteTierId !== tierId) {
        setConfirmDeleteTierId(tierId);
        if (deleteConfirmationTimerRef.current)
          clearTimeout(deleteConfirmationTimerRef.current);
        deleteConfirmationTimerRef.current = setTimeout(() => {
          setConfirmDeleteTierId(null);
          deleteConfirmationTimerRef.current = null;
        }, 3000);
        return;
      }
      setConfirmDeleteTierId(null);
      if (deleteConfirmationTimerRef.current) {
        clearTimeout(deleteConfirmationTimerRef.current);
        deleteConfirmationTimerRef.current = null;
      }
      deleteTicketTierMutation.mutate(tierId, {
        onSuccess: async () => {
          setIsTierOperationInProgress(true);
          await queryClient.refetchQueries({ queryKey: ["organizer-data"] });
          router.refresh();
        },
        onError: (err: Error) => {
          alert(err.message || "Error deleting ticket tier");
        },
      });
    },
    [confirmDeleteTierId, deleteTicketTierMutation, queryClient, router],
  );

  // ─────────────────────────────────────────────────────────────────────────

  const toggleSection = useCallback((key: SectionKey) => {
    setSections(prev => {
      const next = { ...prev, [key]: !prev[key] };
      return next;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    queryClient.refetchQueries({ queryKey: ["organizer-data"] });
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner title="Loading event" subtitle="Please wait..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <p className="text-white-100 text-lg font-poppins-semibold">
            Failed to load event
          </p>
          <button
            onClick={() => router.back()}
            className="bg-white-10 border border-white-20 text-white-100 text-sm font-poppins-medium rounded-pill px-6 py-2 hover:bg-white-20 transition-colors cursor-pointer"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <p className="text-white-100 text-lg font-poppins-semibold">
            Event not found
          </p>
          <button
            onClick={() => router.back()}
            className="bg-white-10 border border-white-20 text-white-100 text-sm font-poppins-medium rounded-pill px-6 py-2 hover:bg-white-20 transition-colors cursor-pointer"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const imageUrl = event.image_url || DEFAULT_IMAGE;
  const purchases = event.purchases || [];
  const promotionalTickets: PromotionalTicket[] = [
    ...(event.promotional_tickets || []),
    ...(event.bank_transfer_orders || []),
  ].sort(
    (a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const promoCodes: PromoCode[] = event.promotional_codes || [];
  const promoterLinks: PromoterLink[] = event.promoter_links || [];

  const formattedDate = new Date(event.starts_at).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const formattedTime = new Date(event.starts_at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[800px] mx-auto px-4 pt-24 pb-16 flex flex-col gap-[30px]">
        {/* Back button + Event name + Edit */}
        <div className="flex flex-col gap-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-white-100 text-sm font-poppins bg-transparent border-none cursor-pointer p-0 w-fit hover:text-white-80 transition-colors"
          >
            <FiArrowLeft size={20} />
            Go Back
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl leading-8 font-poppins-medium text-white-100 m-0 uppercase flex-1">
              {event.name}
            </h1>
            {!editingEventData ? (
              <button
                onClick={() => handleEditEvent(event)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-card text-xs font-poppins-medium transition-colors cursor-pointer border bg-white-10 text-white-100 border-white-20 hover:bg-white-20"
              >
                <FiEdit2 size={14} />
                Edit
              </button>
            ) : (
              <button
                onClick={handleDiscardEventChanges}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-card text-xs font-poppins-medium transition-colors cursor-pointer border bg-transparent text-white-50 border-white-20 hover:bg-white-10"
              >
                <FiX size={14} />
                Exit Edit
              </button>
            )}
          </div>

          {/* Co-hosts row — opens the assignment modal. Owner-only: cohost
              orgs would 404 on POST since the API requires the event to belong
              to the requesting org. Hide rather than expose a broken action. */}
          {isOwnerOrg && (
            <button
              onClick={() => setCohostModalOpen(true)}
              className="flex items-center justify-between gap-3 bg-white-5 border border-white-10 rounded-card px-4 py-3 hover:border-white-20 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FiUsers size={18} className="text-white-50 shrink-0" />
                <div className="min-w-0">
                  <p className="text-white-100 text-sm font-poppins-medium m-0">
                    Co-hosts
                  </p>
                  <p className="text-white-50 text-xs font-poppins m-0">
                    {cohostsQuery.isLoading
                      ? "Loading…"
                      : currentCohostCount === 0
                      ? "No co-hosts yet"
                      : `${currentCohostCount} co-host${currentCohostCount > 1 ? "s" : ""}`}
                  </p>
                </div>
              </div>
              <span className="text-accent text-xs font-poppins-medium shrink-0">
                Manage
              </span>
            </button>
          )}
        </div>

        {editingEventData ? (
          /* ── Inline Edit Form ───────────────────────────────────────────── */
          <div className="flex flex-col gap-4">
            {/* Event Details card */}
            <div className="bg-white-5 rounded-card border border-white-20 p-6">
              <div className="flex justify-between items-center mb-5 pb-3 border-b border-white-20">
                <h3 className="text-xl font-poppins-semibold text-white-100 m-0 flex items-center gap-2">
                  <FiCalendar size={20} />
                  Event Details
                </h3>
              </div>

              {editingEventData.tiersNeedUpdate.length > 0 && (
                <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-card p-4 mb-5">
                  <FiAlertTriangle
                    size={26}
                    className="text-yellow-500 shrink-0"
                  />
                  <div className="flex-1">
                    <strong className="block text-yellow-400 font-poppins-semibold mb-1">
                      Ticket tier conflicts detected!
                    </strong>
                    <p className="m-0 text-white-70 text-sm font-poppins">
                      {editingEventData.dateChanged
                        ? "You must manually update all ticket tier sales times before saving."
                        : "Some ticket tiers have sales end times that conflict. Please update them before saving."}{" "}
                      {editingEventData.tiersNeedUpdate.length} tier(s) need
                      updating.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-4">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="edit-venue"
                    className="font-poppins-medium text-white-70 text-sm m-0 flex items-center gap-1"
                  >
                    Venue *
                  </label>
                  <input
                    type="text"
                    id="edit-venue"
                    value={editingEventData.venue}
                    onChange={e =>
                      handleEventDataChange("venue", e.target.value)
                    }
                    placeholder="Golden Gate Park"
                    className="bg-white-5 border border-white-20 rounded-xl px-3 py-2 text-sm text-white-100 font-poppins transition-all focus:outline-none focus:border-white-50 focus:bg-white-10"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="edit-city"
                    className="font-poppins-medium text-white-70 text-sm m-0 flex items-center gap-1"
                  >
                    <FiMapPin size={16} />
                    City *
                  </label>
                  <CityAutocompleteField
                    id="edit-city"
                    value={editingEventData.city}
                    onChange={city => handleEventDataChange("city", city)}
                    placeholder="San Francisco"
                    className="bg-white-5 border border-white-20 rounded-xl px-3 py-2 text-sm text-white-100 font-poppins transition-all focus:outline-none focus:border-white-50 focus:bg-white-10 w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-4">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="edit-starts-at"
                    className="font-poppins-medium text-white-70 text-sm m-0 flex items-center gap-1"
                  >
                    <FiCalendar size={16} />
                    Start Date &amp; Time *
                  </label>
                  <input
                    type="datetime-local"
                    id="edit-starts-at"
                    value={editingEventData.startsAt}
                    min={getEcuadorNow(2)}
                    onChange={e =>
                      handleEventDataChange("startsAt", e.target.value)
                    }
                    className="bg-white-5 border border-white-20 rounded-xl px-3 py-2 text-sm text-white-100 font-poppins transition-all focus:outline-none focus:border-white-50 focus:bg-white-10 scheme-dark"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="edit-ends-at"
                    className="font-poppins-medium text-white-70 text-sm m-0 flex items-center gap-1"
                  >
                    <FiClock size={16} />
                    End Date &amp; Time *
                  </label>
                  <input
                    type="datetime-local"
                    id="edit-ends-at"
                    value={editingEventData.endsAt}
                    min={getEcuadorNow(2)}
                    onChange={e =>
                      handleEventDataChange("endsAt", e.target.value)
                    }
                    className="bg-white-5 border border-white-20 rounded-xl px-3 py-2 text-sm text-white-100 font-poppins transition-all focus:outline-none focus:border-white-50 focus:bg-white-10 scheme-dark"
                  />
                </div>
              </div>

              <p className="text-[0.8125rem] text-white-50 leading-relaxed my-1.5 font-poppins [&>strong]:text-white-80 [&>strong]:font-poppins-semibold">
                <strong>Note:</strong> Events must start at least 2 hours in the
                future, and ticket sales must end before the event ends. If
                you change the event start time and it conflicts with a ticket
                tier sales end time, you will see an alert and you must manually
                update conflicting ticket tier sales times to match the new
                event start time.
              </p>
              <p className="text-[0.8125rem] text-white-50 leading-relaxed my-1.5 font-poppins [&>strong]:text-white-80 [&>strong]:font-poppins-semibold">
                <strong>Ticket Tier Changes:</strong> When you add, edit, or
                delete ticket tiers below, changes are saved instantly. Only
                event details (venue, city, dates) require you to click
                &quot;Save Event Details&quot;.
              </p>

              {editingEventData.requiresRsvp && (
                <>
                  <hr className="border-none border-t border-white-20 my-6" />

                  <div className="mb-6 flex flex-col gap-3">
                    <h4 className="text-base font-poppins-semibold text-white-100 m-0 flex items-center gap-2">
                      <FiFileText size={18} />
                      Registration Form
                    </h4>
                    <p className="text-[0.8125rem] text-white-50 leading-relaxed m-0 font-poppins">
                      Questions attendees answer when they RSVP. Archive a
                      field to hide it from future registrants while keeping
                      previous answers visible in RSVP details and exports.
                    </p>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <div
                        className={`relative w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          editingEventData.registrationFormEnabled
                            ? "bg-white-100 border-white-100"
                            : "border-white-30 bg-transparent"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={editingEventData.registrationFormEnabled}
                          onChange={e => {
                            const enabled = e.target.checked;
                            setEditingEventData(prev =>
                              prev
                                ? {
                                    ...prev,
                                    registrationFormEnabled: enabled,
                                    registrationFields: enabled
                                      ? prev.registrationFields.length > 0
                                        ? prev.registrationFields
                                        : [createEmptyField()]
                                      : prev.registrationFields,
                                  }
                                : prev,
                            );
                          }}
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                        />
                        {editingEventData.registrationFormEnabled && (
                          <FiCheck
                            className="text-dark pointer-events-none"
                            size={12}
                          />
                        )}
                      </div>
                      <span className="text-white-80 text-sm font-poppins">
                        Include registration form
                      </span>
                    </label>

                    {editingEventData.registrationFormEnabled && (
                      <RegistrationFormBuilder
                        fields={editingEventData.registrationFields}
                        onChange={fields =>
                          setEditingEventData(prev =>
                            prev
                              ? { ...prev, registrationFields: fields }
                              : prev,
                          )
                        }
                      />
                    )}
                  </div>
                </>
              )}

              <hr className="border-none border-t border-white-20 my-6" />

              {/* Edit Event Image */}
              <div className="mb-6">
                <h4 className="text-base font-poppins-semibold text-white-100 m-0 mb-2 flex items-center gap-2">
                  <FiImage size={18} />
                  Edit Event Image
                </h4>
                <p className="text-[0.8125rem] text-white-50 leading-relaxed my-1.5 font-poppins">
                  Upload an image to replace your current one. Recommended
                  size: 1080×1350.
                </p>
                <div className="grid grid-cols-[1fr_2fr] max-sm:grid-cols-1 gap-4 mt-4">
                  <div className="flex flex-col gap-2">
                    <label className="font-poppins-medium text-white-50 text-sm m-0">
                      Current Image
                    </label>
                    {editingImagePreview ? (
                      <div className="w-full aspect-[3/4] rounded-card overflow-hidden bg-white-5 relative">
                        <Image
                          src={editingImagePreview}
                          alt="Event preview"
                          fill
                          className="object-cover"
                          unoptimized={editingImagePreview.startsWith("blob:")}
                        />
                      </div>
                    ) : (
                      <div className="w-full aspect-[3/4] rounded-card overflow-hidden bg-white-5 flex items-center justify-center border-2 border-dashed border-white-20">
                        <div className="flex flex-col items-center gap-2 text-white-50">
                          <FiImage size={32} className="text-white-30" />
                          <p className="m-0 text-sm font-poppins">
                            No image set
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="font-poppins-medium text-white-50 text-sm m-0">
                      Upload New Image
                    </label>
                    <label
                      htmlFor="edit-image-upload"
                      className="w-full border-2 border-dashed border-white-20 rounded-card bg-white-5 cursor-pointer transition-all hover:border-white-40 hover:bg-white-10 flex items-center justify-center min-h-[200px] flex-1"
                      onDragOver={handleEditingImageDragOver}
                      onDragLeave={handleEditingImageDragLeave}
                      onDrop={handleEditingImageDrop}
                      aria-label="Upload image: click to open file picker or drag and drop"
                    >
                      <div className="flex flex-col items-center gap-2 p-6 text-center">
                        <FiUpload size={32} className="text-white-40" />
                        <p className="text-sm font-poppins-medium text-white-70 m-0">
                          Click to upload or drag and drop
                        </p>
                        <p className="text-[0.8125rem] text-white-50 m-0 font-poppins">
                          PNG, JPG, GIF, WebP up to 4.5MB. Recommended size:
                          1080×1350.
                        </p>
                      </div>
                    </label>
                    <input
                      type="file"
                      id="edit-image-upload"
                      accept="image/*"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleEditingImageUpload(f);
                      }}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Save/Discard actions */}
              <div className="flex justify-end gap-3 pt-5 mt-5 border-t border-white-20">
                <button
                  onClick={handleDiscardEventChanges}
                  disabled={isSavingEvent}
                  className="border border-white-30 text-white-100 font-poppins-medium rounded-pill px-7 py-2.5 text-sm hover:bg-white-10 transition-colors cursor-pointer bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Discard
                </button>
                <button
                  onClick={handleSaveEventChanges}
                  disabled={
                    isSavingEvent || editingEventData.tiersNeedUpdate.length > 0
                  }
                  className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-2.5 text-sm hover:opacity-90 transition-opacity cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingEvent ? "Saving..." : "Save Event Details"}
                </button>
              </div>
            </div>

            {/* Ticket Tiers */}
            <div className="bg-white-5 border border-white-20 rounded-card p-6">
              <div className="flex justify-between items-center mb-5 pb-3 border-b border-white-20">
                <h3 className="text-lg font-poppins-semibold text-white-100 m-0">
                  Ticket Tiers for {event.name}
                </h3>
                <button
                  onClick={() => handleAddTier(event.id)}
                  disabled={
                    (event.ticket_tiers || []).length >= MAX_TICKET_TIERS_PER_EVENT
                  }
                  title={
                    (event.ticket_tiers || []).length >= MAX_TICKET_TIERS_PER_EVENT
                      ? `Maximum ${MAX_TICKET_TIERS_PER_EVENT} tiers allowed`
                      : "Add another ticket tier"
                  }
                  className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-4 py-1.5 text-xs hover:opacity-90 transition-opacity cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <FiPlus size={16} />
                  Add Tier
                </button>
              </div>

              <div className="flex flex-col gap-2 relative">
                {(deleteTicketTierMutation.isPending ||
                  isTierOperationInProgress) && (
                  <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center z-10 min-h-[200px] backdrop-blur-sm rounded-card">
                    <div className="animate-spin rounded-full w-10 h-10 border-2 border-white-20 border-t-white-100 mb-3" />
                    <p className="m-0 text-white-100 text-sm font-poppins-semibold">
                      Updating tiers...
                    </p>
                  </div>
                )}

                {(event.ticket_tiers || []).length > 0 ? (
                  [...(event.ticket_tiers || [])]
                    .sort((a: any, b: any) => a.price_cents - b.price_cents)
                    .map((tier: any) => {
                      const needsUpdate =
                        editingEventData.tiersNeedUpdate.includes(tier.id);
                      const formatPrice = (cents: number) =>
                        formatCentsAsPrice(cents, event.currency || "USD");

                      // Use the in-flight draft registration fields so that a
                      // newly-added event field can be selected per-tier before
                      // the event is saved. Falls back to the persisted config
                      // when no edit is in progress. Strips archived + blank-
                      // label drafts to match the POST payload shape.
                      const draftEventFormFields = editingEventData
                        .registrationFormEnabled
                        ? editingEventData.registrationFields.filter(
                            (f) => !f.archived && f.label.trim() !== "",
                          )
                        : [];

                      return (
                        <div key={tier.id}>
                          {editingTierId === tier.id ? (
                            <TierInlineForm
                              tier={tier}
                              tentativeEventStart={editingEventData.startsAt}
                              tentativeEventEnd={editingEventData.endsAt}
                              eventFormFields={draftEventFormFields}
                              onSave={() => {
                                handleTierUpdated(tier.id);
                                handleModalSuccess();
                              }}
                              onCancel={handleCancelEdit}
                            />
                          ) : (
                            <div
                              className={`bg-white-5 border border-white-20 rounded-card px-4 py-3 transition-all hover:bg-white-10 ${needsUpdate ? "bg-yellow-500/10 border-l-[3px] border-l-yellow-500" : ""} ${tier.is_hidden ? "opacity-60" : ""}`}
                            >
                              <div className="flex items-center gap-4 max-md:grid max-md:grid-cols-[1fr_auto] max-md:grid-rows-[auto_auto] max-md:gap-2 max-md:items-start">
                                <div className="flex-[0_0_200px] max-md:flex-none max-md:col-[1] max-md:row-[1] min-w-0">
                                  <h4 className="text-sm font-poppins-semibold text-white-100 m-0 flex items-center gap-1.5 flex-wrap">
                                    {needsUpdate && (
                                      <FiAlertTriangle
                                        size={16}
                                        className="text-yellow-500 shrink-0"
                                        title="This tier needs updating"
                                      />
                                    )}
                                    <span className="break-words">{tier.name}</span>
                                    {tier.is_hidden && (
                                      <span
                                        className="inline-block px-2 py-0.5 rounded-pill bg-white-10 text-white-80 text-[10px] font-poppins-medium uppercase tracking-wider"
                                        title="Hidden from attendees"
                                      >
                                        Hidden
                                      </span>
                                    )}
                                    {tier.is_manually_sold_out && (
                                      <span
                                        className="inline-block px-2 py-0.5 rounded-pill bg-yellow-500/20 text-yellow-300 text-[10px] font-poppins-medium uppercase tracking-wider"
                                        title="Marked sold out by organizer"
                                      >
                                        Marked as Sold Out
                                      </span>
                                    )}
                                    {tier.ticket_stages &&
                                      tier.ticket_stages.length > 1 && (
                                        <span className="inline-block ml-1.5 font-bold text-[#59B2FF] text-xs">
                                          {tier.ticket_stages.length} Price
                                          Stages
                                        </span>
                                      )}
                                  </h4>
                                </div>
                                <div className="flex items-center gap-3 text-sm font-poppins text-white-80 flex-1 max-md:col-[1] max-md:row-[2] max-md:flex-col max-md:items-start max-md:gap-1">
                                  <span>
                                    <strong className="text-white-100">
                                      {tier.ticket_stages &&
                                      tier.ticket_stages.length > 1
                                        ? (() => {
                                            const prices = tier.ticket_stages
                                              .map((s: any) => s.price_cents)
                                              .filter(
                                                (p: number) =>
                                                  typeof p === "number" &&
                                                  !isNaN(p),
                                              );
                                            if (!prices.length)
                                              return typeof tier.price_cents ===
                                                "number"
                                                ? formatPrice(tier.price_cents)
                                                : "N/A";
                                            return `${formatPrice(Math.min(...prices))} – ${formatPrice(Math.max(...prices))}`;
                                          })()
                                        : typeof tier.price_cents ===
                                              "number" &&
                                            !isNaN(tier.price_cents)
                                          ? formatPrice(tier.price_cents)
                                          : "N/A"}
                                    </strong>
                                  </span>
                                  <span>
                                    {Math.max(0, tier.quantity_total -
                                      (tier.quantity_sold ?? 0) -
                                      (tier.quantity_reserved ?? 0))}
                                    /{tier.quantity_total} available
                                    {(tier.quantity_reserved ?? 0) > 0 &&
                                      ` · ${tier.quantity_reserved} reserved`}
                                  </span>
                                  <span>{tier.per_user_limit} per user</span>
                                </div>
                                <div className="flex gap-2 max-md:col-[2] max-md:row-[1/-1] max-md:self-start max-md:flex-col">
                                  <button
                                    onClick={() => handleEditTier(tier)}
                                    title="Edit tier"
                                    className="w-8 h-8 rounded-lg flex items-center justify-center border border-white-30 text-white-80 hover:bg-white-10 transition-colors cursor-pointer bg-transparent"
                                  >
                                    <FiEdit2 size={16} />
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleDeleteTier(tier.id, tier)
                                    }
                                    title={
                                      confirmDeleteTierId === tier.id
                                        ? "Click again to confirm deletion"
                                        : "Delete tier"
                                    }
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors cursor-pointer bg-transparent ${confirmDeleteTierId === tier.id ? "border-red-500 bg-red-500/20 text-red-400" : "border-red-500/30 text-red-400 hover:bg-red-500/20"}`}
                                  >
                                    {confirmDeleteTierId === tier.id ? (
                                      <span className="text-[10px] font-poppins-semibold">
                                        Confirm?
                                      </span>
                                    ) : (
                                      <FiTrash2 size={16} />
                                    )}
                                  </button>
                                </div>
                              </div>

                              {tier.ticket_stages &&
                                tier.ticket_stages.length > 1 && (
                                  <div className="mt-3 pt-3 border-t border-white-20 flex flex-col gap-1.5">
                                    {[...tier.ticket_stages]
                                      .sort(
                                        (a: any, b: any) =>
                                          a.order_index - b.order_index,
                                      )
                                      .map((stage: any) => (
                                        <div
                                          key={stage.id}
                                          className="flex justify-between items-center px-2.5 py-1.5 bg-white-5 border border-white-10 rounded-lg text-xs font-poppins"
                                        >
                                          <span className="font-poppins-medium text-white-100 flex-1">
                                            {stage.name}
                                          </span>
                                          <span className="font-poppins-semibold text-[#59B2FF] mx-3">
                                            {formatPrice(stage.price_cents)}
                                          </span>
                                          <span className="text-white-50 text-[0.7rem]">
                                            {Math.max(
                                              0,
                                              stage.quantity -
                                                ((stage.sold_quantity ?? 0) +
                                                  (stage.quantity_reserved ?? 0)),
                                            )}
                                            /{stage.quantity} left
                                            {(stage.quantity_reserved ?? 0) > 0 &&
                                              ` · ${stage.quantity_reserved} reserved`}
                                          </span>
                                        </div>
                                      ))}
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      );
                    })
                ) : (
                  <div className="flex items-center gap-3 p-5 bg-white-5 border border-white-20 rounded-card text-white-50 italic font-poppins">
                    <FiTag size={24} className="text-white-30 shrink-0" />
                    <p className="m-0">
                      No ticket tiers configured for this event
                    </p>
                  </div>
                )}

                {showingAddForm === event.id ? (
                  <TierInlineForm
                    eventId={event.id}
                    tentativeEventStart={editingEventData.startsAt}
                    tentativeEventEnd={editingEventData.endsAt}
                    eventFormFields={
                      editingEventData.registrationFormEnabled
                        ? editingEventData.registrationFields.filter(
                            (f) => !f.archived && f.label.trim() !== "",
                          )
                        : []
                    }
                    onSave={handleModalSuccess}
                    onCancel={handleCancelEdit}
                  />
                ) : (
                  <button
                    onClick={() => handleAddTier(event.id)}
                    disabled={
                      (event.ticket_tiers || []).length >= MAX_TICKET_TIERS_PER_EVENT
                    }
                    title={
                      (event.ticket_tiers || []).length >= MAX_TICKET_TIERS_PER_EVENT
                        ? `Maximum ${MAX_TICKET_TIERS_PER_EVENT} tiers allowed`
                        : "Add another ticket tier"
                    }
                    className="flex items-center gap-2 p-3 bg-white-5 border-2 border-dashed border-white-20 rounded-card text-white-50 cursor-pointer transition-all text-sm font-poppins-medium w-full justify-center mt-2 hover:border-white-50 hover:bg-white-10 hover:text-white-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <FiPlus size={16} />
                    Add Ticket Tier
                  </button>
                )}
              </div>

              <div className="mt-5 text-center">
                <button
                  onClick={handleDiscardEventChanges}
                  className="border border-white-30 text-white-100 font-poppins-medium rounded-pill px-7 py-2.5 text-sm hover:bg-white-10 transition-colors cursor-pointer bg-transparent"
                >
                  Exit Editing
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Event Banner */}
            <div className="flex flex-col gap-6">
              <div className="w-full h-[254px] rounded-card overflow-hidden relative">
                <Image
                  src={imageUrl}
                  alt={event.name}
                  fill
                  className="object-cover"
                  sizes="800px"
                />
              </div>

              <div className="bg-card border border-white-20 rounded-card p-4">
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <h2 className="text-lg font-poppins-semibold text-white-100 uppercase m-0">
                      {event.name}
                    </h2>
                    {event.description && (
                      <p className="text-white-80 text-sm leading-5 font-poppins-light m-0">
                        {event.description}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-full bg-white-10 flex items-center justify-center shrink-0">
                        <FiCalendar size={20} className="text-white-100" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-white-100 text-xs leading-4 font-poppins-light">
                          {formattedDate}
                        </span>
                        <span className="text-white-100 text-xs leading-4 font-poppins-light">
                          {formattedTime}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-full bg-white-10 flex items-center justify-center shrink-0">
                        <FiMapPin size={20} className="text-white-100" />
                      </div>
                      <span className="text-white-100 text-xs leading-4 font-poppins-light">
                        {[event.venue, event.city].filter(Boolean).join(", ")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons — matches mobile OrgActionButtons */}
            <div className="flex items-center justify-center gap-4">
              <ActionButton
                active={sections.promotions}
                onClick={() => toggleSection("promotions")}
                label="Promotions"
              >
                <FiPercent size={20} />
              </ActionButton>
              <ActionButton
                active={sections.sendTickets}
                onClick={() => toggleSection("sendTickets")}
                label="Send Tickets"
              >
                <FiSend size={20} />
              </ActionButton>
              <ActionButton
                active={sections.promoterLinks}
                onClick={() => toggleSection("promoterLinks")}
                label="Promoter Links"
              >
                <FiLink size={20} />
              </ActionButton>
              <ActionButton
                active={sections.purchasedDetails}
                onClick={() => toggleSection("purchasedDetails")}
                label="Purchases"
              >
                <IoTicketOutline size={20} />
              </ActionButton>
            </div>

            {/* Toggleable Sections */}
            <div className="flex flex-col gap-4">
              {sections.promotions && (
                <SectionCard
                  title="Promotions"
                  icon={<FiPercent size={22} />}
                  onClose={() => toggleSection("promotions")}
                >
                  <PromoCodesSection
                    eventId={event.id}
                    promoCodes={promoCodes}
                    onRefresh={handleRefresh}
                  />
                </SectionCard>
              )}

              {sections.sendTickets && (
                <SectionCard
                  title="Send Tickets"
                  icon={<FiSend size={22} />}
                  onClose={() => toggleSection("sendTickets")}
                >
                  <SendTicketsSection
                    eventId={event.id}
                    ticketTiers={event.ticket_tiers || []}
                    promotionalTickets={promotionalTickets}
                    currency={event.currency}
                    onRefresh={handleRefresh}
                  />
                </SectionCard>
              )}

              {sections.promoterLinks && (
                <SectionCard
                  title="Promoter Links"
                  icon={<FiLink size={22} />}
                  onClose={() => toggleSection("promoterLinks")}
                >
                  <PromoterLinksSection
                    eventId={event.id}
                    eventSlug={event.slug}
                    promoterLinks={promoterLinks}
                    currency={event.currency}
                    onRefresh={handleRefresh}
                  />
                </SectionCard>
              )}

              {sections.purchasedDetails && (
                <PurchasedDetailsSection
                  purchases={purchases}
                  event={event}
                  orgSlug={orgSlug ?? null}
                  onClose={() => toggleSection("purchasedDetails")}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* Cohost assignment modal — owner-only, same gate as the trigger button. */}
      {isOwnerOrg && (
        <CoHostAssignmentModal
          open={cohostModalOpen}
          onClose={() => setCohostModalOpen(false)}
          orgId={data!.organization.id}
          eventId={event.id}
          eventName={event.name}
        />
      )}
    </div>
  );
}

function PurchasedDetailsSection({
  purchases,
  event,
  orgSlug,
  onClose,
}: {
  purchases: Purchase[];
  event: OrganizerEvent;
  orgSlug: string | null;
  onClose: () => void;
}) {
  const [purchaseListExpanded, setPurchaseListExpanded] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Refetch fresh data immediately before building the sheet (matches the
  // pre-Jan 2026 pattern from the legacy `OrganizerDashboard.tsx` export).
  // Without this, a 2-min staleTime cache can serve a response that pre-dates
  // the registration_form_config / registrationData additions, leaving the
  // reg columns blank.
  const handleExportPurchases = useCallback(async () => {
    setIsExporting(true);
    try {
      const url = orgSlug
        ? `/api/organizer/data?org=${encodeURIComponent(orgSlug)}`
        : "/api/organizer/data";
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to fetch latest organizer data");
      }
      const fresh = await response.json();
      const freshEvent = (fresh?.events ?? []).find(
        (e: { id: string }) => e.id === event.id,
      ) as
        | (OrganizerEvent & { purchases?: Purchase[] })
        | undefined;
      if (!freshEvent) {
        throw new Error("Event not found in latest organizer data");
      }
      const freshPurchases: Purchase[] = freshEvent.purchases ?? [];

      const rawTz =
        (freshEvent.timezone ?? event.timezone)?.trim?.() ?? "";
      const formatInTz = (dateStr: string) => {
        try {
          const d = new Date(dateStr);
          if (rawTz) {
            return d.toLocaleString("en-US", { timeZone: rawTz });
          }
          return d.toLocaleString("en-US");
        } catch {
          return new Date(dateStr).toLocaleString("en-US");
        }
      };

      const sorted = [...freshPurchases].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

      const registrationColumns = normalizeRegistrationExportColumns(
        freshEvent.registration_form_config ??
          event.registration_form_config ??
          undefined,
      );

      const currency = freshEvent.currency || event.currency || "USD";
      const eventName = freshEvent.name || event.name;

      const wsData = buildPurchaseExportAoa(
        eventName,
        sorted.map(p => ({
          customer: p.userName,
          email: p.email || "",
          tier: p.tierName + (p.stageName ? ` - ${p.stageName}` : ""),
          quantity: p.quantity,
          purchasedAt: formatInTz(p.createdAt),
          totalCost: formatCentsAsPrice(p.basePrice, currency),
          ...(registrationColumns.length > 0 && {
            registrationValues: registrationValuesForExportColumns(
              registrationColumns,
              p.registrationData ?? null,
            ),
          }),
        })),
        registrationColumns.length > 0 ? registrationColumns : undefined,
      );

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws["!cols"] = purchaseExportColumnWidths(
        registrationColumns.length > 0 ? registrationColumns : undefined,
      );

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Purchase Details");

      const fileName = `${eventName.replace(/[^a-z0-9]/gi, "_")}_purchases.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error("Error exporting purchases:", err);
      alert("Failed to export purchases. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, [event, orgSlug]);

  const totalTicketQnt = (event.ticket_tiers || []).reduce(
    (sum, t) => sum + (t.quantity_total || 0),
    0,
  );
  const requestedTickets = event.pending_rsvps ?? 0;
  const soldTickets = purchases.reduce(
    (sum: number, p: any) => sum + (p.quantity || 0),
    0,
  );
  const revenue = purchases.reduce(
    (sum: number, p: any) => sum + (p.basePrice || 0),
    0,
  );

  const sortedPurchases = useMemo(
    () =>
      [...purchases].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [purchases],
  );

  return (
    <SectionCard
      title="Purchased Details"
      onClose={onClose}
      icon={<IoTicketOutline size={22} />}
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-8">
          <p className="text-white-80 text-base font-poppins m-0">
            Ticket QNT:{" "}
            <span className="text-white-100 font-poppins-semibold">
              {totalTicketQnt}
            </span>
          </p>
          <p className="text-white-80 text-base font-poppins m-0">
            Requested tickets:{" "}
            <span className="text-white-100 font-poppins-semibold">
              {requestedTickets}
            </span>
          </p>
        </div>
        <div className="flex gap-8">
          <p className="text-white-80 text-base font-poppins m-0">
            Sold Tickets:{" "}
            <span className="text-white-100 font-poppins-semibold">
              {soldTickets}
            </span>
          </p>
          <p className="text-white-80 text-base font-poppins m-0">
            Revenue:{" "}
            <span className="text-white-100 font-poppins-semibold">
              {formatCentsAsPrice(revenue, event.currency || "USD")}
            </span>
          </p>
        </div>

        {purchases.length > 0 && (
          <div className="pt-2 border-t border-white-10">
            <div className="flex items-center justify-between py-1">
              <button
                type="button"
                onClick={() => setPurchaseListExpanded(prev => !prev)}
                aria-expanded={purchaseListExpanded}
                aria-controls="org-purchased-details-purchase-list"
                className="flex items-center gap-2 bg-transparent border-none cursor-pointer p-0"
              >
                <span className="text-white-100 text-sm font-poppins-medium">
                  Purchase List ({purchases.length})
                </span>
                <span className="text-white-80 text-lg">
                  {purchaseListExpanded ? "▲" : "▼"}
                </span>
              </button>
              <button
                onClick={handleExportPurchases}
                disabled={isExporting}
                className="flex items-center gap-1.5 bg-white-10 border border-white-20 text-white-100 text-xs font-poppins-medium rounded-pill px-3 py-1.5 hover:bg-white-20 transition-colors cursor-pointer disabled:opacity-50"
                title="Export purchases to Excel"
              >
                {isExporting ? (
                  <FiLoader size={14} className="animate-spin" />
                ) : (
                  <FiDownload size={14} />
                )}
                {isExporting ? "Loading..." : "Export XLSX"}
              </button>
            </div>
            <div
              id="org-purchased-details-purchase-list"
              role="region"
              aria-label="Purchase list"
              hidden={!purchaseListExpanded}
              className="flex flex-col gap-2 mt-2"
            >
              {sortedPurchases.map((purchase: any) => (
                  <div
                    key={purchase.id}
                    className="border border-white-20 rounded-card p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white-100 text-sm font-poppins-semibold m-0 truncate">
                        {purchase.userName}
                      </p>
                      <p className="text-white-50 text-xs font-poppins-light m-0 mt-0.5">
                        {purchase.tierName}
                        {purchase.stageName && ` - ${purchase.stageName}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-white-80 text-xs font-poppins">
                        {purchase.quantity}x
                      </span>
                      <span
                        className={`text-xs font-poppins-medium px-2 py-0.5 rounded-badge ${
                          purchase.scanned
                            ? "bg-green-500/20 text-green-400"
                            : "bg-white-10 text-white-50"
                        }`}
                      >
                        {purchase.scanned ? "Scanned" : "Not Scanned"}
                      </span>
                      <span className="text-white-100 text-xs font-poppins-medium">
                        {formatCentsAsPrice(
                          purchase.basePrice,
                          event.currency || "USD",
                        )}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function ActionButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`w-[52px] h-[52px] rounded-full flex flex-col items-center justify-center cursor-pointer transition-colors border gap-1 ${
        active
          ? "bg-white-100 text-dark border-white-100"
          : "bg-white-5 text-white-100 border-white-100 hover:bg-white-10"
      }`}
    >
      {children}
    </button>
  );
}

function SectionCard({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white-5 border border-white-20 rounded-card p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {icon && (
            <div className="w-[42px] h-[42px] bg-white-5 border border-white-100 rounded-full flex items-center justify-center shrink-0 text-white-100">
              {icon}
            </div>
          )}
          <h3 className="text-[#EAEAEB] text-base leading-[22px] font-poppins-medium m-0">
            {title}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-white-50 hover:text-white-80 bg-transparent border-none cursor-pointer p-0"
          aria-label="Close"
        >
          <FiX size={24} />
        </button>
      </div>
      {children}
    </div>
  );
}
