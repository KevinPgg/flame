import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderV2 } from "./helpers";
import V2Error from "../../app/v2/error";
import OrganizerLoading from "../../app/v2/organizer/loading";

describe("v2 error and loading screens", () => {
  it("error: translated message, retry calls reset, link back to my organizers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    renderV2(<V2Error error={Object.assign(new Error("boom"), { digest: "d1" })} reset={reset} />, "es");
    expect(screen.getByRole("heading", { name: "Algo salió mal" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reset).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Mis organizadores" })).toHaveAttribute("href", "/v2/organizer");
  });

  it("loading: announces itself", () => {
    renderV2(<OrganizerLoading />);
    expect(screen.getByRole("status", { name: "Loading…" })).toBeInTheDocument();
  });
});
