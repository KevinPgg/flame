/**
 * Dev-only email template preview route.
 *
 * Usage: GET /api/dev/email-preview?template=<name>
 *
 * Available templates:
 *   - ticket-confirmation
 *   - ticket-confirmation-rsvp  (RSVP approval with tickets attached)
 *   - ticket-ready-free
 *   - ticket-ready-bank
 *   - ticket-ready-datafast
 *   - promotional-ticket
 *   - rsvp-approval             (RSVP approved — needs purchase)
 *   - rsvp-approval-ready       (RSVP approved — tickets ready, no purchase needed)
 *   - rsvp-rejection
 *   - rsvp-pending
 *   - rsvp-organizer            (new RSVP notification to organizer)
 *   - date-change
 *
 * Without ?template, returns an index page listing all templates.
 *
 * IMPORTANT: This route calls the SAME generate* functions used by the real
 * email senders. What you see here is exactly what gets sent. No duplicated
 * template code.
 *
 * Gated to NODE_ENV !== "production".
 */

import { NextRequest, NextResponse } from "next/server";
import {
  generateTicketEmailHtml,
  generateTicketReadyEmailHtml,
} from "@/app/lib/email/ticket-notifications";
import {
  generateApprovalEmailHtml,
  generateRejectionEmailHtml,
  generatePendingConfirmationEmailHtml,
  generateOrganizerNotificationEmailHtml,
} from "@/app/lib/email/rsvp-notifications";
import {
  generatePromotionalTicketEmailHtml,
} from "@/app/lib/email/promotional-ticket-notifications";
import {
  generateDateChangeEmailHtml,
} from "@/app/lib/email/date-change-notifications";
import { c, font } from "@/app/lib/email/email-styles";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const template = request.nextUrl.searchParams.get("template");
  const origin = request.nextUrl.origin;

  try {
    if (!template) {
      return new NextResponse(renderIndex(), {
        headers: { "Content-Type": "text/html" },
      });
    }

    const html = renderTemplate(template, origin);
    if (!html) {
      return NextResponse.json(
        { error: `Unknown template: ${template}`, available: TEMPLATE_NAMES },
        { status: 400 },
      );
    }

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[email-preview] Rendering failed:", error);
    return NextResponse.json(
      {
        error: "Rendering failed",
        details: error.message,
        available: TEMPLATE_NAMES,
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Template names
// ---------------------------------------------------------------------------

const TEMPLATE_NAMES = [
  "ticket-confirmation",
  "ticket-confirmation-rsvp",
  "ticket-ready-free",
  "ticket-ready-bank",
  "ticket-ready-datafast",
  "promotional-ticket",
  "rsvp-approval",
  "rsvp-approval-ready",
  "rsvp-rejection",
  "rsvp-rejection-auth-released",
  "rsvp-rejection-refunded",
  "rsvp-rejection-follow-up",
  "rsvp-pending",
  "rsvp-organizer",
  "date-change",
] as const;

// ---------------------------------------------------------------------------
// Mock data shared across templates
// ---------------------------------------------------------------------------

const mockDate = "2026-04-15T20:00:00-05:00";

// ---------------------------------------------------------------------------
// Template router — calls the REAL generate* functions with mock data
// ---------------------------------------------------------------------------

function renderTemplate(name: string, origin: string): string | null {
  switch (name) {
    case "ticket-confirmation":
      return generateTicketEmailHtml(
        {
          userEmail: "maria@example.com",
          userName: "María García",
          eventName: "FLAME Festival 2026",
          eventDate: mockDate,
          eventVenue: "Centro de Convenciones de Guayaquil",
          ticketTierName: "VIP Early Bird",
          quantity: 2,
          totalAmount: 4000,
          orderId: "ord_abc123def456",
          promoCode: "EARLYBIRD",
          discountAmount: 1000,
          subtotalAmount: 5000,
          tickets: [
            { id: "tkt_001", qrCode: "", attendeeName: "María García" },
            { id: "tkt_002", qrCode: "", attendeeName: "Carlos López" },
          ],
          isRsvpApproval: false,
        },
        origin,
      );

    case "ticket-confirmation-rsvp":
      return generateTicketEmailHtml(
        {
          userEmail: "maria@example.com",
          userName: "María García",
          eventName: "FLAME Festival 2026",
          eventDate: mockDate,
          eventVenue: "Centro de Convenciones de Guayaquil",
          ticketTierName: "VIP Early Bird",
          quantity: 2,
          totalAmount: 4000,
          orderId: "ord_abc123def456",
          promoCode: "EARLYBIRD",
          discountAmount: 1000,
          subtotalAmount: 5000,
          tickets: [
            { id: "tkt_001", qrCode: "", attendeeName: "María García" },
            { id: "tkt_002", qrCode: "", attendeeName: "Carlos López" },
          ],
          isRsvpApproval: true,
        },
        origin,
      );

    case "ticket-ready-free":
      return generateTicketReadyEmailHtml(
        {
          userEmail: "maria@example.com",
          userName: "María García",
          eventName: "FLAME Festival 2026",
          eventDate: mockDate,
          eventVenue: "Centro de Convenciones de Guayaquil",
          ticketTierName: "General Admission",
          quantity: 1,
          orderId: "N/A",
          paymentMethod: "free",
        },
        origin,
      );

    case "ticket-ready-bank":
      return generateTicketReadyEmailHtml(
        {
          userEmail: "maria@example.com",
          userName: "María García",
          eventName: "FLAME Festival 2026",
          eventDate: mockDate,
          eventVenue: "Centro de Convenciones de Guayaquil",
          ticketTierName: "General Admission",
          quantity: 2,
          orderId: "ord_bank_xyz789",
          paymentMethod: "bank_transfer",
        },
        origin,
      );

    case "ticket-ready-datafast":
      return generateTicketReadyEmailHtml(
        {
          userEmail: "maria@example.com",
          userName: "María García",
          eventName: "FLAME Festival 2026",
          eventDate: mockDate,
          eventVenue: "Centro de Convenciones de Guayaquil",
          ticketTierName: "General Admission",
          quantity: 1,
          orderId: "ord_df_abc123",
          paymentMethod: "datafast",
        },
        origin,
      );

    case "promotional-ticket":
      return generatePromotionalTicketEmailHtml({
        recipientEmail: "ana@example.com",
        recipientName: "Ana Martínez",
        eventId: "evt_preview_123",
        eventName: "FLAME Festival 2026",
        eventDate: mockDate,
        eventVenue: "Centro de Convenciones de Guayaquil",
        eventCity: "Guayaquil",
        ticketTierName: "VIP Backstage",
        organizationName: "FLAME Productions",
        eventSlug: "flame-festival-2026",
        tickets: [
          { qrToken: "promo_qr_token_abc123", ticketId: "tkt_promo_001" },
          { qrToken: "promo_qr_token_def456", ticketId: "tkt_promo_002" },
        ],
      });

    case "rsvp-approval":
      return generateApprovalEmailHtml({
        userEmail: "maria@example.com",
        userName: "María García",
        eventName: "FLAME Festival 2026",
        eventDate: mockDate,
        eventVenue: "Centro de Convenciones de Guayaquil",
        ticketTierName: "General Admission",
        quantity: 2,
        organizationName: "FLAME Productions",
        purchaseUrl: `${origin}/purchase/rsvp-token-abc123`,
      });

    case "rsvp-approval-ready":
      return generateApprovalEmailHtml({
        userEmail: "maria@example.com",
        userName: "María García",
        eventName: "FLAME Festival 2026",
        eventDate: mockDate,
        eventVenue: "Centro de Convenciones de Guayaquil",
        ticketTierName: "General Admission",
        quantity: 2,
        organizationName: "FLAME Productions",
        ticketPrice: 2000,
        serviceFee: 400,
        totalPaid: 2400,
        orderId: "ord_rsvp789xyz",
      });

    case "rsvp-rejection":
      return generateRejectionEmailHtml({
        userEmail: "maria@example.com",
        userName: "María García",
        eventName: "FLAME Festival 2026",
        eventDate: mockDate,
        eventVenue: "Centro de Convenciones de Guayaquil",
        ticketTierName: "General Admission",
        quantity: 2,
        organizationName: "FLAME Productions",
      });

    case "rsvp-rejection-auth-released":
      return generateRejectionEmailHtml({
        userEmail: "maria@example.com",
        userName: "María García",
        eventName: "FLAME Festival 2026",
        eventDate: mockDate,
        eventVenue: "Centro de Convenciones de Guayaquil",
        ticketTierName: "General Admission",
        quantity: 2,
        organizationName: "FLAME Productions",
        paymentOutcome: {
          kind: "auth_released",
          amount: 5000,
          currency: "USD",
          cardBrand: "visa",
          cardLast4: "4242",
        },
      });

    case "rsvp-rejection-refunded":
      return generateRejectionEmailHtml({
        userEmail: "maria@example.com",
        userName: "María García",
        eventName: "FLAME Festival 2026",
        eventDate: mockDate,
        eventVenue: "Centro de Convenciones de Guayaquil",
        ticketTierName: "General Admission",
        quantity: 2,
        organizationName: "FLAME Productions",
        paymentOutcome: {
          kind: "refunded",
          amount: 5000,
          currency: "USD",
          cardBrand: "mastercard",
          cardLast4: "5555",
        },
      });

    case "rsvp-rejection-follow-up":
      return generateRejectionEmailHtml({
        userEmail: "maria@example.com",
        userName: "María García",
        eventName: "FLAME Festival 2026",
        eventDate: mockDate,
        eventVenue: "Centro de Convenciones de Guayaquil",
        ticketTierName: "General Admission",
        quantity: 2,
        organizationName: "FLAME Productions",
        paymentOutcome: { kind: "follow_up" },
      });

    case "rsvp-pending":
      return generatePendingConfirmationEmailHtml({
        userEmail: "maria@example.com",
        userName: "María García",
        eventName: "FLAME Festival 2026",
        eventDate: mockDate,
        eventVenue: "Centro de Convenciones de Guayaquil",
        ticketTierName: "General Admission",
        quantity: 2,
        organizationName: "FLAME Productions",
      });

    case "rsvp-organizer":
      return generateOrganizerNotificationEmailHtml({
        organizerEmail: "diego@example.com",
        organizerName: "Diego",
        userEmail: "maria@example.com",
        userName: "María García",
        eventName: "FLAME Festival 2026",
        eventDate: mockDate,
        eventVenue: "Centro de Convenciones de Guayaquil",
        ticketTierName: "General Admission",
        quantity: 2,
        organizationName: "FLAME Productions",
        rsvpManagementUrl: `${origin}/organizer/rsvps/event-123`,
      });

    case "date-change":
      return generateDateChangeEmailHtml({
        userEmail: "maria@example.com",
        userName: "María García",
        eventName: "FLAME Festival 2026",
        eventVenue: "Centro de Convenciones de Guayaquil",
        oldStartDate: "2026-04-15T20:00:00-05:00",
        oldEndDate: "2026-04-16T02:00:00-05:00",
        newStartDate: "2026-04-22T21:00:00-05:00",
        newEndDate: "2026-04-23T03:00:00-05:00",
        eventSlug: "flame-festival-2026",
        organizationName: "FLAME Productions",
      });

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Index page
// ---------------------------------------------------------------------------

function renderIndex(): string {
  const links = TEMPLATE_NAMES.map(
    (name) => `<a href="/api/dev/email-preview?template=${name}" style="display: block; padding: 10px 16px; margin: 4px 0; background: ${c.bgLight}; border: 1px solid ${c.border}; border-radius: 6px; color: ${c.text}; text-decoration: none; font-family: ${font}; font-size: 14px;">${name}</a>`,
  ).join("\n      ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FLAME Email Template Preview</title>
</head>
<body style="font-family: ${font}; margin: 0; padding: 40px 20px; background-color: ${c.white}; color: ${c.text};">
  <div style="max-width: 500px; margin: 0 auto;">
    <h1 style="margin: 0 0 4px; font-size: 24px; font-weight: 600;">Email Template Preview</h1>
    <p style="margin: 0 0 24px; font-size: 14px; color: ${c.textMuted};">Click a template to preview. These render the exact same HTML that gets sent via Brevo.</p>
    <div style="display: flex; flex-direction: column;">
      ${links}
    </div>
    <p style="margin: 24px 0 0; font-size: 12px; color: ${c.textMuted};">Dev only — not available in production.</p>
  </div>
</body>
</html>`;
}
