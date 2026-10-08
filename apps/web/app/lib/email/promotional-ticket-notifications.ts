import QRCode from "qrcode";
import { getBaseUrl } from "../utils/url";
import {
  wrapEmailHtml,
  emailInfoCard,
  emailStatusBox,
  emailText,
  emailHeading,
  emailCard,
  escapeHtml,
  c,
  font,
} from "./email-styles";

/** One complimentary ticket within a (possibly multi-ticket) comp send. */
interface PromotionalTicketItem {
  qrToken: string;
  ticketId: string;
  /** Per-ticket attendee name; defaults to the recipient name when absent. */
  attendeeName?: string;
}

interface PromotionalTicketEmailData {
  recipientEmail: string;
  recipientName: string;
  /** Required in the QR payload — the scanner rejects promotional QRs without it. */
  eventId: string;
  eventName: string;
  eventDate: string;
  eventTimezone?: string;
  eventVenue: string;
  eventCity: string;
  ticketTierName: string;
  organizationName: string;
  eventSlug: string;
  /**
   * The comp tickets in this send. One PDF page (with its own QR) is rendered
   * per item, so quantity > 1 produces a multi-page PDF in a single email —
   * mirroring the paid `generateTicketsPDF` behavior.
   */
  tickets: PromotionalTicketItem[];
}

