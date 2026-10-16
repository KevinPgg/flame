import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiErrorMessage } from "../../app/v2/lib/api-error";
import { routes } from "../../app/v2/lib/routes";

const db = vi.hoisted(() => ({ admin: null as unknown }));
vi.mock("../../app/lib/supabase/server", () => ({
  get supabaseAdmin() {
    return db.admin;
  },
}));
import { getUserLanguage } from "../../app/v2/lib/user-language";

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });

describe("apiErrorMessage", () => {
  it("4xx: shows the server's message (it says what to fix)", async () => {
    expect(await apiErrorMessage(json({ error: "Code already exists" }, 409), "generic")).toBe("Code already exists");
  });
  it("4xx without a usable message → generic", async () => {
    expect(await apiErrorMessage(json({}, 400), "generic")).toBe("generic");
    expect(await apiErrorMessage(json({ error: "   " }, 400), "generic")).toBe("generic");
    expect(await apiErrorMessage(json({ error: { code: 1 } }, 400), "generic")).toBe("generic");
    expect(await apiErrorMessage(new Response("<html>", { status: 404 }), "generic")).toBe("generic");
  });
  it("5xx: never shows server internals", async () => {
    expect(await apiErrorMessage(json({ error: "relation users does not exist" }, 500), "generic")).toBe("generic");
  });
});

describe("routes", () => {
  it("encodes the org slug and keeps v1 URLs identical to v1", () => {
    expect(routes.dashboard("a b&c")).toBe("/v2/organizer?org=a%20b%26c");
    expect(routes.event("e1", "kora")).toBe("/v2/organizer/event/e1?org=kora");
    expect(routes.event("e1", "kora", "send")).toBe("/v2/organizer/event/e1?org=kora&tab=send");
    expect(routes.eventV1("e1", "kora")).toBe("/organizer/event/e1?org=kora");
    expect(routes.rsvps("kora")).toBe("/v2/organizer/rsvps?org=kora");
    expect(routes.rsvpEvent("e1", "a b")).toBe("/v2/organizer/rsvps/e1?org=a%20b");
    expect(routes.createEvent("kora")).toBe("/v2/organizer/create?org=kora");
    expect(routes.editEvent("e1", "kora")).toBe("/v2/organizer/event/e1/edit?org=kora");
    expect(routes.payouts("kora")).toBe("/organizer/settings?org=kora&tab=payouts");
  });
});

describe("getUserLanguage", () => {
  const admin = (result: { data?: unknown; error?: unknown } | Error) => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (result instanceof Error) throw result;
            return { data: result.data ?? null, error: result.error ?? null };
          },
        }),
      }),
    }),
  });
  beforeEach(() => {
    db.admin = null;
  });

  it("no user or no database → English", async () => {
    expect(await getUserLanguage(null)).toBe("en");
    expect(await getUserLanguage("user_1")).toBe("en");
  });
  it("reads users.language", async () => {
    db.admin = admin({ data: { language: "es" } });
    expect(await getUserLanguage("user_1")).toBe("es");
  });
  it("unknown value, no row, query error or exception → English", async () => {
    db.admin = admin({ data: { language: "fr" } });
    expect(await getUserLanguage("u")).toBe("en");
    db.admin = admin({ data: null });
    expect(await getUserLanguage("u")).toBe("en");
    db.admin = admin({ error: { message: "column users.language does not exist" } });
    expect(await getUserLanguage("u")).toBe("en");
    db.admin = admin(new Error("network"));
    expect(await getUserLanguage("u")).toBe("en");
  });
});
