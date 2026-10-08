/**
 * Send tickets card — search users by email and send promotional/bank-transfer tickets.
 *
 * Ported from:
 *   apps/web/app/components/PromotionsSection.tsx (Send Free Tickets + Bank Transfer Orders tabs)
 *   apps/web/app/api/organizer/search-users/route.ts
 *   apps/web/app/api/organizer/promotional-tickets/route.ts
 *   apps/web/app/api/organizer/bank-transfer-tickets/route.ts
 */

import { useState, useMemo, useEffect, useRef, useCallback, type RefObject } from "react";
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator, Platform, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getBasePriceFromTicket, formatCentsAsPrice } from "@project-flame/lib";
import { OrgSectionCard } from "./OrgSectionCard";
import { useSearchUsers, type SearchUser } from "../../hooks/useSearchUsers";
import { useSendTickets } from "../../hooks/useSendTickets";
import { useBankTransferTickets } from "../../hooks/useBankTransferTickets";
import type { OrgEventTier } from "../../hooks/useOrgEvents";
import type { EnrichedPromotionalTicket } from "../../hooks/useOrgEventEnriched";

interface OrgSendTicketsCardProps {
  eventId: string;
  tiers: OrgEventTier[];
  promotionalTickets?: EnrichedPromotionalTicket[];
  bankTransferOrders?: EnrichedPromotionalTicket[];
  currency?: string;
  onClose?: () => void;
  /**
   * W0-Q2: the parent screen's ScrollView. When a recipient is selected the
   * card scrolls the newly-revealed "configure ticket/order" block into view so
   * it isn't stranded below the fold (and behind the keyboard).
   */
  scrollViewRef?: RefObject<ScrollView | null>;
}

