/** 10-26: the people search ran in a loop when Clerk handed out a new getToken on every render. */
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { PeoplePicker, type Person } from "../../components/v2/people/PeoplePicker";
import { renderV2 } from "./helpers";

const mockApiGet = jest.fn();
jest.mock("../../lib/api", () => ({ apiGet: (...a: unknown[]) => mockApiGet(...a) }));
// A brand-new getToken function on every render (what an unstable auth hook does).
jest.mock("../../hooks/useOptionalAuth", () => ({ useOptionalAuth: () => ({ getToken: async () => "tok", isSignedIn: true }) }));

function Host() {
  const [n, setN] = useState(0);
  const [p, setP] = useState<Person | null>(null);
  return (
    <>
      <Pressable onPress={() => setN(n + 1)} accessibilityLabel="rerender"><Text>{n}</Text></Pressable>
      <PeoplePicker organization={{ id: "org-1", name: "Kora" }} value={p} onChange={setP} />
    </>
  );
}

it("one request per change of the text, however often the screen re-renders", async () => {
  jest.useFakeTimers();
  mockApiGet.mockResolvedValue({ people: [{ id: "u-1", email: "ana@x.com", first_name: "Ana", last_name: null, related: true }] });
  await renderV2(<Host />);
  await fireEvent.changeText(screen.getByLabelText("Name or e-mail"), "an");
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
  await waitFor(() => expect(screen.getByLabelText("Ana ana@x.com")).toBeTruthy());
  for (let i = 0; i < 5; i++) {
    await fireEvent.press(screen.getByLabelText("rerender"));
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
  }
  expect(mockApiGet).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
