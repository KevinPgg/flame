import {
  calculateFeeBreakdownFromTotal,
} from "@project-flame/lib";
import { getBaseUrl } from "../utils/url";
import {
  wrapEmailHtml,
  emailInfoCard,
  emailCtaButton,
  emailStatusBox,
  emailHeading,
  emailCard,
  emailText,
  escapeHtml,
  c,
  font,
  type InfoCardRow,
} from "./email-styles";
import { maskEmail } from "../utils/email-mask";

interface TicketEmailData {
  userEmail: string;
  userName: string;
  eventName: string;
  eventDate: string;
  eventTimezone?: string;
  eventVenue?: string | null;
  ticketTierName: string;
  quantity: number;
  totalAmount: number;
  orderId: string;
  currency?: string;
  promoCode?: string;
  discountAmount?: number;
  subtotalAmount?: number;
  orderCreatedAt?: string | Date;
  explicitFeeBreakdown?: {
    basePriceCents: number;
    serviceFeeCents: number;
    ivaCents: number;
  };
  tickets: Array<{
    id: string;
    qrCode: string;
    attendeeName: string;
  }>;
  isRsvpApproval?: boolean;
}

/**
 * Helper to reconcile fee breakdown with total amount
 * Distributes rounding differences to prevent negative components
 */
function reconcileBreakdownToTotal(
  breakdown: {
    basePriceCents: number;
    serviceFeeCents: number;
    ivaCents: number;
  },
  totalAmount: number,
): { basePriceCents: number; serviceFeeCents: number; ivaCents: number } {
  const { basePriceCents, serviceFeeCents, ivaCents } = breakdown;
  const currentTotal = basePriceCents + serviceFeeCents + ivaCents;
  const diff = totalAmount - currentTotal;

  if (diff === 0) return breakdown;

  if (diff > 0) {
    return { ...breakdown, basePriceCents: basePriceCents + diff };
  }

  let remainingReduction = -diff;
  let newBase = basePriceCents;
  let newFee = serviceFeeCents;
  let newIva = ivaCents;

  const baseReduction = Math.min(newBase, remainingReduction);
  newBase -= baseReduction;
  remainingReduction -= baseReduction;

  if (remainingReduction > 0) {
    const feeReduction = Math.min(newFee, remainingReduction);
    newFee -= feeReduction;
    remainingReduction -= feeReduction;
  }

  if (remainingReduction > 0) {
    const ivaReduction = Math.min(newIva, remainingReduction);
    newIva -= ivaReduction;
    remainingReduction -= ivaReduction;
  }

  return {
    basePriceCents: newBase,
    serviceFeeCents: newFee,
    ivaCents: newIva,
  };
}

/**
 * Calculate promo-aware fee breakdown
 * Extracted helper to ensure consistency between email HTML and PDF
 */
