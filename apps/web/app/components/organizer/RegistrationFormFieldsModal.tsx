"use client";

import { useEffect, useState } from "react";
import { FiCheck, FiX } from "react-icons/fi";
import type { FormField } from "@project-flame/lib";

/**
 * Per-tier registration form field selector.
 *
 * Lets an organizer pick the SUBSET of event-level form fields that apply to
 * one ticket tier. Mirrors the Eventbrite "Custom questions → Specific ticket
 * types" pattern.
 *
 * Save semantics — load-bearing, mirrored on mobile (`TierRegistrationFormSheet`):
 *   - mode === "all"     → onChange(null)       (tier inherits all non-archived event fields)
 *   - mode === "custom"  → onChange([...ids])    (explicit subset; `[]` is valid = collect nothing)
 *
 * Archived fields are filtered out at the picker level — they can never be
 * collected from new registrants.
 */
interface Props {
  isOpen: boolean;
  eventFormFields: FormField[];
  /** Current saved selection: `null` = inherit all, `string[]` = explicit subset. */
  value: string[] | null;
  onChange: (next: string[] | null) => void;
  onClose: () => void;
}

export default function RegistrationFormFieldsModal({
  isOpen,
  eventFormFields,
  value,
  onChange,
  onClose,
}: Props) {
  const [draftMode, setDraftMode] = useState<"all" | "custom">(
    value === null ? "all" : "custom",
  );
  const [draftSelected, setDraftSelected] = useState<Set<string>>(
    new Set(value ?? eventFormFields.map((f) => f.id)),
  );

  // Reset draft state every time the modal opens so cancel = revert to saved.
  useEffect(() => {
    if (!isOpen) return;
    setDraftMode(value === null ? "all" : "custom");
    setDraftSelected(new Set(value ?? eventFormFields.map((f) => f.id)));
  }, [isOpen, value, eventFormFields]);

  if (!isOpen) return null;

  const visible = eventFormFields.filter((f) => !f.archived);

  const toggle = (id: string) => {
    setDraftSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = () => {
    if (draftMode === "all") {
      onChange(null);
    } else {
      // Preserve order from the event field list so payload is stable/diffable.
      const ordered = visible
        .map((f) => f.id)
        .filter((id) => draftSelected.has(id));
      onChange(ordered);
    }
    onClose();
  };

  const requiredAtEventLevelButUnchecked = visible.filter(
    (f) => f.required && draftMode === "custom" && !draftSelected.has(f.id),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-surface border border-white-30 rounded-card shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-white-20">
          <h3 className="text-white-100 text-lg font-poppins-semibold">
            Registration form for this tier
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-white-50 hover:text-white-100 transition-colors p-1 rounded-full"
            aria-label="Close"
          >
            <FiX size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-2 p-5 border-b border-white-20">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="radio"
              name="rff-mode"
              checked={draftMode === "all"}
              onChange={() => setDraftMode("all")}
              className="mt-1 accent-white-100"
            />
            <div>
              <div className="text-white-100 text-sm font-poppins-medium">
                Collect all event fields
              </div>
              <div className="text-white-50 text-xs font-poppins">
                Use every non-archived field configured at the event level.
              </div>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="radio"
              name="rff-mode"
              checked={draftMode === "custom"}
              onChange={() => setDraftMode("custom")}
              className="mt-1 accent-white-100"
            />
            <div>
              <div className="text-white-100 text-sm font-poppins-medium">
                Customize for this tier
              </div>
              <div className="text-white-50 text-xs font-poppins">
                Pick exactly which fields registrants on this tier will fill in.
              </div>
            </div>
          </label>
        </div>

        {draftMode === "custom" && (
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-2">
            {visible.length === 0 ? (
              <p className="text-white-50 text-sm font-poppins">
                No event-level fields to choose from.
              </p>
            ) : (
              visible.map((field) => {
                const checked = draftSelected.has(field.id);
                return (
                  <label
                    key={field.id}
                    className="flex items-center gap-3 cursor-pointer select-none rounded-card border border-white-10 bg-white-5 px-3 py-3 hover:border-white-30 transition-colors"
                  >
                    <div className="relative w-[18px] h-[18px] shrink-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(field.id)}
                        className="peer w-full h-full m-0 cursor-pointer border-2 border-white-30 rounded appearance-none bg-card checked:bg-white-100 checked:border-white-100 hover:border-white-50 focus:outline-none transition-all"
                      />
                      <FiCheck
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-dark pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity"
                        size={14}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white-100 text-sm font-poppins-medium truncate">
                          {field.label || field.id}
                        </span>
                        {field.required && (
                          <span className="text-[10px] font-poppins-medium uppercase tracking-wider rounded-pill border border-white-30 text-white-80 px-2 py-0.5">
                            Required
                          </span>
                        )}
                        <span className="text-[10px] font-poppins uppercase text-white-50">
                          {field.type}
                        </span>
                      </div>
                    </div>
                  </label>
                );
              })
            )}

            {requiredAtEventLevelButUnchecked.length > 0 && (
              <p className="text-white-80 text-xs font-poppins mt-2">
                Heads up: {requiredAtEventLevelButUnchecked.length} field
                {requiredAtEventLevelButUnchecked.length === 1 ? " is" : "s are"}{" "}
                required at the event level but unchecked for this tier.
                Registrants on this tier will skip{" "}
                {requiredAtEventLevelButUnchecked.length === 1 ? "it" : "them"}{" "}
                entirely.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3 justify-end p-5 border-t border-white-20">
          <button
            type="button"
            onClick={onClose}
            className="border border-white-30 text-white-100 font-poppins-medium rounded-pill px-6 py-2 text-sm hover:bg-white-10 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-6 py-2 text-sm hover:opacity-90 transition-opacity"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
