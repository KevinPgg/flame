"use client";

import { FiCheck, FiAlertTriangle, FiX } from "react-icons/fi";

interface ConfirmationModalProps {
  isOpen: boolean;
  variant: "success" | "warning" | "loading" | "error";
  title: string;
  message: string;
  actionButtonText?: string;
  onAction?: () => void;
  showActionButton?: boolean;
}

const iconConfig = {
  success: {
    bg: "bg-[#5DDBB1]/15",
    border: "border-[#5DDBB1]/30",
    text: "text-[#5DDBB1]",
  },
  warning: {
    bg: "bg-[#F5A623]/15",
    border: "border-[#F5A623]/30",
    text: "text-[#F5A623]",
  },
  error: {
    bg: "bg-error/15",
    border: "border-error/30",
    text: "text-error",
  },
  loading: {
    bg: "bg-white-10",
    border: "border-white-20",
    text: "text-white-100",
  },
};

export default function ConfirmationModal({
  isOpen,
  variant,
  title,
  message,
  actionButtonText = "Go Back",
  onAction,
  showActionButton = true,
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const colors = iconConfig[variant];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-1000 p-4">
      <div className="bg-surface border border-white-20 rounded-card w-full max-w-[400px] p-8 flex flex-col items-center gap-5">
        {/* Icon */}
        <div
          className={`w-16 h-16 rounded-full ${colors.bg} border ${colors.border} flex items-center justify-center`}
        >
          {variant === "success" ? (
            <FiCheck size={28} className={colors.text} />
          ) : variant === "warning" ? (
            <FiAlertTriangle size={28} className={colors.text} />
          ) : variant === "error" ? (
            <FiX size={28} className={colors.text} />
          ) : (
            <div className="animate-spin rounded-full w-7 h-7 border-2 border-white-20 border-t-white-100" />
          )}
        </div>

        {/* Title */}
        <h2 className="text-white-100 text-xl font-poppins-semibold text-center m-0">
          {title}
        </h2>

        {/* Message */}
        <p className="text-white-70 text-sm font-poppins-light text-center leading-5 m-0">
          {message}
        </p>

        {/* Action button */}
        {showActionButton && onAction && (
          <button
            onClick={onAction}
            className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-3 text-sm cursor-pointer border-none hover:opacity-90 transition-opacity mt-2"
          >
            {actionButtonText}
          </button>
        )}
      </div>
    </div>
  );
}
