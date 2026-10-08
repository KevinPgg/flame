import type { Appearance } from "@stripe/stripe-js";
import { flameColorWhite, flameColors, flameRadii } from "@project-flame/lib";

/**
 * Shared Stripe Payment Element / Elements appearance for web checkout.
 *
 * `colorPrimary` drives Link promo text, wallet (Apple Pay) accents, and
 * default focus treatment — it must NOT be Flame `primary` or checkout looks
 * like an error state. Use `flameColorWhite` / `white-100` for neutral chrome.
 */
export const flameCheckoutElementsAppearance: Appearance = {
  theme: "night",
  variables: {
    colorPrimary: flameColorWhite,
    colorBackground: flameColors.surface,
    colorText: flameColorWhite,
    colorDanger: flameColors.error,
    colorTextSecondary: flameColors.white50,
    colorTextPlaceholder: flameColors.white30,
    fontFamily: 'Poppins, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontSizeBase: "16px",
    spacingUnit: "4px",
    borderRadius: flameRadii.card,
    focusBoxShadow: `0 0 0 3px ${flameColors.white10}`,
    focusOutline: "none",
  },
  rules: {
    ".Input": {
      backgroundColor: flameColors.white5,
      border: `1px solid ${flameColors.white20}`,
      borderRadius: flameRadii.card,
      padding: "12px 16px",
      fontSize: "16px",
      color: flameColorWhite,
      transition: "border-color 0.2s ease, box-shadow 0.2s ease",
    },
    ".Input:hover": {
      borderColor: flameColors.white30,
    },
    ".Input:focus": {
      borderColor: flameColors.white60,
      boxShadow: `0 0 0 3px ${flameColors.white10}`,
    },
    ".Label": {
      fontWeight: "500",
      marginBottom: "8px",
      color: flameColors.white70,
      fontSize: "14px",
      textTransform: "uppercase",
    },
    ".Tab": {
      backgroundColor: flameColors.white5,
      border: `1px solid ${flameColors.white20}`,
      borderRadius: flameRadii.card,
      padding: "12px 16px",
      color: flameColors.white50,
      transition: "all 0.2s ease",
    },
    ".Tab:hover": {
      borderColor: flameColors.white30,
      color: flameColorWhite,
    },
    ".Tab--selected": {
      borderColor: flameColors.white60,
      backgroundColor: flameColors.white10,
      color: flameColorWhite,
      boxShadow: `0 0 0 1px ${flameColors.white50}`,
    },
    ".Error": {
      color: flameColors.error,
      fontSize: "14px",
    },
  },
};