async function generatePromotionalTicketPDF(
  data: PromotionalTicketEmailData
): Promise<string> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: data.eventTimezone || "America/Guayaquil",
      timeZoneName: "short",
    });
  };

  const total = data.tickets.length;

  for (let index = 0; index < total; index++) {
    const ticket = data.tickets[index];
    const attendeeName = ticket.attendeeName || data.recipientName;

    if (index > 0) {
      doc.addPage();
    }

    // Must match the in-app My Tickets QR shape (QRCodeData) so the scanner
    // accepts it. The scanner identifies a promotional ticket by `!orderId &&
    // qrToken` and then REQUIRES `eventId`; it then verifies by `qr_token`
    // against `promotional_tickets`. The old shape omitted `orderId`/`eventId`/
    // `ticketNumber`, so it failed the scanner's client-side validation before
    // ever reaching the lookup. See JUNE_2026_FIXES.md.
    const qrData = {
      orderId: "", // empty (not missing) → promotional path
      eventId: data.eventId,
      userId: data.recipientEmail,
      tierName: data.ticketTierName,
      eventName: data.eventName,
      ticketNumber: index + 1,
      qrToken: ticket.qrToken,
      timestamp: new Date().toISOString(),
    };

    const qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify(qrData), {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
      errorCorrectionLevel: "H",
      type: "image/png",
    });

    doc.setFillColor(0, 11, 18);
    doc.rect(0, 0, 210, 40, "F");
    doc.setFillColor(255, 0, 0);
    doc.rect(0, 0, 210, 1.5, "F");

    doc.setTextColor(249, 251, 254);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("FLAME", 20, 25);

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Your Event Ticket", 20, 32);

    doc.setTextColor(4, 28, 43);

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Event Information", 20, 60);

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    let yPos = 75;

    doc.setFont("helvetica", "bold");
    doc.text("Event:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(data.eventName, 50, yPos);
    yPos += 10;

    doc.setFont("helvetica", "bold");
    doc.text("Date:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(formatDate(data.eventDate), 50, yPos);
    yPos += 10;

    doc.setFont("helvetica", "bold");
    doc.text("Venue:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(data.eventVenue, 50, yPos);
    yPos += 10;

    doc.setFont("helvetica", "bold");
    doc.text("Ticket Type:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(data.ticketTierName, 50, yPos);
    yPos += 20;

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(`Ticket ${index + 1} of ${total}`, 20, yPos);
    yPos += 15;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Attendee:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(attendeeName, 50, yPos);
    yPos += 10;

    doc.setFont("helvetica", "bold");
    doc.text("Ticket ID:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(ticket.ticketId, 50, yPos);
    yPos += 20;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Entry QR Code", 20, yPos);
    yPos += 10;

    try {
      doc.addImage(qrCodeDataUrl, "PNG", 20, yPos, 60, 60);
    } catch (error) {
      console.error("Error adding QR code to PDF:", error);
      doc.setFontSize(12);
      doc.text("QR Code generation error", 20, yPos + 30);
    }
    yPos += 70;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Instructions:", 20, yPos);
    yPos += 8;

    doc.setFont("helvetica", "normal");
    doc.text("• Present this QR code at the event entrance", 20, yPos);
    yPos += 6;
    doc.text("• Bring a valid ID matching the attendee name", 20, yPos);
    yPos += 6;
    doc.text("• Arrive a few minutes early for smooth check-in", 20, yPos);

    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`Ticket ID: ${ticket.ticketId}`, 20, 280);
    doc.text("Complimentary Ticket", 20, 287);
  }

  return doc.output("datauristring").split(",")[1];
}

export async function sendPromotionalTicketEmail(
  data: PromotionalTicketEmailData
): Promise<boolean> {
  const brevoApiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || "noreply@flme.co";

  if (!brevoApiKey) {
    console.warn(
      "BREVO_API_KEY not found. Email notifications will be disabled."
    );
    return false;
  }

  try {
    const pdfBase64 = await generatePromotionalTicketPDF(data);
    const htmlContent = generatePromotionalTicketEmailHtml(data);
    const ticketCount = data.tickets.length;

    const { BrevoClient } = await import("@getbrevo/brevo");
    const client = new BrevoClient({ apiKey: brevoApiKey });

    await client.transactionalEmails.sendTransacEmail({
      to: [{ email: data.recipientEmail, name: data.recipientName }],
      sender: { email: fromEmail, name: "FLAME Events" },
      subject: `Complimentary Ticket${ticketCount > 1 ? "s" : ""}: ${data.eventName}`,
      htmlContent,
      attachment: [
        {
          name: `${data.eventName.replace(
            /[^a-zA-Z0-9]/g,
            "-"
          )}-complimentary-ticket${ticketCount > 1 ? "s" : ""}.pdf`,
          content: pdfBase64,
        },
      ],
      headers: {
        "X-Priority": "1",
        "X-MSMail-Priority": "High",
        Importance: "High",
        "X-Mailer": "FLAME Events Platform",
        "X-Auto-Response-Suppress": "OOF",
      },
    });
    console.log("✅ Promotional ticket email sent successfully");
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("QR code generation failed")
    ) {
      console.error(
        "❌ CRITICAL: Cannot send promotional ticket - QR code generation failed:",
        error.message
      );
      console.error(
        "   Ticket will not be sent to avoid sending non-functional ticket."
      );
      console.error("   Caller should retry or contact support.");
    } else {
      console.error("❌ Failed to send promotional ticket email:", error);
    }
    return false;
  }
}

export function generatePromotionalTicketEmailHtml(
  data: PromotionalTicketEmailData
): string {
  const recipientName = escapeHtml(data.recipientName);
  const eventName = escapeHtml(data.eventName);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: data.eventTimezone || "America/Guayaquil",
      timeZoneName: "short",
    });
  };

  const quantity = data.tickets.length;
  const isMulti = quantity > 1;
  const ticketWord = isMulti ? "tickets" : "ticket";

  const bodyHtml = `
    <h1 style="margin: 0 0 8px; font-family: ${font}; font-size: 22px; font-weight: 600; color: ${c.text};">Your ${isMulti ? "Tickets Are" : "Ticket Is"} Ready</h1>
    ${emailText(`Thank you, ${recipientName}! You've received ${isMulti ? `${quantity} complimentary tickets` : "a complimentary ticket"} for <strong>${eventName}</strong>.`)}

    ${emailHeading("Event Details")}
    ${emailInfoCard({
      title: data.eventName,
      rows: [
        { label: "Date", value: formatDate(data.eventDate) },
        { label: "Venue", value: data.eventVenue },
        { label: "Ticket Type", value: data.ticketTierName },
        { label: "Quantity", value: `${quantity} ${ticketWord}` },
        { label: "Status", value: "Complimentary", valueColor: c.green, valueBold: true },
      ],
    })}

    ${emailHeading(isMulti ? "Your Tickets" : "Your Ticket")}
    ${emailCard(`
      <p style="margin: 0 0 8px; font-family: ${font}; font-size: 14px; font-weight: 600; color: ${c.text};">Ticket Summary</p>
      <p style="margin: 6px 0; font-family: ${font}; font-size: 14px; color: ${c.textSecondary};"><strong style="color: ${c.text};">Quantity:</strong> ${quantity} ${ticketWord}</p>
      <p style="margin: 6px 0; font-family: ${font}; font-size: 14px; color: ${c.textSecondary};"><strong style="color: ${c.text};">Attendee:</strong> ${recipientName}</p>
    `)}

    ${emailStatusBox({
      variant: "success",
      title: `Your ${isMulti ? `${quantity} tickets are` : "ticket is"} attached as a PDF`,
      items: [
        isMulti
          ? "Download the PDF attachment — each page is one ticket with its own QR code"
          : "Download the PDF attachment to access your ticket with QR code",
        "The PDF contains event information and a unique QR code for entry",
      ],
    })}

    ${emailStatusBox({
      variant: "warning",
      title: "Important Information",
      items: [
        "<strong>Download and print the PDF attachment</strong> or save it to your phone",
        "Keep your QR code safe and don't share it with others",
        "This ticket is valid for one person only",
        "Bring a valid ID that matches the ticket holder's name",
        "Arrive a few minutes early for smooth check-in",
        "Digital tickets on your phone are acceptable for entry",
      ],
    })}

    ${emailText("If you have any questions about your ticket or the event, please contact the event organizer.")}
  `;

  return wrapEmailHtml({
    title: "Your FLAME Event Ticket",
    preheader: `Your complimentary ticket for ${data.eventName} is ready`,
    bodyHtml,
    footerContext: `You received this email because you received a complimentary ticket for ${data.eventName}`,
    footerTransactional: "This is a transactional email for your complimentary ticket.",
  });
}
