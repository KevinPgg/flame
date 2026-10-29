/**
 * Kevin 2026-10-28: the promoter is visible before checkout; phone browsers are offered the app
 * (with the promoter kept); the payment page shows the reservation countdown.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { renderV2 } from "./helpers";
import { OpenInApp, appLinks, detectPlatform } from "../../app/v2/attendee/events/[slug]/OpenInApp";
import { HoldTimer } from "../../app/components/HoldTimer";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

const setUA = (ua: string) => Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129 Mobile";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129";
// __tests__/setup.ts replaces window.location with a plain object: set the URL on it.
const goTo = (url: string) => {
  const u = new URL(url);
  Object.assign(window.location, { href: u.toString(), pathname: u.pathname, search: u.search });
};

describe("open in the app (web, phones)", () => {
  beforeEach(() => {
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    goTo("https://flme.co/events/white-party?promoter=PIRILIN");
  });

  it("platform and links keep the promoter; Android falls back to this page with noapp=1", () => {
    expect(detectPlatform(ANDROID)).toBe("android");
    expect(detectPlatform(IPHONE)).toBe("ios");
    expect(detectPlatform(DESKTOP)).toBeNull();
    const l = appLinks("white-party", "?promoter=PIRILIN", "https://flme.co/events/white-party?promoter=PIRILIN");
    expect(l.scheme).toBe("project-flame://events/white-party?promoter=PIRILIN");
    expect(l.android).toBe(
      "intent://events/white-party?promoter=PIRILIN#Intent;scheme=project-flame;package=com.projectflame.app;S.browser_fallback_url=" +
        encodeURIComponent("https://flme.co/events/white-party?promoter=PIRILIN&noapp=1") +
        ";end",
    );
  });

  it("Android: asks; Open = the intent link (Chrome checks the app is installed); Stay hides it", async () => {
    setUA(ANDROID);
    renderV2(<OpenInApp slug="white-party" />);
    expect(screen.getByText("Open in the Flame app?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in the app" }).getAttribute("href")).toMatch(/^intent:\/\/events\/white-party\?promoter=PIRILIN#Intent;/);
    await act(async () => screen.getByRole("button", { name: "Stay in the browser" }).click());
    expect(screen.queryByText("Open in the Flame app?")).not.toBeInTheDocument();
  });

  it("back from the fallback (noapp=1): says the app isn't there; computers see nothing", () => {
    setUA(ANDROID);
    goTo("https://flme.co/events/white-party?promoter=PIRILIN&noapp=1");
    const { unmount } = renderV2(<OpenInApp slug="white-party" />);
    expect(screen.getByText(/couldn’t open the app on this phone/)).toBeInTheDocument();
    unmount();
    setUA(DESKTOP);
    const { container } = renderV2(<OpenInApp slug="white-party" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("reservation countdown on the payment page", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T20:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("counts down, warns in the last 5 minutes, and says when it expired", () => {
    const onExpired = vi.fn();
    render(<HoldTimer expiresAt="2026-10-28T20:05:02Z" eventSlug="ev" onExpired={onExpired} />);
    expect(screen.getByTestId("hold-timer")).toHaveTextContent("Tickets reserved for 05:02");
    expect(screen.queryByText("Less than 5 minutes left to pay")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByTestId("hold-timer")).toHaveTextContent("04:59");
    expect(screen.getByText("Less than 5 minutes left to pay")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(300_000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Your reservation expired");
    expect(screen.getByRole("link", { name: "Choose again" })).toHaveAttribute("href", "/events/ev");
    expect(onExpired).toHaveBeenCalled();
  });
});
