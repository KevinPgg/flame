"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useI18n } from "../../lib/i18n";
import { Icon, type IconName } from "../components/Icon";
import { NotificationBell } from "./NotificationBell";
import { PurchaseInProgress } from "./PurchaseInProgress";

export type AttendeeTab = "home" | "explore" | "tickets" | "you";

/** Same sections as the app's bar; the public URLs stay as they are (decision 2026-10-27). */
const TABS: ReadonlyArray<{ key: AttendeeTab; icon: IconName; href: string; requiresAuth?: boolean }> = [
  { key: "home", icon: "home", href: "/" },
  { key: "explore", icon: "search", href: "/discover" },
  { key: "tickets", icon: "ticket", href: "/account", requiresAuth: true },
  { key: "you", icon: "user", href: "/profile", requiresAuth: true },
];

export function activeAttendeeTab(pathname: string): AttendeeTab | null {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/discover")) return "explore";
  if (pathname.startsWith("/account")) return "tickets";
  if (pathname.startsWith("/profile")) return "you";
  return null;
}

const signInHref = (to: string) => `/sign-in?redirect_url=${encodeURIComponent(to)}`;
const circle =
  "inline-flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(28,28,28,0.82)] text-v2-cream hover:bg-v2-ink4";

/**
 * Flame 2.0 attendee frame for the web (fase 2.1). A computer gets a top bar with the four
 * sections, search and the bell (panel) — Settings moved into "You" in 2.6; a phone gets the app's floating bottom bar
 * and the bell opens the full notifications page. Signed out: Tickets / You lead to sign in,
 * and the bell gives way to "Sign in".
 */
const FOOTER_LINKS = [
  ["about", "/about-flame"],
  ["faqs", "/faqs"],
  ["contact", "/contact"],
  ["refund", "/contact"],
  ["privacy", "/privacy-policy"],
  ["terms", "/terms-of-use"],
  ["purchaseTerms", "/purchase-terms"],
  ["organizerAgreement", "/organizer-agreement"],
  ["cookies", "/cookie-settings"],
] as const;

/** Same links and contact as the v1 footer (legal pages must stay one click away). */
function AttendeeFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-[#161616] pb-28 pt-8 lg:pb-10">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 lg:px-8">
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {FOOTER_LINKS.map(([key, href]) => (
            <Link key={key} href={href} className="text-[13px] text-v2-c70 hover:text-v2-cream">
              {t(`footer.${key}`)}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-v2-c50">
          <a href="mailto:support@flme.co" className="hover:text-v2-cream">support@flme.co</a>
          <a href="tel:+59342510906" className="hover:text-v2-cream">+593 (04) 2510 9060</a>
          <a href="https://instagram.com/flame__app" target="_blank" rel="noreferrer" className="hover:text-v2-cream">Instagram</a>
          <span className="lg:ml-auto">{t("footer.rights", { year: new Date().getFullYear() })}</span>
        </div>
      </div>
    </footer>
  );
}

/**
 * `hideTabBar` (event page, Kevin 2026-10-28): the phone tab bar gives way to the page's own
 * bottom bar (Continue to checkout / View my tickets), as in the prototype.
 */
export function AttendeeShell({ children, active, hideTabBar = false }: { children: ReactNode; active?: AttendeeTab | null; hideTabBar?: boolean }) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "/";
  const { isSignedIn, isLoaded } = useUser();
  const current = active === undefined ? activeAttendeeTab(pathname) : active;
  const href = (tab: (typeof TABS)[number]) => (tab.requiresAuth && isLoaded && !isSignedIn ? signInHref(tab.href) : tab.href);

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-30 border-b border-[#161616] bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-4 lg:px-8">
          <Link href="/" aria-label={t("tabs.home")} className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- static logo */}
            <img src="/flame-logo-white.svg" alt="Flame" width={94} height={18} className="h-[18px] w-auto" />
          </Link>
          <nav aria-label={t("tabs.main")} className="hidden items-center gap-1 lg:flex">
            {TABS.map((tab) => {
              const on = tab.key === current;
              return (
                <Link
                  key={tab.key}
                  href={href(tab)}
                  aria-current={on ? "page" : undefined}
                  className={`inline-flex h-9 items-center rounded-v2-pill px-3.5 text-[14px] font-v2-ui-semibold ${on ? "bg-v2-ink3 text-v2-cream" : "text-v2-c70 hover:text-v2-cream"}`}
                >
                  {t(`tabs.${tab.key}`)}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/discover" aria-label={t("common.search")} className={circle}>
              <Icon name="search" size={19} />
            </Link>
            {isLoaded && isSignedIn ? (
              // Settings lives inside "You" since 2.6 (prototype), not in the bar.
              <NotificationBell />
            ) : isLoaded ? (
              <Link
                href={signInHref(pathname)}
                className="inline-flex h-10 items-center rounded-v2-pill bg-v2-cream px-4 text-[13.5px] font-v2-ui-semibold text-v2-ink hover:bg-v2-paper"
              >
                {t("userSettings.signIn")}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main className="pb-6 lg:pb-8">{children}</main>
      <AttendeeFooter />

      {/* A running reservation follows the buyer everywhere until it's paid or expires. */}
      {isLoaded && isSignedIn ? <PurchaseInProgress pathname={pathname} aboveBar={hideTabBar} /> : null}

      {/* Phone: the app's floating bar. */}
      {!hideTabBar && (
      <nav
        aria-label={t("tabs.main")}
        className="fixed bottom-3 left-4 right-4 z-30 flex h-16 items-center justify-evenly rounded-v2-pill border border-white/10 bg-[rgba(18,18,18,0.94)] backdrop-blur-xl lg:hidden"
      >
        {TABS.map((tab) => {
          const on = tab.key === current;
          return (
            <Link
              key={tab.key}
              href={href(tab)}
              aria-current={on ? "page" : undefined}
              className={`flex min-w-[64px] flex-col items-center gap-[3px] text-[10.5px] font-v2-ui-medium ${on ? "text-v2-cream" : "text-v2-c50"}`}
            >
              <Icon name={tab.icon} size={23} />
              {t(`tabs.${tab.key}`)}
            </Link>
          );
        })}
      </nav>
      )}
    </div>
  );
}
