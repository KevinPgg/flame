"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FiCalendar,
  FiMapPin,
  FiClock,
  FiFileText,
  FiImage,
  FiDollarSign,
  FiUpload,
  FiX,
  FiEdit2,
  FiCheck,
} from "react-icons/fi";
import { useCreateEvent } from "../../lib/hooks/useForms";
import {
  localToUtc,
  getNowInTimezone,
  MAX_TICKET_TIERS_PER_EVENT,
  TIER_DESCRIPTION_MAX_LENGTH,
} from "@project-flame/lib";
import { resizeImageTo4x5 } from "../../lib/utils/image-upload.client";
import { TicketStage } from "../../lib/types/event";
import ConfirmationModal from "../modals/ConfirmationModal";
import type { FormField } from "../modals/RegistrationFormModal";
import RegistrationFormBuilder, {
  createEmptyField,
} from "./RegistrationFormBuilder";
import RegistrationFormFieldsModal from "../organizer/RegistrationFormFieldsModal";
import { CityAutocompleteField } from "../organizer/CityAutocompleteField";

interface CreateEventFormProps {
  organizationId: string;
}

// Form-specific stage interface (doesn't include database fields like id, created_at, etc.)
interface FormTicketStage {
  name: string;
  price_cents: number;
  quantity: number;
  order_index: number;
  /** W4-C2 (May 2026): per-stage description (max 120 chars), optional. */
  description?: string | null;
}

interface TicketTier {
  name: string;
  price_cents: number; // Base price for the tier (used when stages are disabled)
  quantity_total: number;
  per_user_limit: number;
  sales_start: string;
  sales_end: string;
  useStages: boolean; // Whether to use staged pricing or single price
  stages: FormTicketStage[];
  /**
   * Per-tier registration form subset. `null` → tier inherits all event-level
   * fields. Explicit `[]` → tier collects no fields. See
   * `packages/lib/src/utils/registration-form.ts`.
   */
  registration_form_fields?: string[] | null;
  /** W4-C2 (May 2026): tier-level description (max 120 chars), optional. */
  description?: string | null;
  // W4-C3 (Jun 2026): access-code + visibility + manual-sold-out controls,
  // mirroring the edit-mode TierInlineForm so organizers can configure a
  // hidden / code-gated / closed tier at create-event time.
  secret_code?: string | null;
  is_hidden?: boolean;
  is_manually_sold_out?: boolean;
}

/**
 * W4-C2 (May 2026): shared description textarea + `N/120` counter, used for
 * both the tier-level and per-stage description fields. `onChange` receives the
 * already-truncated value, so call sites pass it straight to
 * `handleTierChange` / `handleStageChange`. Mirrors the mobile `DescriptionInput`
 * helper so the two surfaces don't drift.
 */
function DescriptionField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">
        {label}
      </label>
      <textarea
        value={value}
        onChange={e =>
          onChange(e.target.value.slice(0, TIER_DESCRIPTION_MAX_LENGTH))
        }
        placeholder={placeholder}
        maxLength={TIER_DESCRIPTION_MAX_LENGTH}
        rows={2}
        disabled={disabled}
        className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed resize-none"
      />
      <div className="text-white-30 text-[11px] font-poppins self-end tabular-nums">
        {value.length}/{TIER_DESCRIPTION_MAX_LENGTH}
      </div>
    </div>
  );
}

