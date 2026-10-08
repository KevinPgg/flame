/**
 * Email notifications for event date changes
 */

import { getBaseUrl } from "../utils/url";
import {
  wrapEmailHtml,
  emailInfoCard,
  emailCtaButton,
  emailStatusBox,
  emailText,
  emailSignoff,
  escapeHtml,
  c,
  font,
} from "./email-styles";

interface DateChangeEmailData {
  userEmail: string;
  userName: string;
  eventName: string;
  eventVenue: string;
  oldStartDate: string;
  oldEndDate: string;
  newStartDate: string;
  newEndDate: string;
  eventSlug: string;
  organizationName: string;
  eventTimezone?: string;
}

function formatDateTime(dateString: string, timezone = "America/Guayaquil"): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  });
}

export function generateDateChangeEmailHtml(data: DateChangeEmailData): string {
  const eventUrl = `${getBaseUrl()}/events/${data.eventSlug}`;
  const userName = escapeHtml(data.userName);
  const organizationName = escapeHtml(data.organizationName);
  const eventName = escapeHtml(data.eventName);
  const tz = data.eventTimezone || "America/Guayaquil";

  const bodyHtml = `
    <h1 style="margin: 0 0 8px; font-family: ${font}; font-size: 22px; font-weight: 600; color: ${c.text};">Event Date Changed</h1>
    ${emailText(`Hi ${userName},`)}

    ${emailStatusBox({
      variant: "warning",
      text: "The date and time for your event has been updated",
    })}

    ${emailText(`<strong>${organizationName}</strong> has changed the date and time for <strong>${eventName}</strong>.`)}

    ${emailInfoCard({
      title: "Event Details",
      rows: [
        { label: "Event", value: data.eventName },
        { label: "Venue", value: data.eventVenue },
      ],
    })}

    <div style="border-left: 3px solid ${c.red}; background-color: ${c.redBg}; padding: 14px 16px; margin: 16px 0;">
      <p style="margin: 0 0 6px; font-family: ${font}; font-size: 12px; font-weight: 600; color: ${c.red}; text-transform: uppercase; letter-spacing: 1px;">Previous Date</p>
      <p style="margin: 0; font-family: ${font}; font-size: 14px; color: ${c.textSecondary}; text-decoration: line-through; line-height: 1.6;">
        <strong>Starts:</strong> ${formatDateTime(data.oldStartDate, tz)}<br>
        <strong>Ends:</strong> ${formatDateTime(data.oldEndDate, tz)}
      </p>
    </div>

    <div style="border-left: 3px solid ${c.green}; background-color: ${c.greenBg}; padding: 14px 16px; margin: 16px 0;">
      <p style="margin: 0 0 6px; font-family: ${font}; font-size: 12px; font-weight: 600; color: ${c.green}; text-transform: uppercase; letter-spacing: 1px;">New Date</p>
      <p style="margin: 0; font-family: ${font}; font-size: 14px; color: ${c.text}; line-height: 1.6;">
        <strong>Starts:</strong> ${formatDateTime(data.newStartDate, tz)}<br>
        <strong>Ends:</strong> ${formatDateTime(data.newEndDate, tz)}
      </p>
    </div>

    ${emailStatusBox({
      variant: "info",
      title: "Your Tickets Are Still Valid",
      text: "Your purchased tickets will automatically work for the new date and time. No action is required on your part.",
    })}

    ${emailCtaButton(eventUrl, "View Event Details")}

    ${emailText(`If you have any questions or concerns about this change, please contact <strong>${organizationName}</strong>.`, { size: "14px" })}
    ${emailSignoff()}
  `;

  return wrapEmailHtml({
    title: `Event Date Changed - ${data.eventName}`,
    preheader: `Important: ${data.eventName} date has been changed`,
    bodyHtml,
    footerContext: `You received this email because you have purchased tickets for ${data.eventName}`,
    footerTransactional: "This is a transactional email regarding your event tickets.",
  });
}

export async function sendDateChangeEmail(
  data: DateChangeEmailData
): Promise<boolean> {
  try {
    const brevoApiKey = process.env.BREVO_API_KEY;
    if (!brevoApiKey) {
      console.log(
        "Brevo not configured, skipping date change email notification"
      );
      return false;
    }

    const { BrevoClient } = await import("@getbrevo/brevo");
    const client = new BrevoClient({ apiKey: brevoApiKey });

    const emailContent = generateDateChangeEmailHtml(data);

    await client.transactionalEmails.sendTransacEmail({
      subject: `Date Changed: ${data.eventName}`,
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
    });
    console.log("✅ Date change email sent successfully to:", data.userEmail);
    return true;
  } catch (error) {
    console.error("❌ Failed to send date change email:", error);
    return false;
  }
}
