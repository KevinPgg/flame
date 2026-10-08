"use client";

import React from "react";
import {
  FiTag,
  FiEdit2,
  FiPlus,
  FiEye,
  FiCalendar,
  FiMapPin,
  FiClock,
  FiAlertTriangle,
  FiTrash2,
  FiImage,
  FiUpload,
} from "react-icons/fi";
import { separateEventsByDate } from "../../lib/utils/event-filters";
import {
  utcToEcuadorLocal,
  getEcuadorNow,
  extractBasePriceHistorical,
  MAX_TICKET_TIERS_PER_EVENT,
  getActiveEventFormFields,
} from "@project-flame/lib";
import TierInlineForm from "./TierInlineForm";
import { CityAutocompleteField } from "./CityAutocompleteField";
import type { Event as OrganizerEvent } from "../../lib/hooks/useOrganizerData";

interface EventsTiersViewProps {
  events: OrganizerEvent[];
  organization: { id: string; name: string; slug: string };
  expandedEventId: string | null;
  setExpandedEventId: (id: string | null) => void;
  expandedPastEventId: string | null;
  setExpandedPastEventId: (id: string | null) => void;
  expandedSections: {
    events: boolean;
    ticketTiers: boolean;
    rsvps: boolean;
  };
  setExpandedSections: React.Dispatch<
    React.SetStateAction<{
      events: boolean;
      ticketTiers: boolean;
      rsvps: boolean;
    }>
  >;
  editingEventData: {
    eventId: string;
    eventSlug: string;
    originalStartsAt: string;
    startsAt: string;
    endsAt: string;
    venue: string;
    city: string;
    dateChanged: boolean;
    tiersNeedUpdate: string[];
    imageUrl: string;
    originalImageUrl: string;
  } | null;
  setEditingEventData: React.Dispatch<
    React.SetStateAction<{
      eventId: string;
      eventSlug: string;
      originalStartsAt: string;
      startsAt: string;
      endsAt: string;
      venue: string;
      city: string;
      dateChanged: boolean;
      tiersNeedUpdate: string[];
      imageUrl: string;
      originalImageUrl: string;
    } | null>
  >;
  editingTierId: string | null;
  setEditingTierId: (id: string | null) => void;
  showingAddForm: string | null;
  setShowingAddForm: (id: string | null) => void;
  savingEventId: string | null;
  isSavingEvent: boolean;
  confirmDeleteTierId: string | null;
  editingImagePreview: string;
  setEditingImagePreview: (preview: string) => void;
  editingImageFile: File | null;
  setEditingImageFile: (file: File | null) => void;
  formatDate: (dateString: string) => string;
  formatPrice: (cents: number, currency?: string) => string;
  handleEditEvent: (event: any) => void;
  handleEventDataChange: (
    field: "startsAt" | "endsAt" | "venue" | "city",
    value: string
  ) => void;
  handleTierUpdated: (tierId: string) => void;
  handleDiscardEventChanges: () => void;
  handleSaveEventChanges: () => Promise<void>;
  handleEditingImageUpload: (file: File) => Promise<void>;
  handleEditingImageRemove: () => void;
  handleEditingImageDragOver: (e: React.DragEvent) => void;
  handleEditingImageDragLeave: (e: React.DragEvent) => void;
  handleEditingImageDrop: (e: React.DragEvent) => void;
  handleEditTier: (tier: any) => void;
  handleAddTier: (eventId: string) => void;
  handleCancelEdit: () => void;
  handleModalSuccess: () => Promise<void>;
  handleDeleteTier: (tierId: string, tier?: any) => void;
  isRefetchingData: boolean;
  handleTogglePastEventExpansion: (eventId: string) => void;
  navigateToView: (view: string) => void;
  deleteTicketTierMutation: any;
}

