"use client";

/**
 * "Open in the Flame app?" on the event page, phone browsers only (Kevin 2026-10-28). A web page
 * can't see which apps are installed, so the check is the phone's own:
 *  - Android: an `intent://` link — Chrome opens the app if it's installed, otherwise it goes to
 *    the fallback URL (this same page with `noapp=1`, which then says so).
 *  - iOS: the app's scheme (`project-flame://`); if the page is still visible ~1.6 s later the app
 *    didn't open → say so. (With the app installed, a flme.co link tapped in WhatsApp/Instagram
 *    already opens the app directly — universal links — so this banner is for people who are
 *    already in Safari.)
 * The promoter code travels with it (`?promoter=`), so the sale is still attributed in the app.
 * "Stay in the browser" hides it for this visit.
 */
import { useEffect, useState } from "react";
import { useI18n } from "../../../../lib/i18n";

const KEY = "flame-open-in-app-dismissed";
const ANDROID_PACKAGE = "com.projectflame.app";
const SCHEME = "project-flame";

type Platform = "android" | "ios" | null;

export function detectPlatform(ua: string): Platform {
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return null;
}

export function appLinks(slug: string, search: string, href: string) {
  const params = new URLSearchParams(search);
  const promoter = params.get("promoter");
  const query = promoter ? `?promoter=${encodeURIComponent(promoter)}` : "";
  const path = `events/${encodeURIComponent(slug)}${query}`;
  const fallback = new URL(href);
  fallback.searchParams.set("noapp", "1");
  return {
    scheme: `${SCHEME}://${path}`,
    android: `intent://${path}#Intent;scheme=${SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallback.toString())};end`,
  };
}

export function OpenInApp({ slug }: { slug: string }) {
  const { t } = useI18n();
  const [platform, setPlatform] = useState<Platform>(null);
  const [show, setShow] = useState(false);
  const [notInstalled, setNotInstalled] = useState(false);

  useEffect(() => {
    const p = detectPlatform(navigator.userAgent);
    setPlatform(p);
    if (!p) return;
    if (new URLSearchParams(window.location.search).get("noapp") === "1") {
      setNotInstalled(true);
      setShow(true);
      return;
    }
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(KEY) === "1";
    } catch {
      /* private mode */
    }
    setShow(!dismissed);
  }, []);

  if (!show || !platform) return null;

  const dismiss = () => {
    setShow(false);
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* private mode */
    }
  };

  const links = appLinks(slug, window.location.search, window.location.href);
  const openIos = () => {
    const started = Date.now();
    window.location.href = links.scheme;
    setTimeout(() => {
      // Still here and visible → the app didn't take over.
      if (document.visibilityState === "visible" && Date.now() - started < 4000) setNotInstalled(true);
    }, 1600);
  };

  return (
    <div role="dialog" aria-label={t("openInApp.title")} className="fixed inset-x-3 bottom-[96px] z-40 mx-auto max-w-[460px] rounded-[18px] border border-v2-c10 bg-[#141414]/95 p-4 text-v2-cream shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl lg:hidden">
      {notInstalled ? (
        <div className="flex items-start gap-3">
          <p className="m-0 flex-1 text-[13.5px] text-v2-c90">{t("openInApp.notInstalled")}</p>
          <button type="button" onClick={dismiss} aria-label={t("common.close")} className="text-[13px] font-v2-ui-semibold text-v2-cream underline">
            OK
          </button>
        </div>
      ) : (
        <>
          <b className="block text-[15px] font-v2-ui-semibold">{t("openInApp.title")}</b>
          <small className="mt-0.5 block text-[13px] text-v2-c70">{t("openInApp.body")}</small>
          <div className="mt-3 flex gap-2">
            {platform === "android" ? (
              <a href={links.android} className="inline-flex h-10 flex-1 items-center justify-center rounded-v2-pill bg-v2-cream text-[14px] font-v2-ui-semibold text-v2-ink">
                {t("openInApp.open")}
              </a>
            ) : (
              <button type="button" onClick={openIos} className="inline-flex h-10 flex-1 items-center justify-center rounded-v2-pill bg-v2-cream text-[14px] font-v2-ui-semibold text-v2-ink">
                {t("openInApp.open")}
              </button>
            )}
            <button type="button" onClick={dismiss} className="inline-flex h-10 flex-1 items-center justify-center rounded-v2-pill bg-v2-ink3 text-[14px] font-v2-ui-semibold text-v2-c90">
              {t("openInApp.stay")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
