import { formatCentsAsPrice } from "@project-flame/lib";
import { getBaseUrl } from "../utils/url";
import {
  wrapEmailHtml,
  emailInfoCard,
  emailCtaButton,
  emailStatusBox,
  emailHeading,
  emailCard,
  emailText,
  emailSignoff,
  escapeHtml,
  c,
  font,
  type InfoCardRow,
} from "./email-styles";

/**
 * Payment outcome for the RSVP rejection email.
 *
 * Set by the reject route based on the actual Stripe PaymentIntent state, so the
 * rejection email can tell the user exactly what happened with their money:
 * - `none`:           No payment was ever held (free RSVP, or PI in a pre-auth state).
 * - `auth_released`:  Authorization hold was cancelled — user was never charged,
 *                     but their bank may show a pending auth for 5–10 business days.
 * - `refunded`:       Captured payment was refunded — funds post back within
 *                     5–10 business days.
 * - `follow_up`:      Payment is still settling (async methods) or Stripe call
 *                     failed — our team will manually follow up.
 *
 * All amounts are in cents and always server-authoritative (from the PaymentIntent
 * or Refund object directly — never client-computed). See APRIL_2026_FIXES.md.
 */
export type RejectionPaymentOutcome =
  | { kind: "none" }
  | {
      kind: "auth_released";
      amount: number;
      currency: string;
      cardBrand?: string;
      cardLast4?: string;
    }
  | {
      kind: "refunded";
      amount: number;
      currency: string;
      cardBrand?: string;
      cardLast4?: string;
    }
  | { kind: "follow_up" };

interface RsvpEmailData {
  userEmail: string;
  userName: string;
  eventName: string;
  eventDate: string;
  eventTimezone?: string;
  eventVenue: string;
  ticketTierName: string;
  quantity: number;
  purchaseUrl?: string;
  organizationName: string;
  currency?: string;
  totalPaid?: number;
  orderId?: string;
  ticketPrice?: number;
  serviceFee?: number;
  paymentOutcome?: RejectionPaymentOutcome;
}

interface OrganizerRsvpNotificationData {
  organizerEmail: string;
  organizerName: string;
  userEmail: string;
  userName: string;
  eventName: string;
  eventDate: string;
  eventTimezone?: string;
  eventVenue: string;
  ticketTierName: string;
  quantity: number;
  organizationName: string;
  rsvpManagementUrl: string;
}

interface RsvpPendingEmailData {
  userEmail: string;
  userName: string;
  eventName: string;
  eventDate: string;
  eventTimezone?: string;
  eventVenue: string;
  ticketTierName: string;
  quantity: number;
  organizationName: string;
}

export async function sendRsvpApprovalEmail(
  data: RsvpEmailData
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
    const { BrevoClient } = await import("@getbrevo/brevo");
    const client = new BrevoClient({ apiKey: brevoApiKey });

    await client.transactionalEmails.sendTransacEmail({
      to: [{ email: data.userEmail, name: data.userName }],
      sender: { email: fromEmail, name: "FLAME Events" },
      subject: data.purchaseUrl
        ? `RSVP Approved: ${data.eventName} - Complete Your Purchase`
        : `RSVP Approved: ${data.eventName} - Your Tickets Are Ready`,
      htmlContent: generateApprovalEmailHtml(data),
      headers: {
        "X-Priority": "1",
        "X-MSMail-Priority": "High",
        Importance: "High",
        "X-Mailer": "FLAME Events Platform",
        "X-Auto-Response-Suppress": "OOF",
      },
    });
    console.log("✅ RSVP approval email sent successfully");
    return true;
  } catch (error) {
    console.error("❌ Failed to send RSVP approval email:", error);
    return false;
  }
}