function calculatePromoAwareFeeBreakdown(data: TicketEmailData) {
  if (data.explicitFeeBreakdown) {
    const { basePriceCents, serviceFeeCents, ivaCents } =
      data.explicitFeeBreakdown;
    const explicitTotal = basePriceCents + serviceFeeCents + ivaCents;

    if (explicitTotal !== data.totalAmount) {
      console.warn("Explicit fee breakdown mismatch:", {
        orderId: data.orderId,
        eventName: data.eventName,
        expected: data.totalAmount,
        actual: explicitTotal,
        breakdown: data.explicitFeeBreakdown,
      });

      return reconcileBreakdownToTotal(
        data.explicitFeeBreakdown,
        data.totalAmount,
      );
    }
    return data.explicitFeeBreakdown;
  }

  if (
    data.promoCode &&
    data.discountAmount !== undefined &&
    data.subtotalAmount !== undefined &&
    data.discountAmount > 0 &&
    data.subtotalAmount > 0
  ) {
    const originalBreakdown = calculateFeeBreakdownFromTotal(
      data.subtotalAmount,
      data.orderCreatedAt ? { orderCreatedAt: data.orderCreatedAt } : undefined,
    );

    const effectiveSubtotal =
      originalBreakdown.basePriceCents +
      originalBreakdown.serviceFeeCents +
      originalBreakdown.ivaCents;

    let discountRatio = 0;
    if (effectiveSubtotal > 0) {
      discountRatio = Math.min(
        1,
        Math.max(0, data.discountAmount / effectiveSubtotal),
      );
    }

    const discountedBase0Cents = Math.round(
      originalBreakdown.basePriceCents * (1 - discountRatio),
    );
    const discountedBaseImponibleCents = Math.round(
      originalBreakdown.serviceFeeCents * (1 - discountRatio),
    );
    const discountedIvaCents = Math.round(
      originalBreakdown.ivaCents * (1 - discountRatio),
    );

    const calculatedTotalCents =
      discountedBase0Cents + discountedBaseImponibleCents + discountedIvaCents;
    const roundingDifference = data.totalAmount - calculatedTotalCents;

    const finalIvaCents = Math.max(0, discountedIvaCents + roundingDifference);

    const finalCheck =
      discountedBase0Cents + discountedBaseImponibleCents + finalIvaCents;
    if (finalCheck !== data.totalAmount) {
      console.warn("Fee breakdown validation mismatch after reconciliation:", {
        orderId: data.orderId,
        eventName: data.eventName,
        expected: data.totalAmount,
        actual: finalCheck,
        breakdown: {
          base: discountedBase0Cents,
          fee: discountedBaseImponibleCents,
          iva: finalIvaCents,
        },
      });
      return reconcileBreakdownToTotal(
        {
          basePriceCents: discountedBase0Cents,
          serviceFeeCents: discountedBaseImponibleCents,
          ivaCents: finalIvaCents,
        },
        data.totalAmount,
      );
    }

    return {
      basePriceCents: discountedBase0Cents,
      serviceFeeCents: discountedBaseImponibleCents,
      ivaCents: finalIvaCents,
    };
  }

  return calculateFeeBreakdownFromTotal(
    data.totalAmount,
    data.orderCreatedAt ? { orderCreatedAt: data.orderCreatedAt } : undefined,
  );
}

