"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";

interface EnterCodeModalProps {
  isOpen: boolean;
  onSuccess: (code: string, eventId: string, eventName: string) => void;
  onClose?: () => void;
}

export default function EnterCodeModal({
  isOpen,
  onSuccess,
  onClose,
}: EnterCodeModalProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCode("");
      setError("");
      setIsSubmitting(false);
      // Prevent background scrolling
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
    }
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      // Validate code server-side
      const response = await fetch("/api/qr-scanner/validate-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: code.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Invalid access code. Please try again.");
        setIsSubmitting(false);
        return;
      }

      // Code is valid
      onSuccess(code.trim().toUpperCase(), data.eventId, data.eventName);
      // We don't close manually here, parent will handle it (likely by setting isOpen=false)
    } catch (error) {
      console.error("Error validating access code:", error);
      setError("Failed to validate access code. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="enter-code-modal-title"
    >
      <div className="bg-surface border border-white-30 rounded-card w-full max-w-lg flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white-30">
          <h2 id="enter-code-modal-title" className="text-white-100 font-poppins-medium text-lg">Event Access</h2>
        </div>

        <div className="flex-1 p-5">
          <div>
            <div className="text-center mb-6">
              <p className="text-white-50 text-sm font-poppins leading-relaxed">Enter the event access code to activate the scanner</p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="accessCode" className="text-white-80 text-xs font-poppins-medium flex items-center gap-1">
                  Access Code <span className="text-red-400">*</span>
                </label>
                <input
                  id="accessCode"
                  type="text"
                  className="bg-card border border-white-30 rounded-lg px-3 py-2.5 text-white-100 text-sm font-poppins placeholder:text-white-30 focus:outline-none focus:border-white-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  value={code}
                  onChange={e => {
                    setCode(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
                    );
                    setError("");
                  }}
                  placeholder="CODE123"
                  autoFocus
                  disabled={isSubmitting}
                  required
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-card p-3 mt-3 text-red-400 text-sm font-poppins">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-2 mt-6">
                <button
                  type="submit"
                  className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-2.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!code.trim() || isSubmitting}
                >
                  {isSubmitting ? "Verifying..." : "Enter Event"}
                </button>
                <Link
                  href="/organizer"
                  className="border border-white-30 text-white-100 font-poppins-medium rounded-pill px-7 py-2.5 text-sm hover:bg-white-10 transition-colors text-center"
                >
                  Back to Dashboard
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