export async function sendRsvpRejectionEmail(
  data: Omit<RsvpEmailData, "purchaseUrl">
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
    const { BrevoClient } = await import("@getbrevo/brevo");
    const client = new BrevoClient({ apiKey: brevoApiKey });

    await client.transactionalEmails.sendTransacEmail({
      to: [{ email: data.userEmail, name: data.userName }],
      sender: { email: fromEmail, name: "FLAME Events" },
      subject: `Update on your RSVP for ${data.eventName}`,
      htmlContent: generateRejectionEmailHtml(data),
      headers: {
        "X-Priority": "2",
        "X-MSMail-Priority": "Normal",
        Importance: "Normal",
        "X-Mailer": "FLAME Events Platform",
        "X-Auto-Response-Suppress": "OOF",
      },
    });
    console.log("✅ RSVP rejection email sent successfully");
    return true;
  } catch (error) {
    console.error("❌ Failed to send RSVP rejection email:", error);
    return false;
  }
}

export function generateApprovalEmailHtml(data: RsvpEmailData): string {
  const baseUrl = getBaseUrl();
  const userName = escapeHtml(data.userName);
  const eventName = escapeHtml(data.eventName);
  const organizationName = escapeHtml(data.organizationName);

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

  const currency = data.currency ?? "USD";

  const eventRows: InfoCardRow[] = [
    { label: "Date", value: formatDate(data.eventDate) },
    { label: "Venue", value: data.eventVenue },
    { label: "Ticket Type", value: data.ticketTierName },
    { label: "Quantity", value: `${data.quantity} ticket${data.quantity > 1 ? "s" : ""}` },
  ];
  if (data.ticketPrice !== undefined) {
    eventRows.push({ label: "Ticket price", value: formatCentsAsPrice(data.ticketPrice, currency) });
  }
  if (data.serviceFee !== undefined) {
    eventRows.push({ label: "+ Service fee", value: formatCentsAsPrice(data.serviceFee, currency) });
  }
  if (data.totalPaid !== undefined) {
    eventRows.push({ label: "Total Paid", value: formatCentsAsPrice(data.totalPaid, currency), valueBold: true, valueSize: "16px" });
  }
  if (data.orderId) {
    eventRows.push({ label: "Order ID", value: data.orderId });
  }

  let actionSection: string;
  if (data.purchaseUrl) {
    actionSection = `
      ${emailText("Complete your purchase to secure your tickets:")}
      ${emailCtaButton(data.purchaseUrl, "Purchase Your Tickets")}
      ${emailStatusBox({
        variant: "info",
        title: "What's Next?",
        items: [
          "Click the purchase button above to complete your ticket purchase",
          "You'll receive your tickets and QR codes via email",
          "Present your QR code at the event for entry",
        ],
      })}
    `;
  } else {
    actionSection = `
      ${emailHeading("Your Tickets")}
      ${emailCard(`
        <p style="margin: 0 0 8px; font-family: ${font}; font-size: 14px; font-weight: 600; color: ${c.text};">Ticket Summary</p>
        <p style="margin: 6px 0; font-family: ${font}; font-size: 14px; color: ${c.textSecondary};"><strong style="color: ${c.text};">Quantity:</strong> ${data.quantity} ticket${data.quantity > 1 ? "s" : ""}</p>
        <p style="margin: 6px 0; font-family: ${font}; font-size: 14px; color: ${c.textSecondary};"><strong style="color: ${c.text};">Attendee:</strong> ${userName}</p>
      `)}
      ${emailStatusBox({
        variant: "info",
        title: "What's Next?",
        items: [
          "Your tickets are now available in your account",
          "Click the button below to view your QR tickets anytime",
          "Present your QR code at the event for entry",
        ],
      })}
      ${emailCtaButton(`${baseUrl}/account`, "View My Tickets")}
      ${emailStatusBox({
        variant: "warning",
        title: "Important Information",
        items: [
          "Access your tickets anytime from your account",
          "Keep your QR codes safe and don't share them with others",
          "Each ticket is valid for one person only",
          "Bring a valid ID that matches the ticket holder's name",
          "Arrive a few minutes early for smooth check-in",
          "Digital tickets on your phone are acceptable for entry",
        ],
      })}
    `;
  }

  const bodyHtml = `
    <h1 style="margin: 0 0 8px; font-family: ${font}; font-size: 22px; font-weight: 600; color: ${c.text};">
      ${data.purchaseUrl ? "Complete Your Purchase" : "Your Tickets Are Ready"}
    </h1>
    ${emailText(`Your RSVP for <strong>${eventName}</strong> has been approved by ${organizationName}.`)}
    ${emailHeading("Event Details")}
    ${emailInfoCard({ title: data.eventName, rows: eventRows })}
    ${actionSection}
    ${emailText(
      data.purchaseUrl
        ? "Looking forward to seeing you at the event!"
        : "If you have any questions about your tickets or the event, please contact the event organizer."
    )}
    ${emailSignoff()}
  `;

  return wrapEmailHtml({
    title: `RSVP Approved - ${data.eventName}`,
    preheader: data.purchaseUrl
      ? `Complete your purchase for ${data.eventName}`
      : `Your tickets for ${data.eventName} are ready`,
    bodyHtml,
    footerContext: `You received this email because your RSVP for ${data.eventName} was approved`,
    footerTransactional: data.purchaseUrl
      ? "This is a transactional email confirming your RSVP approval."
      : "This is a transactional email confirming your tickets are ready.",
  });
}

