/**
 * Registration Form types
 *
 * Shared shape for event-level registration form fields. Both the web app
 * (`apps/web/app/components/modals/RegistrationFormModal.tsx`) and the mobile
 * app (`apps/mobile/hooks/useRsvpManagement.ts`) define structurally-identical
 * types locally. This canonical definition lives in `@project-flame/lib` so
 * shared helpers (`isFieldVisibleForTier`, `filterFieldsForTier`) can be typed
 * once.
 */

export type FormFieldType = "text" | "email" | "date" | "number" | "checkbox";

export interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  /**
   * Archived fields are hidden from the registrant form and tier pickers for new
   * selections, but still rendered in organizer RSVP detail views and XLSX exports
   * so historical answers remain labeled. Does NOT delete the field or any
   * previously submitted `registration_data` values.
   */
  archived?: boolean;
}
