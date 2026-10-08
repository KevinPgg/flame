"use client";

import { useState, useEffect } from "react";
import { FiX, FiTag } from "react-icons/fi";

interface TicketTier {
  id: string;
  name: string;
  price_cents: number;
  quantity_total: number;
  per_user_limit: number;
  sales_start: string;
  sales_end: string;
}

interface EditTicketTierModalProps {
  isOpen: boolean;
  onClose: () => void;
  tier: TicketTier | null;
  eventId: string;
  onSuccess: () => void;
}

export default function EditTicketTierModal({
  isOpen,
  onClose,
  tier,
  eventId,
  onSuccess,
}: EditTicketTierModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    price_cents: 0,
    quantity_total: 100,
    per_user_limit: 4,
    sales_start: "",
    sales_end: "",
  });

  useEffect(() => {
    if (tier) {
      // Editing existing tier
      setFormData({
        name: tier.name,
        price_cents: tier.price_cents,
        quantity_total: tier.quantity_total,
        per_user_limit: tier.per_user_limit,
        sales_start: new Date(tier.sales_start).toISOString().slice(0, 16),
        sales_end: new Date(tier.sales_end).toISOString().slice(0, 16),
      });
    } else {
      // Creating new tier
      setFormData({
        name: "",
        price_cents: 0,
        quantity_total: 100,
        per_user_limit: 4,
        sales_start: "",
        sales_end: "",
      });
    }
    setError("");
  }, [tier, isOpen]);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const salesStart = new Date(formData.sales_start);
      const salesEnd = new Date(formData.sales_end);

      if (salesEnd <= salesStart) {
        setError("Sales end date must be after start date");
        return;
      }

      // Note: Additional validation (30-minute rule) is handled by the backend

      const payload = {
        ...formData,
        sales_start: salesStart.toISOString(),
        sales_end: salesEnd.toISOString(),
        ...(tier ? { id: tier.id } : { event_id: eventId }),
      };

      const response = await fetch("/api/ticket-tiers", {
        method: tier ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save ticket tier");
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="edit-ticket-tier-title">
      <div className="bg-surface border border-white-30 rounded-card w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white-30">
          <div className="flex items-center gap-3">
            <FiTag size={24} className="text-white-100" />
            <h2 id="edit-ticket-tier-title" className="text-white-100 font-poppins-semibold text-lg">{tier ? "Edit Ticket Tier" : "Add Ticket Tier"}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white-50 hover:text-white-100 transition-colors"
            disabled={isLoading}
          >
            <FiX size={24} />
          </button>
        </div>

        <form
          id="edit-ticket-tier-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-5 flex flex-col gap-5"
        >
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-card p-3 text-red-400 text-sm font-poppins">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-4">
            <h3 className="text-white-100 font-poppins-medium text-sm">Tier Details</h3>

            <div className="flex flex-col gap-1.5">
              <label className="text-white-80 text-xs font-poppins-medium">Tier Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={e =>
                  setFormData(prev => ({ ...prev, name: e.target.value }))
                }
                placeholder="Early Bird, General, VIP..."
                required
                className="bg-card border border-white-30 rounded-lg px-3 py-2.5 text-white-100 text-sm font-poppins placeholder:text-white-30 focus:outline-none focus:border-white-50 transition-colors"
                disabled={isLoading}
              />
              <p className="text-white-30 text-xs font-poppins">
                Choose a descriptive name for this ticket tier
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-white-80 text-xs font-poppins-medium">Price (USD) *</label>
                <input
                  type="number"
                  value={
                    tier
                      ? formData.price_cents / 100
                      : formData.price_cents === 0
                      ? ""
                      : formData.price_cents / 100
                  }
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      price_cents: Math.round(
                        parseFloat(e.target.value || "0") * 100
                      ),
                    }))
                  }
                  onWheel={e => e.currentTarget.blur()}
                  placeholder="25.00"
                  min="0"
                  step="0.01"
                  required
                  className="bg-card border border-white-30 rounded-lg px-3 py-2.5 text-white-100 text-sm font-poppins placeholder:text-white-30 focus:outline-none focus:border-white-50 transition-colors"
                  disabled={isLoading}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-white-80 text-xs font-poppins-medium">Total Quantity *</label>
                <input
                  type="number"
                  value={
                    tier
                      ? formData.quantity_total
                      : formData.quantity_total === 100
                      ? ""
                      : formData.quantity_total
                  }
                  onChange={e => {
                    const val = e.target.value;
                    const parsed = parseInt(val || "100");
                    setFormData(prev => ({
                      ...prev,
                      quantity_total: isNaN(parsed) || parsed < 1 ? 1 : parsed,
                    }));
                  }}
                  onWheel={e => e.currentTarget.blur()}
                  placeholder="100"
                  min="1"
                  required
                  className="bg-card border border-white-30 rounded-lg px-3 py-2.5 text-white-100 text-sm font-poppins placeholder:text-white-30 focus:outline-none focus:border-white-50 transition-colors"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-white-80 text-xs font-poppins-medium">Per User Limit *</label>
              <input
                type="number"
                value={
                  tier
                    ? formData.per_user_limit
                    : formData.per_user_limit === 4
                    ? ""
                    : formData.per_user_limit
                }
                onChange={e =>
                  setFormData(prev => ({
                    ...prev,
                    per_user_limit: parseInt(e.target.value || "4"),
                  }))
                }
                onWheel={e => e.currentTarget.blur()}
                placeholder="4"
                min="1"
                max="50"
                required
                className="bg-card border border-white-30 rounded-lg px-3 py-2.5 text-white-100 text-sm font-poppins placeholder:text-white-30 focus:outline-none focus:border-white-50 transition-colors"
                disabled={isLoading}
              />
              <p className="text-white-30 text-xs font-poppins">
                Maximum tickets per customer for this tier
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-white-100 font-poppins-medium text-sm">Sales Period</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-white-80 text-xs font-poppins-medium">Sales Start *</label>
                <input
                  type="datetime-local"
                  value={formData.sales_start}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      sales_start: e.target.value,
                    }))
                  }
                  required
                  className="bg-card border border-white-30 rounded-lg px-3 py-2.5 text-white-100 text-sm font-poppins focus:outline-none focus:border-white-50 transition-colors scheme-dark"
                  disabled={isLoading}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-white-80 text-xs font-poppins-medium">Sales End *</label>
                <input
                  type="datetime-local"
                  value={formData.sales_end}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      sales_end: e.target.value,
                    }))
                  }
                  required
                  className="bg-card border border-white-30 rounded-lg px-3 py-2.5 text-white-100 text-sm font-poppins focus:outline-none focus:border-white-50 transition-colors scheme-dark"
                  disabled={isLoading}
                />
              </div>
            </div>

            <p className="text-white-30 text-xs font-poppins">
              Set when customers can start and stop purchasing this tier
            </p>
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-white-30">
          <button
            type="button"
            onClick={onClose}
            className="border border-white-30 text-white-100 font-poppins-medium rounded-pill px-7 py-2.5 text-sm hover:bg-white-10 transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-ticket-tier-form"
            className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-2.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading}
          >
            {isLoading ? "Saving..." : tier ? "Update Tier" : "Create Tier"}
          </button>
        </div>
      </div>
    </div>
  );
}