/**
 * Human-readable label for a Stripe `card.brand` value. Falls back to
 * Title-Casing the raw brand string so unknown or future brands still render.
 */
const CARD_BRAND_LABEL: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
};

function formatCardLabel(brand?: string): string | null {
  if (!brand) return null;
  const normalized = brand.toLowerCase();
  return (
    CARD_BRAND_LABEL[normalized] ??
    brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase()
  );
}

/**
 * Renders the payment-outcome block that appears above the "Common reasons"
 * section in the RSVP rejection email. Returns empty string when there's
 * nothing to say (no PI, or payment was never held).
 *
 * Inline block (rather than `emailStatusBox`) because `emailStatusBox` escapes
 * its `text` field — we need `<strong>` around the amount and card label to
 * match industry conventions (Ticketmaster/Eventbrite/Stripe emphasize the
 * amount + card so users can cross-check their statement).
 */
function renderPaymentOutcomeBlock(outcome: RejectionPaymentOutcome): string {
  if (outcome.kind === "none") return "";

  // Visual parity with emailStatusBox variant="info" (blue left border + bg).
  const border = c.blue;
  const bg = c.blueBg;

  let title: string;
  let bodyText: string;

  if (outcome.kind === "follow_up") {
    title = "About your payment";
    bodyText =
      "Your payment is still settling with your bank. Our team will review and follow up within <strong>1–2 business days</strong> — no action needed from you.";
  } else {
    const amountLabel = formatCentsAsPrice(outcome.amount, outcome.currency);
    const cardLabel = formatCardLabel(outcome.cardBrand);
    const cardFragment =
      cardLabel && outcome.cardLast4
        ? ` on your <strong>${escapeHtml(cardLabel)} ending in ${escapeHtml(outcome.cardLast4)}</strong>`
        : "";

    if (outcome.kind === "auth_released") {
      title = "You were not charged";
      bodyText = `Your authorization hold of <strong>${escapeHtml(amountLabel)}</strong>${cardFragment} will be released by your bank within <strong>5–10 business days</strong>.`;
    } else {
      // refunded
      title = "Refund issued";
      bodyText = cardFragment
        ? `A full refund of <strong>${escapeHtml(amountLabel)}</strong>${cardFragment} has been issued. Refunds typically appear within <strong>5–10 business days</strong> depending on your bank.`
        : `A full refund of <strong>${escapeHtml(amountLabel)}</strong> has been issued to your original payment method. Refunds typically appear within <strong>5–10 business days</strong> depending on your bank.`;
    }
  }

  return `
    <div class="email-status-info" style="border-left: 3px solid ${border}; background-color: ${bg}; padding: 14px 16px; margin: 16px 0;">
      <p class="email-text" style="margin: 0 0 8px; font-family: ${font}; font-size: 14px; font-weight: 600; color: ${c.text};">${escapeHtml(title)}</p>
      <p class="email-text-secondary" style="margin: 0; font-family: ${font}; font-size: 14px; color: ${c.textSecondary}; line-height: 1.5;">${bodyText}</p>
    </div>`;
}

