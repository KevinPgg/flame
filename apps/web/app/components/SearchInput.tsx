"use client";

import { IoSearch } from "react-icons/io5";

/**
 * Pill search input matching the existing inline pattern in
 * `OrganizerPublicView.tsx` / `EventsCatalog.tsx`. Extracted so the profile
 * org lists can reuse it once a list grows past the search threshold.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="bg-white-5 border border-white-10 rounded-pill px-4 py-2.5 flex items-center gap-2">
      <IoSearch size={16} className="text-white-50 shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 bg-transparent text-white-100 text-sm font-poppins placeholder:text-white-50 outline-none min-w-0"
      />
    </div>
  );
}
