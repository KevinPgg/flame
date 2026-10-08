"use client";

import { useState } from "react";
import { IoChevronDown, IoChevronForward } from "react-icons/io5";

/**
 * Collapsible section with a section-header-styled toggle (title + optional
 * count + chevron). Mirrors the inline "Past events" accordion pattern in
 * `OrganizerPublicView.tsx`, generalized for the profile org-approval lists.
 */
export function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="mt-[30px] flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex items-center justify-between"
      >
        <h2 className="text-white-100 text-sm leading-5 font-poppins-semibold uppercase">
          {title}
          {typeof count === "number" ? ` (${count})` : ""}
        </h2>
        {open ? (
          <IoChevronDown size={18} className="text-white-100" />
        ) : (
          <IoChevronForward size={18} className="text-white-100" />
        )}
      </button>
      {open && children}
    </section>
  );
}
