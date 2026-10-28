/** "Have an access code?" link + sheet on the event screen (app, 2026-10-27). */
import { useState } from "react";
import { fireEvent, screen } from "@testing-library/react-native";
import { renderV2 } from "./helpers";
import { AccessCode } from "../../components/v2/attendee/event/AccessCode";

function Harness({ accept, onUnlock, onClear }: { accept: boolean; onUnlock: (v: string) => void; onClear: () => void }) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "validating" | "valid" | "invalid">("idle");
  return (
    <AccessCode
      value={value}
      status={status}
      error={status === "invalid" ? "Invalid access code" : null}
      onChange={setValue}
      onUnlock={(v) => {
        onUnlock(v);
        setStatus(accept ? "valid" : "invalid");
      }}
      onClear={() => {
        onClear();
        setValue("");
        setStatus("idle");
      }}
    />
  );
}

describe("AccessCode (app)", () => {
  it("link opens the sheet; Unlock checks the code; accepted → sheet closes and a chip with Remove", async () => {
    const unlock = jest.fn();
    const clear = jest.fn();
    await renderV2(<Harness accept onUnlock={unlock} onClear={clear} />);
    await fireEvent.press(screen.getByRole("button", { name: "Have an access code?" }));
    expect(screen.getByText("Some tickets are private. Enter the code the organizer gave you to unlock them.")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Access code"), "whitevip");
    await fireEvent.press(screen.getByRole("button", { name: "Unlock" }));
    expect(unlock).toHaveBeenCalledWith("whitevip");
    expect(screen.getByText("Code WHITEVIP applied")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Remove" }));
    expect(clear).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Have an access code?" })).toBeTruthy();
  });

  it("rejected → error stays in the sheet (Spanish)", async () => {
    await renderV2(<Harness accept={false} onUnlock={jest.fn()} onClear={jest.fn()} />, "es");
    await fireEvent.press(screen.getByRole("button", { name: "¿Tienes un código de acceso?" }));
    await fireEvent.changeText(screen.getByLabelText("Código de acceso"), "nope");
    await fireEvent.press(screen.getByRole("button", { name: "Desbloquear" }));
    expect(screen.getByText("Invalid access code")).toBeTruthy();
  });
});
