/**
 * Shared email template design system
 *
 * Clean white template with Flame branding:
 * - White background, dark text
 * - Flame logo (black version) at top
 * - Left-border blockquote style for info sections
 * - System font stack (web fonts are unreliable across email clients —
 *   Gmail strips <link>/<style> tags, Outlook ignores them)
 */

export const FLAME_LOGO_URL =
  "https://jaoqfvugxmtomdufhswa.supabase.co/storage/v1/object/public/event-images/events/app-images/flame-black.png";

export const FLAME_LOGO_WHITE_URL =
  "https://jaoqfvugxmtomdufhswa.supabase.co/storage/v1/object/public/event-images/events/app-images/flame-white.png";

export const c = {
  white: "#FFFFFF",
  bgLight: "#F9FAFB",
  text: "#1A1A1A",
  textSecondary: "#4B5563",
  textMuted: "#9CA3AF",
  border: "#E5E7EB",
  accent: "#FF0000",
  accentDark: "#CB0000",
  ctaBg: "#1A1A1A",
  ctaText: "#FFFFFF",
  green: "#16A34A",
  greenBg: "#F0FDF4",
  yellow: "#CA8A04",
  yellowBg: "#FEFCE8",
  blue: "#2563EB",
  blueBg: "#EFF6FF",
  red: "#DC2626",
  redBg: "#FEF2F2",
  mutedBorder: "#D1D5DB",
} as const;

export const font =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * HTML-escape user-provided strings before interpolation into email templates.
 * Prevents XSS/content injection when rendering dynamic values (names, venues, etc.).
 */
export function escapeHtml(text: string): string {
  const htmlEscapeMap: { [key: string]: string } = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "/": "&#x2F;",
  };
  return text.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char] || char);
}

/**
 * Validates URLs for use in href/src attributes. Allows https, mailto, and
 * http for localhost (dev). Returns the URL if safe, otherwise "#".
 */
export function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return url;
    if (u.protocol === "mailto:") return url;
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"))
      return url;
  } catch {
    /* invalid URL */
  }
  return "#";
}

// ---------------------------------------------------------------------------
// Full HTML email wrapper
// ---------------------------------------------------------------------------

interface WrapEmailOptions {
  title: string;
  preheader?: string;
  bodyHtml: string;
  footerContext: string;
  footerTransactional: string;
}