export function generateRejectionEmailHtml(
  data: Omit<RsvpEmailData, "purchaseUrl">
): string {
  const userName = escapeHtml(data.userName);
  const eventName = escapeHtml(data.eventName);
  const organizationName = escapeHtml(data.organizationName);

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

  const paymentOutcome = data.paymentOutcome ?? { kind: "none" as const };
  const paymentBlock = renderPaymentOutcomeBlock(paymentOutcome);
  const supportLine =
    paymentOutcome.kind === "none"
      ? ""
      : emailText(
          "Questions about your payment? Reply to this email or contact <strong>support@flme.co</strong>."
        );

  const bodyHtml = `
    <h1 style="margin: 0 0 8px; font-family: ${font}; font-size: 22px; font-weight: 600; color: ${c.text};">RSVP Update</h1>
    ${emailText(`Hi ${userName},`)}
    ${emailText(`Thank you for your interest in <strong>${eventName}</strong>. Unfortunately, we're unable to approve your RSVP at this time.`)}

    ${paymentBlock}

    ${emailInfoCard({
      title: "Event Details",
      rows: [
        { label: "Event", value: data.eventName },
        { label: "Date", value: formatDate(data.eventDate) },
        { label: "Venue", value: data.eventVenue },
        { label: "Requested", value: `${data.quantity} ${data.ticketTierName} ticket${data.quantity > 1 ? "s" : ""}` },
      ],
      accentColor: c.mutedBorder,
    })}

    ${emailStatusBox({
      variant: "muted",
      title: "Common reasons for RSVP rejection:",
      items: [
        "Event has reached capacity",
        "Requested ticket tier is sold out",
        "Event requirements not met",
        "Registration deadline has passed",
      ],
    })}

    ${emailText(`If you believe your registration details were incorrect or incomplete, you're welcome to submit a new RSVP request for <strong>${eventName}</strong> from the event page.`)}
    ${emailText("We appreciate your understanding and also encourage you to check out our other upcoming events.")}
    ${supportLine}
    ${emailSignoff()}
  `;

  return wrapEmailHtml({
    title: `RSVP Update - ${data.eventName}`,
    preheader: `Update on your RSVP for ${data.eventName}`,
    bodyHtml,
    footerContext: `You received this email regarding your RSVP for ${data.eventName}`,
    footerTransactional: "This is a transactional email regarding your RSVP status.",
  });
}

export async function sendRsvpPendingConfirmation(
  data: RsvpPendingEmailData
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
    const { BrevoClient } = await import("@getbrevo/brevo");
    const client = new BrevoClient({ apiKey: brevoApiKey });

    await client.transactionalEmails.sendTransacEmail({
      to: [{ email: data.userEmail, name: data.userName }],
      sender: { email: fromEmail, name: "FLAME Events" },
      subject: `RSVP Received: ${data.eventName} - Pending Approval`,
      htmlContent: generatePendingConfirmationEmailHtml(data),
      headers: {
        "X-Priority": "2",
        "X-MSMail-Priority": "Normal",
        Importance: "Normal",
        "X-Mailer": "FLAME Events Platform",
        "X-Auto-Response-Suppress": "OOF",
      },
    });
    console.log("✅ RSVP pending confirmation email sent successfully");
    return true;
  } catch (error) {
    console.error("❌ Failed to send RSVP pending confirmation email:", error);
    return false;
  }
}

export function generatePendingConfirmationEmailHtml(
  data: RsvpPendingEmailData
): string {
  const userName = escapeHtml(data.userName);
  const eventName = escapeHtml(data.eventName);
  const organizationName = escapeHtml(data.organizationName);

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

  const bodyHtml = `
    <h1 style="margin: 0 0 8px; font-family: ${font}; font-size: 22px; font-weight: 600; color: ${c.text};">RSVP Received</h1>
    ${emailText(`Hi ${userName},`)}
    ${emailText(`Thank you for your interest in <strong>${eventName}</strong>! We've received your RSVP request and it's currently pending approval from ${organizationName}.`)}

    ${emailInfoCard({
      title: "Your RSVP Request",
      rows: [
        { label: "Event", value: data.eventName },
        { label: "Date", value: formatDate(data.eventDate) },
        { label: "Venue", value: data.eventVenue },
        { label: "Ticket Type", value: data.ticketTierName },
        { label: "Quantity", value: `${data.quantity} ticket${data.quantity > 1 ? "s" : ""}` },
      ],
      accentColor: c.blue,
    })}

    ${emailStatusBox({
      variant: "info",
      title: "What's Next?",
      items: [
        "The event organizers will review your RSVP request",
        "You'll receive an email notification once your RSVP is approved or if there are any updates",
        "If approved, you'll get a link to complete your purchase and secure your tickets",
        "Please keep an eye on your inbox for further updates",
      ],
    })}

    ${emailText("We appreciate your patience while the organizers review your request. You'll hear from us soon!")}
    ${emailSignoff()}
  `;

  return wrapEmailHtml({
    title: `RSVP Received - ${data.eventName}`,
    preheader: `Your RSVP for ${data.eventName} is pending approval`,
    bodyHtml,
    footerContext: `You received this email to confirm your RSVP request for ${data.eventName}`,
    footerTransactional: "This is a confirmation email for your RSVP submission.",
  });
}

export async function sendOrganizerRsvpNotification(
  data: OrganizerRsvpNotificationData
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
    const { BrevoClient } = await import("@getbrevo/brevo");
    const client = new BrevoClient({ apiKey: brevoApiKey });

    await client.transactionalEmails.sendTransacEmail({
      to: [{ email: data.organizerEmail, name: data.organizerName }],
      sender: { email: fromEmail, name: "FLAME Events" },
      subject: `New RSVP Request: ${data.userName} for ${data.eventName}`,
      htmlContent: generateOrganizerNotificationEmailHtml(data),
      headers: {
        "X-Priority": "2",
        "X-MSMail-Priority": "Normal",
        Importance: "Normal",
        "X-Mailer": "FLAME Events Platform",
        "X-Auto-Response-Suppress": "OOF",
      },
    });
    console.log("✅ Organizer RSVP notification email sent successfully");
    return true;
  } catch (error) {
    console.error(
      "❌ Failed to send organizer RSVP notification email:",
      error
    );
    return false;
  }
}

export function generateOrganizerNotificationEmailHtml(
  data: OrganizerRsvpNotificationData
): string {
  const organizerName = escapeHtml(data.organizerName);
  const userName = escapeHtml(data.userName);
  const eventName = escapeHtml(data.eventName);
  const organizationName = escapeHtml(data.organizationName);

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

  const bodyHtml = `
    <h1 style="margin: 0 0 8px; font-family: ${font}; font-size: 22px; font-weight: 600; color: ${c.text};">New RSVP Request</h1>
    ${emailText(`Hi ${organizerName},`)}
    ${emailText(`<strong>${userName}</strong> has requested tickets for your event <strong>${eventName}</strong>.`)}

    ${emailInfoCard({
      title: "RSVP Request Details",
      rows: [
        { label: "Requester", value: data.userName },
        { label: "Email", value: data.userEmail },
        { label: "Ticket Type", value: data.ticketTierName },
        { label: "Quantity", value: `${data.quantity} ticket${data.quantity > 1 ? "s" : ""}` },
      ],
    })}

    ${emailInfoCard({
      title: "Event Details",
      rows: [
        { label: "Event", value: data.eventName },
        { label: "Date", value: formatDate(data.eventDate) },
        { label: "Venue", value: data.eventVenue },
      ],
      accentColor: c.green,
    })}

    ${emailText("Review and manage this RSVP request:")}
    ${emailCtaButton(data.rsvpManagementUrl, `View RSVPs for ${data.eventName}`)}

    ${emailStatusBox({
      variant: "info",
      title: "What's Next?",
      items: [
        "Click the button above to review the RSVP request",
        "Approve or reject the request based on your event criteria",
        "If approved, the user will receive a purchase link to complete their ticket purchase",
        "You can manage all RSVPs for your events from your organizer dashboard",
      ],
    })}

    ${emailText("Thank you for using FLAME Events to manage your event!")}
    ${emailSignoff()}
  `;

  return wrapEmailHtml({
    title: `New RSVP Request - ${data.eventName}`,
    preheader: `${data.userName} wants to attend ${data.eventName}`,
    bodyHtml,
    footerContext: `You received this email because you're an organizer for ${data.organizationName}`,
    footerTransactional: "This is a notification email for RSVP management.",
  });
}
