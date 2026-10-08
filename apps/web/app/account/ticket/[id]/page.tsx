"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  formatEventDate,
  buildTimeRange,
  isValidIanaTimezone,
  formatCentsAsPrice,
  getOrderDisplayCents,
} from "@project-flame/lib";
import type { QRCodeData, UserTicket } from "@project-flame/lib";
import {
  Calendar,
  LocationEdit,
  Ticket,
  X,
  ArrowLeft,
  ArrowRight,
} from "@mynaui/icons-react";
import { FiArrowLeft, FiMaximize2, FiUsers } from "react-icons/fi";
import { useUserTickets } from "../../../lib/hooks/useUserTickets";
import NavbarWrapper from "../../../components/NavbarWrapper";
import LoadingSpinner from "../../../components/LoadingSpinner";

const QR_SIZE = 200;
const FULLSCREEN_QR_SIZE = 320;

/**
 * Per-ticket price label for the QR detail view.
 * - Promotional → "Complimentary"
 * - Free (order total_cents === 0) → "FREE"
 * - Bank transfer → base price (no platform fee — see getOrderDisplayCents)
 * - Regular paid → total_cents / quantity (reflects discounts)
 * - Fallback → tier price
 */
function getTicketPriceLabel(
  ticket: UserTicket,
  tierInfo: { price_cents?: number } | null | undefined,
  currency?: string,
): string {
  if (ticket.type === "promotional") return "Complimentary";

  if (ticket.order) {
    if (ticket.order.total_cents === 0) return "FREE";

    const displayCents = getOrderDisplayCents(ticket.order);
    if (
      displayCents != null &&
      displayCents > 0 &&
      ticket.order.quantity &&
      ticket.order.quantity > 0
    ) {
      const pricePerTicket = displayCents / ticket.order.quantity;
      return formatCentsAsPrice(pricePerTicket, currency);
    }

    if (ticket.order.unit_price_cents !== undefined && ticket.order.unit_price_cents > 0) {
      return formatCentsAsPrice(ticket.order.unit_price_cents, currency);
    }
  }

  if (tierInfo?.price_cents !== undefined) {
    if (tierInfo.price_cents === 0) return "FREE";
    if (tierInfo.price_cents > 0) return formatCentsAsPrice(tierInfo.price_cents, currency);
  }

  return "";
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, error } = useUserTickets();

  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrFullscreen, setQrFullscreen] = useState(false);
  const qrGenRef = useRef(0);

  const { ticketsInGroup, currentTicket, currentIndex } = useMemo(() => {
    const allTickets = data?.tickets ?? [];
    const ticket = allTickets.find((t) => t.id === id);
    if (!ticket)
      return { ticketsInGroup: [] as UserTicket[], currentTicket: null, currentIndex: 0 };

    const eventId = ticket.ticket_tier?.event?.id;
    const tierId = ticket.ticket_tier?.id;
    if (!eventId || !tierId)
      return { ticketsInGroup: [ticket], currentTicket: ticket, currentIndex: 0 };

    const isQRViewable = (t: UserTicket) =>
      t.ticket_tier?.event?.id === eventId &&
      t.ticket_tier?.id === tierId &&
      (t.type === "ticket" || t.type === "promotional") &&
      (t.status === "issued" || t.status === "checked_in");

    const siblings = allTickets.filter(isQRViewable);
    const ticketsInGroup = siblings.some((t) => t.id === id)
      ? siblings
      : [ticket, ...siblings];

    const idx = ticketsInGroup.findIndex((t) => t.id === id);
    return {
      ticketsInGroup,
      currentTicket: ticket,
      currentIndex: idx >= 0 ? idx : 0,
    };
  }, [id, data?.tickets]);

  const hasValidQR =
    currentTicket &&
    (currentTicket.status === "issued" || currentTicket.status === "checked_in") &&
    ((currentTicket.type === "ticket" && currentTicket.qr_code) ||
      (currentTicket.type === "promotional" && currentTicket.qr_token));

  // Generate / resolve QR code image
  // qr_code is a URL to an already-generated QR image (regular tickets)
  // qr_token requires on-the-fly generation via the qrcode library (promotional tickets)
  useEffect(() => {
    if (!currentTicket || !hasValidQR) {
      setQrDataUrl("");
      return;
    }

    // Regular tickets: qr_code is already a URL to the QR image — use it directly
    if (currentTicket.qr_code && currentTicket.type === "ticket") {
      setQrDataUrl(currentTicket.qr_code);
      return;
    }

    // Promotional tickets: generate QR from token data
    if (currentTicket.qr_token) {
      const gen = ++qrGenRef.current;
      const eventInfo = currentTicket.ticket_tier?.event;
      const tierInfo = currentTicket.ticket_tier;
      const qrData: QRCodeData = {
        orderId: currentTicket.order?.id ?? "",
        eventId: eventInfo?.id ?? "",
        userId: currentTicket.attendee_email ?? "",
        tierName: tierInfo?.name ?? "",
        eventName: eventInfo?.name ?? "",
        ticketNumber: currentIndex + 1,
        qrToken: currentTicket.qr_token,
        timestamp: currentTicket.created_at ?? new Date().toISOString(),
      };
      QRCode.toDataURL(JSON.stringify(qrData), { width: QR_SIZE * 2, margin: 2 }).then(
        (url) => { if (qrGenRef.current === gen) setQrDataUrl(url); },
        () => { if (qrGenRef.current === gen) setQrDataUrl(""); },
      );
      return () => { qrGenRef.current++; };
    }

    setQrDataUrl("");
  }, [currentTicket, currentIndex, hasValidQR]);

  const navigateTicket = useCallback(
    (direction: "prev" | "next") => {
      const newIndex =
        direction === "prev"
          ? Math.max(0, currentIndex - 1)
          : Math.min(ticketsInGroup.length - 1, currentIndex + 1);
      const nextTicket = ticketsInGroup[newIndex];
      if (nextTicket) router.replace(`/account/ticket/${nextTicket.id}`);
    },
    [currentIndex, ticketsInGroup, router],
  );

  if (isLoading) {
    return (
      <>
        <NavbarWrapper />
        <div className="min-h-screen bg-background flex items-center justify-center pt-16">
          <LoadingSpinner />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <NavbarWrapper />
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6 pt-16">
          <p className="text-white-100 text-lg font-poppins-semibold text-center">
            Failed to load ticket
          </p>
          <p className="text-white-50 text-sm font-poppins text-center">
            Something went wrong. Please try again.
          </p>
          <button
            onClick={() => router.back()}
            className="bg-white-100 text-dark text-sm font-poppins-semibold px-6 py-2.5 rounded-pill cursor-pointer border-none hover:opacity-90 transition-opacity"
          >
            Go Back
          </button>
        </div>
      </>
    );
  }

  if (!currentTicket) {
    return (
      <>
        <NavbarWrapper />
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6 pt-16">
          <p className="text-white-100 text-lg font-poppins-semibold text-center">
            Ticket not found
          </p>
          <button
            onClick={() => router.push("/account")}
            className="bg-white-100 text-dark text-sm font-poppins-semibold px-6 py-2.5 rounded-pill cursor-pointer border-none hover:opacity-90 transition-opacity"
          >
            Back to Dashboard
          </button>
        </div>
      </>
    );
  }

  const eventInfo = currentTicket.ticket_tier?.event;
  const tierInfo = currentTicket.ticket_tier;

  const tz =
    eventInfo?.timezone && isValidIanaTimezone(eventInfo.timezone)
      ? eventInfo.timezone
      : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateStr = eventInfo?.starts_at ? formatEventDate(eventInfo.starts_at, tz) : "";
  const timeRange = eventInfo?.starts_at
    ? buildTimeRange(eventInfo.starts_at, eventInfo.ends_at, tz, eventInfo.city)
    : "";

  const orgs = eventInfo?.organizations;
  const organizerName =
    eventInfo?.organization?.name ??
    (Array.isArray(orgs) ? orgs.find((o) => o.name)?.name : orgs?.name) ??
    "Unknown Organizer";

  // Tier + stage + price label for display below QR title and in fullscreen
  const stageName = currentTicket.metadata?.stage_name || currentTicket.stage_name;
  const tierLabel = [tierInfo?.name, stageName].filter(Boolean).join(" - ");
  const priceLabel = getTicketPriceLabel(currentTicket, tierInfo, eventInfo?.currency);
  const ticketInfoLine = [tierLabel, priceLabel].filter(Boolean).join(" • ");

  return (
    <>
    <NavbarWrapper />
    <div className="min-h-screen bg-background">
      <div className="max-w-[800px] mx-auto px-4 pt-24 pb-16 flex flex-col gap-6">
        {/* Go back */}
        <button
          onClick={() => router.push("/account")}
          className="flex items-center gap-2 text-white-100 text-sm font-poppins bg-transparent border-none cursor-pointer hover:text-white-80 transition-colors p-0 w-fit"
        >
          <FiArrowLeft size={20} />
          Back to Dashboard
        </button>

        {/* QR Code Section */}
        <div className="flex flex-col items-center gap-4">
          <h1 className="text-white-100 text-lg font-poppins-semibold uppercase m-0">
            QR Code
          </h1>
          {ticketInfoLine && (
            <p className="text-white-80 text-sm font-poppins m-0 text-center">
              {ticketInfoLine}
            </p>
          )}

          <button
            onClick={hasValidQR ? () => setQrFullscreen(true) : undefined}
            disabled={!hasValidQR}
            className="bg-white rounded-card w-[246px] h-[246px] flex items-center justify-center relative cursor-pointer border-none disabled:cursor-default"
          >
            {hasValidQR && qrDataUrl ? (
              <Image src={qrDataUrl} alt="Ticket QR" width={200} height={200} unoptimized className="w-[200px] h-[200px]" />
            ) : (
              <Ticket size={120} className="text-gray-300" />
            )}
            {hasValidQR && (
              <div className="absolute top-2 right-2 bg-black/20 rounded-full p-1">
                <FiMaximize2 size={16} className="text-black" />
              </div>
            )}
          </button>
        </div>

        {/* Ticket navigation */}
        {ticketsInGroup.length > 1 && (
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => navigateTicket("prev")}
              disabled={currentIndex === 0}
              className="p-2 rounded-full bg-white-10 cursor-pointer border-none disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white-20 transition-colors"
            >
              <ArrowLeft size={24} className="text-white-100" />
            </button>
            <span className="text-white-80 text-sm font-poppins">
              Ticket {currentIndex + 1} of {ticketsInGroup.length}
            </span>
            <button
              onClick={() => navigateTicket("next")}
              disabled={currentIndex === ticketsInGroup.length - 1}
              className="p-2 rounded-full bg-white-10 cursor-pointer border-none disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white-20 transition-colors"
            >
              <ArrowRight size={24} className="text-white-100" />
            </button>
          </div>
        )}

        {/* Event details */}
        <div className="flex flex-col gap-5">
          {/* Event image */}
          {eventInfo?.image_url && (
            <div className="relative w-full h-[254px] rounded-card overflow-hidden">
              <Image
                src={eventInfo.image_url}
                alt={eventInfo.name ?? "Event"}
                fill
                sizes="(max-width: 800px) 100vw, 800px"
                className="object-cover"
              />
            </div>
          )}

          {/* Organizer */}
          <div className="flex items-center gap-2">
            <FiUsers size={20} className="text-white-100 shrink-0" />
            <span className="text-white-100 text-xs font-poppins-light">
              By {organizerName}
            </span>
          </div>

          {/* Event name + description */}
          <div className="flex flex-col gap-2">
            <h2 className="text-white-100 text-lg font-poppins-semibold uppercase m-0">
              {eventInfo?.name ?? "Event"}
            </h2>
            {eventInfo?.description && (
              <p className="text-white-80 text-sm font-poppins-light m-0 leading-relaxed">
                {eventInfo.description}
              </p>
            )}
          </div>

          {/* Date + Location */}
          <div className="flex flex-col gap-4">
            {(dateStr || timeRange) && (
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-white-10 flex items-center justify-center shrink-0">
                  <Calendar size={20} className="text-white-100" />
                </div>
                <div className="flex flex-col gap-1">
                  {dateStr && (
                    <span className="text-white-100 text-xs font-poppins-light">
                      {dateStr}
                    </span>
                  )}
                  {timeRange && (
                    <span className="text-white-100 text-xs font-poppins-light">
                      {timeRange}
                    </span>
                  )}
                </div>
              </div>
            )}

            {eventInfo?.venue && (
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-white-10 flex items-center justify-center shrink-0">
                  <LocationEdit size={20} className="text-white-100" />
                </div>
                <span className="text-white-100 text-xs font-poppins-light">
                  {eventInfo.venue}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Hint */}
        {hasValidQR && (
          <p className="text-white-50 text-sm font-poppins text-center">
            Present this QR code at the event entrance
          </p>
        )}
      </div>

      {/* ─── QR Fullscreen Modal ─── */}
      {qrFullscreen && (
        <div
          className="fixed inset-0 z-1000 bg-white flex flex-col items-center justify-center"
          onClick={() => setQrFullscreen(false)}
        >
          <button
            onClick={() => setQrFullscreen(false)}
            className="absolute top-4 right-4 bg-black/10 rounded-full p-2 cursor-pointer border-none hover:bg-black/20 transition-colors z-10"
          >
            <X size={28} className="text-black" />
          </button>

          {qrDataUrl && (
            <Image
              src={qrDataUrl}
              alt="Ticket QR Code"
              width={320}
              height={320}
              unoptimized
              className="max-w-[320px] w-full aspect-square"
            />
          )}

          <p className="text-black text-base font-poppins-medium mt-6 text-center px-8 m-0">
            {eventInfo?.name ?? "Event"}
          </p>
          {ticketInfoLine && (
            <p className="text-black/60 text-sm font-poppins mt-1 text-center px-8 m-0">
              {ticketInfoLine}
            </p>
          )}
          {ticketsInGroup.length > 1 && (
            <p className="text-black/40 text-xs font-poppins mt-1 text-center px-8 m-0">
              Ticket {currentIndex + 1} of {ticketsInGroup.length}
            </p>
          )}
        </div>
      )}
    </div>
    </>
  );
}
