"use client";

import { useState, useEffect } from "react";
import { FiX } from "react-icons/fi";
import { useUser } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import CreateOrganizationForm from "../forms/CreateOrganizationForm";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function OnboardingModal({
  isOpen,
  onClose,
  onSuccess,
}: OnboardingModalProps) {
  const { user } = useUser();
  const queryClient = useQueryClient();

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "hidden"; // Prevent background scrolling
    }

    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  const handleSuccess = (organization: {
    id: string;
    name: string;
    slug: string;
    created_at: string;
    owner_user_id: string;
  }) => {
    // Invalidate organizations query to refetch updated data
    queryClient.invalidateQueries({ queryKey: ["organizations"] });

    if (onSuccess) {
      onSuccess();
    }
    onClose();
    // Redirect to organizer dashboard after successful creation
    window.location.href = "/organizer";
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-surface border border-white-30 rounded-card w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white-30">
          <h2 className="text-white-100 font-poppins-semibold text-lg">Welcome to FLAME</h2>
          <button onClick={onClose} className="text-white-50 hover:text-white-100 transition-colors">
            <FiX size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-4">
            <p className="text-white-80 text-sm font-poppins">
              Hi {user?.firstName || user?.emailAddresses?.[0]?.emailAddress}!
              Let&apos;s set up your organization so you can start creating amazing
              events.
            </p>

            <CreateOrganizationForm onSuccess={handleSuccess} />
          </div>
        </div>
      </div>
    </div>
  );
}
