/** The promoter from the link, visible on the event screen before checkout (app, 10-28). */
import { fireEvent, screen } from "@testing-library/react-native";
import { renderV2 } from "./helpers";
import { PromoterChip } from "../../components/v2/attendee/event/PromoterChip";

describe("PromoterChip (app)", () => {
  it("checked → green with remove; checking; not valid; couldn't check → Retry; nothing when idle", async () => {
    const onClear = jest.fn();
    const onRetry = jest.fn();
    const { rerender } = await renderV2(<PromoterChip code="pirilin" status="valid" onRetry={onRetry} onClear={onClear} />);
    expect(screen.getByText("Promoter PIRILIN")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Remove PIRILIN" }));
    expect(onClear).toHaveBeenCalled();
    await rerender(<PromoterChip code="pirilin" status="validating" onRetry={onRetry} onClear={onClear} />);
    expect(screen.getByText("Checking promoter code PIRILIN…")).toBeTruthy();
    await rerender(<PromoterChip code="pirilin" status="invalid" onRetry={onRetry} onClear={onClear} />);
    expect(screen.getByText("Promoter code PIRILIN isn’t valid for this event")).toBeTruthy();
    await rerender(<PromoterChip code="pirilin" status="error" onRetry={onRetry} onClear={onClear} />);
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
    await rerender(<PromoterChip code="" status="idle" onRetry={onRetry} onClear={onClear} />);
    expect(screen.queryByTestId("promoter-chip")).toBeNull();
  });
});
