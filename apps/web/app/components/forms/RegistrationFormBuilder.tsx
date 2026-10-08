"use client";

/**
 * Web registration-form builder — lets organizers author and edit the
 * `registration_form_config` on an event.
 *
 * Used by both the create flow (`CreateEventForm.tsx`) and the edit flow
 * (`OrgEventDetailClient.tsx`) so the authoring UI is identical in both
 * places. Mirrors the mobile builder at
 * `apps/mobile/components/create-event/RegistrationFormBuilder.tsx`.
 *
 * Archive semantics (see `FormField.archived` + APRIL_2026_FIXES.md #132):
 *   - Archived fields stay in `registration_form_config` so organizer RSVP
 *     detail views and XLSX exports keep labeling historical answers.
 *   - Archived fields are hidden from the registrant-facing form and skipped
 *     by `POST /api/rsvp` required-field validation.
 */

import { FiCheck, FiX, FiArchive, FiRotateCcw } from "react-icons/fi";
import type { FormField } from "../modals/RegistrationFormModal";

function makeFieldId(): string {
  return `field-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyField(): FormField {
  return {
    id: makeFieldId(),
    label: "",
    type: "text",
    required: false,
  };
}

interface RegistrationFormBuilderProps {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
  /** Show the "No fields yet" hint when empty. Defaults to true. */
  showEmptyHint?: boolean;
}

export default function RegistrationFormBuilder({
  fields,
  onChange,
  showEmptyHint = true,
}: RegistrationFormBuilderProps) {
  const updateField = (index: number, patch: Partial<FormField>) => {
    const next = [...fields];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const toggleArchived = (index: number) => {
    updateField(index, { archived: !fields[index].archived });
  };

  const addField = () => {
    onChange([...fields, createEmptyField()]);
  };

  return (
    <div className="flex flex-col gap-3">
      {fields.length === 0 && showEmptyHint && (
        <p className="text-white-50 text-xs font-poppins m-0">
          No fields yet. Add a question below.
        </p>
      )}

      {fields.map((field, index) => {
        const isArchived = field.archived === true;
        return (
          <div
            key={field.id}
            className={`bg-white-5 border border-white-20 rounded-card p-4 flex flex-col gap-3 ${
              isArchived ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-white-50 text-xs font-poppins shrink-0 w-14">
                Field {index + 1}
              </span>
              <input
                type="text"
                placeholder="Question label"
                value={field.label}
                onChange={e => updateField(index, { label: e.target.value })}
                className="flex-1 bg-transparent border-b border-white-20 text-white-100 text-sm font-poppins placeholder:text-white-50 outline-none focus:border-white-50 py-1 transition-colors"
              />
              <button
                type="button"
                onClick={() => toggleArchived(index)}
                className="text-white-50 hover:text-white-100 transition-colors shrink-0 p-1 cursor-pointer"
                aria-label={isArchived ? "Unarchive field" : "Archive field"}
                title={
                  isArchived
                    ? "Unarchive — show again for new registrants"
                    : "Archive — hide from new registrants, keep historical answers visible"
                }
              >
                {isArchived ? <FiRotateCcw size={14} /> : <FiArchive size={14} />}
              </button>
              <button
                type="button"
                onClick={() => removeField(index)}
                className="text-white-50 hover:text-white-100 transition-colors shrink-0 p-1 cursor-pointer"
                aria-label="Remove field"
              >
                <FiX size={16} />
              </button>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <select
                value={field.type}
                onChange={e =>
                  updateField(index, { type: e.target.value as FormField["type"] })
                }
                className="bg-white-5 border border-white-20 rounded-pill px-3 py-1.5 text-xs font-poppins text-white-100 outline-none focus:border-white-50 transition-colors"
              >
                <option value="text">Text</option>
                <option value="email">Email</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="checkbox">Checkbox (Yes/No)</option>
              </select>
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  className={`relative w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    field.required
                      ? "bg-white-100 border-white-100"
                      : "border-white-30 bg-transparent"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={field.required ?? false}
                    onChange={e =>
                      updateField(index, { required: e.target.checked })
                    }
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                  {field.required && (
                    <FiCheck className="text-dark pointer-events-none" size={10} />
                  )}
                </div>
                <span className="text-white-50 text-xs font-poppins">
                  Required
                </span>
              </label>
              {isArchived && (
                <span className="text-white-50 text-xs font-poppins-light">
                  · archived
                </span>
              )}
            </div>
            {isArchived && (
              <p className="text-white-50 text-xs font-poppins-light m-0">
                Hidden from new registrations. Previous answers still appear in
                RSVP details and exports.
              </p>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={addField}
        className="flex items-center justify-center gap-2 border border-dashed border-white-20 rounded-card py-3 text-white-80 text-sm font-poppins hover:border-white-50 hover:text-white-100 transition-colors w-full cursor-pointer bg-transparent"
      >
        + Add Field
      </button>
    </div>
  );
}