export default function CreateEventForm({
  organizationId,
}: CreateEventFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = searchParams.get("org");
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [registrationFormEnabled, setRegistrationFormEnabled] = useState(false);
  const [registrationFields, setRegistrationFields] = useState<FormField[]>([]);

  // React Query mutation for event creation
  const createEventMutation = useCreateEvent();

  // Helper function to generate empty defaults - no pre-filling
  const getDefaultSalesDates = () => {
    // Let users set both sales start and end times manually for full control
    return {
      sales_start: "", // Empty - user must set manually
      sales_end: "", // Empty - user must set manually
    };
  };

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    city: "",
    venue: "",
    starts_at: "",
    ends_at: "",
    description: "",
    image_url: "",
    status: "published" as "published",
    requires_rsvp: true, // Default to requiring RSVP
    currency: "USD",
    timezone: "America/Guayaquil",
  });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  // State for deferred image upload (upload after event is created)
  const [pendingImageBlob, setPendingImageBlob] = useState<Blob | null>(null);

  // Cleanup effect to prevent memory leaks from object URLs
  useEffect(() => {
    return () => {
      // Clean up any remaining object URLs when component unmounts
      if (imagePreview && imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const defaultDates = getDefaultSalesDates();
  const [ticketTiers, setTicketTiers] = useState<TicketTier[]>([
    {
      name: "General Admission",
      price_cents: 0,
      quantity_total: 500,
      per_user_limit: 20,
      sales_start: defaultDates.sales_start,
      sales_end: defaultDates.sales_end,
      useStages: false,
      stages: [
        {
          name: "Standard",
          price_cents: 0,
          quantity: 500,
          order_index: 0,
        },
      ],
      registration_form_fields: null,
    },
  ]);

  // Track organizer input prices (what they want to receive)
  const [tierBasePrices, setTierBasePrices] = useState<{
    [tierIndex: number]: string;
  }>({});

  const [stageBasePrices, setStageBasePrices] = useState<{
    [tierIndex: number]: { [stageIndex: number]: string };
  }>({});

  // Per-tier registration form modal state — which tier (by index) is open.
  const [formFieldsModalForTier, setFormFieldsModalForTier] = useState<
    number | null
  >(null);

  // Event-level form fields visible to the per-tier selector. We mirror the
  // EXACT shape passed in the eventual POST payload (i.e. drop blank-label
  // drafts) so the per-tier modal can never select a field that won't ship.
  const visibleEventFormFields = registrationFormEnabled
    ? registrationFields.filter((f) => f.label.trim() !== "" && !f.archived)
    : [];
  const hasEventForm = visibleEventFormFields.length > 0;

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      slug: generateSlug(name),
    }));
  };

  const handleAddTier = () => {
    setTicketTiers(prev => [
      ...prev,
      {
        name: `Tier ${prev.length + 1}`,
        price_cents: 0,
        quantity_total: 500,
        per_user_limit: 20,
        sales_start: "",
        sales_end: formData.ends_at || "",
        useStages: false,
        stages: [
          {
            name: "Standard",
            price_cents: 0,
            quantity: 500,
            order_index: 0,
          },
        ],
        registration_form_fields: null,
      },
    ]);
  };

  const handleTierFormFieldsChange = (
    tierIndex: number,
    next: string[] | null,
  ) => {
    setTicketTiers((prev) =>
      prev.map((tier, i) =>
        i === tierIndex ? { ...tier, registration_form_fields: next } : tier,
      ),
    );
  };

  const handleRemoveTier = (index: number) => {
    if (ticketTiers.length > 1) {
      setTicketTiers(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleAddStage = (tierIndex: number) => {
    setTicketTiers(prev =>
      prev.map((tier, i) => {
        if (i === tierIndex) {
          const nextOrderIndex = tier.stages.length;
          const newStages = [
            ...tier.stages,
            {
              name: `Stage ${nextOrderIndex + 1}`,
              price_cents: 0,
              quantity: 25,
              order_index: nextOrderIndex,
            },
          ];

          const newTotalQuantity = newStages.reduce(
            (sum, stage) => sum + stage.quantity,
            0
          );

          return {
            ...tier,
            quantity_total: newTotalQuantity, // Sync base quantity with stage total
            stages: newStages,
          };
        }
        return tier;
      })
    );
  };

  const handleRemoveStage = (tierIndex: number, stageIndex: number) => {
    setTicketTiers(prev =>
      prev.map((tier, i) => {
        if (i === tierIndex) {
          if (tier.stages.length > 1) {
            const newStages = tier.stages.filter((_, j) => j !== stageIndex);
            const newTotalQuantity = newStages.reduce(
              (sum, stage) => sum + stage.quantity,
              0
            );

            return {
              ...tier,
              quantity_total: newTotalQuantity, // Sync base quantity with stage total
              stages: newStages,
            };
          }
        }
        return tier;
      })
    );
  };

  const handleStageChange = (
    tierIndex: number,
    stageIndex: number,
    field: keyof FormTicketStage,
    value: any
  ) => {
    setTicketTiers(prev =>
      prev.map((tier, i) => {
        if (i === tierIndex) {
          const updatedStages = tier.stages.map((stage, j) =>
            j === stageIndex ? { ...stage, [field]: value } : stage
          );

          // If quantity changed, sync the base quantity_total
          if (field === "quantity") {
            const newTotalQuantity = updatedStages.reduce(
              (sum, stage) => sum + stage.quantity,
              0
            );
            return {
              ...tier,
              quantity_total: newTotalQuantity, // Sync base quantity with stage total
              stages: updatedStages,
            };
          }

          return {
            ...tier,
            stages: updatedStages,
          };
        }
        return tier;
      })
    );
  };

  const handleUseStagesToggle = (tierIndex: number, useStages: boolean) => {
    setTicketTiers(prev =>
      prev.map((tier, i) => {
        if (i === tierIndex) {
          if (useStages) {
            // Enable stages - split the current total quantity across stages
            const halfQuantity = Math.floor(tier.quantity_total / 2);
            const remainderQuantity = tier.quantity_total - halfQuantity;

            return {
              ...tier,
              useStages: true,
              stages: [
                {
                  name: "Early Bird",
                  price_cents: tier.price_cents,
                  quantity: halfQuantity,
                  order_index: 0,
                },
                {
                  name: "Regular",
                  price_cents: tier.price_cents,
                  quantity: remainderQuantity,
                  order_index: 1,
                },
              ],
            };
          } else {
            // Disable stages - update quantity_total to match current stage total
            const currentTotalQuantity = tier.stages.reduce(
              (sum, stage) => sum + stage.quantity,
              0
            );

            return {
              ...tier,
              useStages: false,
              quantity_total: currentTotalQuantity, // Sync base quantity with stage total
              stages: [
                {
                  name: "Standard",
                  price_cents: tier.price_cents,
                  quantity: currentTotalQuantity,
                  order_index: 0,
                },
              ],
            };
          }
        }
        return tier;
      })
    );
  };

  const handleTierChange = (
    index: number,
    field: keyof TicketTier,
    value: any
  ) => {
    setTicketTiers(prev =>
      prev.map((tier, i) => {
        if (i === index) {
          const updatedTier = { ...tier, [field]: value };

          // If quantity_total changed and stages are disabled, sync the single stage
          if (
            field === "quantity_total" &&
            !tier.useStages &&
            tier.stages.length === 1
          ) {
            return {
              ...updatedTier,
              stages: [
                {
                  ...tier.stages[0],
                  quantity: value, // Sync single stage quantity with base quantity
                },
              ],
            };
          }

          return updatedTier;
        }
        return tier;
      })
    );
  };

  const handleImageUpload = async (file: File) => {
    // Helper to reset file input
    const resetFileInput = () => {
      const fileInput = document.getElementById(
        "image-upload"
      ) as HTMLInputElement;
      if (fileInput) {
        fileInput.value = "";
      }
    };

    // Validate that we have a valid slug before uploading
    if (!formData.slug || formData.slug.trim() === "") {
      setImageError(
        "Please enter an event name first before uploading an image"
      );
      resetFileInput();
      return;
    }

    if (!file.type.startsWith("image/")) {
      setImageError("Please select a valid image file");
      resetFileInput();
      return;
    }

    if (file.size > 4.5 * 1024 * 1024) {
      setImageError(
        `Image size must be less than 4.5MB. Your file is ${(
          file.size /
          1024 /
          1024
        ).toFixed(2)}MB.`
      );
      resetFileInput();
      return;
    }

    try {
      setImageFile(file);

      // Resize the image client-side
      const resizedImageBlob = await resizeImageTo4x5(file);

      // Clean up any existing preview URL before creating a new one
      if (imagePreview && imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }

      // Create a preview URL for display
      const previewUrl = URL.createObjectURL(resizedImageBlob);
      setImagePreview(previewUrl);

      // Store the resized blob locally for later upload (after event is created)
      setPendingImageBlob(resizedImageBlob);

      // Update form data with preview URL (will be replaced with actual URL after upload)
      setFormData(prev => ({ ...prev, image_url: previewUrl }));
      setImageError(""); // Clear any previous errors
    } catch (err) {
      setImageError(
        err instanceof Error
          ? err.message
          : "Failed to process image. Please try a different image."
      );

      // Clean up blob URL before clearing state to prevent memory leak
      if (imagePreview && imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }

      setImageFile(null);
      setImagePreview("");
      setPendingImageBlob(null);
      setFormData(prev => ({ ...prev, image_url: "" }));

      // Reset file input so user can try again
      resetFileInput();
    }
  };

  const handleImageRemove = () => {
    // Clean up any blob URL before removing
    if (imagePreview && imagePreview.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreview);
    }
    setImageFile(null);
    setImagePreview("");
    setPendingImageBlob(null);
    setImageError(""); // Clear any image errors
    setFormData(prev => ({ ...prev, image_url: "" }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("dragover");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("dragover");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("dragover");
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleImageUpload(files[0]);
    }
  };

  const tz = formData.timezone || "America/Guayaquil";

  const formatDateTimeForAPI = (dateTimeLocal: string): string => {
    if (!dateTimeLocal) return "";
    return localToUtc(dateTimeLocal, tz);
  };

  // Helper function to get datetime for min attribute with optional hours ahead (selected timezone)
  const getDateTimeLocal = (hoursAhead: number = 0): string => {
    return getNowInTimezone(tz, hoursAhead);
  };

  // Helper function to validate form data and return error message if invalid
  // NOTE: This validation EXACTLY mirrors backend validation in /api/events/route.ts
  // Any changes here MUST be replicated in the backend to prevent inconsistencies
  const validateFormData = (): string | null => {
    // Validate that slug is not empty (prevents names with only symbols/non-Latin chars)
    if (!formData.slug || formData.slug.trim() === "") {
      return "Event name must contain at least one letter or number. Names with only symbols or special characters are not allowed.";
    }

    // Validate required event fields
    if (!formData.starts_at || !formData.ends_at) {
      return "Start and end dates are required";
    }

    // Convert selected timezone local time to UTC for consistent validation
    const startsAtUtc = localToUtc(formData.starts_at, tz);
    const endsAtUtc = localToUtc(formData.ends_at, tz);

    // Check for invalid date conversion
    if (!startsAtUtc || !endsAtUtc) {
      return "Invalid date format";
    }

    // Validate event dates using UTC
    const startDate = new Date(startsAtUtc);
    const endDate = new Date(endsAtUtc);
    const now = new Date();

    // Guard against invalid dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return "Invalid date format";
    }

    // Check if start date is at least 2 hours in the future (UTC comparison)
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    if (startDate < twoHoursFromNow) {
      return "Event start time must be at least 2 hours in the future";
    }

    // Validate that event end time is after start time
    if (endDate <= startDate) {
      return "End date must be after start date";
    }

    // Validate ticket tier dates and stages
    for (let i = 0; i < ticketTiers.length; i++) {
      const tier = ticketTiers[i];

      // Check if tier sales end date is provided (sales_start is optional)
      if (!tier.sales_end) {
        return `Ticket tier "${tier.name}" is missing a sales end date`;
      }

      // Validate per_user_limit
      if (
        tier.per_user_limit == null ||
        typeof tier.per_user_limit !== "number"
      ) {
        return `Ticket tier "${tier.name}" must have a per-user limit`;
      }
      if (tier.per_user_limit < 1) {
        return `Ticket tier "${tier.name}" per-user limit must be at least 1`;
      }
      if (tier.per_user_limit > 50) {
        return `Ticket tier "${tier.name}" per-user limit cannot exceed 50`;
      }

      // Validate quantity_total
      if (
        tier.quantity_total == null ||
        typeof tier.quantity_total !== "number"
      ) {
        return `Ticket tier "${tier.name}" must have a total quantity`;
      }
      if (tier.quantity_total <= 0) {
        return `Ticket tier "${tier.name}" must have at least 1 ticket`;
      }

      // Validate stages if useStages is enabled
      if (tier.useStages) {
        if (!tier.stages || tier.stages.length === 0) {
          return `Ticket tier "${tier.name}" must have at least one price stage`;
        }
      } else {
        // For non-staged tiers, validate the base price (allow 0 for free tickets)
        if (tier.price_cents == null || typeof tier.price_cents !== "number") {
          return `Ticket tier "${tier.name}" must have a price`;
        }
        if (tier.price_cents < 0) {
          return `Ticket tier "${tier.name}" must have a valid price (cannot be negative)`;
        }
      }

      // Validate each stage if useStages is enabled
      if (tier.useStages) {
        for (let j = 0; j < tier.stages.length; j++) {
          const stage = tier.stages[j];

          if (!stage.name.trim()) {
            return `Ticket tier "${tier.name}": Stage ${
              j + 1
            } must have a name`;
          }

          if (
            stage.price_cents == null ||
            typeof stage.price_cents !== "number"
          ) {
            return `Ticket tier "${tier.name}": Stage "${stage.name}" must have a price`;
          }
          if (stage.price_cents < 0) {
            return `Ticket tier "${tier.name}": Stage "${stage.name}" must have a valid price (cannot be negative)`;
          }

          if (stage.quantity == null || typeof stage.quantity !== "number") {
            return `Ticket tier "${tier.name}": Stage "${stage.name}" must have a quantity`;
          }
          if (stage.quantity <= 0) {
            return `Ticket tier "${tier.name}": Stage "${stage.name}" must have a quantity greater than 0`;
          }
        }
      }

      // Convert tier dates to UTC for consistent validation
      // sales_start is optional — blank means server will default to now
      const salesStartUtc = tier.sales_start ? localToUtc(tier.sales_start, tz) : null;
      const salesEndUtc = localToUtc(tier.sales_end, tz);

      // Check for invalid date conversion
      if (!salesEndUtc) {
        return `Ticket tier "${tier.name}" has invalid date format`;
      }
      if (tier.sales_start && !salesStartUtc) {
        return `Ticket tier "${tier.name}" has invalid sales start date format`;
      }

      // Validate tier date formats and logic using UTC
      const salesEndDate = new Date(salesEndUtc);

      // Guard against invalid dates
      if (isNaN(salesEndDate.getTime())) {
        return `Ticket tier "${tier.name}" has invalid date format`;
      }

      // Validate that tier sales end is after sales start (only if sales_start was provided)
      if (salesStartUtc) {
        const salesStartDate = new Date(salesStartUtc);
        if (!isNaN(salesStartDate.getTime()) && salesEndDate <= salesStartDate) {
          return `Ticket tier "${tier.name}": Sales end date must be after start date`;
        }
      }
    }

    return null; // No validation errors
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate form data
    const validationError = validateFormData();
    if (validationError) {
      setError(validationError);
      return;
    }

    // Guard: organizer enabled the registration form but all field labels are blank
    if (formData.requires_rsvp && registrationFormEnabled) {
      const validRegistrationFieldsCheck = registrationFields.filter(f => f.label.trim() !== "");
      if (validRegistrationFieldsCheck.length === 0) {
        setError("Registration form is enabled but has no valid fields. Add at least one field with a label, or uncheck \"Include registration form\".");
        return;
      }
    }

    // Format datetime fields for API
    const validRegistrationFields = registrationFields.filter(f => f.label.trim() !== "");
    const formattedEvent = {
      ...formData,
      // Sanitize image_url: never send blob: URLs to backend
      image_url: formData.image_url.startsWith("blob:")
        ? ""
        : formData.image_url,
      organization_id: organizationId,
      status: "published" as const,
      requires_rsvp: formData.requires_rsvp,
      currency: formData.currency,
      timezone: formData.timezone,
      starts_at: formatDateTimeForAPI(formData.starts_at),
      ends_at: formatDateTimeForAPI(formData.ends_at),
      ...(formData.requires_rsvp && registrationFormEnabled && validRegistrationFields.length > 0 && {
        registration_form_config: validRegistrationFields,
      }),
    };

    const formattedTicketTiers = ticketTiers.map(tier => ({
      ...tier,
      quantity_total: tier.stages.reduce(
        (sum, stage) => sum + stage.quantity,
        0
      ),
      // sales_start is optional — blank sends null so server defaults to now
      sales_start: tier.sales_start ? formatDateTimeForAPI(tier.sales_start) : null,
      sales_end: formatDateTimeForAPI(tier.sales_end),
      // Per-tier registration form subset. Only send when the event has a form
      // configured — otherwise it's meaningless. `null` means "inherit all".
      registration_form_fields: hasEventForm
        ? tier.registration_form_fields ?? null
        : null,
    }));

    // Use React Query mutation instead of direct fetch
    createEventMutation.mutate(
      {
        event: formattedEvent,
        ticket_tiers: formattedTicketTiers,
      },
      {
        onSuccess: async data => {
          try {
            // If there's a pending image, upload it now that the event exists
            if (pendingImageBlob && imageFile && data.event.slug) {
              // Track image upload phase
              setIsUploadingImage(true);

              // Convert blob to File for upload
              // Replace the original file extension with .jpg to match the JPEG content type
              const originalName = imageFile.name;
              const nameWithoutExt =
                originalName.substring(0, originalName.lastIndexOf(".")) ||
                originalName;
              const newFileName = `${nameWithoutExt}.jpg`;

              const resizedFile = new File([pendingImageBlob], newFileName, {
                type: "image/jpeg",
              });

              // Upload to Supabase Storage
              const uploadFormData = new FormData();
              uploadFormData.append("file", resizedFile);
              // Prefer eventId (UUID) — slugs are unique per-org only, so a
              // cross-org draft collision would make a slug-only lookup
              // ambiguous. See /api/upload-image route for rationale.
              uploadFormData.append("eventId", data.event.id);
              uploadFormData.append("eventSlug", data.event.slug);

              const uploadResponse = await fetch("/api/upload-image", {
                method: "POST",
                body: uploadFormData,
              });

              if (uploadResponse.ok) {
                const { url } = await uploadResponse.json();

                // Update the event with the image URL
                await fetch("/api/events", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    id: data.event.id,
                    image_url: url,
                  }),
                });
              }
              // If upload fails, we still continue (event was created successfully)
            }
          } catch (uploadErr) {
            console.error("Failed to upload image:", uploadErr);
            // Continue anyway - event was created successfully
          } finally {
            // Clear upload state
            setIsUploadingImage(false);

            // Clean up blob URL
            if (imagePreview && imagePreview.startsWith("blob:")) {
              URL.revokeObjectURL(imagePreview);
            }

            // Show success modal AFTER everything is complete (event + image upload)
            setIsNavigating(true);

            setTimeout(() => {
              const target = orgSlug
                ? `/organizer?org=${encodeURIComponent(orgSlug)}`
                : "/organizer";
              router.push(target);
            }, 1000);
          }
        },
        onError: error => {
          setError(error.message || "An error occurred");
          setIsNavigating(false);
          setIsUploadingImage(false);
        },
      }
    );
  };

  return (
    <div className="w-full">
      {/* Success overlay during navigation */}
      <ConfirmationModal
        isOpen={isNavigating}
        variant="success"
        title="Event Created Successfully!"
        message="Taking you to your dashboard..."
        showActionButton={false}
      />
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Basic Event Info */}
        <div className="bg-white-5 border border-white-20 rounded-card p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center pb-4 border-b border-white-20">
            <h3 className="text-lg font-poppins-semibold text-white-100 m-0 flex items-center gap-2">
              <FiFileText size={20} />
              Event Details
            </h3>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">
              Event Name *
            </label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="e.g., Summer Music Festival 2025"
              required
              className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="slug" className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">
              URL Slug *
            </label>
            <input
              type="text"
              id="slug"
              value={formData.slug}
              readOnly
              placeholder="summer-music-festival-2025"
              className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled
            />
            <p className="text-white-50 text-xs font-poppins m-0">
              This is automatically generated from the event name. It will be
              used in the event's URL.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="city" className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">
                <FiMapPin size={16} />
                City *
              </label>
              <CityAutocompleteField
                id="city"
                value={formData.city}
                onChange={city =>
                  setFormData(prev => ({ ...prev, city }))
                }
                placeholder="San Francisco"
                required
                className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="venue" className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">
                Venue *
              </label>
              <input
                type="text"
                id="venue"
                value={formData.venue}
                onChange={e =>
                  setFormData(prev => ({ ...prev, venue: e.target.value }))
                }
                placeholder="Golden Gate Park"
                required
                className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="starts_at" className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">
                <FiCalendar size={16} />
                Start Date & Time *
              </label>
              <input
                type="datetime-local"
                id="starts_at"
                value={formData.starts_at}
                min={getDateTimeLocal(2)}
                onChange={e => {
                  setFormData(prev => ({ ...prev, starts_at: e.target.value }));
                }}
                required
                className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="ends_at" className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">
                <FiClock size={16} />
                End Date & Time *
              </label>
              <input
                type="datetime-local"
                id="ends_at"
                value={formData.ends_at}
                min={getDateTimeLocal(2)}
                onChange={e => {
                  const newEndTime = e.target.value;
                  setFormData(prev => ({ ...prev, ends_at: newEndTime }));

                  // Auto-fill tier sales_end with event end time when it hasn't been set yet
                  if (newEndTime) {
                    setTicketTiers(prev =>
                      prev.map(tier => {
                        if (!tier.sales_end || tier.sales_end.trim() === "") {
                          return { ...tier, sales_end: newEndTime };
                        }
                        return tier;
                      })
                    );
                  }
                }}
                required
                className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="description" className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">
              Description
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={e =>
                setFormData(prev => ({ ...prev, description: e.target.value }))
              }
              placeholder="Tell people about your event..."
              rows={4}
              maxLength={520}
              className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors resize-y min-h-[96px]"
            />
            <p className="text-white-50 text-xs font-poppins m-0">
              {formData.description.length}/520 characters
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">
              <FiImage size={16} />
              Event Image
            </label>

            {!imagePreview ? (
              <div
                className="border-2 border-dashed border-white-20 rounded-card p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-white-50 transition-colors"
                style={{
                  opacity: !formData.slug ? 0.5 : 1,
                  cursor: !formData.slug ? "not-allowed" : "pointer",
                }}
                onDragOver={formData.slug ? handleDragOver : undefined}
                onDragLeave={formData.slug ? handleDragLeave : undefined}
                onDrop={formData.slug ? handleDrop : undefined}
                onClick={() =>
                  formData.slug
                    ? document.getElementById("image-upload")?.click()
                    : setImageError(
                        "Please enter an event name first before uploading an image"
                      )
                }
              >
                <FiUpload size={32} className="text-white-50" />
                <p className="text-white-80 text-sm font-poppins text-center m-0">
                  {!formData.slug
                    ? "Enter event name first"
                    : "Click to upload or drag and drop"}
                </p>
                <p className="text-white-50 text-xs font-poppins text-center m-0">
                  PNG, JPG, GIF, WebP up to 4.5MB. Recommended size: 1080×1350.
                </p>
              </div>
            ) : (
              <div className="relative w-full h-48 rounded-card overflow-hidden group">
                <Image src={imagePreview} alt="Event preview" fill sizes="100vw" className="object-cover" unoptimized={imagePreview.startsWith("blob:")} />
                <div className="absolute inset-0 bg-background/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="w-10 h-10 rounded-full bg-white-10 border border-white-30 text-white-100 flex items-center justify-center hover:bg-white-20 transition-colors cursor-pointer"
                      onClick={() => document.getElementById("image-upload")?.click()}
                    >
                      <FiEdit2 size={16} />
                    </button>
                    <button
                      type="button"
                      className="w-10 h-10 rounded-full bg-white-10 border border-white-30 text-white-100 flex items-center justify-center hover:bg-white-20 transition-colors cursor-pointer"
                      onClick={handleImageRemove}
                    >
                      <FiX size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <input
              type="file"
              id="image-upload"
              accept="image/*"
              disabled={!formData.slug}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(file);
              }}
              className="hidden"
            />

            {imageError && (
              <div className="text-red-400 text-sm font-poppins" style={{ marginTop: "0.5rem" }}>
                {imageError}
              </div>
            )}

            <p className="text-white-50 text-xs font-poppins m-0">
              Upload an image to make your event more attractive. Recommended
              size: 1080×1350.
            </p>
          </div>
        </div>

        {/* RSVP Settings */}
        <div className="bg-white-5 border border-white-20 rounded-card p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center pb-4 border-b border-white-20">
            <h3 className="text-lg font-poppins-semibold text-white-100 m-0 flex items-center gap-2">
              <FiClock size={20} />
              Purchase Settings
            </h3>
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <div className={`relative w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${formData.requires_rsvp ? "bg-white-100 border-white-100" : "border-white-30 bg-transparent"}`}>
                <input
                  type="checkbox"
                  checked={formData.requires_rsvp}
                  onChange={e => {
                    setFormData(prev => ({ ...prev, requires_rsvp: e.target.checked }));
                    if (!e.target.checked) {
                      setRegistrationFormEnabled(false);
                      setRegistrationFields([]);
                    }
                  }}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                />
                {formData.requires_rsvp && <FiCheck className="text-dark pointer-events-none" size={12} />}
              </div>
              <span className="text-white-80 text-sm font-poppins">RSVP Required?</span>
            </label>
            <p className="text-white-50 text-xs font-poppins m-0">
              {formData.requires_rsvp ? (
                <>
                  <strong>RSVP Mode:</strong> Attendees must submit a request
                  and wait for your approval before they can purchase tickets.
                  This gives you control over who can attend your event.
                </>
              ) : (
                <>
                  <strong>Direct Purchase Mode:</strong> Attendees can purchase
                  tickets immediately without approval. Tickets will be reserved
                  for 5 minutes during checkout to prevent overselling.
                </>
              )}
            </p>

            {/* Registration form builder — only visible when RSVP is on */}
            {formData.requires_rsvp && (
              <div className="flex flex-col gap-3 pt-2 border-t border-white-20">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className={`relative w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${registrationFormEnabled ? "bg-white-100 border-white-100" : "border-white-30 bg-transparent"}`}>
                    <input
                      type="checkbox"
                      checked={registrationFormEnabled}
                      onChange={e => {
                        const enabled = e.target.checked;
                        setRegistrationFormEnabled(enabled);
                        if (!enabled) {
                          setRegistrationFields([]);
                        } else if (registrationFields.length === 0) {
                          setRegistrationFields([createEmptyField()]);
                        }
                      }}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    />
                    {registrationFormEnabled && <FiCheck className="text-dark pointer-events-none" size={12} />}
                  </div>
                  <span className="text-white-80 text-sm font-poppins">Include registration form</span>
                </label>

                {registrationFormEnabled && (
                  <div className="pl-8">
                    <RegistrationFormBuilder
                      fields={registrationFields}
                      onChange={setRegistrationFields}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Currency */}
        <div className="bg-white-5 border border-white-20 rounded-card p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center pb-4 border-b border-white-20">
            <h3 className="text-lg font-poppins-semibold text-white-100 m-0 flex items-center gap-2">
              <FiDollarSign size={20} />
              Currency
            </h3>
          </div>
          <div className="flex flex-col gap-2">
            <select
              value={formData.currency}
              onChange={e =>
                setFormData(prev => ({ ...prev, currency: e.target.value }))
              }
              className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="USD">USD - US Dollar</option>
              <option value="EUR">EUR - Euro</option>
              <option value="GBP">GBP - British Pound</option>
              <option value="MXN">MXN - Mexican Peso</option>
              <option value="DOP">DOP - Dominican Peso</option>
              <option value="COP">COP - Colombian Peso</option>
            </select>
            <p className="text-white-50 text-xs font-poppins m-0">
              All ticket prices for this event will be in this currency.
            </p>
          </div>
        </div>

        {/* Timezone */}
        <div className="bg-white-5 border border-white-20 rounded-card p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center pb-4 border-b border-white-20">
            <h3 className="text-lg font-poppins-semibold text-white-100 m-0 flex items-center gap-2">
              <FiClock size={20} />
              Event Timezone
            </h3>
          </div>
          <div className="flex flex-col gap-2">
            <select
              value={formData.timezone}
              onChange={e =>
                setFormData(prev => ({ ...prev, timezone: e.target.value }))
              }
              className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="America/Guayaquil">Ecuador (ECT, UTC-5)</option>
              <option value="America/New_York">Eastern US (ET)</option>
              <option value="America/Chicago">Central US (CT)</option>
              <option value="America/Denver">Mountain US (MT)</option>
              <option value="America/Los_Angeles">Pacific US (PT)</option>
              <option value="America/Bogota">Colombia (COT, UTC-5)</option>
              <option value="America/Lima">Peru (PET, UTC-5)</option>
              <option value="America/Mexico_City">Mexico City (CST)</option>
              <option value="America/Santo_Domingo">Dominican Republic (AST, UTC-4)</option>
              <option value="America/Sao_Paulo">Brazil (BRT, UTC-3)</option>
              <option value="America/Argentina/Buenos_Aires">Argentina (ART, UTC-3)</option>
              <option value="Europe/London">London (GMT/BST)</option>
              <option value="Europe/Madrid">Madrid (CET/CEST)</option>
              <option value="Europe/Paris">Paris (CET/CEST)</option>
              <option value="Europe/Berlin">Berlin (CET/CEST)</option>
              <option value="Asia/Tokyo">Tokyo (JST, UTC+9)</option>
            </select>
            <p className="text-white-50 text-xs font-poppins m-0">
              Event times will be displayed in this timezone.
            </p>
          </div>
        </div>

        {/* Ticket Tiers */}
        <div className="bg-white-5 border border-white-20 rounded-card p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center pb-4 border-b border-white-20">
            <h3 className="text-lg font-poppins-semibold text-white-100 m-0 flex items-center gap-2">
              <FiDollarSign size={20} />
              Ticket Tiers
            </h3>
            <button
              type="button"
              onClick={handleAddTier}
              disabled={ticketTiers.length >= MAX_TICKET_TIERS_PER_EVENT}
              className="bg-white-10 border border-white-20 text-white-100 font-poppins-medium text-xs rounded-pill px-3 py-1.5 cursor-pointer hover:bg-white-20 transition-colors"
              title={
                ticketTiers.length >= MAX_TICKET_TIERS_PER_EVENT
                  ? `Maximum ${MAX_TICKET_TIERS_PER_EVENT} tiers allowed`
                  : "Add another ticket tier"
              }
            >
              Add Tier
            </button>
          </div>

          <p className="text-white-50 text-xs font-poppins m-0">
            <strong>Note:</strong> Events must start at least 2 hours in the
            future. Ticket sales end defaults to the event end time when left
            blank, and each tier&apos;s sales end can extend through or past
            the event start — just ensure it remains after the sales start
            date. Any remaining conflicts will be surfaced as validation errors
            on submit.
          </p>

          {hasEventForm && formFieldsModalForTier !== null && (
            <RegistrationFormFieldsModal
              isOpen={formFieldsModalForTier !== null}
              eventFormFields={visibleEventFormFields}
              value={
                ticketTiers[formFieldsModalForTier]?.registration_form_fields ??
                null
              }
              onChange={(next) =>
                handleTierFormFieldsChange(formFieldsModalForTier, next)
              }
              onClose={() => setFormFieldsModalForTier(null)}
            />
          )}

          {ticketTiers.map((tier, index) => (
            <div key={index} className="bg-white-5 border border-white-20 rounded-card p-4 flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <h4 className="text-white-100 text-sm font-poppins-semibold m-0">Tier {index + 1}</h4>

                  {/* Stages are enabled */}
                  <div className="flex items-center">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div className={`relative w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${tier.useStages ? "bg-white-100 border-white-100" : "border-white-30 bg-transparent"}`}>
                        <input
                          type="checkbox"
                          checked={tier.useStages}
                          onChange={e =>
                            handleUseStagesToggle(index, e.target.checked)
                          }
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                        />
                        {tier.useStages && <FiCheck className="text-dark pointer-events-none" size={12} />}
                      </div>
                      <span className="text-white-80 text-sm font-poppins">Use Price Stages</span>
                    </label>
                  </div>
                </div>
                {ticketTiers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveTier(index)}
                    className="bg-red-500/10 border border-red-500/30 text-red-400 font-poppins-medium text-xs rounded-pill px-3 py-1.5 cursor-pointer hover:bg-red-500/20 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">Tier Name *</label>
                  <input
                    type="text"
                    value={tier.name}
                    onChange={e =>
                      handleTierChange(index, "name", e.target.value)
                    }
                    placeholder="Early Bird, General, VIP..."
                    required
                    className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">Per User Limit *</label>
                  <input
                    type="number"
                    value={tier.per_user_limit ?? ""}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === "") {
                        handleTierChange(index, "per_user_limit", null);
                      } else {
                        const parsed = parseInt(val);
                        handleTierChange(
                          index,
                          "per_user_limit",
                          isNaN(parsed) || parsed < 1 ? 1 : Math.min(parsed, 50)
                        );
                      }
                    }}
                    onWheel={e => e.currentTarget.blur()}
                    placeholder="4"
                    min="1"
                    max="50"
                    required
                    className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* W4-C2 (May 2026): tier-level description. Shown on attendee
                  tier cards under the price. Stage description (if set)
                  replaces this on the public surface while the stage is
                  active. Mirrors the edit-flow TierInlineForm textarea. */}
              <DescriptionField
                label="Description (optional)"
                value={tier.description ?? ""}
                onChange={v => handleTierChange(index, "description", v)}
                placeholder="What's included? E.g. 'Unlimited drinks, free entry until 11pm'"
              />

              {/* Base Price and Quantity - shown when stages are disabled */}
              {!tier.useStages && (
                <>
                  <div className="flex flex-col gap-2">
                    <label className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">
                      Your Ticket Price ({formData.currency}) *
                    </label>
                    <p
                      className="text-white-50 text-xs font-poppins m-0"
                      style={{
                        marginTop: "4px",
                        marginBottom: "8px",
                        fontSize: "0.85rem",
                      }}
                    >
                      Enter the amount you want to receive per ticket
                    </p>
                    <input
                      type="number"
                      value={tierBasePrices[index] || ""}
                      onChange={e => {
                        const val = e.target.value;
                        setTierBasePrices(prev => ({ ...prev, [index]: val }));

                        if (val === "" || val === "-" || val === "0") {
                          handleTierChange(index, "price_cents", 0);
                        } else {
                          const parsed = parseFloat(val);
                          if (
                            !isNaN(parsed) &&
                            isFinite(parsed) &&
                            parsed > 0
                          ) {
                            handleTierChange(
                              index,
                              "price_cents",
                              Math.round(parsed * 100) // Save BASE price in cents
                            );
                          } else {
                            // Treat invalid or non-positive parsed values as free
                            handleTierChange(index, "price_cents", 0);
                          }
                        }
                      }}
                      onWheel={e => e.currentTarget.blur()}
                      placeholder="100.00"
                      min="0"
                      step="0.01"
                      required
                      className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">Total Tickets *</label>
                    <input
                      type="number"
                      value={tier.quantity_total ?? ""}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === "") {
                          handleTierChange(index, "quantity_total", null);
                        } else {
                          const parsed = parseInt(val);
                          handleTierChange(
                            index,
                            "quantity_total",
                            isNaN(parsed) || parsed < 1 ? 1 : parsed
                          );
                        }
                      }}
                      onWheel={e => e.currentTarget.blur()}
                      placeholder="100"
                      min="1"
                      required
                      className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">Sales Start (optional)</label>
                  <input
                    type="datetime-local"
                    value={tier.sales_start}
                    onChange={e =>
                      handleTierChange(index, "sales_start", e.target.value)
                    }
                    className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">Sales End *</label>
                  <input
                    type="datetime-local"
                    value={tier.sales_end}
                    min={getDateTimeLocal(0)}
                    onChange={e =>
                      handleTierChange(index, "sales_end", e.target.value)
                    }
                    required
                    className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* W4-C3 (Jun 2026): Access code + visibility toggles. Mirrors
                  TierInlineForm so organizers can set up a hidden / code-gated
                  / closed tier at create-event time. */}
              <div className="flex flex-col gap-1">
                <label className="text-white-80 text-sm font-poppins-medium">
                  Access Code (optional)
                </label>
                <input
                  type="text"
                  value={tier.secret_code ?? ""}
                  onChange={e => {
                    // Trim + uppercase so the stored value matches the
                    // edit-flow normalization. Empty stays null (instead of
                    // ""), so the server's hidden-tier gate (which checks
                    // `is_hidden && secret_code`) treats unset as unset.
                    // 3-char minimum is enforced at submit/server, not on
                    // every keystroke, so the input stays responsive.
                    const normalized = e.target.value.trim().toUpperCase();
                    handleTierChange(
                      index,
                      "secret_code",
                      normalized.length === 0 ? null : normalized,
                    );
                  }}
                  placeholder="Min. 3 characters — saved in capitals"
                  autoCapitalize="characters"
                  className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors uppercase"
                />
                <p className="text-white-30 text-xs font-poppins mt-0.5">
                  Attendees enter this code on the event page to unlock and select this tier.
                </p>
                {tier.secret_code && !tier.is_hidden && (
                  <p className="text-[#FBD68D] text-xs font-poppins mt-1">
                    Access codes only work on hidden tiers. Enable &ldquo;Hide tier&rdquo;
                    below to require this code for unlock.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 rounded-card border border-white-10 bg-white-5 px-4 py-3">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!tier.is_manually_sold_out}
                    onChange={e =>
                      handleTierChange(
                        index,
                        "is_manually_sold_out",
                        e.target.checked,
                      )
                    }
                    className="mt-0.5 w-[18px] h-[18px] cursor-pointer accent-white"
                  />
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
                  <input
                    type="checkbox"
                    checked={!!tier.is_hidden}
                    onChange={e =>
                      handleTierChange(index, "is_hidden", e.target.checked)
                    }
                    className="mt-0.5 w-[18px] h-[18px] cursor-pointer accent-white"
                  />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-white-100 text-sm font-poppins-medium">
                      Hide tier
                    </span>
                    <span className="text-white-50 text-xs font-poppins">
                      Hide from attendees entirely. You&rsquo;ll still see and
                      manage this tier on your dashboard.
                    </span>
                  </div>
                </label>
              </div>

              {/* Per-tier registration form subset. Hidden when no event form is configured. */}
              {hasEventForm ? (
                <div className="flex items-center justify-between rounded-card border border-white-10 bg-white-5 px-4 py-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-white-100 text-sm font-poppins-medium">
                      Registration form
                    </span>
                    <span className="text-white-50 text-xs font-poppins truncate">
                      {tier.registration_form_fields === null ||
                      tier.registration_form_fields === undefined
                        ? `All ${visibleEventFormFields.length} event field${visibleEventFormFields.length === 1 ? "" : "s"}`
                        : `${tier.registration_form_fields.length} of ${visibleEventFormFields.length} selected`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormFieldsModalForTier(index)}
                    className="rounded-pill border border-white-20 px-4 py-1.5 text-white-100 text-xs font-poppins hover:border-white-50 transition-colors cursor-pointer shrink-0"
                  >
                    {tier.registration_form_fields === null ||
                    tier.registration_form_fields === undefined
                      ? "Customize"
                      : "Edit"}
                  </button>
                </div>
              ) : formData.requires_rsvp ? (
                <p className="text-white-50 text-xs font-poppins italic">
                  Enable the registration form for this event to customize which
                  fields each tier collects.
                </p>
              ) : null}

              {/* Ticket Stages - only show when useStages is enabled */}
              {tier.useStages && (
                <div className="flex flex-col gap-3 border-t border-white-20 pt-4">
                  <div className="flex items-center justify-between">
                    <h5 className="text-white-100 text-sm font-poppins-semibold m-0">Price Stages</h5>
                    <button
                      type="button"
                      onClick={() => handleAddStage(index)}
                      className="bg-white-10 border border-white-20 text-white-100 font-poppins-medium text-xs rounded-pill px-3 py-1.5 cursor-pointer hover:bg-white-20 transition-colors"
                    >
                      Add Stage
                    </button>
                  </div>

                  {tier.stages.map((stage, stageIndex) => (
                    <div key={stageIndex} className="bg-white-10 border border-white-20 rounded-card p-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-white-100 text-sm font-poppins-semibold">Stage {stageIndex + 1}</span>
                        {tier.stages.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveStage(index, stageIndex)}
                            className="bg-red-500/10 border border-red-500/30 text-red-400 font-poppins-medium text-xs rounded-pill px-3 py-1.5 cursor-pointer hover:bg-red-500/20 transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      {/* Stage Name and Price (Left) + Breakdown (Right) */}
                      <div className="flex flex-col gap-3">
                        {/* Left Column: Stage Name and Price */}
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col gap-2">
                            <label className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">
                              Stage Name *
                            </label>
                            <input
                              type="text"
                              value={stage.name}
                              onChange={e =>
                                handleStageChange(
                                  index,
                                  stageIndex,
                                  "name",
                                  e.target.value
                                )
                              }
                              placeholder="Early Bird, Sale 1, Final..."
                              required
                              className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>

                          <div
                            className="flex flex-col gap-2"
                            style={{ marginTop: "12px" }}
                          >
                            <label className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">
                              Your Price for This Stage ({formData.currency}) *
                            </label>
                            <p
                              className="text-white-50 text-xs font-poppins m-0"
                              style={{
                                marginTop: "4px",
                                marginBottom: "8px",
                                fontSize: "0.85rem",
                              }}
                            >
                              What you want to receive per ticket in this stage
                            </p>
                            <input
                              type="number"
                              value={stageBasePrices[index]?.[stageIndex] || ""}
                              onChange={e => {
                                const val = e.target.value;
                                setStageBasePrices(prev => ({
                                  ...prev,
                                  [index]: {
                                    ...(prev[index] || {}),
                                    [stageIndex]: val,
                                  },
                                }));

                                if (val === "" || val === "-" || val === "0") {
                                  handleStageChange(
                                    index,
                                    stageIndex,
                                    "price_cents",
                                    0
                                  );
                                } else {
                                  const parsed = parseFloat(val);
                                  if (
                                    !isNaN(parsed) &&
                                    isFinite(parsed) &&
                                    parsed > 0
                                  ) {
                                    handleStageChange(
                                      index,
                                      stageIndex,
                                      "price_cents",
                                      Math.round(parsed * 100) // Save BASE price in cents
                                    );
                                  } else {
                                    // Treat invalid or non-positive parsed values as free
                                    handleStageChange(
                                      index,
                                      stageIndex,
                                      "price_cents",
                                      0
                                    );
                                  }
                                }
                              }}
                              onWheel={e => e.currentTarget.blur()}
                              placeholder="100.00"
                              min="0"
                              step="0.01"
                              required
                              className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-white-80 text-sm font-poppins-medium flex items-center gap-1">Quantity *</label>
                        <input
                          type="number"
                          value={stage.quantity ?? ""}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === "") {
                              handleStageChange(
                                index,
                                stageIndex,
                                "quantity",
                                null
                              );
                            } else {
                              const parsed = parseInt(val);
                              handleStageChange(
                                index,
                                stageIndex,
                                "quantity",
                                isNaN(parsed) || parsed < 1 ? 1 : parsed
                              );
                            }
                          }}
                          onWheel={e => e.currentTarget.blur()}
                          placeholder="50"
                          min="1"
                          required
                          className="bg-white-5 border border-white-20 rounded-card px-3 py-2.5 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>

                      {/* W4-C2 (May 2026): per-stage description (optional).
                          Replaces the tier description on attendee tier cards
                          while this stage is active. */}
                      <DescriptionField
                        label="Stage Description (optional)"
                        value={stage.description ?? ""}
                        onChange={v =>
                          handleStageChange(
                            index,
                            stageIndex,
                            "description",
                            v,
                          )
                        }
                        placeholder="Stage-specific perk or note (e.g. 'Includes welcome drink')"
                      />
                    </div>
                  ))}

                  <div className="text-white-50 text-xs font-poppins m-0">
                    Total tickets for this tier:{" "}
                    {tier.stages.reduce(
                      (sum, stage) => sum + stage.quantity,
                      0
                    )}
                    {tier.stages.reduce(
                      (sum, stage) => sum + stage.quantity,
                      0
                    ) !== tier.quantity_total && (
                      <span
                        style={{
                          marginLeft: "1rem",
                          fontWeight: "bold",
                          color: "#f59e0b",
                        }}
                      >
                        (Base: {tier.quantity_total})
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Form Actions */}
        {error && <div className="text-red-400 text-sm font-poppins">{error}</div>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              const targetUrl = orgSlug
                ? `/organizer?org=${encodeURIComponent(orgSlug)}`
                : "/organizer";
              router.push(targetUrl);
            }}
            className="bg-transparent border border-white-30 text-white-100 font-poppins-medium text-sm rounded-pill px-6 py-2.5 cursor-pointer hover:bg-white-10 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              createEventMutation.isPending ||
              isUploadingImage ||
              isNavigating ||
              !formData.name.trim() ||
              !formData.city.trim() ||
              !formData.venue.trim() ||
              !formData.starts_at ||
              !formData.ends_at
            }
            className="bg-white-100 text-dark font-poppins-semibold text-sm rounded-pill px-6 py-2.5 cursor-pointer hover:opacity-90 transition-opacity border-none disabled:opacity-60"
          >
            {isNavigating
              ? "Event Created! Redirecting..."
              : isUploadingImage
              ? "Uploading Image..."
              : createEventMutation.isPending
              ? "Creating Event..."
              : "Create & Publish"}
          </button>
        </div>
      </form>
    </div>
  );
}
