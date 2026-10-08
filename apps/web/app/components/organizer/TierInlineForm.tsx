"use client";

import React, { useMemo, useState } from "react";
import { FiCheck, FiX } from "react-icons/fi";
import {
  utcToEcuadorLocal,
  ecuadorLocalToUtc,
  getEcuadorNow,
  formatPrice,
  normalizeOptionalTicketTierSecretCode,
  normalizeTicketTierSecretCode,
  TIER_DESCRIPTION_MAX_LENGTH,
} from "@project-flame/lib";
import { FormTicketStage, TierInlineFormProps } from "./types";
import RegistrationFormFieldsModal from "./RegistrationFormFieldsModal";

export default function TierInlineForm({
  tier,
  eventId,
  tentativeEventStart,
  tentativeEventEnd,
  eventFormFields,
  onSave,
  onCancel,
}: TierInlineFormProps) {
  // price_cents now stores base price directly (after migration)
  const initialBasePrice = tier?.price_cents ? tier.price_cents / 100 : 0;

  const [formData, setFormData] = useState({
    name: tier?.name || "",
    price_cents: tier?.price_cents || 0,
    quantity_total: tier?.quantity_total || 100,
    per_user_limit: tier?.per_user_limit || 4,
    sales_start: tier?.sales_start ? utcToEcuadorLocal(tier.sales_start) : "",
    // W0-Q4: default a blank sales_end to the event end (mirrors create-event).
    // An existing tier with an explicit sales_end keeps it; a new tier or an
    // existing tier with a null sales_end pre-fills to the event end when known.
    sales_end: tier?.sales_end
      ? utcToEcuadorLocal(tier.sales_end)
      : tentativeEventEnd || "",
    secret_code: tier?.secret_code
      ? normalizeTicketTierSecretCode(tier.secret_code)
      : null,
    // W4-C1 (May 2026): organizer toggles. Both default false on new tiers and
    // reflect the persisted value when editing.
    is_manually_sold_out: tier?.is_manually_sold_out === true,
    is_hidden: tier?.is_hidden === true,
    // W4-C2 (May 2026): tier-level organizer description (max 120 chars).
    description: typeof tier?.description === "string" ? tier.description : "",
  });

  // Track organizer's input price (what they want to receive)
  const [organizerBasePrice, setOrganizerBasePrice] = useState<string>(
    initialBasePrice > 0 ? initialBasePrice.toString() : "",
  );

  // Initialize stages from tier data or create default single stage
  const hasExistingStages =
    tier?.ticket_stages && tier.ticket_stages.length > 0;
  const isExistingTierWithoutStages = !!tier?.id && !hasExistingStages;
  const [useStages, setUseStages] = useState(hasExistingStages || false);
  const [stages, setStages] = useState<FormTicketStage[]>(() => {
    if (tier?.ticket_stages && tier.ticket_stages.length > 0) {
      return tier.ticket_stages
        .sort((a: any, b: any) => a.order_index - b.order_index)
        .map((stage: any) => ({
          id: stage.id,
          name: stage.name,
          price_cents: stage.price_cents,
          quantity: stage.quantity,
          order_index: stage.order_index,
          sold_quantity: stage.sold_quantity,
          description: typeof stage.description === "string" ? stage.description : "",
        }));
    }
    return [
      {
        name: "Standard",
        price_cents: tier?.price_cents || 0,
        quantity: tier?.quantity_total || 100,
        order_index: 0,
        description: "",
      },
    ];
  });

  // Track organizer input prices for stages
  const [stageBasePrices, setStageBasePrices] = useState<{
    [key: number]: string;
  }>(() => {
    const initial: { [key: number]: string } = {};
    stages.forEach((stage, index) => {
      if (stage.price_cents > 0) {
        initial[index] = (stage.price_cents / 100).toString();
      } else {
        initial[index] = "";
      }
    });
    return initial;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  // W4-C1: when the PATCH returns code=QUANTITY_BELOW_RESERVED, we capture the
  // server's authoritative blocker counts and prompt the organizer to force-
  // reduce capacity. Null when no force-reduce confirmation is pending.
  const [forceReducePrompt, setForceReducePrompt] = useState<{
    tier_id: string;
    requested_quantity: number;
    quantity_sold: number;
    quantity_reserved: number;
    min_allowed_quantity: number;
  } | null>(null);
  const [forceReducing, setForceReducing] = useState(false);

  // Per-tier registration form subset. `null` → inherit all event fields.
  const [formFields, setFormFields] = useState<string[] | null>(
    tier?.registration_form_fields ?? null,
  );
  const [showFormFieldsModal, setShowFormFieldsModal] = useState(false);
  // Memoized so a parent re-render (e.g. React Query background refetch) while
  // the per-tier picker modal is open doesn't produce a new array reference and
  // re-fire the modal's reset effect, stomping the draft selection.
  const visibleEventFormFields = useMemo(
    () => (eventFormFields ?? []).filter((f) => !f.archived),
    [eventFormFields],
  );
  const visibleEventFormFieldCount = visibleEventFormFields.length;
  const hasEventForm = visibleEventFormFieldCount > 0;

  const getDateTimeLocal = (hoursAhead: number = 0): string => {
    return getEcuadorNow(hoursAhead);
  };

  // Stage management functions
  const handleAddStage = () => {
    setStages(prev => [
      ...prev,
      {
        name: `Stage ${prev.length + 1}`,
        price_cents: 0,
        quantity: 25,
        order_index: prev.length,
        description: "",
      },
    ]);
  };

  const handleRemoveStage = (stageIndex: number) => {
    if (stageIndex < 0 || stageIndex >= stages.length) {
      setError("Invalid stage index");
      return;
    }

    const stageToRemove = stages[stageIndex];
    if (stageToRemove.sold_quantity && stageToRemove.sold_quantity > 0) {
      setError(
        `Cannot delete "${stageToRemove.name}" - ${stageToRemove.sold_quantity} ticket(s) already sold`,
      );
      return;
    }

    if (stages.length > 2) {
      const nextStages = stages
        .filter((_, i) => i !== stageIndex)
        .map((stage, index) => ({
          ...stage,
          order_index: index,
        }));

      setStages(nextStages);
      setStageBasePrices(() => {
        const next: Record<number, string> = {};
        nextStages.forEach((stage, index) => {
          next[index] =
            stage.price_cents > 0 ? (stage.price_cents / 100).toString() : "";
        });
        return next;
      });
    } else {
      setError(
        "Tiers with price stages must have at least 2 stages. To delete this tier, use the delete button in the tier list.",
      );
    }
  };

  const handleStageChange = (
    stageIndex: number,
    field: keyof FormTicketStage,
    value: any,
  ) => {
    setStages(prev =>
      prev.map((stage, i) =>
        i === stageIndex ? { ...stage, [field]: value } : stage,
      ),
    );
  };

  const handleUseStagesToggle = (enabled: boolean) => {
    setUseStages(enabled);
    if (enabled) {
      const halfQuantity = Math.floor(formData.quantity_total / 2);
      const remainderQuantity = formData.quantity_total - halfQuantity;

      setStages([
        {
          name: "Early Bird",
          price_cents: formData.price_cents,
          quantity: halfQuantity,
          order_index: 0,
          description: "",
        },
        {
          name: "Regular",
          price_cents: formData.price_cents,
          quantity: remainderQuantity,
          order_index: 1,
          description: "",
        },
      ]);
    } else {
      const totalQuantity = stages.reduce(
        (sum, stage) => sum + stage.quantity,
        0,
      );
      setStages([
        {
          name: "Standard",
          price_cents: formData.price_cents,
          quantity: totalQuantity,
          order_index: 0,
          description: "",
        },
      ]);
      setFormData(prev => ({ ...prev, quantity_total: totalQuantity }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      // sales_start is optional — blank means "use server default (now)"
      const salesStartUtc = formData.sales_start
        ? ecuadorLocalToUtc(formData.sales_start)
        : null;
      const salesEndUtc = ecuadorLocalToUtc(formData.sales_end);

      // Only error on sales_start if a value was provided but couldn't be parsed
      if (formData.sales_start && !salesStartUtc) {
        setError("Invalid sales start date format");
        setIsLoading(false);
        return;
      }
      if (!salesEndUtc) {
        setError("Invalid sales end date format");
        setIsLoading(false);
        return;
      }

      const salesEnd = new Date(salesEndUtc);

      if (isNaN(salesEnd.getTime())) {
        setError("Invalid sales end date format");
        setIsLoading(false);
        return;
      }

      if (salesStartUtc) {
        const salesStart = new Date(salesStartUtc);
        if (!isNaN(salesStart.getTime()) && salesEnd <= salesStart) {
          setError("Sales end date must be after start date");
          setIsLoading(false);
          return;
        }
      }

      if (
        formData.per_user_limit == null ||
        typeof formData.per_user_limit !== "number"
      ) {
        setError("Per-user limit is required");
        setIsLoading(false);
        return;
      }
      if (formData.per_user_limit < 0) {
        setError("Per-user limit cannot be negative");
        setIsLoading(false);
        return;
      }

      if (!useStages) {
        if (
          formData.price_cents == null ||
          typeof formData.price_cents !== "number"
        ) {
          setError("Price is required");
          setIsLoading(false);
          return;
        }
        if (formData.price_cents < 0) {
          setError("Price cannot be negative");
          setIsLoading(false);
          return;
        }

        if (
          formData.quantity_total == null ||
          typeof formData.quantity_total !== "number"
        ) {
          setError("Total quantity is required");
          setIsLoading(false);
          return;
        }
        if (formData.quantity_total <= 0) {
          setError("Total quantity must be at least 1");
          setIsLoading(false);
          return;
        }
      }

      const secretNormalized = normalizeTicketTierSecretCode(
        typeof formData.secret_code === "string" ? formData.secret_code : "",
      );
      if (secretNormalized.length > 0 && secretNormalized.length < 3) {
        setError("Access code must be at least 3 characters or left blank.");
        setIsLoading(false);
        return;
      }
      const secretCodeForPayload = normalizeOptionalTicketTierSecretCode(
        typeof formData.secret_code === "string" ? formData.secret_code : undefined,
      );

      if (useStages) {
        const seenNames = new Set<string>();
        for (let i = 0; i < stages.length; i++) {
          const stage = stages[i];
          if (!stage.name.trim()) {
            setError(`Stage ${i + 1} must have a name`);
            setIsLoading(false);
            return;
          }

          const normalizedName = stage.name.trim().toLowerCase();
          if (seenNames.has(normalizedName)) {
            setError(
              `Duplicate stage name "${stage.name}" - each stage must have a unique name`,
            );
            setIsLoading(false);
            return;
          }
          seenNames.add(normalizedName);

          if (
            stage.price_cents == null ||
            typeof stage.price_cents !== "number"
          ) {
            setError(`Stage "${stage.name}" must have a price`);
            setIsLoading(false);
            return;
          }
          if (stage.price_cents < 0) {
            setError(`Stage "${stage.name}" must have a valid price`);
            setIsLoading(false);
            return;
          }
          if (stage.quantity == null || typeof stage.quantity !== "number") {
            setError(`Stage "${stage.name}" must have a quantity`);
            setIsLoading(false);
            return;
          }
          if (stage.quantity <= 0) {
            setError(
              `Stage "${stage.name}" must have a quantity greater than 0`,
            );
            setIsLoading(false);
            return;
          }

          const soldQuantity = stage.sold_quantity ?? 0;
          if (stage.quantity < soldQuantity) {
            setError(
              `Stage "${stage.name}" cannot have quantity (${stage.quantity}) less than already sold tickets (${soldQuantity})`,
            );
            setIsLoading(false);
            return;
          }
        }
      }

      const totalQuantity = useStages
        ? stages.reduce((sum, stage) => sum + stage.quantity, 0)
        : formData.quantity_total;

      // W4-C2: normalize empty descriptions to null so we don't write empty
      // strings to the DB (RPCs already do `NULLIF(... ,'')` defensively but
      // the PATCH path goes through a direct UPDATE).
      const trimmedTierDescription =
        typeof formData.description === "string"
          ? formData.description.trim()
          : "";
      const tierDescriptionForPayload =
        trimmedTierDescription.length === 0 ? null : trimmedTierDescription;

      const stagesForPayload = stages.map((stage) => {
        const trimmed =
          typeof stage.description === "string" ? stage.description.trim() : "";
        return {
          ...stage,
          description: trimmed.length === 0 ? null : trimmed,
        };
      });

      const payload = {
        ...formData,
        description: tierDescriptionForPayload,
        quantity_total: totalQuantity,
        // sales_start: always include in the payload so clearing the field explicitly
        // sends null to the server (meaning "start now"), rather than omitting it
        // and leaving the server to retain the old value.
        sales_start: salesStartUtc,
        sales_end: salesEndUtc,
        secret_code: secretCodeForPayload,
        useStages,
        ...(useStages && { stages: stagesForPayload }),
        // Per-tier registration form subset. `null` → server inherits all event
        // fields. Explicit `[]` is intentional (= collect nothing). Hide from
        // payload entirely when the event has no form configured — there's
        // nothing meaningful to send.
        ...(hasEventForm && { registration_form_fields: formFields }),
        ...(tier ? { id: tier.id } : { event_id: eventId }),
        ...(tentativeEventStart && {
          tentative_event_start: ecuadorLocalToUtc(tentativeEventStart),
        }),
      };

      const response = await fetch("/api/ticket-tiers", {
        method: tier ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        // W4-C1: detect the structured "blocked by holds + pending RSVPs" code
        // and open the force-reduce confirmation instead of just throwing.
        if (errorData.code === "QUANTITY_BELOW_RESERVED" && errorData.details && tier?.id) {
          setForceReducePrompt({
            tier_id: errorData.details.tier_id ?? tier.id,
            requested_quantity: errorData.details.requested_quantity ?? 0,
            quantity_sold: errorData.details.quantity_sold ?? 0,
            quantity_reserved: errorData.details.quantity_reserved ?? 0,
            min_allowed_quantity: errorData.details.min_allowed_quantity ?? 0,
          });
          setIsLoading(false);
          return;
        }
        throw new Error(errorData.error || "Failed to save ticket tier");
      }

      onSave();
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceReduceConfirm = async () => {
    if (!forceReducePrompt) return;
    setForceReducing(true);
    setError("");
    try {
      const response = await fetch(
        `/api/organizer/tiers/${forceReducePrompt.tier_id}/force-reduce`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            new_quantity_total: forceReducePrompt.requested_quantity,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Force reduce failed");
      }

      setForceReducePrompt(null);
      onSave();
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Force reduce failed");
    } finally {
      setForceReducing(false);
    }
  };

  const inputClasses = "bg-card border border-white-30 rounded-lg px-3 py-2 text-white-100 text-sm font-poppins placeholder:text-white-30 focus:outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full scheme-dark";
  const labelClasses = "text-white-50 text-xs font-poppins-medium uppercase tracking-wider mt-1";

  return (
    <div className="bg-surface border border-white-30 rounded-card p-4 my-2">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-card p-3 text-red-400 text-sm font-poppins">
            {error}
          </div>
        )}

        <div className="pb-3 border-b border-white-30 mb-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm font-poppins select-none">
            <div className="relative w-[18px] h-[18px] shrink-0">
              <input
                type="checkbox"
                checked={useStages}
                onChange={e => handleUseStagesToggle(e.target.checked)}
                disabled={
                  isLoading ||
                  hasExistingStages ||
                  isExistingTierWithoutStages
                }
                className="peer w-full h-full m-0 cursor-pointer border-2 border-white-30 rounded appearance-none bg-card checked:bg-white-100 checked:border-white-100 hover:border-white-50 focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <FiCheck className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-dark pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" size={14} />
            </div>
            <span className="text-white-100 font-poppins-medium">
              Use Price Stages
              {hasExistingStages && (
                <span className="ml-2 text-[11px] text-white-50 italic font-poppins">
                  (Cannot disable once stages are created)
                </span>
              )}
              {isExistingTierWithoutStages && (
                <span className="ml-2 text-[11px] text-white-50 italic font-poppins">
                  (Cannot add stages to existing tier, create a new tier
                  instead)
                </span>
              )}
            </span>
          </label>
        </div>

        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[150px] flex flex-col gap-1">
            <label className={labelClasses}>Tier Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={e =>
                setFormData(prev => ({ ...prev, name: e.target.value }))
              }
              placeholder="Early Bird, General, VIP..."
              required
              disabled={isLoading}
              className={inputClasses}
            />
          </div>
          <div className="flex-1 min-w-[150px] flex flex-col gap-1">
            <label className={labelClasses}>Per User Limit *</label>
            <input
              type="number"
              value={formData.per_user_limit ?? ""}
              onChange={e => {
                const val = e.target.value;
                if (val === "") {
                  setFormData(prev => ({ ...prev, per_user_limit: null }));
                } else {
                  const parsed = parseInt(val);
                  setFormData(prev => ({
                    ...prev,
                    per_user_limit: isNaN(parsed) || parsed < 1 ? 1 : parsed,
                  }));
                }
              }}
              onWheel={e => e.currentTarget.blur()}
              placeholder="4"
              min="1"
              max="50"
              required
              disabled={isLoading}
              className={inputClasses}
            />
          </div>
        </div>

        {/* Base Price and Quantity - shown when stages are disabled */}
        {!useStages && (
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[150px] flex flex-col gap-1">
              <input
                type="number"
                value={organizerBasePrice}
                onChange={e => {
                  const val = e.target.value;
                  setOrganizerBasePrice(val);

                  const parsed = parseFloat(val);
                  if (!isFinite(parsed) || isNaN(parsed) || parsed <= 0) {
                    setFormData(prev => ({ ...prev, price_cents: 0 }));
                    return;
                  }
                  setFormData(prev => ({
                    ...prev,
                    price_cents: Math.round(parsed * 100),
                  }));
                }}
                onWheel={e => e.currentTarget.blur()}
                placeholder="100.00"
                min="0"
                step="0.01"
                required
                disabled={isLoading}
                className={inputClasses}
              />
            </div>
            <div className="flex-1 min-w-[150px] flex flex-col gap-1">
              <label className={labelClasses}>Total Quantity *</label>
              <input
                type="number"
                value={formData.quantity_total ?? ""}
                onChange={e => {
                  const val = e.target.value;
                  if (val === "") {
                    setFormData(prev => ({ ...prev, quantity_total: null }));
                  } else {
                    const parsed = parseInt(val);
                    setFormData(prev => ({
                      ...prev,
                      quantity_total: isNaN(parsed) || parsed < 1 ? 1 : parsed,
                    }));
                  }
                }}
                onWheel={e => e.currentTarget.blur()}
                placeholder="100"
                min="1"
                required
                disabled={isLoading}
                className={inputClasses}
              />
            </div>
          </div>
        )}

        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[150px] flex flex-col gap-1">
            <label className={labelClasses}>Sales Start (optional)</label>
            <input
              type="datetime-local"
              value={formData.sales_start}
              onChange={e =>
                setFormData(prev => ({
                  ...prev,
                  sales_start: e.target.value,
                }))
              }
              disabled={isLoading}
              className={inputClasses}
            />
          </div>
          <div className="flex-1 min-w-[150px] flex flex-col gap-1">
            <label className={labelClasses}>Sales End *</label>
            <input
              type="datetime-local"
              value={formData.sales_end}
              min={getDateTimeLocal(0)}
              onChange={e =>
                setFormData(prev => ({
                  ...prev,
                  sales_end: e.target.value,
                }))
              }
              required
              disabled={isLoading}
              className={inputClasses}
            />
          </div>
        </div>

        {/* W4-C2 (May 2026): tier-level organizer description (max 120 chars).
            Renders on attendee tier cards under the price. The active stage's
            description (if any) replaces this on the public surface. */}
        <div className="flex flex-col gap-1">
          <label className={labelClasses}>Description (optional)</label>
          <textarea
            value={formData.description ?? ""}
            onChange={e =>
              setFormData(prev => ({
                ...prev,
                description: e.target.value.slice(0, TIER_DESCRIPTION_MAX_LENGTH),
              }))
            }
            placeholder="What's included? E.g. 'Unlimited drinks, free entry until 11pm'"
            disabled={isLoading}
            maxLength={TIER_DESCRIPTION_MAX_LENGTH}
            rows={2}
            className={`${inputClasses} resize-none`}
          />
          <div className="text-white-30 text-[11px] font-poppins mt-0.5 self-end tabular-nums">
            {(formData.description ?? "").length}/{TIER_DESCRIPTION_MAX_LENGTH}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClasses}>Access Code (optional)</label>
          <input
            type="text"
            value={formData.secret_code ?? ""}
            onChange={e => {
              const raw = e.target.value.toUpperCase();
              setFormData(prev => ({
                ...prev,
                secret_code: raw.trim() === "" ? null : raw,
              }));
            }}
            placeholder="Min. 3 characters — saved in capitals"
            disabled={isLoading}
            autoCapitalize="characters"
            className={inputClasses}
          />
          <p className="text-white-30 text-xs font-poppins mt-0.5">
            Attendees enter this code on the event page to unlock and select this tier.
          </p>
          {formData.secret_code && !formData.is_hidden && (
            <p className="text-[#FBD68D] text-xs font-poppins mt-1">
              Access codes only work on hidden tiers. Enable &ldquo;Hide tier&rdquo;
              below to require this code for unlock.
            </p>
          )}
        </div>

        {/* W4-C1 (May 2026): organizer visibility / sold-out toggles. */}
        <div className="flex flex-col gap-2 rounded-card border border-white-10 bg-white-5 px-4 py-3">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <div className="relative w-[18px] h-[18px] shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={formData.is_manually_sold_out}
                onChange={e =>
                  setFormData(prev => ({
                    ...prev,
                    is_manually_sold_out: e.target.checked,
                  }))
                }
                disabled={isLoading}
                className="peer w-full h-full m-0 cursor-pointer border-2 border-white-30 rounded appearance-none bg-card checked:bg-white-100 checked:border-white-100 hover:border-white-50 focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <FiCheck className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-dark pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" size={14} />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-white-100 text-sm font-poppins-medium">
                Mark as sold out
              </span>
              <span className="text-white-50 text-xs font-poppins">
                Prevent new purchases. Attendees see the tier as &ldquo;Sold
                Out&rdquo;. Existing tickets and pending RSVPs are unaffected.
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer select-none border-t border-white-10 pt-3">
            <div className="relative w-[18px] h-[18px] shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={formData.is_hidden}
                onChange={e =>
                  setFormData(prev => ({ ...prev, is_hidden: e.target.checked }))
                }
                disabled={isLoading}
                className="peer w-full h-full m-0 cursor-pointer border-2 border-white-30 rounded appearance-none bg-card checked:bg-white-100 checked:border-white-100 hover:border-white-50 focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <FiCheck className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-dark pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" size={14} />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-white-100 text-sm font-poppins-medium">
                Hide tier
              </span>
              <span className="text-white-50 text-xs font-poppins">
                Hide from attendees entirely. You&rsquo;ll still see and manage
                this tier on your dashboard.
              </span>
            </div>
          </label>
        </div>

        {/* Per-tier registration form subset. Hidden when the event has no form configured. */}
        {hasEventForm && (
          <div className="flex items-center justify-between rounded-card border border-white-10 bg-white-5 px-4 py-3">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-white-100 text-sm font-poppins-medium">
                Registration form
              </span>
              <span className="text-white-50 text-xs font-poppins truncate">
                {formFields === null
                  ? `All ${visibleEventFormFieldCount} event field${visibleEventFormFieldCount === 1 ? "" : "s"}`
                  : `${formFields.length} of ${visibleEventFormFieldCount} selected`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowFormFieldsModal(true)}
              className="rounded-pill border border-white-20 px-4 py-1.5 text-white-100 text-xs font-poppins hover:border-white-50 transition-colors cursor-pointer shrink-0"
            >
              {formFields === null ? "Customize" : "Edit"}
            </button>
          </div>
        )}

        {/* Ticket Stages - only show when useStages is enabled */}
        {useStages && (
          <div className="bg-card border border-white-30 rounded-card mt-2">
            <div className="flex justify-between items-center p-4">
              <h5 className="text-white-100 font-poppins-semibold text-sm uppercase tracking-wider">Price Stages</h5>
              <button
                type="button"
                onClick={handleAddStage}
                className="border border-white-30 text-white-100 font-poppins-medium rounded-pill px-4 py-1.5 text-xs hover:bg-white-10 transition-colors"
                disabled={isLoading}
              >
                Add Stage
              </button>
            </div>

            {stages.map((stage, stageIndex) => (
              <div key={stageIndex} className="border-t border-white-30 p-4">
                <div className="flex justify-between items-center mb-3 pb-2 border-b border-white-30">
                  <span className="text-white-50 text-xs font-poppins-semibold uppercase tracking-wider">Stage {stageIndex + 1}</span>
                  {stages.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveStage(stageIndex)}
                      className="text-red-400 hover:text-red-300 transition-colors p-1"
                      disabled={isLoading}
                      title="Remove this stage"
                    >
                      <FiX size={16} />
                    </button>
                  )}
                </div>

                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <label className={labelClasses}>Stage Name *</label>
                      <input
                        type="text"
                        value={stage.name}
                        onChange={e =>
                          handleStageChange(stageIndex, "name", e.target.value)
                        }
                        placeholder="Early Bird, Sale 1, Final..."
                        required
                        disabled={isLoading}
                        className={inputClasses}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className={labelClasses}>Your Price for This Stage (USD) *</label>
                      <input
                        type="number"
                        value={stageBasePrices[stageIndex] || ""}
                        onChange={e => {
                          const val = e.target.value;
                          setStageBasePrices(prev => ({
                            ...prev,
                            [stageIndex]: val,
                          }));

                          if (val === "" || val === "-" || val === "0") {
                            handleStageChange(stageIndex, "price_cents", 0);
                          } else {
                            const parsed = parseFloat(val);
                            if (
                              !isNaN(parsed) &&
                              isFinite(parsed) &&
                              parsed > 0
                            ) {
                              handleStageChange(
                                stageIndex,
                                "price_cents",
                                Math.round(parsed * 100),
                              );
                            } else {
                              handleStageChange(stageIndex, "price_cents", 0);
                            }
                          }
                        }}
                        onWheel={e => e.currentTarget.blur()}
                        placeholder="100.00"
                        min="0"
                        step="0.01"
                        required
                        disabled={isLoading}
                        className={inputClasses}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1 mt-3">
                  <label className={labelClasses}>Quantity *</label>
                  <input
                    type="number"
                    value={stage.quantity ?? ""}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === "") {
                        handleStageChange(stageIndex, "quantity", null);
                      } else {
                        const parsed = parseInt(val);
                        handleStageChange(
                          stageIndex,
                          "quantity",
                          isNaN(parsed) || parsed < 1 ? 1 : parsed,
                        );
                      }
                    }}
                    onWheel={e => e.currentTarget.blur()}
                    placeholder="50"
                    min="1"
                    required
                    disabled={isLoading}
                    className={inputClasses}
                  />
                </div>

                {/* W4-C2 (May 2026): per-stage description. Replaces tier
                    description on attendee surfaces while this stage is active. */}
                <div className="flex flex-col gap-1 mt-3">
                  <label className={labelClasses}>Stage Description (optional)</label>
                  <textarea
                    value={stage.description ?? ""}
                    onChange={e =>
                      handleStageChange(
                        stageIndex,
                        "description",
                        e.target.value.slice(0, TIER_DESCRIPTION_MAX_LENGTH),
                      )
                    }
                    placeholder="Stage-specific perk or note (e.g. 'Includes welcome drink')"
                    maxLength={TIER_DESCRIPTION_MAX_LENGTH}
                    rows={2}
                    disabled={isLoading}
                    className={`${inputClasses} resize-none`}
                  />
                  <div className="text-white-30 text-[11px] font-poppins mt-0.5 self-end tabular-nums">
                    {(stage.description ?? "").length}/{TIER_DESCRIPTION_MAX_LENGTH}
                  </div>
                </div>
              </div>
            ))}

            <div className="text-white-50 text-xs font-poppins italic p-4 border-t border-white-30">
              Total tickets for this tier:{" "}
              {stages.reduce((sum, stage) => sum + stage.quantity, 0)}
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-end pt-4 border-t border-white-30">
          <button
            type="button"
            onClick={onCancel}
            className="border border-white-30 text-white-100 font-poppins-medium rounded-pill px-7 py-2.5 text-sm hover:bg-white-10 transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-2.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading}
          >
            {isLoading ? "Saving..." : tier ? "Update Tier" : "Create Tier"}
          </button>
        </div>
      </form>

      {hasEventForm && (
        <RegistrationFormFieldsModal
          isOpen={showFormFieldsModal}
          eventFormFields={visibleEventFormFields}
          value={formFields}
          onChange={(next) => setFormFields(next)}
          onClose={() => setShowFormFieldsModal(false)}
        />
      )}

      {/* W4-C1 (May 2026): force-reduce confirmation modal. Surfaces only when
          the PATCH returns code=QUANTITY_BELOW_RESERVED. Sold tickets are never
          touched — only active checkout holds and pending/approved RSVPs. */}
      {forceReducePrompt && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="force-reduce-title"
        >
          <div className="bg-surface border border-white-30 rounded-card p-6 max-w-md w-full flex flex-col gap-4">
            <h3
              id="force-reduce-title"
              className="text-white-100 text-lg font-poppins-semibold m-0"
            >
              Reduce capacity?
            </h3>
            <p className="text-white-80 text-sm font-poppins m-0 leading-relaxed">
              {forceReducePrompt.quantity_sold > 0
                ? `${forceReducePrompt.quantity_sold} sold ticket${forceReducePrompt.quantity_sold === 1 ? "" : "s"} can't be removed. `
                : ""}
              Reducing this tier to {forceReducePrompt.requested_quantity} will
              cancel all{" "}
              <strong className="text-white-100">
                {forceReducePrompt.quantity_reserved} active checkout hold
                {forceReducePrompt.quantity_reserved === 1 ? "" : "s"} + pending
                RSVP{forceReducePrompt.quantity_reserved === 1 ? "" : "s"}
              </strong>{" "}
              for this tier. Affected attendees will be notified by email and
              push, and any pending Stripe authorizations will be released.
            </p>
            <p className="text-white-50 text-xs font-poppins m-0">
              Sold tickets are unaffected.
            </p>
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-card p-3 text-red-400 text-sm font-poppins">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2 border-t border-white-30">
              <button
                type="button"
                onClick={() => {
                  setForceReducePrompt(null);
                  setError("");
                }}
                disabled={forceReducing}
                className="border border-white-30 text-white-100 font-poppins-medium rounded-pill px-5 py-2 text-sm hover:bg-white-10 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleForceReduceConfirm}
                disabled={forceReducing}
                className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-5 py-2 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {forceReducing ? "Reducing..." : "Force reduce"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
