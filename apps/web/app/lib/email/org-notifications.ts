import { getBaseUrl } from "../utils/url";
import {
  wrapEmailHtml,
  emailInfoCard,
  emailCtaButton,
  emailStatusBox,
  emailHeading,
  emailText,
  emailSignoff,
  escapeHtml,
  c,
  font,
} from "./email-styles";

/**
 * Organization lifecycle emails (W7-H1).
 *
 * Currently: the approval email sent when support approves a pending org. Built
 * on the shared design system in `email-styles.ts` and modeled on the RSVP
 * approval sender (`rsvp-notifications.ts`). Reject/delete do NOT email the
 * owner (decision: approve-only).
 */
interface OrgApprovalEmailData {
  ownerEmail: string;
  ownerName: string;
  organizationName: string;
  /** Org slug for the organizer dashboard deep link (`/organizer?org=<slug>`). */
  organizationSlug: string;
}

export async function sendOrgApprovalEmail(
  data: OrgApprovalEmailData,
): Promise<boolean> {
  const brevoApiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || "noreply@flme.co";

  if (!brevoApiKey) {
    console.warn("BREVO_API_KEY not found. Email notifications will be disabled.");
    return false;
  }

  try {
    const { BrevoClient } = await import("@getbrevo/brevo");
    const client = new BrevoClient({ apiKey: brevoApiKey });

    await client.transactionalEmails.sendTransacEmail({
      to: [{ email: data.ownerEmail, name: data.ownerName }],
      sender: { email: fromEmail, name: "FLAME Events" },
      subject: `${data.organizationName} is approved — start creating events`,
      htmlContent: generateOrgApprovalEmailHtml(data),
      headers: {
        "X-Priority": "1",
        "X-MSMail-Priority": "High",
        Importance: "High",
        "X-Mailer": "FLAME Events Platform",
        "X-Auto-Response-Suppress": "OOF",
      },
    });
    console.log("✅ Org approval email sent successfully");
    return true;
  } catch (error) {
    console.error("❌ Failed to send org approval email:", error);
    return false;
  }
}

export function generateOrgApprovalEmailHtml(data: OrgApprovalEmailData): string {
  const baseUrl = getBaseUrl();
  const ownerName = escapeHtml(data.ownerName);
  const organizationName = escapeHtml(data.organizationName);
  const dashboardUrl = `${baseUrl}/organizer?org=${encodeURIComponent(data.organizationSlug)}`;

  const bodyHtml = `
    <h1 style="margin: 0 0 8px; font-family: ${font}; font-size: 22px; font-weight: 600; color: ${c.text};">
      You're approved!
    </h1>
    ${emailText(`Hi ${ownerName},`)}
    ${emailText(`Great news — <strong>${organizationName}</strong> has been approved on FLAME Events. You can now create and publish events.`)}
    ${emailHeading("Get Started")}
    ${emailInfoCard({
      title: organizationName,
      rows: [{ label: "Status", value: "Approved", valueBold: true }],
      accentColor: c.green,
    })}
    ${emailText("Head to your organizer dashboard to create your first event:")}
    ${emailCtaButton(dashboardUrl, "Go to Organizer Dashboard")}
    ${emailStatusBox({
      variant: "info",
      title: "What's Next?",
      items: [
        "Create your first event with ticket tiers and pricing",
        "Set up Stripe Connect to receive payouts",
        "Publish your event so attendees can discover and buy tickets",
      ],
    })}
    ${emailText("If you have any questions, reply to this email or contact <strong>support@flme.co</strong>.")}
    ${emailSignoff()}
  `;

  return wrapEmailHtml({
    title: `${data.organizationName} approved`,
    preheader: `${data.organizationName} is approved — you can now create events`,
    bodyHtml,
    footerContext: `You received this email because ${data.organizationName} was approved on FLAME Events`,
    footerTransactional: "This is a transactional email confirming your organization's approval.",
  });
}
