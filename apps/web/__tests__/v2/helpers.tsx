/**
 * Shared helpers for Flame 2.0 (v2) component tests.
 * - renderV2: wraps in the real I18nProvider (en by default) so tests read the same copy users see.
 * - mockFetch: route table → Response; records every call for payload assertions.
 * - jsdom has no <dialog>.showModal(): polyfilled here (ConfirmDialog uses it).
 */
import React from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { I18nProvider } from "../../app/lib/i18n";

if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

export function renderV2(ui: React.ReactElement, language: "en" | "es" = "en") {
  return render(<I18nProvider initialLanguage={language}>{ui}</I18nProvider>);
}

export type Route = { match: (url: string, init?: RequestInit) => boolean; status?: number; body?: unknown };

export function mockFetch(routes: Route[]) {
  const calls: Array<{ url: string; method: string; body: any }> = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    // JSON bodies are parsed for assertions; FormData (uploads) is kept as is.
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body ?? undefined;
    calls.push({ url, method, body });
    const r = routes.find((x) => x.match(url, init));
    if (!r) return new Response(JSON.stringify({ error: `unmocked ${method} ${url}` }), { status: 599 });
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls, posts: () => calls.filter((c) => c.method !== "GET") };
}
