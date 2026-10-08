"use client";

/**
 * Centered confirmation modal matching the RSVP approve/reject dialog in
 * `RsvpManagement.tsx`. Used by the profile org-approval actions (approve,
 * delete) so destructive/important actions get an explicit confirm step.
 */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="bg-surface border border-white-20 rounded-card w-full max-w-[400px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-white-20">
          <h3 className="text-white-100 text-lg font-poppins-semibold m-0">{title}</h3>
        </div>
        <div className="p-5">
          <p className="text-white-80 text-sm font-poppins m-0">{message}</p>
        </div>
        <div className="p-5 border-t border-white-20 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="border border-white-30 rounded-pill px-4 py-2.5 text-white-100 text-sm font-poppins-medium bg-transparent cursor-pointer hover:bg-white-10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="bg-white-100 text-dark rounded-pill px-6 py-2.5 text-sm font-poppins-medium cursor-pointer border-none transition-opacity hover:opacity-90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
