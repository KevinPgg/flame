/** Fase 4.3: line-up on the event screen (app). */
import { Linking } from "react-native";
import { fireEvent, screen } from "@testing-library/react-native";
import { Lineup } from "../../components/v2/attendee/event/Lineup";
import { renderV2 } from "./helpers";

it("a tile per artist with initials and links that open outside", async () => {
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true as never);
  await renderV2(<Lineup lineup={[{ name: "DJ Mila Q", instagram: "mila.q" }, { name: "Perdomo", soundcloud: "https://soundcloud.com/perdomo" }, null]} />);
  expect(screen.getByRole("header", { name: "Lineup" })).toBeTruthy();
  expect(screen.getByText("MQ")).toBeTruthy();
  expect(screen.getByText("PE")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("DJ Mila Q on Instagram"));
  expect(open).toHaveBeenCalledWith("https://instagram.com/mila.q");
  await fireEvent.press(screen.getByLabelText("Perdomo on SoundCloud"));
  expect(open).toHaveBeenCalledWith("https://soundcloud.com/perdomo");
});

it("nothing when the line-up is empty", async () => {
  await renderV2(<Lineup lineup={[]} />);
  expect(screen.queryByText("Lineup")).toBeNull();
});
