"use client";

import React, { useState, useEffect, useMemo } from "react";
import { FiX, FiCopy, FiCheck } from "react-icons/fi";
import { Event } from "../../lib/hooks/useOrganizerData";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: Event[];
}

export default function QRScannerModal({
  isOpen,
  onClose,
  events,
}: QRScannerModalProps) {
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen) {
      setSelectedEventId("");
      setCode("");
      setError("");
      setSuccess("");
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const selectedEvent = useMemo(
    () => events.find(e => e.id === selectedEventId),
    [selectedEventId, events]
  );

  useEffect(() => {
    if (selectedEvent) {
      setCode(selectedEvent.qr_scanner_code || "");
    } else {
      setCode("");
    }
  }, [selectedEvent]);

  const updateCodeMutation = useMutation({
    mutationFn: async (data: { eventId: string; code: string }) => {
      const response = await fetch("/api/events", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: data.eventId,
          qr_scanner_code: data.code || "",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update code");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizer-data"] });
      setSuccess("Access code updated successfully");
      setTimeout(() => setSuccess(""), 3000);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (value.length <= 8) {
      setCode(value);
      setError("");
    }
  };

  const handleSave = () => {
    if (!selectedEventId) {
      setError("Please select an event");
      return;
    }

    if (code && code.length < 4) {
      setError("Code must be at least 4 characters");
      return;
    }

    updateCodeMutation.mutate({ eventId: selectedEventId, code });
  };

  const handleCopy = (text: string, id: string) => {
    if (!navigator.clipboard) {
      const input = document.createElement("input");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      try {
        document.execCommand("copy");
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      } catch {
        setError("Could not copy. Please copy manually: " + text);
      } finally {
        document.body.removeChild(input);
      }
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch(() => {
        setError("Failed to copy to clipboard");
      });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-modal-title"
    >
      <div className="bg-surface border border-white-20 rounded-card w-full max-w-[600px] max-h-[90vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-white-20 flex justify-between items-center">
          <h2
            id="qr-scanner-modal-title"
            className="m-0 text-lg font-poppins-semibold text-white-100"
          >
            QR Scanner Access Codes
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white-10 flex items-center justify-center text-white-50 hover:text-white-100 hover:bg-white-20 transition-colors cursor-pointer border-none"
            aria-label="Close modal"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-6">
          {/* Manage Access Code section */}
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-poppins-semibold text-white-100 m-0">
              Manage Access Code
            </h3>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="event-select"
                className="text-sm font-poppins-medium text-white-80"
              >
                Select Event
              </label>
              <select
                id="event-select"
                value={selectedEventId}
                onChange={e => setSelectedEventId(e.target.value)}
                className="w-full h-11 bg-white-5 border border-white-20 rounded-card px-3 text-sm font-poppins text-white-100 outline-none focus:border-white-50 transition-colors cursor-pointer appearance-none"
              >
                <option value="">-- Select an event --</option>
                {events.map(event => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="access-code-input"
                className="text-sm font-poppins-medium text-white-80"
              >
                Access Code (4-8 characters, uppercase alphanumeric)
              </label>
              <div className="flex gap-2">
                <input
                  id="access-code-input"
                  type="text"
                  value={code}
                  onChange={handleCodeChange}
                  placeholder="CODE123"
                  disabled={!selectedEventId}
                  className="flex-1 h-11 bg-white-5 border border-white-20 rounded-card px-3 text-sm font-poppins text-white-100 placeholder:text-white-50 outline-none focus:border-white-50 transition-colors disabled:opacity-50"
                />
                <button
                  onClick={handleSave}
                  disabled={!selectedEventId || updateCodeMutation.isPending}
                  className="h-11 px-5 bg-white-100 text-dark font-poppins-semibold text-sm rounded-pill hover:opacity-90 transition-opacity cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updateCodeMutation.isPending ? "Saving..." : "Save Code"}
                </button>
              </div>
              {error && (
                <p className="text-error text-sm font-poppins m-0">{error}</p>
              )}
              {success && (
                <p className="text-[#5DDBB1] text-sm font-poppins m-0 flex items-center gap-1">
                  <FiCheck size={16} /> {success}
                </p>
              )}
            </div>
          </div>

          {/* All Event Codes section */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-poppins-semibold text-white-100 m-0">
              All Event Codes
            </h3>
            <div className="flex flex-col gap-2 bg-white-5 rounded-card p-3 max-h-[300px] overflow-y-auto">
              {events.length === 0 ? (
                <p className="text-white-50 text-sm font-poppins italic m-0">
                  No events found.
                </p>
              ) : (
                events.map(event => {
                  const { qr_scanner_code } = event;
                  return (
                    <div
                      key={event.id}
                      className="flex justify-between items-center p-3 bg-white-5 border border-white-20 rounded-card"
                    >
                      <div>
                        <div className="text-sm font-poppins-medium text-white-100">
                          {event.name}
                        </div>
                        <div className="text-xs font-poppins-light text-white-50">
                          {new Date(event.starts_at).toLocaleDateString()}
                        </div>
                      </div>
                      {qr_scanner_code ? (
                        <div className="flex items-center gap-2 bg-white-10 rounded-card px-3 py-1.5">
                          <span className="font-mono text-sm font-semibold text-white-100">
                            {qr_scanner_code}
                          </span>
                          <button
                            onClick={() =>
                              handleCopy(qr_scanner_code, event.id)
                            }
                            title="Copy code"
                            className="text-white-50 hover:text-white-100 transition-colors cursor-pointer bg-transparent border-none p-0.5 flex items-center"
                          >
                            {copiedId === event.id ? (
                              <FiCheck size={16} />
                            ) : (
                              <FiCopy size={16} />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-white-50 text-sm font-poppins italic">
                          No code set
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