export default function EventsTiersView({
  events,
  organization,
  expandedEventId,
  setExpandedEventId,
  expandedPastEventId,
  setExpandedPastEventId,
  expandedSections,
  setExpandedSections,
  editingEventData,
  setEditingEventData,
  editingTierId,
  setEditingTierId,
  showingAddForm,
  setShowingAddForm,
  savingEventId,
  isSavingEvent,
  confirmDeleteTierId,
  editingImagePreview,
  setEditingImagePreview,
  editingImageFile,
  setEditingImageFile,
  formatDate,
  formatPrice,
  handleEditEvent,
  handleEventDataChange,
  handleTierUpdated,
  handleDiscardEventChanges,
  handleSaveEventChanges,
  handleEditingImageUpload,
  handleEditingImageRemove,
  handleEditingImageDragOver,
  handleEditingImageDragLeave,
  handleEditingImageDrop,
  handleEditTier,
  handleAddTier,
  handleCancelEdit,
  handleModalSuccess,
  handleDeleteTier,
  handleTogglePastEventExpansion,
  navigateToView,
  deleteTicketTierMutation,
  isRefetchingData,
}: EventsTiersViewProps) {
  // NOTE: All events are guaranteed to have ends_at due to:
  // 1. Database NOT NULL constraint (verified via Supabase MCP)
  // 2. Zod validation, TypeScript types, and frontend validation
  // No defensive filtering needed - separateEventsByDate handles all events safely
  const { currentEvents: allCurrentTierEvents, pastEvents: pastTierEvents } =
    separateEventsByDate(events);

  // Helper to get datetime for min attribute with optional hours ahead (Ecuador time)
  const getMainDateTimeLocal = (hoursAhead: number = 0): string => {
    return getEcuadorNow(hoursAhead);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl leading-8 font-poppins-medium text-white-100 m-0">Events & Ticket Tiers</h2>
        <p className="text-white-50 text-sm font-poppins mt-1 m-0">Manage event details, ticket pricing and availability</p>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16">
          <FiTag size={48} className="text-white-30" />
          <h3 className="text-white-100 text-lg font-poppins-semibold m-0">No Events Yet</h3>
          <p className="text-white-50 text-sm font-poppins text-center m-0">
            Create your first event to start managing events and ticket tiers
          </p>
          <button
            onClick={() => navigateToView("create-event")}
            className="bg-white-100 text-dark font-poppins-semibold text-sm px-6 py-2.5 rounded-pill hover:opacity-90 transition-opacity cursor-pointer border-none"
          >
            Create Event
          </button>
        </div>
      ) : (
        <>
          {/* Current/Future Events */}
          {allCurrentTierEvents.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-poppins-semibold text-white-100 uppercase tracking-wider m-0">
                Current & Upcoming Events
              </h2>

              {/* Mobile Cards */}
              <div className="hidden max-lg:flex flex-col gap-2">
                {allCurrentTierEvents.map(event => {
                  const ticketTiers = [...(event.ticket_tiers ?? [])].sort(
                    (a: any, b: any) => a.price_cents - b.price_cents
                  );
                  const tierCount = ticketTiers.length;
                  const tierNames = ticketTiers
                    .map((tier: any) => tier.name)
                    .join(", ");
                  const isExpanded = expandedEventId === event.id;
                  const isEditing = editingEventData?.eventId === event.id;
                  const isEventSaving =
                    savingEventId === event.id && isSavingEvent;

                  const totalTickets = ticketTiers.reduce(
                    (sum: number, tier: any) => sum + tier.quantity_total,
                    0
                  );
                  const soldTickets = ticketTiers.reduce(
                    (sum: number, tier: any) => sum + (tier.quantity_sold ?? 0),
                    0
                  );

                  return (
                    <React.Fragment key={`mobile-${event.id}`}>
                      <div
                        className={`bg-white-5 border border-white-15 rounded-card p-3 transition-all ${
                          isExpanded ? "!bg-white-8 !border-white-30" : ""
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1.5">
                          <div>
                            <h3 className="text-sm font-poppins-semibold text-white-100 m-0">
                              {event.name}
                            </h3>
                            <p className="text-xs text-white-40 mt-0.5 font-poppins">
                              /{event.slug}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-white-50 mt-1 mb-1.5 font-poppins">
                          {formatDate(event.starts_at)}
                        </p>
                        <p className="text-xs text-white-50 mb-2 flex items-center gap-1 font-poppins">
                          <FiMapPin size={14} />
                          {event.venue}, {event.city}
                        </p>
                        <div className="flex justify-between items-center pt-2 border-t border-white-15">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[0.7rem] text-white-50 uppercase tracking-wider font-poppins-medium">
                              Attendees
                            </span>
                            <span className="text-sm font-poppins-semibold text-white-100">
                              {soldTickets} / {totalTickets}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[0.7rem] text-white-50 uppercase tracking-wider font-poppins-medium">
                              Tiers
                            </span>
                            <span className="text-sm font-poppins-semibold text-white-100">
                              {tierCount > 0 ? (
                                <>
                                  {tierCount} tier{tierCount !== 1 ? "s" : ""}
                                </>
                              ) : (
                                "None"
                              )}
                            </span>
                          </div>
                          <div className="shrink-0">
                            <button
                              className={`w-8 h-8 rounded-lg flex items-center justify-center border border-white-30 text-white-80 hover:bg-white-10 transition-colors cursor-pointer bg-transparent ${
                                isExpanded ? "bg-white-10 text-white-100" : ""
                              }`}
                              title={
                                isExpanded ? "Collapse" : "Edit Event & Tiers"
                              }
                              onClick={() => {
                                if (isExpanded) {
                                  handleDiscardEventChanges();
                                } else {
                                  handleEditEvent(event);
                                }
                              }}
                              disabled={isEventSaving}
                            >
                              <FiEdit2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Mobile Expansion Content - directly below this card */}
                      {isExpanded && isEditing && (
                        <div className="p-6 max-md:p-3 bg-white-3 border-l-[3px] border-white-30">
                          {/* Event Details Section */}
                          {editingEventData && (
                            <div className="bg-white-3 rounded-card border border-white-20 p-6 max-md:p-3 mb-4">
                              <div className="flex justify-between items-center max-md:flex-col max-md:items-start max-md:gap-3 mb-5 pb-3 border-b border-white-15">
                                <h3 className="text-xl font-poppins-semibold text-white-100 m-0 flex items-center gap-2">
                                  <FiCalendar size={20} />
                                  Event Details
                                </h3>
                              </div>

                              {editingEventData.tiersNeedUpdate.length > 0 && (
                                <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-card p-4 mb-5">
                                  <div className="text-yellow-500 shrink-0 flex">
                                    <FiAlertTriangle size={26} />
                                  </div>
                                  <div className="flex-1">
                                    <strong className="block text-yellow-400 font-poppins-semibold mb-1">
                                      Ticket tier conflicts detected!
                                    </strong>
                                    <p className="m-0 text-white-70 text-sm font-poppins">
                                      {editingEventData.dateChanged
                                        ? "You must manually update all ticket tier sales times before saving."
                                        : "Some ticket tiers have sales end times that are after the event starts. Please update them before saving."}{" "}
                                      {editingEventData.tiersNeedUpdate.length}{" "}
                                      tier(s) need updating.
                                    </p>
                                  </div>
                                </div>
                              )}

                              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] max-md:grid-cols-1 gap-4 mb-4">
                                <div className="flex flex-col gap-1.5">
                                  <label
                                    htmlFor="edit-venue-mobile"
                                    className="font-poppins-medium text-white-70 text-sm m-0 flex items-center gap-1"
                                  >
                                    Venue *
                                  </label>
                                  <input
                                    type="text"
                                    id="edit-venue-mobile"
                                    value={editingEventData.venue}
                                    onChange={e =>
                                      handleEventDataChange(
                                        "venue",
                                        e.target.value
                                      )
                                    }
                                    className="bg-white-5 border border-white-20 rounded-xl px-3 py-2 text-sm text-white-100 font-poppins transition-all focus:outline-none focus:border-white-50 focus:bg-white-8 disabled:opacity-50 disabled:cursor-not-allowed"
                                    placeholder="Golden Gate Park"
                                  />
                                </div>

                                <div className="flex flex-col gap-1.5">
                                  <label
                                    htmlFor="edit-city-mobile"
                                    className="font-poppins-medium text-white-70 text-sm m-0 flex items-center gap-1"
                                  >
                                    <FiMapPin size={16} />
                                    City *
                                  </label>
                                  <CityAutocompleteField
                                    id="edit-city-mobile"
                                    value={editingEventData.city}
                                    onChange={city =>
                                      handleEventDataChange("city", city)
                                    }
                                    className="bg-white-5 border border-white-20 rounded-xl px-3 py-2 text-sm text-white-100 font-poppins transition-all focus:outline-none focus:border-white-50 focus:bg-white-8 disabled:opacity-50 disabled:cursor-not-allowed w-full"
                                    placeholder="San Francisco"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] max-md:grid-cols-1 gap-4 mb-4">
                                <div className="flex flex-col gap-1.5">
                                  <label
                                    htmlFor="edit-starts-at-mobile"
                                    className="font-poppins-medium text-white-70 text-sm m-0 flex items-center gap-1"
                                  >
                                    <FiCalendar size={16} />
                                    Start Date & Time *
                                  </label>
                                  <input
                                    type="datetime-local"
                                    id="edit-starts-at-mobile"
                                    value={editingEventData.startsAt}
                                    min={getMainDateTimeLocal(2)}
                                    onChange={e =>
                                      handleEventDataChange(
                                        "startsAt",
                                        e.target.value
                                      )
                                    }
                                    className="bg-white-5 border border-white-20 rounded-xl px-3 py-2 text-sm text-white-100 font-poppins transition-all focus:outline-none focus:border-white-50 focus:bg-white-8 disabled:opacity-50 disabled:cursor-not-allowed scheme-dark"
                                  />
                                </div>

                                <div className="flex flex-col gap-1.5">
                                  <label
                                    htmlFor="edit-ends-at-mobile"
                                    className="font-poppins-medium text-white-70 text-sm m-0 flex items-center gap-1"
                                  >
                                    <FiClock size={16} />
                                    End Date & Time *
                                  </label>
                                  <input
                                    type="datetime-local"
                                    id="edit-ends-at-mobile"
                                    value={editingEventData.endsAt}
                                    min={getMainDateTimeLocal(2)}
                                    onChange={e =>
                                      handleEventDataChange(
                                        "endsAt",
                                        e.target.value
                                      )
                                    }
                                    className="bg-white-5 border border-white-20 rounded-xl px-3 py-2 text-sm text-white-100 font-poppins transition-all focus:outline-none focus:border-white-50 focus:bg-white-8 disabled:opacity-50 disabled:cursor-not-allowed scheme-dark"
                                  />
                                </div>
                              </div>

                              <p className="text-[0.8125rem] text-white-50 leading-relaxed my-1.5 font-poppins [&>strong]:text-white-80 [&>strong]:font-poppins-semibold">
                                <strong>Note:</strong> Events must start at
                                least 2 hours in the future, and ticket sales
                                must end before the event starts. If you change the event start time and
                                it conflicts with a ticket tier sales end time,
                                you will see an alert and you must manually
                                update conflicting ticket tier sales times to
                                match the new event start time.
                              </p>

                              <p className="text-[0.8125rem] text-white-50 leading-relaxed my-1.5 font-poppins [&>strong]:text-white-80 [&>strong]:font-poppins-semibold">
                                <strong>Ticket Tier Changes:</strong> When you
                                add, edit, or delete ticket tiers below, changes
                                are saved instantly. Only event details (venue,
                                city, dates) require you to click &quot;Save
                                Event Details&quot;.
                              </p>

                              {/* Horizontal Rule */}
                              <hr className="border-none border-t border-white-15 my-6" />

                              {/* Edit Event Image Section */}
                              <div className="mb-6">
                                <h4 className="text-base font-poppins-semibold text-white-100 m-0 mb-2 flex items-center gap-2">
                                  <FiImage size={18} />
                                  Edit Event Image
                                </h4>
                                <p className="text-[0.8125rem] text-white-50 leading-relaxed my-1.5 font-poppins">
                                  Upload an image to replace your current one.
                                  Recommended size: 1080×1350.
                                </p>

                                <div className="grid grid-cols-[1fr_2fr] max-md:grid-cols-1 gap-4 mt-4">
                                  {/* Left side: Current Image Preview */}
                                  <div className="flex flex-col gap-2">
                                    <label className="font-poppins-medium text-white-50 text-sm m-0">
                                      Current Image
                                    </label>
                                    {editingImagePreview ? (
                                      <div className="w-full aspect-[3/4] rounded-card overflow-hidden bg-white-5 flex items-center justify-center">
                                        <img
                                          src={editingImagePreview}
                                          alt="Event preview"
                                          className="w-full h-full object-cover"
                                        />
                                      </div>
                                    ) : (
                                      <div className="w-full aspect-[3/4] rounded-card overflow-hidden bg-white-5 flex items-center justify-center border-2 border-dashed border-white-20">
                                        <div className="flex flex-col items-center gap-2 text-white-50">
                                          <FiImage
                                            size={32}
                                            className="text-white-30"
                                          />
                                          <p className="m-0 text-sm">No image set</p>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Right side: Upload Area */}
                                  <div className="flex flex-col gap-2">
                                    <label className="font-poppins-medium text-white-50 text-sm m-0">
                                      Upload New Image
                                    </label>
                                    <div
                                      className="w-full border-2 border-dashed border-white-20 rounded-card bg-white-3 cursor-pointer transition-all hover:border-white-40 hover:bg-white-8 flex items-center justify-center min-h-[250px] flex-1"
                                      onDragOver={handleEditingImageDragOver}
                                      onDragLeave={handleEditingImageDragLeave}
                                      onDrop={handleEditingImageDrop}
                                      onClick={() =>
                                        document
                                          .getElementById(
                                            "edit-image-upload-mobile"
                                          )
                                          ?.click()
                                      }
                                    >
                                      <div className="flex flex-col items-center gap-2 p-6 text-center">
                                        <FiUpload
                                          size={32}
                                          className="text-white-40"
                                        />
                                        <p className="text-sm font-poppins-medium text-white-70 m-0">
                                          Click to upload or drag and drop
                                        </p>
                                        <p className="text-[0.8125rem] text-white-50 m-0 font-poppins">
                                          PNG, JPG, GIF up to 4.5MB. Recommended
                                          size: 1080×1350.
                                        </p>
                                      </div>
                                    </div>

                                    <input
                                      type="file"
                                      id="edit-image-upload-mobile"
                                      accept="image/*"
                                      onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file)
                                          handleEditingImageUpload(file);
                                      }}
                                      className="hidden"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Save/Discard Actions */}
                              <div className="flex justify-end gap-3 pt-5 mt-5 border-t border-white-20">
                                <button
                                  onClick={handleDiscardEventChanges}
                                  className="border border-white-30 text-white-100 font-poppins-medium rounded-pill px-7 py-2.5 text-sm hover:bg-white-10 transition-colors cursor-pointer bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                                  disabled={isSavingEvent}
                                >
                                  Discard
                                </button>
                                <button
                                  onClick={handleSaveEventChanges}
                                  className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-2.5 text-sm hover:opacity-90 transition-opacity cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
                                  disabled={
                                    isSavingEvent ||
                                    editingEventData.tiersNeedUpdate.length > 0
                                  }
                                >
                                  {isSavingEvent
                                    ? "Saving..."
                                    : "Save Event Details"}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Ticket Tiers Section */}
                          <div className="flex justify-between items-center max-md:flex-col max-md:items-start max-md:gap-3 max-md:mt-3 mb-5 pb-3 border-b border-white-20">
                            <h3 className="text-lg font-poppins-semibold text-white-100 m-0">Ticket Tiers for {event.name}</h3>
                            <button
                              onClick={() => handleAddTier(event.id)}
                              disabled={ticketTiers.length >= MAX_TICKET_TIERS_PER_EVENT}
                              className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-4 py-1.5 text-xs hover:opacity-90 transition-opacity cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                              title={
                                ticketTiers.length >= MAX_TICKET_TIERS_PER_EVENT
                                  ? `Maximum ${MAX_TICKET_TIERS_PER_EVENT} tiers allowed`
                                  : "Add another ticket tier"
                              }
                            >
                              <FiPlus size={16} />
                              Add Tier
                            </button>
                          </div>

                          <div className="flex flex-col gap-2 relative">
                            {/* Loading overlay during tier operations */}
                            {(deleteTicketTierMutation.isPending ||
                              isRefetchingData) && (
                              <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center z-10 min-h-[200px] backdrop-blur-sm rounded-card">
                                <div className="animate-spin rounded-full w-10 h-10 border-2 border-white-20 border-t-white-100 mb-3"></div>
                                <p className="m-0 text-white-100 text-sm font-poppins-semibold">Updating tiers...</p>
                              </div>
                            )}

                            {ticketTiers.length > 0 ? (
                              ticketTiers.map((tier: any) => {
                                const needsUpdate =
                                  editingEventData?.tiersNeedUpdate.includes(
                                    tier.id
                                  ) || false;

                                return (
                                  <div key={tier.id}>
                                    {editingTierId === tier.id ? (
                                      <TierInlineForm
                                        tier={tier}
                                        tentativeEventStart={
                                          editingEventData?.eventId === event.id
                                            ? editingEventData?.startsAt
                                            : undefined
                                        }
                                        tentativeEventEnd={
                                          editingEventData?.eventId === event.id
                                            ? editingEventData?.endsAt
                                            : undefined
                                        }
                                        eventFormFields={getActiveEventFormFields(
                                          event.registration_form_config,
                                        )}
                                        onSave={() => {
                                          handleTierUpdated(tier.id);
                                          handleModalSuccess();
                                        }}
                                        onCancel={handleCancelEdit}
                                      />
                                    ) : (
                                      <div
                                        className={`bg-white-5 border border-white-20 rounded-card px-4 py-3 transition-all hover:bg-white-8 ${
                                          needsUpdate
                                            ? "bg-yellow-500/10 border-l-[3px] border-l-yellow-500"
                                            : ""
                                        }`}
                                      >
                                        <div className="flex items-center gap-4 max-md:grid max-md:grid-cols-[1fr_auto] max-md:grid-rows-[auto_auto] max-md:gap-2 max-md:items-start">
                                          <div className="flex-[0_0_200px] max-md:flex-none max-md:col-[1] max-md:row-[1]">
                                            <h4 className="text-sm font-poppins-semibold text-white-100 m-0 flex items-center gap-1.5">
                                              {needsUpdate && (
                                                <span
                                                  className="text-yellow-500 shrink-0"
                                                  title="This tier needs updating after date change"
                                                >
                                                  <FiAlertTriangle size={24} />
                                                </span>
                                              )}
                                              <span>{tier.name}</span>
                                              {tier.ticket_stages &&
                                                tier.ticket_stages.length >
                                                  1 && (
                                                  <span
                                                    className="inline-block ml-1.5 font-bold text-[#59B2FF] text-xs"
                                                    title="This tier uses price stages"
                                                  >
                                                    {tier.ticket_stages.length}{" "}
                                                    Price Stages
                                                  </span>
                                                )}
                                            </h4>
                                          </div>
                                          <div className="flex items-center gap-3 text-sm font-poppins text-white-80 max-md:col-[1] max-md:row-[2] max-md:flex-col max-md:items-start max-md:gap-1">
                                            <span>
                                              <strong className="text-white-100">
                                                {tier.ticket_stages &&
                                                tier.ticket_stages.length > 1
                                                  ? (() => {
                                                      const prices =
                                                        tier.ticket_stages
                                                          .map(
                                                            (s: any) =>
                                                              s.price_cents
                                                          )
                                                          .filter(
                                                            (p: number) =>
                                                              typeof p ===
                                                                "number" &&
                                                              !isNaN(p)
                                                          );

                                                      if (prices.length === 0) {
                                                        if (
                                                          typeof tier.price_cents ===
                                                            "number" &&
                                                          !isNaN(
                                                            tier.price_cents
                                                          )
                                                        ) {
                                                          return formatPrice(
                                                            tier.price_cents,
                                                            event.currency
                                                          );
                                                        }
                                                        return "N/A";
                                                      }

                                                      const minPrice = Math.min(
                                                        ...prices
                                                      );
                                                      const maxPrice = Math.max(
                                                        ...prices
                                                      );

                                                      return `${formatPrice(
                                                        minPrice,
                                                        event.currency
                                                      )} - ${formatPrice(
                                                        maxPrice,
                                                        event.currency
                                                      )}`;
                                                    })()
                                                  : typeof tier.price_cents ===
                                                      "number" &&
                                                    !isNaN(tier.price_cents)
                                                  ? formatPrice(
                                                      tier.price_cents,
                                                      event.currency
                                                    )
                                                  : "N/A"}
                                              </strong>
                                            </span>
                                            <span>
                                              {Math.max(0, tier.quantity_total -
                                                (tier.quantity_sold ?? 0) -
                                                (tier.quantity_reserved ?? 0))}
                                              /{tier.quantity_total} available
                                              {(tier.quantity_reserved ?? 0) >
                                                0 &&
                                                ` · ${tier.quantity_reserved} Pending RSVPs`}
                                            </span>
                                            <span>
                                              {tier.per_user_limit} per user
                                            </span>
                                          </div>
                                          <div className="flex gap-2 max-md:col-[2] max-md:row-[1/-1] max-md:self-start max-md:flex-col">
                                            <button
                                              className="w-8 h-8 rounded-lg flex items-center justify-center border border-white-30 text-white-80 hover:bg-white-10 transition-colors cursor-pointer bg-transparent"
                                              title="Edit tier"
                                              onClick={() =>
                                                handleEditTier(tier)
                                              }
                                            >
                                              <FiEdit2 size={16} />
                                            </button>
                                            <button
                                              className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors cursor-pointer bg-transparent ${
                                                confirmDeleteTierId === tier.id
                                                  ? "border-red-500 bg-red-500/20 text-red-400"
                                                  : "border-red-500/30 text-red-400 hover:bg-red-500/20"
                                              }`}
                                              title={
                                                confirmDeleteTierId === tier.id
                                                  ? "Click again to confirm deletion"
                                                  : "Delete tier"
                                              }
                                              onClick={() =>
                                                handleDeleteTier(tier.id, tier)
                                              }
                                            >
                                              {confirmDeleteTierId ===
                                              tier.id ? (
                                                <span className="text-xs font-poppins-semibold">
                                                  Confirm?
                                                </span>
                                              ) : (
                                                <FiTrash2 size={16} />
                                              )}
                                            </button>
                                          </div>
                                        </div>

                                        {/* Display stages if present */}
                                        {tier.ticket_stages &&
                                          tier.ticket_stages.length > 1 && (
                                            <div className="mt-3 pt-3 border-t border-white-15 flex flex-col gap-1.5">
                                              {[...tier.ticket_stages]
                                                .sort(
                                                  (a: any, b: any) =>
                                                    a.order_index -
                                                    b.order_index
                                                )
                                                .map((stage: any) => (
                                                  <div
                                                    key={stage.id}
                                                    className="flex justify-between items-center px-2.5 py-1.5 bg-white-5 border border-white-10 rounded-lg text-xs font-poppins"
                                                  >
                                                    <span className="font-poppins-medium text-white-100 flex-1">
                                                      {stage.name}
                                                    </span>
                                                    <span className="font-poppins-semibold text-[#59B2FF] mx-3">
                                                      {formatPrice(
                                                        stage.price_cents,
                                                        event.currency
                                                      )}
                                                    </span>
                                                    <span className="text-white-50 text-[0.7rem]">
                                                      {stage.quantity -
                                                        (stage.sold_quantity ??
                                                          0)}
                                                      /{stage.quantity} left
                                                    </span>
                                                  </div>
                                                ))}
                                            </div>
                                          )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              <div className="flex items-center gap-3 p-5 bg-white-5 border border-white-15 rounded-card text-white-50 italic font-poppins [&>svg]:text-white-30 [&>svg]:shrink-0">
                                <FiTag size={24} />
                                <p>No ticket tiers configured for this event</p>
                              </div>
                            )}

                            {showingAddForm === event.id ? (
                              <TierInlineForm
                                eventId={event.id}
                                tentativeEventStart={
                                  editingEventData?.eventId === event.id
                                    ? editingEventData?.startsAt
                                    : undefined
                                }
                                tentativeEventEnd={
                                  editingEventData?.eventId === event.id
                                    ? editingEventData?.endsAt
                                    : undefined
                                }
                                eventFormFields={getActiveEventFormFields(
                                  event.registration_form_config,
                                )}
                                onSave={handleModalSuccess}
                                onCancel={handleCancelEdit}
                              />
                            ) : (
                              <button
                                onClick={() => handleAddTier(event.id)}
                                disabled={ticketTiers.length >= MAX_TICKET_TIERS_PER_EVENT}
                                className="flex items-center gap-2 p-3 bg-white-5 border-2 border-dashed border-white-20 rounded-card text-white-50 cursor-pointer transition-all text-sm font-poppins-medium w-full justify-center mt-2 hover:border-white-50 hover:bg-white-10 hover:text-white-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                title={
                                  ticketTiers.length >= MAX_TICKET_TIERS_PER_EVENT
                                    ? `Maximum ${MAX_TICKET_TIERS_PER_EVENT} tiers allowed`
                                    : "Add another ticket tier"
                                }
                              >
                                <FiPlus size={16} />
                                Add Ticket Tier
                              </button>
                            )}
                          </div>

                          {/* Exit Editing Button - closes the accordion */}
                          {editingEventData && (
                            <div className="mt-5 text-center">
                              <button
                                onClick={handleDiscardEventChanges}
                                className="border border-white-30 text-white-100 font-poppins-medium rounded-pill px-7 py-2.5 text-sm hover:bg-white-10 transition-colors cursor-pointer bg-transparent"
                              >
                                Exit Editing
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Desktop Table */}
              <table className="w-full border-collapse max-lg:hidden">
                <thead>
                  <tr>
                    <th className="bg-white-5 px-4 py-3 text-left font-poppins-medium text-white-50 border-b border-white-20 text-xs uppercase tracking-wider">Event Name</th>
                    <th className="bg-white-5 px-4 py-3 text-left font-poppins-medium text-white-50 border-b border-white-20 text-xs uppercase tracking-wider">Date</th>
                    <th className="bg-white-5 px-4 py-3 text-left font-poppins-medium text-white-50 border-b border-white-20 text-xs uppercase tracking-wider">Location</th>
                    <th className="bg-white-5 px-4 py-3 text-left font-poppins-medium text-white-50 border-b border-white-20 text-xs uppercase tracking-wider">Attendees</th>
                    <th className="bg-white-5 px-4 py-3 text-left font-poppins-medium text-white-50 border-b border-white-20 text-xs uppercase tracking-wider">Ticket Tiers</th>
                    <th className="bg-white-5 px-4 py-3 text-left font-poppins-medium text-white-50 border-b border-white-20 text-xs uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allCurrentTierEvents.map(event => {
                    // Sort tiers by price (lowest first)
                    const ticketTiers = [...(event.ticket_tiers ?? [])].sort(
                      (a: any, b: any) => a.price_cents - b.price_cents
                    );
                    const tierCount = ticketTiers.length;
                    const tierNames = ticketTiers
                      .map((tier: any) => tier.name)
                      .join(", ");
                    const isExpanded = expandedEventId === event.id;
                    const isEditing = editingEventData?.eventId === event.id;
                    const isEventSaving =
                      savingEventId === event.id && isSavingEvent;

                    // Calculate total attendees (sold tickets)
                    const totalTickets = ticketTiers.reduce(
                      (sum: number, tier: any) => sum + tier.quantity_total,
                      0
                    );
                    const soldTickets = ticketTiers.reduce(
                      (sum: number, tier: any) =>
                        sum + (tier.quantity_sold ?? 0),
                      0
                    );

                    return (
                      <React.Fragment key={event.id}>
                        <tr
                          className={`hover:bg-white-5 ${isExpanded ? "!bg-white-5" : ""} ${
                            isEventSaving ? "pointer-events-none [&>td]:opacity-40" : ""
                          }`}
                        >
                          <td className="px-4 py-3 border-b border-white-10 text-white-80 font-poppins text-sm">
                            <div className="flex flex-col">
                              <h4 className="text-sm font-poppins-semibold text-white-100 m-0">{event.name}</h4>
                              <span className="text-xs text-white-40 font-poppins">/{event.slug}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 border-b border-white-10 text-white-80 font-poppins text-sm">{formatDate(event.starts_at)}</td>
                          <td className="px-4 py-3 border-b border-white-10 text-white-80 font-poppins text-sm">
                            {event.venue}, {event.city}
                          </td>
                          <td className="px-4 py-3 border-b border-white-10 text-white-80 font-poppins text-sm">
                            {soldTickets} / {totalTickets}
                          </td>
                          <td className="px-4 py-3 border-b border-white-10 text-white-80 font-poppins text-sm">
                            <div className="flex flex-col">
                              {tierCount > 0 ? (
                                <>
                                  <div className="text-sm font-poppins-semibold text-white-100">
                                    {tierCount} tier{tierCount !== 1 ? "s" : ""}
                                  </div>
                                  <div className="text-xs text-white-50 font-poppins" title={tierNames}>
                                    {tierNames.length > 30
                                      ? `${tierNames.substring(0, 30)}...`
                                      : tierNames}
                                  </div>
                                </>
                              ) : (
                                <div className="text-white-50 text-sm font-poppins italic">
                                  No tiers configured
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 border-b border-white-10 text-white-80 font-poppins text-sm">
                            <div className="flex gap-2">
                              <button
                                className={`w-8 h-8 rounded-lg flex items-center justify-center border border-white-30 text-white-80 hover:bg-white-10 transition-colors cursor-pointer bg-transparent ${
                                  isExpanded ? "bg-white-10 text-white-100" : ""
                                }`}
                                title={
                                  isExpanded ? "Collapse" : "Edit Event & Tiers"
                                }
                                onClick={() => {
                                  if (isExpanded) {
                                    handleDiscardEventChanges();
                                  } else {
                                    handleEditEvent(event);
                                  }
                                }}
                              >
                                <FiEdit2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && isEditing && (
                          <tr className="bg-transparent">
                            <td
                              colSpan={6}
                              className="!p-0 !border-b !border-white-20"
                            >
                              <div className="p-6 bg-white-3 border-l-[3px] border-white-30">
                                {/* Event Details Section */}
                                {editingEventData && (
                                  <div className="bg-white-3 rounded-card border border-white-20 p-6 mb-4">
                                    <div className="flex justify-between items-center mb-5 pb-3 border-b border-white-15">
                                      <h3 className="text-xl font-poppins-semibold text-white-100 m-0 flex items-center gap-2">
                                        <FiCalendar size={20} />
                                        Event Details
                                      </h3>
                                    </div>

                                    {editingEventData.tiersNeedUpdate.length >
                                      0 && (
                                      <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-card p-4 mb-5">
                                        <div className="text-yellow-500 shrink-0 flex">
                                          <FiAlertTriangle size={26} />
                                        </div>
                                        <div className="flex-1">
                                          <strong className="block text-yellow-400 font-poppins-semibold mb-1">
                                            Ticket tier conflicts detected!
                                          </strong>
                                          <p className="m-0 text-white-70 text-sm font-poppins">
                                            {editingEventData.dateChanged
                                              ? "You must manually update all ticket tier sales times before saving."
                                              : "Some ticket tiers have sales end times that are after the event starts. Please update them before saving."}{" "}
                                            {
                                              editingEventData.tiersNeedUpdate
                                                .length
                                            }{" "}
                                            tier(s) need updating.
                                          </p>
                                        </div>
                                      </div>
                                    )}

                                    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-4">
                                      <div className="flex flex-col gap-1.5">
                                        <label
                                          htmlFor="edit-venue"
                                          className="font-poppins-medium text-white-70 text-sm m-0 flex items-center gap-1"
                                        >
                                          Venue *
                                        </label>
                                        <input
                                          type="text"
                                          id="edit-venue"
                                          value={editingEventData.venue}
                                          onChange={e =>
                                            handleEventDataChange(
                                              "venue",
                                              e.target.value
                                            )
                                          }
                                          className="bg-white-5 border border-white-20 rounded-xl px-3 py-2 text-sm text-white-100 font-poppins transition-all focus:outline-none focus:border-white-50 focus:bg-white-8 disabled:opacity-50 disabled:cursor-not-allowed"
                                          placeholder="Golden Gate Park"
                                        />
                                      </div>

                                      <div className="flex flex-col gap-1.5">
                                        <label
                                          htmlFor="edit-city"
                                          className="font-poppins-medium text-white-70 text-sm m-0 flex items-center gap-1"
                                        >
                                          <FiMapPin size={16} />
                                          City *
                                        </label>
                                        <CityAutocompleteField
                                          id="edit-city"
                                          value={editingEventData.city}
                                          onChange={city =>
                                            handleEventDataChange("city", city)
                                          }
                                          className="bg-white-5 border border-white-20 rounded-xl px-3 py-2 text-sm text-white-100 font-poppins transition-all focus:outline-none focus:border-white-50 focus:bg-white-8 disabled:opacity-50 disabled:cursor-not-allowed w-full"
                                          placeholder="San Francisco"
                                        />
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-4">
                                      <div className="flex flex-col gap-1.5">
                                        <label
                                          htmlFor="edit-starts-at"
                                          className="font-poppins-medium text-white-70 text-sm m-0 flex items-center gap-1"
                                        >
                                          <FiCalendar size={16} />
                                          Start Date & Time *
                                        </label>
                                        <input
                                          type="datetime-local"
                                          id="edit-starts-at"
                                          value={editingEventData.startsAt}
                                          min={getMainDateTimeLocal(2)}
                                          onChange={e =>
                                            handleEventDataChange(
                                              "startsAt",
                                              e.target.value
                                            )
                                          }
                                          className="bg-white-5 border border-white-20 rounded-xl px-3 py-2 text-sm text-white-100 font-poppins transition-all focus:outline-none focus:border-white-50 focus:bg-white-8 disabled:opacity-50 disabled:cursor-not-allowed scheme-dark"
                                        />
                                      </div>

                                      <div className="flex flex-col gap-1.5">
                                        <label
                                          htmlFor="edit-ends-at"
                                          className="font-poppins-medium text-white-70 text-sm m-0 flex items-center gap-1"
                                        >
                                          <FiClock size={16} />
                                          End Date & Time *
                                        </label>
                                        <input
                                          type="datetime-local"
                                          id="edit-ends-at"
                                          value={editingEventData.endsAt}
                                          min={getMainDateTimeLocal(2)}
                                          onChange={e =>
                                            handleEventDataChange(
                                              "endsAt",
                                              e.target.value
                                            )
                                          }
                                          className="bg-white-5 border border-white-20 rounded-xl px-3 py-2 text-sm text-white-100 font-poppins transition-all focus:outline-none focus:border-white-50 focus:bg-white-8 disabled:opacity-50 disabled:cursor-not-allowed scheme-dark"
                                        />
                                      </div>
                                    </div>

                                    <p className="text-[0.8125rem] text-white-50 leading-relaxed my-1.5 font-poppins [&>strong]:text-white-80 [&>strong]:font-poppins-semibold">
                                      <strong>Note:</strong> Events must start
                                      at least 2 hours in the future, and ticket sales must end before the event
                                      starts. If you change the event
                                      start time and it conflicts with a ticket
                                      tier sales end time, you will see an alert
                                      and you must manually update conflicting
                                      ticket tier sales times to match the new
                                      event start time.
                                    </p>

                                    <p className="text-[0.8125rem] text-white-50 leading-relaxed my-1.5 font-poppins [&>strong]:text-white-80 [&>strong]:font-poppins-semibold">
                                      <strong>Ticket Tier Changes:</strong> When
                                      you add, edit, or delete ticket tiers
                                      below, changes are saved instantly. Only
                                      event details (venue, city, dates) require
                                      you to click &quot;Save Event
                                      Details&quot;.
                                    </p>

                                    {/* Horizontal Rule */}
                                    <hr className="border-none border-t border-white-15 my-6" />

                                    {/* Edit Event Image Section */}
                                    <div className="mb-6">
                                      <h4 className="text-base font-poppins-semibold text-white-100 m-0 mb-2 flex items-center gap-2">
                                        <FiImage size={18} />
                                        Edit Event Image
                                      </h4>
                                      <p className="text-[0.8125rem] text-white-50 leading-relaxed my-1.5 font-poppins">
                                        Upload an image to replace your current
                                        one. Recommended size: 1080×1350.
                                      </p>

                                      <div className="grid grid-cols-[1fr_2fr] max-md:grid-cols-1 gap-4 mt-4">
                                        {/* Left side: Current Image Preview */}
                                        <div className="flex flex-col gap-2">
                                          <label className="font-poppins-medium text-white-50 text-sm m-0">
                                            Current Image
                                          </label>
                                          {editingImagePreview ? (
                                            <div className="w-full aspect-[3/4] rounded-card overflow-hidden bg-white-5 flex items-center justify-center">
                                              <img
                                                src={editingImagePreview}
                                                alt="Event preview"
                                                className="w-full h-full object-cover"
                                              />
                                            </div>
                                          ) : (
                                            <div className="w-full aspect-[3/4] rounded-card overflow-hidden bg-white-5 flex items-center justify-center border-2 border-dashed border-white-20">
                                              <div className="flex flex-col items-center gap-2 text-white-50">
                                                <FiImage
                                                  size={32}
                                                  className="text-white-30"
                                                />
                                                <p className="m-0 text-sm">No image set</p>
                                              </div>
                                            </div>
                                          )}
                                        </div>

                                        {/* Right side: Upload Area */}
                                        <div className="flex flex-col gap-2">
                                          <label className="font-poppins-medium text-white-50 text-sm m-0">
                                            Upload New Image
                                          </label>
                                          <div
                                            className="w-full border-2 border-dashed border-white-20 rounded-card bg-white-3 cursor-pointer transition-all hover:border-white-40 hover:bg-white-8 flex items-center justify-center min-h-[200px]"
                                            onDragOver={
                                              handleEditingImageDragOver
                                            }
                                            onDragLeave={
                                              handleEditingImageDragLeave
                                            }
                                            onDrop={handleEditingImageDrop}
                                            onClick={() =>
                                              document
                                                .getElementById(
                                                  "edit-image-upload"
                                                )
                                                ?.click()
                                            }
                                          >
                                            <div className="flex flex-col items-center gap-2 p-6 text-center">
                                              <FiUpload
                                                size={32}
                                                className="text-white-40"
                                              />
                                              <p className="text-sm font-poppins-medium text-white-70 m-0">
                                                Click to upload or drag and drop
                                              </p>
                                              <p className="text-[0.8125rem] text-white-50 m-0 font-poppins">
                                                PNG, JPG, GIF up to 4.5MB.
                                                Recommended size: 1080×1350.
                                              </p>
                                            </div>
                                          </div>

                                          <input
                                            type="file"
                                            id="edit-image-upload"
                                            accept="image/*"
                                            onChange={e => {
                                              const file = e.target.files?.[0];
                                              if (file)
                                                handleEditingImageUpload(file);
                                            }}
                                            className="hidden"
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    {/* Save/Discard Actions */}
                                    <div className="flex justify-end gap-3 pt-5 mt-5 border-t border-white-20">
                                      <button
                                        onClick={handleDiscardEventChanges}
                                        className="border border-white-30 text-white-100 font-poppins-medium rounded-pill px-7 py-2.5 text-sm hover:bg-white-10 transition-colors cursor-pointer bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={isSavingEvent}
                                      >
                                        Discard
                                      </button>
                                      <button
                                        onClick={handleSaveEventChanges}
                                        className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-7 py-2.5 text-sm hover:opacity-90 transition-opacity cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={
                                          isSavingEvent ||
                                          editingEventData.tiersNeedUpdate
                                            .length > 0
                                        }
                                      >
                                        {isSavingEvent
                                          ? "Saving..."
                                          : "Save Event Details"}
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Ticket Tiers Section */}
                                <div className="flex justify-between items-center mb-5 pb-3 border-b border-white-20">
                                  <h3 className="text-lg font-poppins-semibold text-white-100 m-0">Ticket Tiers for {event.name}</h3>
                                  <button
                                    onClick={() => handleAddTier(event.id)}
                                    disabled={ticketTiers.length >= MAX_TICKET_TIERS_PER_EVENT}
                                    className="bg-white-100 text-dark font-poppins-semibold rounded-pill px-4 py-1.5 text-xs hover:opacity-90 transition-opacity cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                    title={
                                      ticketTiers.length >= MAX_TICKET_TIERS_PER_EVENT
                                        ? `Maximum ${MAX_TICKET_TIERS_PER_EVENT} tiers allowed`
                                        : "Add another ticket tier"
                                    }
                                  >
                                    <FiPlus size={16} />
                                    Add Tier
                                  </button>
                                </div>

                                <div className="flex flex-col gap-2 relative">
                                  {/* Loading overlay during tier operations */}
                                  {(deleteTicketTierMutation.isPending ||
                                    isRefetchingData) && (
                                    <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center z-10 min-h-[200px] backdrop-blur-sm rounded-card">
                                      <div className="animate-spin rounded-full w-10 h-10 border-2 border-white-20 border-t-white-100 mb-3"></div>
                                      <p className="m-0 text-white-100 text-sm font-poppins-semibold">Updating tiers...</p>
                                    </div>
                                  )}

                                  {ticketTiers.length > 0 ? (
                                    ticketTiers.map((tier: any) => {
                                      const needsUpdate =
                                        editingEventData?.tiersNeedUpdate.includes(
                                          tier.id
                                        ) || false;

                                      return (
                                        <div key={tier.id}>
                                          {editingTierId === tier.id ? (
                                            <TierInlineForm
                                              tier={tier}
                                              tentativeEventStart={
                                                editingEventData?.eventId ===
                                                event.id
                                                  ? editingEventData?.startsAt
                                                  : undefined
                                              }
                                              tentativeEventEnd={
                                                editingEventData?.eventId ===
                                                event.id
                                                  ? editingEventData?.endsAt
                                                  : undefined
                                              }
                                              eventFormFields={getActiveEventFormFields(
                                                event.registration_form_config,
                                              )}
                                              onSave={() => {
                                                handleTierUpdated(tier.id);
                                                handleModalSuccess();
                                              }}
                                              onCancel={handleCancelEdit}
                                            />
                                          ) : (
                                            <div
                                              className={`bg-white-5 border border-white-20 rounded-card px-4 py-3 transition-all hover:bg-white-8 ${
                                                needsUpdate
                                                  ? "bg-yellow-500/10 border-l-[3px] border-l-yellow-500"
                                                  : ""
                                              }`}
                                            >
                                              <div className="flex items-center gap-4">
                                                <div className="flex-[0_0_200px]">
                                                  <h4 className="text-sm font-poppins-semibold text-white-100 m-0 flex items-center gap-1.5">
                                                    <div className="flex items-center gap-1.5">
                                                      {needsUpdate && (
                                                        <span title="This tier needs updating after date change">
                                                          <FiAlertTriangle
                                                            size={24}
                                                            className="text-yellow-500 shrink-0"
                                                          />
                                                        </span>
                                                      )}
                                                      <span>{tier.name}</span>
                                                      {tier.ticket_stages &&
                                                        tier.ticket_stages
                                                          .length > 1 && (
                                                          <span
                                                            className="inline-block ml-1.5 font-bold text-[#59B2FF] text-xs"
                                                            title="This tier uses price stages"
                                                          >
                                                            {
                                                              tier.ticket_stages
                                                                .length
                                                            }{" "}
                                                            Price Stages
                                                          </span>
                                                        )}
                                                    </div>
                                                  </h4>
                                                </div>
                                                <div className="flex items-center gap-3 text-sm font-poppins text-white-80">
                                                  <span>
                                                    <strong className="text-white-100">
                                                      {tier.ticket_stages &&
                                                      tier.ticket_stages
                                                        .length > 1
                                                        ? (() => {
                                                            // Map prices and filter out any invalid values
                                                            const prices =
                                                              tier.ticket_stages
                                                                .map(
                                                                  (s: any) =>
                                                                    s.price_cents
                                                                )
                                                                .filter(
                                                                  (p: number) =>
                                                                    typeof p ===
                                                                      "number" &&
                                                                    !isNaN(p)
                                                                );

                                                            // Guard against empty array after filtering
                                                            if (
                                                              prices.length ===
                                                              0
                                                            ) {
                                                              // Validate tier.price_cents before using as fallback
                                                              if (
                                                                typeof tier.price_cents ===
                                                                  "number" &&
                                                                !isNaN(
                                                                  tier.price_cents
                                                                )
                                                              ) {
                                                                return formatPrice(
                                                                  tier.price_cents,
                                                                  event.currency
                                                                );
                                                              }
                                                              return "N/A";
                                                            }

                                                            const minPrice =
                                                              Math.min(
                                                                ...prices
                                                              );
                                                            const maxPrice =
                                                              Math.max(
                                                                ...prices
                                                              );

                                                            return `${formatPrice(
                                                              minPrice,
                                                              event.currency
                                                            )} - ${formatPrice(
                                                              maxPrice,
                                                              event.currency
                                                            )}`;
                                                          })()
                                                        : typeof tier.price_cents ===
                                                            "number" &&
                                                          !isNaN(
                                                            tier.price_cents
                                                          )
                                                        ? formatPrice(
                                                            tier.price_cents,
                                                            event.currency
                                                          )
                                                        : "N/A"}
                                                    </strong>
                                                  </span>
                                                  <span>
                                                    {Math.max(0, tier.quantity_total -
                                                      (tier.quantity_sold ?? 0) -
                                                      (tier.quantity_reserved ?? 0))}
                                                    /{tier.quantity_total}{" "}
                                                    available
                                                    {(tier.quantity_reserved ??
                                                      0) > 0 &&
                                                      ` · ${tier.quantity_reserved} Pending RSVPs`}
                                                  </span>
                                                  <span>
                                                    {tier.per_user_limit} per
                                                    user
                                                  </span>
                                                </div>
                                                <div className="flex gap-2">
                                                  <button
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center border border-white-30 text-white-80 hover:bg-white-10 transition-colors cursor-pointer bg-transparent"
                                                    title="Edit tier"
                                                    onClick={() =>
                                                      handleEditTier(tier)
                                                    }
                                                  >
                                                    <FiEdit2 size={16} />
                                                  </button>
                                                  <button
                                                    className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors cursor-pointer bg-transparent ${
                                                      confirmDeleteTierId ===
                                                      tier.id
                                                        ? "border-red-500 bg-red-500/20 text-red-400"
                                                        : "border-red-500/30 text-red-400 hover:bg-red-500/20"
                                                    }`}
                                                    title={
                                                      confirmDeleteTierId ===
                                                      tier.id
                                                        ? "Click again to confirm deletion"
                                                        : "Delete tier"
                                                    }
                                                    onClick={() =>
                                                      handleDeleteTier(
                                                        tier.id,
                                                        tier
                                                      )
                                                    }
                                                  >
                                                    {confirmDeleteTierId ===
                                                    tier.id ? (
                                                      <span className="text-xs font-poppins-semibold">
                                                        Confirm?
                                                      </span>
                                                    ) : (
                                                      <FiTrash2 size={16} />
                                                    )}
                                                  </button>
                                                </div>
                                              </div>

                                              {/* Display stages if present */}
                                              {tier.ticket_stages &&
                                                tier.ticket_stages.length >
                                                  1 && (
                                                  <div className="mt-3 pt-3 border-t border-white-15 flex flex-col gap-1.5">
                                                    {[...tier.ticket_stages]
                                                      .sort(
                                                        (a: any, b: any) =>
                                                          a.order_index -
                                                          b.order_index
                                                      )
                                                      .map((stage: any) => (
                                                        <div
                                                          key={stage.id}
                                                          className="flex justify-between items-center px-2.5 py-1.5 bg-white-5 border border-white-10 rounded-lg text-xs font-poppins"
                                                        >
                                                          <span className="font-poppins-medium text-white-100 flex-1">
                                                            {stage.name}
                                                          </span>
                                                          <span className="font-poppins-semibold text-[#59B2FF] mx-3">
                                                            {formatPrice(
                                                              stage.price_cents,
                                                              event.currency
                                                            )}
                                                          </span>
                                                          <span className="text-white-50 text-[0.7rem]">
                                                            {stage.quantity -
                                                              (stage.sold_quantity ??
                                                                0)}
                                                            /{stage.quantity}{" "}
                                                            left
                                                          </span>
                                                        </div>
                                                      ))}
                                                  </div>
                                                )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <div className="flex items-center gap-3 p-5 bg-white-5 border border-white-15 rounded-card text-white-50 italic font-poppins [&>svg]:text-white-30 [&>svg]:shrink-0">
                                      <FiTag size={24} />
                                      <p>
                                        No ticket tiers configured for this
                                        event
                                      </p>
                                    </div>
                                  )}

                                  {showingAddForm === event.id ? (
                                    <TierInlineForm
                                      eventId={event.id}
                                      tentativeEventStart={
                                        editingEventData?.eventId === event.id
                                          ? editingEventData?.startsAt
                                          : undefined
                                      }
                                      tentativeEventEnd={
                                        editingEventData?.eventId === event.id
                                          ? editingEventData?.endsAt
                                          : undefined
                                      }
                                      eventFormFields={getActiveEventFormFields(
                                        event.registration_form_config,
                                      )}
                                      onSave={handleModalSuccess}
                                      onCancel={handleCancelEdit}
                                    />
                                  ) : (
                                    <button
                                      onClick={() => handleAddTier(event.id)}
                                      disabled={ticketTiers.length >= MAX_TICKET_TIERS_PER_EVENT}
                                      className="flex items-center gap-2 p-3 bg-white-5 border-2 border-dashed border-white-20 rounded-card text-white-50 cursor-pointer transition-all text-sm font-poppins-medium w-full justify-center mt-2 hover:border-white-50 hover:bg-white-10 hover:text-white-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                      title={
                                        ticketTiers.length >= MAX_TICKET_TIERS_PER_EVENT
                                          ? `Maximum ${MAX_TICKET_TIERS_PER_EVENT} tiers allowed`
                                          : "Add another ticket tier"
                                      }
                                    >
                                      <FiPlus size={16} />
                                      Add Ticket Tier
                                    </button>
                                  )}
                                </div>

                                {/* Exit Editing Button - closes the accordion */}
                                {editingEventData && (
                                  <div className="mt-5 text-center">
                                    <button
                                      onClick={handleDiscardEventChanges}
                                      className="border border-white-30 text-white-100 font-poppins-medium rounded-pill px-7 py-2.5 text-sm hover:bg-white-10 transition-colors cursor-pointer bg-transparent"
                                    >
                                      Exit Editing
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Past Events - Collapsible Section */}
          {pastTierEvents.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() =>
                  setExpandedSections(prev => ({
                    ...prev,
                    ticketTiers: !prev.ticketTiers,
                  }))
                }
                className="w-full flex justify-between items-center p-0 border-none cursor-pointer bg-transparent text-left"
              >
                <h2 className="text-sm font-poppins-semibold text-white-100 uppercase tracking-wider m-0">
                  Past Events ({pastTierEvents.length})
                </h2>
                <span className="text-xl text-white-50 w-6 h-6 flex items-center justify-center">
                  {expandedSections.ticketTiers ? "\u2212" : "+"}
                </span>
              </button>

              {expandedSections.ticketTiers && (
                <div className="flex flex-col gap-3">
                  {/* Mobile Cards */}
                  <div className="hidden max-lg:flex flex-col gap-2">
                    {pastTierEvents
                      .sort((a, b) => {
                        const aTime = new Date(a.starts_at).getTime();
                        const bTime = new Date(b.starts_at).getTime();
                        return bTime - aTime;
                      })
                      .map(event => {
                        const ticketTiers = [
                          ...(event.ticket_tiers ?? []),
                        ].sort(
                          (a: any, b: any) => a.price_cents - b.price_cents
                        );
                        const tierCount = ticketTiers.length;
                        const tierNames = ticketTiers
                          .map((tier: any) => tier.name)
                          .join(", ");
                        const isExpanded = expandedPastEventId === event.id;

                        const totalTickets = ticketTiers.reduce(
                          (sum: number, tier: any) => sum + tier.quantity_total,
                          0
                        );
                        const soldTickets = ticketTiers.reduce(
                          (sum: number, tier: any) =>
                            sum + (tier.quantity_sold ?? 0),
                          0
                        );

                        return (
                          <React.Fragment key={`mobile-past-${event.id}`}>
                            <div
                              className={`bg-white-5 border border-white-15 rounded-card p-3 transition-all opacity-70 ${
                                isExpanded
                                  ? "!bg-white-8 !border-white-30"
                                  : ""
                              }`}
                            >
                              <div className="flex justify-between items-start mb-1.5">
                                <div>
                                  <h3 className="text-sm font-poppins-semibold text-white-100 m-0">
                                    {event.name}
                                  </h3>
                                  <p className="text-xs text-white-40 mt-0.5 font-poppins">
                                    Past Event
                                  </p>
                                </div>
                              </div>
                              <p className="text-xs text-white-50 mt-1 mb-1.5 font-poppins">
                                {formatDate(event.starts_at)}
                              </p>
                              <p className="text-xs text-white-50 mb-2 flex items-center gap-1 font-poppins">
                                <FiMapPin size={14} />
                                {event.venue}, {event.city}
                              </p>
                              <div className="flex justify-between items-center pt-2 border-t border-white-15">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[0.7rem] text-white-50 uppercase tracking-wider font-poppins-medium">
                                    Attendees
                                  </span>
                                  <span className="text-sm font-poppins-semibold text-white-100">
                                    {soldTickets} / {totalTickets}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[0.7rem] text-white-50 uppercase tracking-wider font-poppins-medium">
                                    Tiers
                                  </span>
                                  <span className="text-sm font-poppins-semibold text-white-100">
                                    {tierCount > 0 ? (
                                      <>
                                        {tierCount} tier
                                        {tierCount !== 1 ? "s" : ""}
                                      </>
                                    ) : (
                                      "None"
                                    )}
                                  </span>
                                </div>
                                <div className="shrink-0">
                                  <button
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center border border-white-30 text-white-80 hover:bg-white-10 transition-colors cursor-pointer bg-transparent ${
                                      isExpanded ? "bg-white-10 text-white-100" : ""
                                    }`}
                                    title={
                                      isExpanded
                                        ? "Collapse Tiers"
                                        : "View Ticket Tiers"
                                    }
                                    onClick={() =>
                                      handleTogglePastEventExpansion(event.id)
                                    }
                                  >
                                    <FiEye size={16} />
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Mobile Expansion Content - directly below this card */}
                            {isExpanded && (
                              <div className="p-6 max-md:p-3 bg-white-3 border-l-[3px] border-white-30">
                                <div className="flex justify-between items-center max-md:flex-col max-md:items-start max-md:gap-3 max-md:mt-3 mb-5 pb-3 border-b border-white-20">
                                  <h3 className="text-lg font-poppins-semibold text-white-100 m-0">Ticket Tiers for {event.name}</h3>
                                  <span className="inline-block text-xs font-poppins-medium text-white-50 bg-white-10 px-2 py-1 uppercase tracking-wider rounded-lg">
                                    Read-only
                                  </span>
                                </div>

                                <div className="flex flex-col gap-2 relative">
                                  {ticketTiers.length > 0 ? (
                                    ticketTiers.map((tier: any) => (
                                      <div
                                        key={tier.id}
                                        className="bg-white-5 border border-white-20 rounded-card px-4 py-3 transition-all cursor-default"
                                      >
                                        <div className="flex items-center gap-4 max-md:grid max-md:grid-cols-[1fr_auto] max-md:grid-rows-[auto_auto] max-md:gap-2 max-md:items-start">
                                          <div className="flex-[0_0_200px] max-md:flex-none max-md:col-[1] max-md:row-[1]">
                                            <h4 className="text-sm font-poppins-semibold text-white-100 m-0 flex items-center gap-1.5">{tier.name}</h4>
                                          </div>
                                          <div className="flex items-center gap-3 text-sm font-poppins text-white-80 max-md:col-[1] max-md:row-[2] max-md:flex-col max-md:items-start max-md:gap-1">
                                            <span>
                                              <strong className="text-white-100">
                                                {formatPrice(
                                                  extractBasePriceHistorical(
                                                    tier.price_cents,
                                                    tier.updated_at ||
                                                      tier.created_at
                                                  ).basePriceCents,
                                                  event.currency
                                                )}
                                              </strong>
                                            </span>
                                            <span>
                                              {Math.max(
                                                0,
                                                tier.quantity_total -
                                                  (tier.quantity_sold ?? 0) -
                                                  (tier.quantity_reserved ?? 0)
                                              )}
                                              /{tier.quantity_total} available
                                              {(tier.quantity_reserved ?? 0) >
                                                0 &&
                                                ` · ${tier.quantity_reserved} reserved`}
                                            </span>
                                            <span>
                                              {tier.per_user_limit} per user
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="flex items-center gap-3 p-5 bg-white-5 border border-white-15 rounded-card text-white-50 italic font-poppins [&>svg]:text-white-30 [&>svg]:shrink-0">
                                      <FiTag size={24} />
                                      <p>
                                        No ticket tiers configured for this
                                        event
                                      </p>
                                    </div>
                                  )}
                                </div>

                                <div className="flex justify-center mt-4">
                                  <button
                                    onClick={() =>
                                      handleTogglePastEventExpansion(event.id)
                                    }
                                    className="border border-white-30 text-white-100 font-poppins-medium rounded-pill px-7 py-2.5 text-sm hover:bg-white-10 transition-colors cursor-pointer bg-transparent"
                                  >
                                    Close
                                  </button>
                                </div>
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                  </div>

                  {/* Desktop Table */}
                  <table className="w-full border-collapse max-lg:hidden [&_tbody_tr]:opacity-70 hover:[&_tbody_tr]:opacity-100">
                    <thead>
                      <tr>
                        <th className="bg-white-5 px-4 py-3 text-left font-poppins-medium text-white-50 border-b border-white-20 text-xs uppercase tracking-wider">Event Name</th>
                        <th className="bg-white-5 px-4 py-3 text-left font-poppins-medium text-white-50 border-b border-white-20 text-xs uppercase tracking-wider">Date</th>
                        <th className="bg-white-5 px-4 py-3 text-left font-poppins-medium text-white-50 border-b border-white-20 text-xs uppercase tracking-wider">Location</th>
                        <th className="bg-white-5 px-4 py-3 text-left font-poppins-medium text-white-50 border-b border-white-20 text-xs uppercase tracking-wider">Attendees</th>
                        <th className="bg-white-5 px-4 py-3 text-left font-poppins-medium text-white-50 border-b border-white-20 text-xs uppercase tracking-wider">Ticket Tiers</th>
                        <th className="bg-white-5 px-4 py-3 text-left font-poppins-medium text-white-50 border-b border-white-20 text-xs uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pastTierEvents
                        .sort((a, b) => {
                          // All events are guaranteed to have starts_at
                          const aTime = new Date(a.starts_at).getTime();
                          const bTime = new Date(b.starts_at).getTime();
                          return bTime - aTime;
                        })
                        .map(event => {
                          // Sort tiers by price (lowest first)
                          const ticketTiers = [
                            ...(event.ticket_tiers ?? []),
                          ].sort(
                            (a: any, b: any) => a.price_cents - b.price_cents
                          );
                          const tierCount = ticketTiers.length;
                          const tierNames = ticketTiers
                            .map((tier: any) => tier.name)
                            .join(", ");
                          const isExpanded = expandedPastEventId === event.id;

                          // Calculate total attendees (sold tickets)
                          const totalTickets = ticketTiers.reduce(
                            (sum: number, tier: any) =>
                              sum + tier.quantity_total,
                            0
                          );
                          const soldTickets = ticketTiers.reduce(
                            (sum: number, tier: any) =>
                              sum + (tier.quantity_sold ?? 0),
                            0
                          );

                          return (
                            <React.Fragment key={event.id}>
                              <tr
                                className={isExpanded ? "!bg-white-5" : ""}
                              >
                                <td className="px-4 py-3 border-b border-white-10 text-white-80 font-poppins text-sm">
                                  <div className="flex flex-col">
                                    <h4 className="text-sm font-poppins-semibold text-white-100 m-0">{event.name}</h4>
                                    <span className="inline-block text-[0.625rem] font-poppins-medium text-white-50 bg-white-10 px-1.5 py-0.5 uppercase tracking-wider rounded mt-1 w-fit">
                                      Past Event
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 border-b border-white-10 text-white-80 font-poppins text-sm">{formatDate(event.starts_at)}</td>
                                <td className="px-4 py-3 border-b border-white-10 text-white-80 font-poppins text-sm">
                                  {event.venue}, {event.city}
                                </td>
                                <td className="px-4 py-3 border-b border-white-10 text-white-80 font-poppins text-sm">
                                  {soldTickets} / {totalTickets}
                                </td>
                                <td className="px-4 py-3 border-b border-white-10 text-white-80 font-poppins text-sm">
                                  <div className="flex flex-col">
                                    {tierCount > 0 ? (
                                      <>
                                        <div className="text-sm font-poppins-semibold text-white-100">
                                          {tierCount} tier
                                          {tierCount !== 1 ? "s" : ""}
                                        </div>
                                        <div
                                          className="text-xs text-white-50 font-poppins"
                                          title={tierNames}
                                        >
                                          {tierNames.length > 30
                                            ? `${tierNames.substring(0, 30)}...`
                                            : tierNames}
                                        </div>
                                      </>
                                    ) : (
                                      <div className="text-white-50 text-sm font-poppins italic">
                                        No tiers configured
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 border-b border-white-10 text-white-80 font-poppins text-sm">
                                  <div className="flex gap-2">
                                    <button
                                      className={`w-8 h-8 rounded-lg flex items-center justify-center border border-white-30 text-white-80 hover:bg-white-10 transition-colors cursor-pointer bg-transparent ${
                                        isExpanded ? "bg-white-10 text-white-100" : ""
                                      }`}
                                      title={
                                        isExpanded
                                          ? "Collapse Tiers"
                                          : "View Ticket Tiers"
                                      }
                                      onClick={() =>
                                        handleTogglePastEventExpansion(event.id)
                                      }
                                    >
                                      <FiEye size={16} />
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {isExpanded && (
                                <tr className="bg-transparent">
                                  <td
                                    colSpan={6}
                                    className="!p-0 !border-b !border-white-20"
                                  >
                                    <div className="p-6 bg-white-3 border-l-[3px] border-white-30">
                                      <div className="flex justify-between items-center mb-5 pb-3 border-b border-white-20">
                                        <h3 className="text-lg font-poppins-semibold text-white-100 m-0">Ticket Tiers for {event.name}</h3>
                                        <span className="inline-block text-xs font-poppins-medium text-white-50 bg-white-10 px-2 py-1 uppercase tracking-wider rounded-lg">
                                          Read-only
                                        </span>
                                      </div>

                                      <div className="flex flex-col gap-2 relative">
                                        {ticketTiers.length > 0 ? (
                                          ticketTiers.map((tier: any) => (
                                            <div
                                              key={tier.id}
                                              className="bg-white-5 border border-white-20 rounded-card px-4 py-3 transition-all cursor-default"
                                            >
                                              <div className="flex items-center gap-4">
                                                <div className="flex-[0_0_200px]">
                                                  <h4 className="text-sm font-poppins-semibold text-white-100 m-0 flex items-center gap-1.5">{tier.name}</h4>
                                                </div>
                                                <div className="flex items-center gap-3 text-sm font-poppins text-white-80">
                                                  <span>
                                                    <strong className="text-white-100">
                                                      {formatPrice(
                                                        extractBasePriceHistorical(
                                                          tier.price_cents,
                                                          tier.updated_at ||
                                                            tier.created_at
                                                        ).basePriceCents,
                                                        event.currency
                                                      )}
                                                    </strong>
                                                  </span>
                                                  <span>
                                                    {Math.max(
                                                      0,
                                                      tier.quantity_total -
                                                        (tier.quantity_sold ??
                                                          0) -
                                                        (tier.quantity_reserved ??
                                                          0)
                                                    )}
                                                    /{tier.quantity_total}{" "}
                                                    available
                                                    {(tier.quantity_reserved ??
                                                      0) > 0 &&
                                                      ` · ${tier.quantity_reserved} reserved`}
                                                  </span>
                                                  <span>
                                                    {tier.per_user_limit} per
                                                    user
                                                  </span>
                                                </div>
                                              </div>
                                            </div>
                                          ))
                                        ) : (
                                          <div className="flex items-center gap-3 p-5 bg-white-5 border border-white-15 rounded-card text-white-50 italic font-poppins [&>svg]:text-white-30 [&>svg]:shrink-0">
                                            <FiTag size={24} />
                                            <p>
                                              No ticket tiers configured for
                                              this event
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
