"use client";

import { useState, useRef, FormEvent, useEffect } from "react";
import { FiCheck, FiX } from "react-icons/fi";
import { z } from "zod";

export interface FormField {
  id: string;
  label: string;
  type: "text" | "email" | "date" | "number" | "checkbox";
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

export type RegistrationFormValues = Record<string, string | boolean>;

export interface RegistrationFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: RegistrationFormValues) => void | Promise<void>;
  formConfig: FormField[];
}

export default function RegistrationFormModal({
  isOpen,
  onClose,
  onSuccess,
  formConfig,
}: RegistrationFormModalProps) {
  const [formData, setFormData] = useState<RegistrationFormValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({});
      setErrors({});
      setIsSubmitting(false);
      setSubmissionError(null);
      // Prevent background scrolling
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Separate effect for Escape key to avoid resetting form on onClose reference changes
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, isSubmitting, onClose]);

  // Focus trap and focus restore
  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    const focusableSelectors =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const getFocusable = () =>
      Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(focusableSelectors) ?? []
      );

    getFocusable()[0]?.focus();

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !modalRef.current) return;
      const focusable = getFocusable();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", handleTabKey);

    return () => {
      document.removeEventListener("keydown", handleTabKey);
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  const handleChange = (id: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [id]: value,
    }));
    // Clear error when user types
    if (errors[id]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[id];
        return newErrors;
      });
    }
  };

  const visibleFields = formConfig.filter((f) => !f.archived);

  const validate = () => {
    const shape: Record<string, z.ZodTypeAny> = {};

    visibleFields.forEach((field) => {
      if (field.type === "checkbox") {
        shape[field.id] = field.required
          ? z.boolean().refine((v) => v === true, { message: "This field is required" })
          : z.boolean().optional();
      } else if (field.type === "email") {
        shape[field.id] = field.required
          ? z.string().min(1, "This field is required").email("Please enter a valid email address")
          : z.string().refine(
              (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
              "Please enter a valid email address"
            ).optional();
      } else {
        shape[field.id] = field.required
          ? z.string().min(1, "This field is required")
          : z.string().optional();
      }
    });

    const schema = z.object(shape);

    // Normalize undefined values so the field-level `min(1, "This field is required")`
    // message surfaces instead of Zod's default type error ("Invalid input: expected
    // string, received undefined"), which leaks into the UI for empty required fields.
    const normalizedFormData: Record<string, unknown> = {};
    visibleFields.forEach((field) => {
      const raw = formData[field.id];
      if (field.type === "checkbox") {
        normalizedFormData[field.id] = raw === true;
      } else {
        normalizedFormData[field.id] = typeof raw === "string" ? raw : "";
      }
    });

    const result = schema.safeParse(normalizedFormData);

    if (!result.success) {
      const newErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const key = String(issue.path[0]);
        if (key && !newErrors[key]) {
          newErrors[key] = issue.message;
        }
      });
      setErrors(newErrors);
      return false;
    }

    setErrors({});
    return true;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      await onSuccess(formData);
      onClose();
    } catch (error) {
      console.error("submitRegistration failed", { error, modal: "RegistrationFormModal" });
      setSubmissionError("Something went wrong. Please try again.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="registration-modal-title"
    >
      <div ref={modalRef} className="bg-surface border border-white-30 rounded-card w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-white-30">
          <h2 id="registration-modal-title" className="text-white-100 font-poppins-medium text-lg">Registration Questions</h2>
          <button
            type="button"
            className="text-white-50 hover:text-white-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => { if (!isSubmitting) onClose(); }}
            disabled={isSubmitting}
            aria-disabled={isSubmitting}
            aria-label="Close modal"
          >
            <FiX size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {visibleFields.map((field) => (
            <div key={field.id} className="flex flex-col gap-2">
              {field.type === "checkbox" ? (
                <label htmlFor={field.id} className="flex items-center gap-2 cursor-pointer text-sm font-poppins text-white-80 select-none">
                  <div className="relative w-[18px] h-[18px] shrink-0">
                    <input
                      type="checkbox"
                      id={field.id}
                      checked={!!formData[field.id]}
                      onChange={(e) => handleChange(field.id, e.target.checked)}
                      className="peer w-full h-full m-0 cursor-pointer border-2 border-white-30 rounded appearance-none bg-card checked:bg-white-100 checked:border-white-100 hover:border-white-50 focus:outline-none transition-all"
                      disabled={isSubmitting}
                      aria-invalid={!!errors[field.id]}
                      aria-describedby={errors[field.id] ? `${field.id}-error` : undefined}
                    />
                    <FiCheck className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-dark pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" size={14} />
                  </div>
                  <span>
                    {field.label}
                    {field.required && <span className="text-red-400"> *</span>}
                  </span>
                </label>
              ) : (
                <>
                  <label htmlFor={field.id} className="text-white-80 text-xs font-poppins-medium flex items-center gap-1">
                    {field.label}
                    {field.required && <span className="text-red-400"> *</span>}
                  </label>
                  <input
                    type={field.type}
                    id={field.id}
                    value={(formData[field.id] as string | undefined) || ""}
                    onChange={(e) => handleChange(field.id, e.target.value)}
                    placeholder={field.placeholder}
                    className="bg-card border border-white-30 rounded-lg px-3 py-2.5 text-white-100 text-sm font-poppins placeholder:text-white-30 focus:outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full"
                    disabled={isSubmitting}
                    aria-invalid={!!errors[field.id]}
                    aria-describedby={errors[field.id] ? `${field.id}-error` : undefined}
                  />
                </>
              )}
              {errors[field.id] && (
                <div
                  id={`${field.id}-error`}
                  role="alert"
                  className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-1.5 text-red-400 text-xs font-poppins"
                >
                  {errors[field.id]}
                </div>
              )}
            </div>
          ))}

          {submissionError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5 text-red-400 text-xs font-poppins">
              {submissionError}
            </div>
          )}

          <div className="flex gap-3 justify-end mt-2">
            <button
              type="button"
              className="border border-white-30 text-white-100 font-poppins-medium rounded-pill px-7 py-2.5 text-sm hover:bg-white-10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-1"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-2.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex-1"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
