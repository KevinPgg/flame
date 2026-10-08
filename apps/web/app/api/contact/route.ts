import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { contactSchema } from "../../lib/contact-schema";
import { escapeHtml } from "../../lib/email/email-styles";

// Simple rate limiting
const submissions = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 3;

  if (!submissions.has(ip)) {
    submissions.set(ip, []);
  }

  const userSubmissions = submissions.get(ip)!;
  const recentSubmissions = userSubmissions.filter(
    time => now - time < windowMs
  );

  submissions.set(ip, recentSubmissions);

  if (recentSubmissions.length >= maxRequests) {
    return true;
  }

  recentSubmissions.push(now);
  return false;
}

// Block disposable email domains
const disposableEmailDomains = [
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "tempmail.org",
  "yopmail.com",
  "temp-mail.org",
];

function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return disposableEmailDomains.includes(domain);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validatedData = contactSchema.parse(body);

    // Get client IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    // Rate limiting
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again in a minute." },
        { status: 429 }
      );
    }

    // Honeypot check
    if (validatedData.honeypot.trim()) {
      return NextResponse.json(
        { error: "Invalid submission" },
        { status: 400 }
      );
    }

    // Disposable email check
    if (isDisposableEmail(validatedData.email)) {
      return NextResponse.json(
        { error: "Please use a valid email address" },
        { status: 400 }
      );
    }

    // Send email via Brevo
    const brevoApiKey = process.env.BREVO_API_KEY;
    const supportEmail = process.env.SUPPORT_EMAIL || "support@flme.co";
    // Domain flme.co is verified in Brevo, so any @flme.co email can be used
    const fromEmail = process.env.FROM_EMAIL || "noreply@flme.co";

    if (!brevoApiKey) {
      console.error("❌ BREVO_API_KEY not configured");
      return NextResponse.json(
        { error: "Email service not configured. Please contact support." },
        { status: 500 }
      );
    }

    try {
      const { BrevoClient } = await import("@getbrevo/brevo");
      const client = new BrevoClient({ apiKey: brevoApiKey });

      const emailHtmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #ff4c24; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">FLAME</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">New Contact Form Submission</p>
          </div>
          
          <div style="background-color: #f9f9f9; padding: 20px; border-left: 4px solid #ff4c24;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #333; width: 120px;">From:</td>
                <td style="padding: 8px 0; color: #666;">${escapeHtml(validatedData.name)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #333;">Email:</td>
                <td style="padding: 8px 0; color: #666;">${escapeHtml(validatedData.email)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #333;">Subject:</td>
                <td style="padding: 8px 0; color: #666;">${escapeHtml(validatedData.subject)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #333;">IP Address:</td>
                <td style="padding: 8px 0; color: #666;">${ip}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #333;">Submitted:</td>
                <td style="padding: 8px 0; color: #666;">${new Date().toLocaleString()}</td>
              </tr>
            </table>
          </div>
          
          <div style="margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 10px;">Message:</h3>
            <div style="background-color: white; padding: 20px; border: 1px solid #ddd; border-radius: 4px; line-height: 1.6; color: #333;">
              ${escapeHtml(validatedData.message).replace(/\n/g, "<br>")}
            </div>
          </div>
          
          <div style="background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd;">
            <p style="margin: 0;">
              This email was sent from the FLAME contact form. Reply directly to respond to ${escapeHtml(validatedData.name)}.
            </p>
          </div>
        </div>
      `;

      // Send the email
      await client.transactionalEmails.sendTransacEmail({
        to: [{ email: supportEmail, name: "FLAME Support" }],
        sender: { email: fromEmail, name: "FLAME Contact Form" },
        replyTo: {
          email: validatedData.email,
          name: validatedData.name,
        },
        subject: `[FLAME Contact] ${validatedData.subject}`,
        headers: {
          "X-Priority": "2",
          "X-MSMail-Priority": "Normal",
          Importance: "Normal",
          "X-Mailer": "FLAME Events Platform",
          "X-Auto-Response-Suppress": "OOF",
        },
        htmlContent: emailHtmlContent,
      });

      console.log("✅ Contact email sent successfully");
    } catch (brevoError) {
      console.error("❌ Error sending contact email:", brevoError);

      // Return error to user so they know the email failed
      return NextResponse.json(
        {
          error:
            "Failed to send email. Please try again or contact us directly at support@flme.co",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message:
        "Thank you for your message! We'll get back to you within 24 hours.",
      success: true,
    });
  } catch (error) {
    console.error("Contact form error:", error);

    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || "Invalid form data" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to send message. Please try again." },
      { status: 500 }
    );
  }
}