async function generateTicketsPDF(data: TicketEmailData): Promise<string> {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: data.currency ?? "USD",
    }).format(cents / 100);
  };

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

  const feeBreakdown = calculatePromoAwareFeeBreakdown(data);

  data.tickets.forEach((ticket, index) => {
    if (index > 0) {
      doc.addPage();
    }

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
    doc.text(data.eventVenue || "TBD", 50, yPos);
    yPos += 10;

    doc.setFont("helvetica", "bold");
    doc.text("Ticket Type:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(data.ticketTierName, 50, yPos);
    yPos += 20;

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(`Ticket ${index + 1} of ${data.tickets.length}`, 20, yPos);
    yPos += 15;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Attendee:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(ticket.attendeeName, 50, yPos);
    yPos += 10;

    doc.setFont("helvetica", "bold");
    doc.text("Ticket ID:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(ticket.id, 50, yPos);
    yPos += 10;

    doc.setFont("helvetica", "bold");
    doc.text("Order ID:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(data.orderId, 50, yPos);
    yPos += 20;

    const qrCodeX = 20;
    const orderDetailsX = 110;
    const qrCodeY = yPos;

    if (ticket.qrCode) {
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Entry QR Code", qrCodeX, qrCodeY);

      try {
        doc.addImage(ticket.qrCode, "PNG", qrCodeX, qrCodeY + 10, 60, 60);
      } catch (error) {
        console.error("Error adding QR code to PDF:", error);
        doc.setFontSize(12);
        doc.text("QR Code generation error", qrCodeX, qrCodeY + 40);
      }
    }

    let rightYPos = qrCodeY;
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Order Details:", orderDetailsX, rightYPos);
    rightYPos += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const originalSubtotal =
      data.subtotalAmount ?? data.totalAmount + (data.discountAmount || 0);

    doc.text(
      `Original subtotal: ${formatPrice(originalSubtotal)}`,
      orderDetailsX,
      rightYPos,
    );
    rightYPos += 6;

    if (data.promoCode && data.discountAmount) {
      doc.text(
        `Discount (${data.promoCode}): -${formatPrice(data.discountAmount)}`,
        orderDetailsX,
        rightYPos,
      );
      rightYPos += 6;
      doc.setDrawColor(200, 200, 200);
      doc.line(orderDetailsX, rightYPos - 2, orderDetailsX + 85, rightYPos - 2);
      rightYPos += 4;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Final price breakdown:", orderDetailsX, rightYPos);
    rightYPos += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      `Ticket price: ${formatPrice(feeBreakdown.basePriceCents)}`,
      orderDetailsX + 3,
      rightYPos,
    );
    rightYPos += 5;
    doc.text(
      `Service fee: ${formatPrice(feeBreakdown.serviceFeeCents)}`,
      orderDetailsX + 3,
      rightYPos,
    );
    rightYPos += 5;

    if (feeBreakdown.ivaCents > 0) {
      doc.text(
        `IVA: ${formatPrice(feeBreakdown.ivaCents)}`,
        orderDetailsX + 3,
        rightYPos,
      );
      rightYPos += 5;
    }

    rightYPos += 1;

    doc.setDrawColor(200, 200, 200);
    doc.line(orderDetailsX, rightYPos, orderDetailsX + 85, rightYPos);
    rightYPos += 5;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(
      `Total Paid: ${formatPrice(data.totalAmount)}`,
      orderDetailsX,
      rightYPos,
    );

    yPos = qrCodeY + 80;
    const leftColumnX = 20;
    const startYPos = yPos;

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(4, 28, 43);
    doc.text("Instructions:", leftColumnX, startYPos);
    let leftYPos = startYPos + 8;

    doc.setFont("helvetica", "normal");
    doc.text(
      "• Present this QR code at the event entrance",
      leftColumnX,
      leftYPos,
    );
    leftYPos += 6;
    doc.text(
      "• Bring a valid ID matching the attendee name",
      leftColumnX,
      leftYPos,
    );
    leftYPos += 6;
    doc.text(
      "• Arrive a few minutes early for smooth check-in",
      leftColumnX,
      leftYPos,
    );
  });

  return doc.output("datauristring").split(",")[1];
}

export async function sendTicketConfirmationEmail(
  data: TicketEmailData,
): Promise<boolean> {
  try {
    const brevoApiKey = process.env.BREVO_API_KEY;
    if (!brevoApiKey) {
      console.log("Brevo not configured, skipping email notification");
      return false;
    }

    const baseUrl = getBaseUrl();
    if (
      process.env.NODE_ENV === "production" &&
      baseUrl.includes("localhost")
    ) {
      console.warn(
        "⚠️ Production environment detected but base URL is localhost. Ticket email links may be broken. Configure NEXT_PUBLIC_APP_URL.",
      );
    }

    const { BrevoClient } = await import("@getbrevo/brevo");
    const client = new BrevoClient({ apiKey: brevoApiKey });

    const pdfBase64 = await generateTicketsPDF(data);

    const attachments = [
      {
        name: `${data.eventName.replace(/[^a-zA-Z0-9]/g, "-")}-tickets.pdf`,
        content: pdfBase64,
      },
    ];

    const emailContent = generateTicketEmailHtml(data, baseUrl);

    await client.transactionalEmails.sendTransacEmail({
      subject: data.isRsvpApproval
        ? `Your RSVP is approved - Tickets for ${data.eventName} are ready!`
        : `Your tickets for ${data.eventName} are ready!`,
      htmlContent: emailContent,
      sender: {
        name: "FLAME Events",
        email: process.env.BREVO_SENDER_EMAIL || "noreply@flme.co",
      },
      to: [{ email: data.userEmail, name: data.userName }],
      headers: {
        "X-Priority": "1",
        "X-MSMail-Priority": "High",
        Importance: "High",
        "X-Mailer": "FLAME Events Platform",
        "X-Auto-Response-Suppress": "OOF",
      },
      attachment: attachments.length > 0 ? attachments : undefined,
    });
    console.log("Ticket confirmation email sent successfully", {
      orderId: data.orderId,
      ticketCount: data.tickets.length,
    });
    return true;
  } catch (error) {
    console.error("Error sending ticket confirmation email:", {
      orderId: data.orderId,
      maskedEmail: maskEmail(data.userEmail),
      eventName: data.eventName,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return false;
  }
}

export function generateTicketEmailHtml(
  data: TicketEmailData,
  baseUrl: string,
): string {
  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: data.currency ?? "USD",
    }).format(cents / 100);
  };

  const feeBreakdown = calculatePromoAwareFeeBreakdown(data);

  const userName = escapeHtml(data.userName || "");
  const eventName = escapeHtml(data.eventName || "");
  const eventVenue = escapeHtml(data.eventVenue || "");
  const ticketTierName = escapeHtml(data.ticketTierName || "");

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

  const eventRows: InfoCardRow[] = [
    { label: "Date", value: formatDate(data.eventDate) },
    ...(data.eventVenue ? [{ label: "Venue", value: data.eventVenue }] : []),
    { label: "Ticket Type", value: data.ticketTierName },
    {
      label: "Quantity",
      value: `${data.quantity} ticket${data.quantity > 1 ? "s" : ""}`,
    },
  ];

  if (data.promoCode && data.discountAmount && data.subtotalAmount) {
    eventRows.push({
      label: "Subtotal",
      value: formatPrice(data.subtotalAmount),
    });
    eventRows.push({
      label: `Discount (${data.promoCode})`,
      value: `-${formatPrice(data.discountAmount)}`,
      valueColor: c.green,
      valueBold: true,
    });
  }

  eventRows.push({
    label: "Ticket price",
    value: formatPrice(feeBreakdown.basePriceCents),
  });
  eventRows.push({
    label: "+ Service fee",
    value: formatPrice(feeBreakdown.serviceFeeCents),
  });
  if (feeBreakdown.ivaCents > 0) {
    eventRows.push({
      label: "+ IVA",
      value: formatPrice(feeBreakdown.ivaCents),
    });
  }
  eventRows.push({
    label: "Total Paid",
    value: formatPrice(data.totalAmount),
    valueBold: true,
    valueSize: "16px",
  });
  eventRows.push({ label: "Order ID", value: data.orderId });

  const greeting = data.isRsvpApproval
    ? `Your RSVP has been approved! Your tickets for <strong>${eventName}</strong> are ready.`
    : `Thank you for your purchase, ${userName}! Your tickets for <strong>${eventName}</strong> are ready.`;

  const bodyHtml = `
    <h1 style="margin: 0 0 8px; font-family: ${font}; font-size: 22px; font-weight: 600; color: ${c.text};">
      ${data.isRsvpApproval ? "RSVP Approved" : "Your Tickets Are Ready"}
    </h1>
    ${emailText(greeting)}

    ${emailHeading("Event Details")}
    ${emailInfoCard({ title: data.eventName, rows: eventRows })}

    ${emailHeading("Your Tickets")}
    ${emailCard(`
      <p style="margin: 0 0 8px; font-family: ${font}; font-size: 14px; font-weight: 600; color: ${c.text};">Ticket Summary</p>
      <p style="margin: 6px 0; font-family: ${font}; font-size: 14px; color: ${c.textSecondary};"><strong style="color: ${c.text};">Quantity:</strong> ${data.quantity} ticket${data.quantity > 1 ? "s" : ""}</p>
      <p style="margin: 6px 0; font-family: ${font}; font-size: 14px; color: ${c.textSecondary};"><strong style="color: ${c.text};">Attendee${data.quantity > 1 ? "s" : ""}:</strong></p>
      <ul style="margin: 6px 0; padding-left: 18px;">
        ${data.tickets.map((ticket) => `<li style="margin: 3px 0; font-family: ${font}; font-size: 14px; color: ${c.textSecondary};">${escapeHtml(ticket.attendeeName)}</li>`).join("")}
      </ul>
    `)}

    ${emailStatusBox({
      variant: "success",
      title: `Your ${data.quantity} ticket${data.quantity > 1 ? "s are" : " is"} attached as a PDF`,
      items: [
        "Download the PDF attachment to access your tickets with QR codes",
        "Each page contains one ticket with event information and a unique QR code for entry",
      ],
    })}

    ${emailStatusBox({
      variant: "info",
      title: "What's Next?",
      items: [
        "Your tickets are also available in your account",
        "Click the button below to view your QR tickets anytime",
        "Present your QR code at the event for entry",
      ],
    })}

    ${emailCtaButton(`${baseUrl}/account`, "View My Tickets")}

    ${emailStatusBox({
      variant: "warning",
      title: "Important Information",
      items: [
        "<strong>Download and print the PDF attachment</strong> or save it to your phone",
        "Keep your QR codes safe and don't share them with others",
        "Each ticket is valid for one person only",
        "Bring a valid ID that matches the ticket holder's name",
        "Arrive a few minutes early for smooth check-in",
        "Digital tickets on your phone are acceptable for entry",
      ],
    })}

    ${emailText("If you have any questions about your tickets or the event, please contact the event organizer.")}
  `;

  return wrapEmailHtml({
    title: "Your FLAME Event Tickets",
    preheader: data.isRsvpApproval
      ? `Your RSVP was approved for ${data.eventName}`
      : `Your tickets for ${data.eventName} are ready`,
    bodyHtml,
    footerContext: `You received this email because ${
      data.isRsvpApproval
        ? `your RSVP was approved for`
        : `you purchased tickets for`
    } ${data.eventName}`,
    footerTransactional: `This is a transactional email for your ${
      data.isRsvpApproval ? "RSVP approval" : "ticket purchase"
    }.`,
  });
}

// ---------------------------------------------------------------------------
// Simple ticket-ready notification (free tickets and bank transfer orders)
// ---------------------------------------------------------------------------

interface TicketReadyEmailData {
  userEmail: string;
  userName: string;
  eventName: string;
  eventDate: string;
  eventTimezone?: string;
  eventVenue?: string | null;
  ticketTierName: string;
  quantity: number;
  orderId: string;
  paymentMethod: "free" | "bank_transfer" | "datafast";
}

export async function sendTicketReadyEmail(
  data: TicketReadyEmailData,
): Promise<boolean> {
  try {
    const brevoApiKey = process.env.BREVO_API_KEY;
    if (!brevoApiKey) {
      console.log("Brevo not configured, skipping ticket-ready email");
      return false;
    }

    const baseUrl = getBaseUrl();
    if (
      process.env.NODE_ENV === "production" &&
      (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1"))
    ) {
      console.warn(
        "⚠️ Production environment detected but base URL is localhost. NEXT_PUBLIC_APP_URL appears misconfigured. Skipping ticket-ready email to avoid broken /account links."
      );
      return false;
    }

    const { BrevoClient } = await import("@getbrevo/brevo");
    const client = new BrevoClient({ apiKey: brevoApiKey });

    const emailContent = generateTicketReadyEmailHtml(data, baseUrl);

    await client.transactionalEmails.sendTransacEmail({
      subject: `Your ticket${data.quantity > 1 ? "s" : ""} for ${data.eventName} ${data.quantity > 1 ? "are" : "is"} ready!`,
      htmlContent: emailContent,
      sender: {
        name: "FLAME Events",
        email: process.env.BREVO_SENDER_EMAIL || "noreply@flme.co",
      },
      to: [{ email: data.userEmail, name: data.userName }],
      headers: {
        "X-Priority": "1",
        "X-MSMail-Priority": "High",
        Importance: "High",
        "X-Mailer": "FLAME Events Platform",
      },
    });
    console.log("Ticket-ready email sent successfully", {
      orderId: data.orderId,
      paymentMethod: data.paymentMethod,
    });
    return true;
  } catch (error) {
    console.error("Error sending ticket-ready email:", {
      orderId: data.orderId,
      maskedEmail: maskEmail(data.userEmail),
      paymentMethod: data.paymentMethod,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return false;
  }
}

export function generateTicketReadyEmailHtml(
  data: TicketReadyEmailData,
  baseUrl: string,
): string {
  const formatDate = (dateString: string) => {
    try {
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
    } catch {
      return dateString;
    }
  };

  const userName = escapeHtml(data.userName || "");
  const eventName = escapeHtml(data.eventName || "");
  const ticketTierName = escapeHtml(data.ticketTierName || "");
  const eventVenue = escapeHtml(data.eventVenue || "");

  const isFree = data.paymentMethod === "free";
  const isBankTransfer = data.paymentMethod === "bank_transfer";
  const isDatafast = data.paymentMethod === "datafast";

  const eventRows: InfoCardRow[] = [
    { label: "Date", value: formatDate(data.eventDate) },
    ...(data.eventVenue ? [{ label: "Venue", value: data.eventVenue }] : []),
    { label: "Ticket Type", value: data.ticketTierName },
    {
      label: "Quantity",
      value: `${data.quantity} ticket${data.quantity > 1 ? "s" : ""}`,
    },
    ...(data.orderId &&
    data.orderId !== "N/A" &&
    !isFree
      ? [{ label: "Order ID", value: data.orderId }]
      : []),
  ];

  const bodyHtml = `
    <h1 style="margin: 0 0 8px; font-family: ${font}; font-size: 22px; font-weight: 600; color: ${c.text};">Your Tickets Are Ready</h1>
    ${emailText(
      isFree
        ? `Your free ticket${data.quantity > 1 ? "s" : ""} for <strong>${eventName}</strong> ${data.quantity > 1 ? "are" : "is"} waiting for you${userName ? `, ${userName}` : ""}!`
        : `Your ticket${data.quantity > 1 ? "s" : ""} for <strong>${eventName}</strong> ${data.quantity > 1 ? "are" : "is"} confirmed${userName ? `, ${userName}` : ""}!`
    )}

    ${emailHeading("Event Details")}
    ${emailInfoCard({ title: data.eventName, rows: eventRows })}

    ${emailStatusBox({
      variant: "success",
      title: `Your ${data.quantity} ticket${data.quantity > 1 ? "s are" : " is"} confirmed!`,
      items: [
        isFree
          ? "Your free ticket(s) are ready in your account"
          : isBankTransfer || isDatafast
            ? "Your payment has been processed and your tickets are ready"
            : "Your tickets are available in your account",
        "Open the app or visit My Account to view your QR code(s)",
        "Present your QR code at the event entrance for entry",
      ],
    })}

    ${emailCtaButton(`${baseUrl}/account`, "View My Tickets")}

    ${emailStatusBox({
      variant: "warning",
      title: "Important",
      items: [
        "Keep your QR code safe — do not share it with others",
        "Each ticket is valid for one person only",
        "Bring a valid ID matching the ticket holder's name",
        "Arrive a few minutes early for smooth check-in",
      ],
    })}

    ${emailText("If you have any questions about your tickets or the event, please contact the event organizer.")}
  `;

  const footerContext = isFree
    ? `You received this email because you claimed ticket(s) for ${data.eventName}`
    : isBankTransfer
      ? `You received this email because you purchased ticket(s) for ${data.eventName} via bank transfer`
      : isDatafast
        ? `You received this email because you purchased ticket(s) for ${data.eventName} via card payment`
        : `You received this email because you purchased ticket(s) for ${data.eventName}`;

  const footerTransactional = isFree
    ? "This is a transactional email for your complimentary ticket(s)."
    : "This is a transactional email for your ticket order.";

  return wrapEmailHtml({
    title: "Your FLAME Event Tickets",
    preheader: `Your ticket${data.quantity > 1 ? "s" : ""} for ${data.eventName} ${data.quantity > 1 ? "are" : "is"} ready`,
    bodyHtml,
    footerContext,
    footerTransactional,
  });
}
