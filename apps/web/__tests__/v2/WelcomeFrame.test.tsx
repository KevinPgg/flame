/** Fase 2.6: welcome around Clerk's sign-in (server component). */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const st = vi.hoisted(() => ({ lang: "es-EC,es;q=0.9", fail: false }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "accept-language": st.lang }) }));
vi.mock("../../app/lib/home-events", () => ({
  getHomeEvents: async () => {
    if (st.fail) throw new Error("db");
    return [{ image_url: "https://img/a.jpg" }, { image_url: null }, { image_url: "https://img/b.jpg" }];
  },
}));
import { WelcomeFrame, attendeeV2Web } from "../../app/components/auth/WelcomeFrame";

describe("WelcomeFrame", () => {
  it("flyer collage, headline in the browser's language, the form inside", async () => {
    render(await WelcomeFrame({ children: <form aria-label="clerk" /> }));
    expect(screen.getByRole("heading", { name: "Todas las noches que valen la pena, en un solo lugar." })).toBeInTheDocument();
    expect(screen.getByTestId("welcome-collage").children).toHaveLength(2);
    expect(screen.getByRole("form", { name: "clerk" })).toBeInTheDocument();
  });

  it("no events → no collage, still the form; English by default; switch", async () => {
    st.fail = true;
    st.lang = "fr-FR";
    render(await WelcomeFrame({ children: <span>form</span> }));
    expect(screen.queryByTestId("welcome-collage")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Every night worth going to, in one place." })).toBeInTheDocument();
    expect(attendeeV2Web()).toBe(process.env.ATTENDEE_V1 !== "true");
  });
});
