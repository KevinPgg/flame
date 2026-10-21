import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderV2 } from "./helpers";
import { Toggle } from "../../app/v2/components/Toggle";
import { SwitchRow } from "../../app/v2/organizer/event-form/ui";

/** Knob anchored left: off = left, on = right (bug 2026-10-20: the knob started from the center). */
const knob = (name: string) => screen.getByRole("switch", { name }).querySelector("span")!;

describe("switches move left (off) → right (on)", () => {
  it("Toggle", async () => {
    const onChange = vi.fn();
    const { rerender } = renderV2(<Toggle checked={false} onChange={onChange} label="Sold out" />);
    expect(knob("Sold out").className).toMatch(/\bleft-0\b/);
    expect(knob("Sold out").className).toMatch(/translate-x-0\.5/);
    await userEvent.click(screen.getByRole("switch", { name: "Sold out" }));
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<Toggle checked onChange={onChange} label="Sold out" />);
    expect(knob("Sold out").className).toMatch(/translate-x-\[18px\]/);
  });

  it("SwitchRow", () => {
    renderV2(<SwitchRow title="Hide tier" checked={false} onChange={() => {}} />);
    const k = screen.getByRole("switch", { name: /Hide tier/ }).querySelector("span[aria-hidden] > span")!;
    expect(k.className).toMatch(/\bleft-0\b/);
    expect(k.className).toMatch(/translate-x-0\.5/);
  });
});