type TabKey = "free" | "bankTransfer";

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center justify-center py-1.5 ${
        active ? "border-b-[1.5px] border-white-100" : ""
      }`}
    >
      <Text
        className={`text-sm leading-5 font-poppins ${
          active ? "text-white-100" : "text-white-80"
        }`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function UserResultRow({
  user,
  onSelect,
  actionLabel,
  loading,
}: {
  user: SearchUser;
  onSelect: () => void;
  actionLabel: string;
  loading: boolean;
}) {
  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;

  return (
    <View className="flex-row items-center gap-[10px]">
      <View className="flex-1 flex-row items-center gap-2">
        <View className="size-[48px] rounded-full bg-white-10 items-center justify-center">
          <Ionicons name="person" size={24} color="rgba(255,255,255,0.5)" />
        </View>
        <View className="flex-1 gap-2">
          <Text className="text-white-100 text-base font-poppins-semibold uppercase">
            {displayName}
          </Text>
          <Text className="text-white-100 text-xs leading-4 font-poppins-medium">
            {user.email}
          </Text>
        </View>
        <Pressable
          onPress={onSelect}
          disabled={loading}
          className={`bg-white-100 rounded-[20px] px-[18px] py-2 ${loading ? "opacity-60" : ""}`}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#041C2B" />
          ) : (
            <Text className="text-dark text-sm leading-[22px] font-poppins-medium">
              {actionLabel}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function SelectedUserBanner({
  user,
  onClear,
}: {
  user: SearchUser;
  onClear: () => void;
}) {
  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;

  return (
    <View className="flex-row items-center bg-white-5 border border-white-20 rounded-card p-3 gap-3">
      <View className="size-[36px] rounded-full bg-white-10 items-center justify-center">
        <Ionicons name="person" size={18} color="rgba(255,255,255,0.5)" />
      </View>
      <View className="flex-1">
        <Text className="text-white-100 text-sm font-poppins-semibold">
          {displayName}
        </Text>
        <Text className="text-white-50 text-xs font-poppins">
          {user.email}
        </Text>
      </View>
      <Pressable onPress={onClear} className="p-1">
        <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.5)" />
      </Pressable>
    </View>
  );
}

function UserSearchSection({
  emailInput,
  setEmailInput,
  searching,
  searchError,
  users,
  onSearch,
  onClearResults,
  selectedUser,
  onSelectUser,
  onClearUser,
  actionLabel,
  sendingUserIds,
}: {
  emailInput: string;
  setEmailInput: (text: string) => void;
  searching: boolean;
  searchError: string | null;
  users: SearchUser[];
  onSearch: () => void;
  onClearResults: () => void;
  selectedUser: SearchUser | null;
  onSelectUser: (user: SearchUser) => void;
  onClearUser: () => void;
  actionLabel: string;
  /** When provided, each row gets loading={sendingUserIds.has(user.id)}. Omit for sync actions (e.g. bank transfer "Select"). */
  sendingUserIds?: Set<string>;
}) {
  if (selectedUser) {
    return <SelectedUserBanner user={selectedUser} onClear={onClearUser} />;
  }

  return (
    <View className="gap-4">
      <Text className="text-white-100 font-poppins-medium text-sm leading-5">
        Find user by email
      </Text>

      <View className="flex-row items-center gap-[10px]">
        <View className="flex-1 bg-white-5 border border-white-30 rounded-pill px-4 py-2">
          <Text className="text-white-70 text-xs leading-4 font-poppins">
            Email Address
          </Text>
          <TextInput
            className="text-white-100 text-sm leading-5 font-poppins p-0"
            placeholder="user@example.com"
            placeholderTextColor="rgba(255,255,255,0.5)"
            value={emailInput}
            onChangeText={(text) => {
              setEmailInput(text);
              if (!text.trim()) onClearResults();
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            onSubmitEditing={onSearch}
          />
        </View>
        <Pressable
          onPress={onSearch}
          disabled={searching}
          className="bg-white-100 rounded-full p-[10px]"
        >
          {searching ? (
            <ActivityIndicator
              size={Platform.OS === "ios" ? 24 : "small"}
              color="#041C2B"
            />
          ) : (
            <Ionicons name="search" size={24} color="#041C2B" />
          )}
        </Pressable>
      </View>

      {searchError && (
        <Text className="text-[#EAB308] text-xs leading-4 font-poppins">
          {searchError}
        </Text>
      )}

      {users.map((user) => (
        <UserResultRow
          key={user.id}
          user={user}
          onSelect={() => onSelectUser(user)}
          actionLabel={actionLabel}
          loading={sendingUserIds?.has(user.id) ?? false}
        />
      ))}
    </View>
  );
}

interface TierOption {
  label: string;
  tierId: string;
  stageId?: string;
  priceCents: number;
}

function SentTicketRow({
  ticket,
  currency,
}: {
  ticket: EnrichedPromotionalTicket;
  currency: string;
}) {
  const tierName = ticket.ticket_tiers?.name ?? "Unknown";
  const stageName = ticket.metadata?.stage_name;
  const tierDisplay = stageName ? `${tierName} - ${stageName}` : tierName;
  const quantity = ticket.is_bank_transfer
    ? ticket.order_quantity ?? 1
    : ticket.quantity ?? 1;

  let costDisplay: string;
  if (ticket.is_bank_transfer && ticket.order_total_cents) {
    // Modern bank-transfer orders (post-2026-01-15) store `total_cents` as the
    // base subtotal — no platform fees are baked in (organizer collects payment
    // off-platform). `getBasePriceFromTicket` returns the price as-is in that
    // case, and falls back to `extractBasePriceHistorical` only for legacy rows
    // where fees were rolled into `total_cents`. See MAY_2026_FIXES.md.
    const basePrice = getBasePriceFromTicket(
      ticket.order_total_cents,
      ticket.created_at,
    );
    costDisplay = formatCentsAsPrice(basePrice, currency);
  } else if (ticket.is_bank_transfer) {
    costDisplay = formatCentsAsPrice(0, currency);
  } else {
    costDisplay = "Complimentary";
  }

  return (
    <View className="border border-white-20 rounded-card p-3 gap-1">
      <View className="flex-row items-center justify-between">
        <Text
          className="text-white-100 text-sm leading-5 font-poppins-semibold flex-1"
          numberOfLines={1}
        >
          {ticket.customer_name}
        </Text>
        <Text className="text-white-50 text-xs leading-4 font-poppins">
          {costDisplay}
        </Text>
      </View>
      <Text className="text-white-50 text-xs leading-4 font-poppins" numberOfLines={1}>
        {tierDisplay}
      </Text>
      <Text className="text-white-50 text-xs leading-4 font-poppins">
        {quantity}x · {ticket.email}
      </Text>
    </View>
  );
}

export function OrgSendTicketsCard({
  eventId,
  tiers,
  promotionalTickets = [],
  bankTransferOrders = [],
  currency = "USD",
  onClose,
  scrollViewRef,
}: OrgSendTicketsCardProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("free");
  const [sentExpanded, setSentExpanded] = useState(false);

  // W0-Q2: refs to the conditionally-rendered configure blocks + a per-tab
  // "scroll pending" flag set on recipient-select and consumed in onLayout
  // (the block only mounts after the user is chosen, so we wait for layout).
  const freeConfigRef = useRef<View>(null);
  const btConfigRef = useRef<View>(null);
  const freePendingScrollRef = useRef(false);
  const btPendingScrollRef = useRef(false);

  const scrollConfigIntoView = useCallback(
    (blockRef: RefObject<View | null>) => {
      const scroll = scrollViewRef?.current;
      const block = blockRef.current;
      if (!scroll || !block) return;
      // New Architecture (Fabric): measureLayout's relative node must be a host
      // component *ref*, not a `findNodeHandle` number — passing a number logs
      // "ref.measureLayout must be called with a ref to a native component" and
      // silently no-ops. `ScrollView.getNativeScrollRef()` returns the
      // underlying host view, which is what Fabric's measureLayout expects.
      const scrollHost = scroll.getNativeScrollRef?.();
      if (!scrollHost) return;
      block.measureLayout(
        scrollHost,
        (_x, y) => {
          scroll.scrollTo({ y: Math.max(0, y - 24), animated: true });
        },
        () => {
          // measureLayout's failure callback (RN types it as `() => void`, no
          // error arg) fires if the block detached before the measure resolved
          // — non-fatal (the user just doesn't get auto-scrolled), but log in
          // dev so a silent no-scroll is diagnosable.
          if (__DEV__) {
            console.error(
              "[OrgSendTicketsCard] measureLayout failed — configure block not scrolled into view",
            );
          }
        },
      );
    },
    [scrollViewRef],
  );

  // Free ticket state — mirrors web's "Step 1: Find user → Step 2: Configure"
  // (apps/web/app/organizer/event/[id]/OrgEventDetailClient.tsx). Previously the
  // Free flow auto-picked the first non-sold-out tier with no organizer choice —
  // see MAY_2026_FIXES.md.
  const [freeEmailInput, setFreeEmailInput] = useState("");
  const freeSearch = useSearchUsers();
  const sendTickets = useSendTickets();
  const [sendingUserIds, setSendingUserIds] = useState<Set<string>>(new Set());
  const [freeSelectedUser, setFreeSelectedUser] = useState<SearchUser | null>(null);
  const [freeSelectedTierIdx, setFreeSelectedTierIdx] = useState(0);
  const [freeQuantity, setFreeQuantity] = useState("1");
  // W7-H2 (3a): a confirmed recipient email with NO Flame account (free tab
  // only). Mutually exclusive with freeSelectedUser.
  const [freeNoAccountRecipient, setFreeNoAccountRecipient] = useState<string | null>(null);
  // The email actually submitted to the most recent free-tab search. The
  // no-account offer references this (not the live input) so editing the field
  // after a "not found" can't capture an unsearched address.
  const [freeLastSearched, setFreeLastSearched] = useState("");

  // Bank transfer state
  const [btEmailInput, setBtEmailInput] = useState("");
  const btSearch = useSearchUsers();
  const bankTransfer = useBankTransferTickets();
  const [btSelectedUser, setBtSelectedUser] = useState<SearchUser | null>(null);
  const [btSelectedTierIdx, setBtSelectedTierIdx] = useState(0);
  const [btQuantity, setBtQuantity] = useState("1");
  // W7-H2 (3b): a confirmed recipient email with NO Flame account (bank tab).
  // Mutually exclusive with btSelectedUser.
  const [btNoAccountRecipient, setBtNoAccountRecipient] = useState<string | null>(null);
  // The email actually submitted to the most recent bank-tab search (see
  // freeLastSearched).
  const [btLastSearched, setBtLastSearched] = useState("");

  // W7-H3: optional custom price for bank-transfer orders. Off by default (uses
  // the selected tier/stage price); toggling on reveals a dollar input
  // pre-filled with that price. Server stays authoritative.
  const [btCustomPrice, setBtCustomPrice] = useState(false);
  const [btCustomPriceInput, setBtCustomPriceInput] = useState("");

  const resetBtCustomPrice = useCallback(() => {
    setBtCustomPrice(false);
    setBtCustomPriceInput("");
  }, []);

  // Sort Sent lists by purchase date, newest first. The API doesn't guarantee
  // ordering on `promotional_tickets` / `bank_transfer_orders`, so we sort
  // client-side to match the user-visible expectation. See MAY_2026_FIXES.md.
  const sortedPromotionalTickets = useMemo(
    () =>
      [...promotionalTickets].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [promotionalTickets]
  );

  const sortedBankTransferOrders = useMemo(
    () =>
      [...bankTransferOrders].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [bankTransferOrders]
  );

  // Free flow operates at the tier level (matches web). No stage breakdown.
  const freeTierOptions = useMemo<TierOption[]>(
    () =>
      tiers.map((tier) => ({
        label: tier.name,
        tierId: tier.id,
        priceCents: tier.price_cents,
      })),
    [tiers]
  );

  // Bank transfer flow operates at the stage level (matches web). Uses the
  // event's currency rather than a hardcoded "$" so non-USD events render
  // correctly.
  const tierOptions = useMemo<TierOption[]>(() => {
    const options: TierOption[] = [];
    for (const tier of tiers) {
      if (tier.ticket_stages && tier.ticket_stages.length > 0) {
        const sorted = [...tier.ticket_stages].sort(
          (a, b) => a.order_index - b.order_index
        );
        for (const stage of sorted) {
          options.push({
            label: `${tier.name} - ${stage.name} (${formatCentsAsPrice(stage.price_cents, currency)})`,
            tierId: tier.id,
            stageId: stage.id,
            priceCents: stage.price_cents,
          });
        }
      } else {
        options.push({
          label: `${tier.name} (${formatCentsAsPrice(tier.price_cents, currency)})`,
          tierId: tier.id,
          priceCents: tier.price_cents,
        });
      }
    }
    return options;
  }, [tiers, currency]);

  // Clamp selected indexes when option lists change (e.g. event refetch)
  useEffect(() => {
    if (tierOptions.length === 0) return;
    const maxIdx = tierOptions.length - 1;
    setBtSelectedTierIdx((prev) => (prev > maxIdx ? 0 : prev));
  }, [tierOptions]);

  useEffect(() => {
    if (freeTierOptions.length === 0) return;
    const maxIdx = freeTierOptions.length - 1;
    setFreeSelectedTierIdx((prev) => (prev > maxIdx ? 0 : prev));
  }, [freeTierOptions]);

  const handleTabSwitch = (tab: TabKey) => {
    setActiveTab(tab);
    freeSearch.clearResults();
    btSearch.clearResults();
    setFreeEmailInput("");
    setBtEmailInput("");
    setFreeSelectedUser(null);
    setFreeNoAccountRecipient(null);
    setFreeLastSearched("");
    setBtSelectedUser(null);
    setBtNoAccountRecipient(null);
    setBtLastSearched("");
    resetBtCustomPrice();
  };

  // --- Free ticket handlers ---
  const handleFreeSearch = () => {
    setFreeLastSearched(freeEmailInput.trim());
    freeSearch.searchByEmail(freeEmailInput);
  };

  const handleFreeSelectUser = (user: SearchUser) => {
    setFreeSelectedUser(user);
    freeSearch.clearResults();
    setFreeEmailInput("");
    freePendingScrollRef.current = true;
  };

  // W7-H2 (3a): confirm sending a comp ticket to a non-Flame email.
  const handleFreeConfirmNoAccount = () => {
    setFreeNoAccountRecipient(freeLastSearched.toLowerCase());
    freeSearch.clearResults();
    setFreeEmailInput("");
    freePendingScrollRef.current = true;
  };

  const handleFreeClearUser = () => {
    setFreeSelectedUser(null);
    setFreeNoAccountRecipient(null);
    setFreeLastSearched("");
    setFreeEmailInput("");
    freeSearch.clearResults();
  };

  const handleSendFreeTicket = async () => {
    if (!freeSelectedUser && !freeNoAccountRecipient) return;
    if (freeSelectedUser && sendingUserIds.has(freeSelectedUser.id)) return;

    if (freeTierOptions.length === 0) {
      Alert.alert("Error", "No ticket tiers available for this event.");
      return;
    }

    const selected = freeTierOptions[freeSelectedTierIdx];
    if (!selected) return;

    const qty = parseInt(freeQuantity, 10);
    if (isNaN(qty) || qty < 1 || qty > 10) {
      Alert.alert("Error", "Quantity must be between 1 and 10.");
      return;
    }

    // Account path tracks per-row loading via sendingUserIds; the no-account
    // path relies on sendTickets.isPending for the button spinner.
    const userId = freeSelectedUser?.id;
    if (userId) {
      setSendingUserIds((prev) => {
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
    }

    try {
      const result = await sendTickets.mutateAsync({
        event_id: eventId,
        ticket_tier_id: selected.tierId,
        quantity: qty,
        ...(freeSelectedUser
          ? { user_id: freeSelectedUser.id }
          : { recipient_email: freeNoAccountRecipient! }),
      });
      Alert.alert("Success", result.message || "Ticket sent successfully!");
      handleFreeClearUser();
      setFreeQuantity("1");
      setFreeSelectedTierIdx(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send ticket";
      Alert.alert("Error", message);
    } finally {
      if (userId) {
        setSendingUserIds((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      }
    }
  };

  // --- Bank transfer handlers ---
  const handleBtSearch = () => {
    setBtLastSearched(btEmailInput.trim());
    btSearch.searchByEmail(btEmailInput);
  };

  const handleBtSelectUser = (user: SearchUser) => {
    setBtSelectedUser(user);
    btSearch.clearResults();
    setBtEmailInput("");
    btPendingScrollRef.current = true;
  };

  // W7-H2 (3b): confirm a bank-transfer order to a non-Flame email.
  const handleBtConfirmNoAccount = () => {
    setBtNoAccountRecipient(btLastSearched.toLowerCase());
    btSearch.clearResults();
    setBtEmailInput("");
    btPendingScrollRef.current = true;
  };

  const handleBtClearUser = () => {
    setBtSelectedUser(null);
    setBtNoAccountRecipient(null);
    setBtLastSearched("");
    setBtEmailInput("");
    btSearch.clearResults();
  };

  const handleCreateBankTransfer = async () => {
    if (!btSelectedUser && !btNoAccountRecipient) return;

    if (tierOptions.length === 0) {
      Alert.alert("Error", "No ticket tiers available for this event.");
      return;
    }

    const qty = parseInt(btQuantity, 10);
    if (isNaN(qty) || qty < 1 || qty > 10) {
      Alert.alert("Error", "Quantity must be between 1 and 10.");
      return;
    }

    const selected = tierOptions[btSelectedTierIdx];
    if (!selected) return;

    // W7-H3: resolve the optional custom price override (dollars → cents).
    let unitPriceCents: number | undefined;
    if (btCustomPrice) {
      const cents = Math.round(parseFloat(btCustomPriceInput) * 100);
      if (!Number.isFinite(cents) || cents <= 0) {
        Alert.alert(
          "Invalid price",
          "Custom price must be greater than $0. For free tickets, use the Send Free Ticket tab.",
        );
        return;
      }
      unitPriceCents = cents;
    }

    try {
      const result = await bankTransfer.mutateAsync({
        event_id: eventId,
        ticket_tier_id: selected.tierId,
        stage_id: selected.stageId,
        quantity: qty,
        unit_price_cents: unitPriceCents,
        // Account path → user_id; no-account path → recipient_email (3b).
        ...(btSelectedUser
          ? { user_id: btSelectedUser.id }
          : { recipient_email: btNoAccountRecipient! }),
      });

      const totalPrice = formatCentsAsPrice(result.order.total_cents, currency);
      // Strip the trailing "(price)" suffix from the option label so the
      // success toast doesn't double-print the amount.
      const tierLabel = selected.label.replace(/\s*\([^)]*\)\s*$/, "");
      const recipientLabel = result.user?.name || btNoAccountRecipient || "recipient";
      Alert.alert(
        "Success",
        `Bank transfer order created: ${qty}x ${tierLabel} (${totalPrice}) for ${recipientLabel}`
      );
      handleBtClearUser();
      setBtQuantity("1");
      setBtSelectedTierIdx(0);
      resetBtCustomPrice();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create bank transfer order";
      Alert.alert("Error", message);
    }
  };

  // W7-H3: derived values for the custom-price UI (bank tab).
  const btSelectedPriceCents = tierOptions[btSelectedTierIdx]?.priceCents ?? 0;
  const btParsedCents = Math.round(parseFloat(btCustomPriceInput) * 100);
  const btCustomValid =
    !btCustomPrice || (Number.isFinite(btParsedCents) && btParsedCents > 0);
  const btEffectiveUnitCents =
    btCustomPrice && btCustomValid ? btParsedCents : btSelectedPriceCents;
  const btQtyNum = parseInt(btQuantity, 10);
  const btTotalCents =
    btEffectiveUnitCents *
    (Number.isFinite(btQtyNum) && btQtyNum > 0 ? btQtyNum : 0);

  const handleToggleBtCustomPrice = () => {
    setBtCustomPrice((prev) => {
      const next = !prev;
      if (next) {
        // Pre-fill with the selected tier/stage price (only if empty so we don't
        // clobber a price the organizer already typed).
        setBtCustomPriceInput((cur) =>
          cur ? cur : (btSelectedPriceCents / 100).toFixed(2),
        );
      } else {
        // Clear on turn-off so a later toggle-on pre-fills fresh from the
        // then-current tier (avoids a stale price after off → tier change → on).
        setBtCustomPriceInput("");
      }
      return next;
    });
  };

  return (
    <OrgSectionCard
      icon={<Ionicons name="send" size={22} color="#F9FBFE" />}
      title="Send Tickets"
      onClose={onClose}
    >
      <View className="flex-row gap-[6px] p-[2px] rounded-[20px]">
        <TabButton
          label={`Send Free Ticket (${promotionalTickets.length})`}
          active={activeTab === "free"}
          onPress={() => handleTabSwitch("free")}
        />
        <TabButton
          label={`Bank Transfer Orders (${bankTransferOrders.length})`}
          active={activeTab === "bankTransfer"}
          onPress={() => handleTabSwitch("bankTransfer")}
        />
      </View>

      {activeTab === "free" ? (
        <View className="gap-4">
          {freeNoAccountRecipient ? (
            <View className="flex-row items-center bg-white-5 border border-white-20 rounded-card p-3 gap-3">
              <View className="size-[36px] rounded-full bg-white-10 items-center justify-center">
                <Ionicons name="mail" size={18} color="rgba(255,255,255,0.5)" />
              </View>
              <View className="flex-1">
                <Text
                  className="text-white-100 text-sm font-poppins-semibold"
                  numberOfLines={1}
                >
                  {freeNoAccountRecipient}
                </Text>
                <Text className="text-white-50 text-xs font-poppins">
                  No Flame account — will be sent by email
                </Text>
              </View>
              <Pressable onPress={handleFreeClearUser} className="p-1">
                <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.5)" />
              </Pressable>
            </View>
          ) : (
            <>
              <UserSearchSection
                emailInput={freeEmailInput}
                setEmailInput={setFreeEmailInput}
                searching={freeSearch.searching}
                searchError={freeSearch.searchError}
                users={freeSearch.users}
                onSearch={handleFreeSearch}
                onClearResults={freeSearch.clearResults}
                selectedUser={freeSelectedUser}
                onSelectUser={handleFreeSelectUser}
                onClearUser={handleFreeClearUser}
                actionLabel="Select"
              />

              {/* W7-H2 (3a): offer a no-account comp send when the email isn't a
                  Flame user. Free tab only — bank no-account (3b) is deferred. */}
              {!freeSelectedUser &&
                freeSearch.searchError === "No user found with that email" &&
                freeLastSearched.length > 0 && (
                  <View className="bg-white-5 border border-white-10 rounded-card p-3 gap-2">
                    <Text className="text-white-70 text-xs leading-4 font-poppins">
                      No Flame account found for{" "}
                      <Text className="text-white-100 font-poppins-medium">
                        {freeLastSearched}
                      </Text>
                      . You can still send the ticket by email — they scan the
                      PDF QR at the door. (They won&apos;t see it in My Tickets
                      unless they sign up with that email.)
                    </Text>
                    <Pressable
                      onPress={handleFreeConfirmNoAccount}
                      className="self-start bg-white-100 rounded-pill px-4 py-2"
                    >
                      <Text className="text-dark text-xs font-poppins-medium">
                        Send without a Flame account
                      </Text>
                    </Pressable>
                  </View>
                )}
            </>
          )}

          {(freeSelectedUser || freeNoAccountRecipient) && (
            <View
              ref={freeConfigRef}
              onLayout={() => {
                if (freePendingScrollRef.current) {
                  freePendingScrollRef.current = false;
                  scrollConfigIntoView(freeConfigRef);
                }
              }}
              className="gap-4"
            >
              <Text className="text-white-100 font-poppins-medium text-sm leading-5">
                Configure Ticket
              </Text>

              {/* Tier Selector */}
              <View className="bg-white-5 border border-white-30 rounded-card p-3 gap-2">
                <Text className="text-white-70 text-xs leading-4 font-poppins">
                  Ticket Tier
                </Text>
                <ScrollView
                  horizontal={false}
                  style={{ maxHeight: 180 }}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                >
                  {freeTierOptions.map((opt, idx) => (
                    <Pressable
                      key={opt.tierId}
                      onPress={() => setFreeSelectedTierIdx(idx)}
                      className={`flex-row items-center justify-between py-3 px-2 rounded-[8px] ${
                        freeSelectedTierIdx === idx ? "bg-white-10" : ""
                      }`}
                    >
                      <Text
                        className={`flex-1 text-sm font-poppins ${
                          freeSelectedTierIdx === idx
                            ? "text-white-100 font-poppins-medium"
                            : "text-white-80"
                        }`}
                      >
                        {opt.label}
                      </Text>
                      {freeSelectedTierIdx === idx && (
                        <Ionicons name="checkmark-circle" size={20} color="#F9FBFE" />
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Quantity */}
              <View className="bg-white-5 border border-white-30 rounded-pill px-4 py-2">
                <Text className="text-white-70 text-xs leading-4 font-poppins">
                  Quantity (1-10)
                </Text>
                <TextInput
                  className="text-white-100 text-sm leading-5 font-poppins p-0"
                  value={freeQuantity}
                  onChangeText={setFreeQuantity}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>

              {/* Send Button */}
              <Pressable
                onPress={handleSendFreeTicket}
                disabled={
                  sendTickets.isPending ||
                  (freeSelectedUser != null && sendingUserIds.has(freeSelectedUser.id))
                }
                className={`bg-white-100 rounded-pill py-3 items-center ${
                  sendTickets.isPending ? "opacity-60" : ""
                }`}
              >
                {sendTickets.isPending ? (
                  <ActivityIndicator size="small" color="#041C2B" />
                ) : (
                  <Text className="text-dark text-base font-poppins-semibold">
                    Send Free Ticket
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          {sortedPromotionalTickets.length > 0 && (
            <View className="pt-3 mt-3 border-t border-white-10">
              <Pressable
                onPress={() => setSentExpanded((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel="Sent complimentary tickets"
                className="flex-row items-center justify-between py-0.5"
              >
                <Text className="text-white-100 text-xs leading-4 font-poppins-medium">
                  Sent ({sortedPromotionalTickets.length})
                </Text>
                <Ionicons
                  name={sentExpanded ? "chevron-up-outline" : "chevron-down-outline"}
                  size={20}
                  color="rgba(255,255,255,0.8)"
                />
              </Pressable>
              {sentExpanded && (
                <View className="mt-1.5 gap-1.5">
                  {sortedPromotionalTickets.map((ticket) => (
                    <SentTicketRow key={ticket.id} ticket={ticket} currency={currency} />
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      ) : (
        <View className="gap-4">
          {btNoAccountRecipient ? (
            <View className="flex-row items-center bg-white-5 border border-white-20 rounded-card p-3 gap-3">
              <View className="size-[36px] rounded-full bg-white-10 items-center justify-center">
                <Ionicons name="mail" size={18} color="rgba(255,255,255,0.5)" />
              </View>
              <View className="flex-1">
                <Text
                  className="text-white-100 text-sm font-poppins-semibold"
                  numberOfLines={1}
                >
                  {btNoAccountRecipient}
                </Text>
                <Text className="text-white-50 text-xs font-poppins">
                  No Flame account — will be sent by email
                </Text>
              </View>
              <Pressable onPress={handleBtClearUser} className="p-1">
                <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.5)" />
              </Pressable>
            </View>
          ) : (
            <>
              <UserSearchSection
                emailInput={btEmailInput}
                setEmailInput={setBtEmailInput}
                searching={btSearch.searching}
                searchError={btSearch.searchError}
                users={btSearch.users}
                onSearch={handleBtSearch}
                onClearResults={btSearch.clearResults}
                selectedUser={btSelectedUser}
                onSelectUser={handleBtSelectUser}
                onClearUser={handleBtClearUser}
                actionLabel="Select"
              />

              {/* W7-H2 (3b): offer a no-account bank-transfer order when the
                  email isn't a Flame user. They scan the PDF QR at the door. */}
              {!btSelectedUser &&
                btSearch.searchError === "No user found with that email" &&
                btLastSearched.length > 0 && (
                  <View className="bg-white-5 border border-white-10 rounded-card p-3 gap-2">
                    <Text className="text-white-70 text-xs leading-4 font-poppins">
                      No Flame account found for{" "}
                      <Text className="text-white-100 font-poppins-medium">
                        {btLastSearched}
                      </Text>
                      . You can still create the order by email — they scan the
                      PDF QR at the door. (They won&apos;t see it in My Tickets
                      unless they sign up with that email.)
                    </Text>
                    <Pressable
                      onPress={handleBtConfirmNoAccount}
                      className="self-start bg-white-100 rounded-pill px-4 py-2"
                    >
                      <Text className="text-dark text-xs font-poppins-medium">
                        Create order without a Flame account
                      </Text>
                    </Pressable>
                  </View>
                )}
            </>
          )}

          {(btSelectedUser || btNoAccountRecipient) && (
            <View
              ref={btConfigRef}
              onLayout={() => {
                if (btPendingScrollRef.current) {
                  btPendingScrollRef.current = false;
                  scrollConfigIntoView(btConfigRef);
                }
              }}
              className="gap-4"
            >
              <Text className="text-white-100 font-poppins-medium text-sm leading-5">
                Configure Order
              </Text>

              {/* Tier/Stage Selector */}
              <View className="bg-white-5 border border-white-30 rounded-card p-3 gap-2">
                <Text className="text-white-70 text-xs leading-4 font-poppins">
                  Ticket Tier
                </Text>
                <ScrollView
                  horizontal={false}
                  style={{ maxHeight: 180 }}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                >
                  {tierOptions.map((opt, idx) => (
                    <Pressable
                      key={`${opt.tierId}-${opt.stageId || "base"}`}
                      onPress={() => setBtSelectedTierIdx(idx)}
                      className={`flex-row items-center justify-between py-3 px-2 rounded-[8px] ${
                        btSelectedTierIdx === idx ? "bg-white-10" : ""
                      }`}
                    >
                      <Text
                        className={`flex-1 text-sm font-poppins ${
                          btSelectedTierIdx === idx
                            ? "text-white-100 font-poppins-medium"
                            : "text-white-80"
                        }`}
                      >
                        {opt.label}
                      </Text>
                      {btSelectedTierIdx === idx && (
                        <Ionicons name="checkmark-circle" size={20} color="#F9FBFE" />
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Quantity */}
              <View className="bg-white-5 border border-white-30 rounded-pill px-4 py-2">
                <Text className="text-white-70 text-xs leading-4 font-poppins">
                  Quantity (1-10)
                </Text>
                <TextInput
                  className="text-white-100 text-sm leading-5 font-poppins p-0"
                  value={btQuantity}
                  onChangeText={setBtQuantity}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>

              {/* W7-H3: custom price toggle + input */}
              <View className="gap-2">
                <Pressable
                  onPress={handleToggleBtCustomPrice}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: btCustomPrice }}
                  className="flex-row items-center gap-2 py-0.5"
                >
                  <Ionicons
                    name={btCustomPrice ? "checkbox" : "square-outline"}
                    size={20}
                    color={btCustomPrice ? "#F9FBFE" : "rgba(255,255,255,0.5)"}
                  />
                  <Text className="text-white-80 text-sm leading-5 font-poppins-medium">
                    Set custom price
                  </Text>
                </Pressable>

                {btCustomPrice && (
                  <View className="bg-white-5 border border-white-30 rounded-pill px-4 py-2">
                    <Text className="text-white-70 text-xs leading-4 font-poppins">
                      Price per ticket ($)
                    </Text>
                    <TextInput
                      className="text-white-100 text-sm leading-5 font-poppins p-0"
                      value={btCustomPriceInput}
                      onChangeText={setBtCustomPriceInput}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="rgba(255,255,255,0.5)"
                    />
                  </View>
                )}

                {btCustomPrice && !btCustomValid && (
                  <Text className="text-[#EAB308] text-xs leading-4 font-poppins">
                    Enter a price greater than $0 (use Send Free Ticket for free
                    tickets).
                  </Text>
                )}

                {btCustomValid && btTotalCents > 0 && (
                  <Text className="text-white-50 text-xs leading-4 font-poppins">
                    Total:{" "}
                    <Text className="text-white-100 font-poppins-medium">
                      {formatCentsAsPrice(btTotalCents, currency)}
                    </Text>
                  </Text>
                )}
              </View>

              {/* Create Order Button */}
              <Pressable
                onPress={handleCreateBankTransfer}
                disabled={bankTransfer.isPending || !btCustomValid}
                className={`bg-white-100 rounded-pill py-3 items-center ${
                  bankTransfer.isPending || !btCustomValid ? "opacity-60" : ""
                }`}
              >
                {bankTransfer.isPending ? (
                  <ActivityIndicator size="small" color="#041C2B" />
                ) : (
                  <Text className="text-dark text-base font-poppins-semibold">
                    Create Order
                  </Text>
                )}
              </Pressable>
            </View>
          )}
          {sortedBankTransferOrders.length > 0 && (
            <View className="pt-3 mt-3 border-t border-white-10">
              <Pressable
                onPress={() => setSentExpanded((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel="Sent bank transfer tickets"
                className="flex-row items-center justify-between py-0.5"
              >
                <Text className="text-white-100 text-xs leading-4 font-poppins-medium">
                  Sent ({sortedBankTransferOrders.length})
                </Text>
                <Ionicons
                  name={sentExpanded ? "chevron-up-outline" : "chevron-down-outline"}
                  size={20}
                  color="rgba(255,255,255,0.8)"
                />
              </Pressable>
              {sentExpanded && (
                <View className="mt-1.5 gap-1.5">
                  {sortedBankTransferOrders.map((ticket) => (
                    <SentTicketRow key={ticket.id} ticket={ticket} currency={currency} />
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </OrgSectionCard>
  );
}
