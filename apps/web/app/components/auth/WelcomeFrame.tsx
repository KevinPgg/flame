import type { ReactNode } from "react";
import { headers } from "next/headers";
import { createTranslator, resolveLanguage } from "@project-flame/lib";
import { getHomeEvents } from "../../lib/home-events";

/**
 * Flame 2.0 welcome around Clerk's sign-in / sign-up (fase 2.6). Prototype `SCREENS.splash`:
 * a collage of real flyers fading to black, the Flame logo and one line, and Clerk's own form
 * (same accounts, providers and legal consent as before) in dark colors. The browser's language
 * picks the copy (nobody is signed in yet). ATTENDEE_V1=true → the white v1 page.
 */
export const attendeeV2Web = () => process.env.ATTENDEE_V1 !== "true";

/** Clerk in Flame 2.0 colors (dark card, white primary button). */
export const clerkDarkAppearance = {
  variables: {
    colorBackground: "#0F0F0F",
    colorText: "#FFFFFF",
    colorTextSecondary: "rgba(255,255,255,0.66)",
    colorPrimary: "#FFFFFF",
    colorTextOnPrimaryBackground: "#000000",
    colorInputBackground: "#171717",
    colorInputText: "#FFFFFF",
    colorNeutral: "#FFFFFF",
    borderRadius: "14px",
  },
  elements: {
    rootBox: "mx-auto w-full",
    card: "shadow-none border border-white/10",
  },
};

export async function WelcomeFrame({ children }: { children: ReactNode }) {
  const language = resolveLanguage((await headers()).get("accept-language"));
  const t = createTranslator(language);
  let flyers: string[] = [];
  try {
    flyers = (await getHomeEvents())
      .map((e) => e.image_url)
      .filter((u): u is string => !!u)
      .slice(0, 9);
  } catch {
    flyers = []; // the page works without the collage
  }
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-black text-white">
      {flyers.length > 0 && (
        <div aria-hidden data-testid="welcome-collage" className="pointer-events-none absolute inset-0 grid grid-cols-3 gap-1 opacity-60 md:grid-cols-5">
          {flyers.map((src, i) => (
            <div key={i} className="aspect-[4/5] bg-cover bg-center" style={{ backgroundImage: `url("${src}")` }} />
          ))}
        </div>
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-black/85 to-black" />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-[460px] flex-col items-center justify-center gap-6 px-4 py-10">
        {/* eslint-disable-next-line @next/next/no-img-element -- static logo */}
        <img src="/flame-logo-white.svg" alt="Flame" width={150} height={30} className="h-[30px] w-auto" />
        <h1 className="text-center text-[30px] font-bold leading-[1.05] tracking-[-0.04em] md:text-[38px]">{t("welcome.headline")}</h1>
        {children}
        <p className="text-center text-[12px] text-white/50">{t("welcome.fine")}</p>
      </div>
    </div>
  );
}