export function wrapEmailHtml(opts: WrapEmailOptions): string {
  const title = escapeHtml(opts.title);
  const footerContext = escapeHtml(opts.footerContext);
  const footerTransactional = escapeHtml(opts.footerTransactional);
  const preheader = opts.preheader ? escapeHtml(opts.preheader) : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${title}</title>
  <!--[if mso]>
  <style>table,td{font-family:Arial,sans-serif !important;}</style>
  <![endif]-->
  <style>
    :root { color-scheme: light dark; }
    @media only screen and (max-width: 620px) {
      .email-outer-td { padding: 0 !important; }
      .email-inner-table { width: 100% !important; }
      .email-logo-td { padding: 24px 20px 16px !important; }
      .email-body-td { padding: 0 20px 32px !important; }
      .email-divider-td { padding: 0 20px !important; }
      .email-footer-td { padding: 20px 20px 28px !important; }
    }
    @media (prefers-color-scheme: dark) {
      body { background-color: #1A1A1A !important; }
      .email-outer-table { background-color: #1A1A1A !important; }
      .email-inner-table { background-color: #2A2A2A !important; }
      .email-text { color: #E5E7EB !important; }
      .email-text-secondary { color: #9CA3AF !important; }
      .email-text-muted { color: #6B7280 !important; }
      .email-border { border-color: #374151 !important; }
      .email-divider { background-color: #374151 !important; }
      .email-blockquote { background-color: #1F2937 !important; }
      .email-status-success { background-color: #052E16 !important; }
      .email-status-warning { background-color: #1C1917 !important; }
      .email-status-info { background-color: #0C1929 !important; }
      .email-status-muted { background-color: #1F2937 !important; }
      .email-cta { background-color: #F9FAFB !important; color: #1A1A1A !important; }
      .email-logo-light { display: none !important; }
      .email-logo-dark { display: block !important; }
    }
  </style>
</head>
<body style="font-family: ${font}; line-height: 1.6; color: ${c.text}; margin: 0; padding: 0; background-color: ${c.bgLight}; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: 100%;">
  ${preheader ? `<div style="display:none;font-size:1px;color:${c.bgLight};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</div>` : ""}

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-outer-table" style="background-color: ${c.bgLight};">
    <tr>
      <td align="center" class="email-outer-td" style="padding: 40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="email-inner-table" style="max-width: 600px; width: 100%; background-color: ${c.white};">

          <!-- Logo: black for light mode, white for dark mode -->
          <tr>
            <td class="email-logo-td" style="padding: 32px 40px 24px;">
              <img src="${FLAME_LOGO_URL}" alt="FLAME" width="100" height="auto" class="email-logo-light" style="display: block; max-width: 100px;" />
              <img src="${FLAME_LOGO_WHITE_URL}" alt="FLAME" width="100" height="auto" class="email-logo-dark" style="display: none; max-width: 100px;" />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="email-text email-body-td" style="padding: 0 40px 40px; color: ${c.text};">
              ${opts.bodyHtml}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td class="email-divider-td" style="padding: 0 40px;">
              <div class="email-divider" style="height: 1px; background-color: ${c.border};"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="email-footer-td" style="padding: 24px 40px 32px;">
              <p class="email-text-muted" style="margin: 0; font-family: ${font}; font-size: 12px; color: ${c.textMuted};">${footerContext}</p>
              <p class="email-text-muted" style="margin: 8px 0 0; font-family: ${font}; font-size: 12px; color: ${c.textMuted};">${footerTransactional}</p>
              <p style="margin: 12px 0 0; font-family: ${font}; font-size: 12px;">
                <a class="email-text-muted" href="mailto:support@flme.co" style="color: ${c.textMuted}; text-decoration: underline;">Contact Support</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Reusable building blocks
// ---------------------------------------------------------------------------

export interface InfoCardRow {
  label: string;
  value: string;
  valueColor?: string;
  valueBold?: boolean;
  valueSize?: string;
}

/**
 * Blockquote-style info section with a left accent border.
 */
export function emailInfoCard(opts: {
  title?: string;
  rows: InfoCardRow[];
  accentColor?: string;
}): string {
  const accent = opts.accentColor ?? c.text;
  const rowsHtml = opts.rows
    .map(
      (r) => `
        <tr>
          <td style="padding: 5px 0; font-family: ${font}; color: ${c.textSecondary}; font-size: 14px; width: 130px; vertical-align: top;">${escapeHtml(r.label)}</td>
          <td style="padding: 5px 0; font-family: ${font}; color: ${r.valueColor ?? c.text}; font-size: ${r.valueSize ?? "14px"}; ${r.valueBold ? "font-weight: 600;" : ""}">${escapeHtml(r.value)}</td>
        </tr>`,
    )
    .join("");

  return `
    <div class="email-blockquote" style="border-left: 3px solid ${accent}; padding: 16px 20px; margin: 16px 0; background-color: transparent;">
      ${opts.title ? `<p class="email-text" style="margin: 0 0 12px; font-family: ${font}; font-size: 16px; font-weight: 600; color: ${c.text};">${escapeHtml(opts.title)}</p>` : ""}
      <table style="width: 100%; border-collapse: collapse;">
        ${rowsHtml}
      </table>
    </div>`;
}

/**
 * CTA button — dark bg, white text.
 * href is validated (https/mailto/localhost only); invalid URLs fall back to "#".
 */
export function emailCtaButton(href: string, label: string): string {
  const safeHref = safeUrl(href);
  const safeLabel = escapeHtml(label);
  return `
    <div style="margin: 24px 0;">
      <a href="${safeHref}" class="email-cta"
         style="display: inline-block; background-color: ${c.ctaBg}; color: ${c.ctaText}; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-family: ${font}; font-weight: 600; font-size: 14px;">
        ${safeLabel}
      </a>
    </div>`;
}

type StatusVariant = "success" | "warning" | "info" | "muted";

/**
 * Left-bordered status/alert block.
 */
export function emailStatusBox(opts: {
  variant: StatusVariant;
  title?: string;
  items?: string[];
  text?: string;
}): string {
  const palette = {
    success: { border: c.green, bg: c.greenBg, text: c.green },
    warning: { border: c.yellow, bg: c.yellowBg, text: c.yellow },
    info: { border: c.blue, bg: c.blueBg, text: c.blue },
    muted: { border: c.mutedBorder, bg: c.bgLight, text: c.textSecondary },
  }[opts.variant];

  const variantClass = `email-status-${opts.variant}`;

  const titleHtml = opts.title
    ? `<p class="email-text" style="margin: 0 0 8px; font-family: ${font}; font-size: 14px; font-weight: 600; color: ${c.text};">${escapeHtml(opts.title)}</p>`
    : "";

  const textHtml = opts.text
    ? `<p class="email-text-secondary" style="margin: 0; font-family: ${font}; font-size: 14px; color: ${c.textSecondary}; line-height: 1.5;">${escapeHtml(opts.text)}</p>`
    : "";

  const listHtml = opts.items
    ? `<ul style="margin: 0; padding-left: 18px;">
        ${opts.items.map((item) => `<li class="email-text-secondary" style="margin-bottom: 4px; font-family: ${font}; font-size: 13px; color: ${c.textSecondary}; line-height: 1.5;">${item}</li>`).join("")}
       </ul>`
    : "";

  return `
    <div class="${variantClass}" style="border-left: 3px solid ${palette.border}; background-color: ${palette.bg}; padding: 14px 16px; margin: 16px 0;">
      ${titleHtml}
      ${textHtml}
      ${listHtml}
    </div>`;
}

/**
 * Section heading.
 */
export function emailHeading(text: string): string {
  return `<h2 class="email-text" style="color: ${c.text}; margin: 24px 0 12px; font-family: ${font}; font-size: 18px; font-weight: 600;">${escapeHtml(text)}</h2>`;
}

/**
 * Generic card container (blockquote style, no background).
 */
export function emailCard(content: string): string {
  return `
    <div class="email-blockquote email-border" style="border-left: 3px solid ${c.border}; padding: 14px 20px; margin: 16px 0; background-color: transparent;">
      ${content}
    </div>`;
}

/**
 * Body text paragraph.
 */
export function emailText(
  html: string,
  opts?: { size?: string; color?: string; bold?: boolean },
): string {
  const size = opts?.size ?? "15px";
  const color = opts?.color ?? c.textSecondary;
  const weight = opts?.bold ? "font-weight: 600;" : "";
  return `<p class="email-text-secondary" style="font-family: ${font}; font-size: ${size}; color: ${color}; margin: 0 0 14px; line-height: 1.6; ${weight}">${html}</p>`;
}

/**
 * Sign-off block — always "Flame Team" for consistency.
 */
export function emailSignoff(): string {
  return `
    <p class="email-text-secondary" style="font-family: ${font}; font-size: 15px; color: ${c.textSecondary}; margin: 24px 0 0;">
      Best regards,<br>
      <strong class="email-text" style="color: ${c.text};">Flame Team</strong>
    </p>`;
}
