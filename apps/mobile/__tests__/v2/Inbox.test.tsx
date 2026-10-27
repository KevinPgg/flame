/** Notifications panel (bell) — "Clear all" (fix 2026-10-27). */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderV2 } from "./helpers";
import { NotificationsOverlay, type NotificationsOverlayState } from "../../components/notifications/NotificationsOverlay";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
// The shared UI package pulls Skia (native only); the panel just needs colors and the refresh control.
jest.mock("@project-flame/ui", () => ({
  colors: new Proxy({}, { get: () => "#ffffff" }),
  CustomRefreshControl: () => null,
}));

const n = (id: string, read: boolean) => ({ id, type: "event_reminder", title: `Title ${id}`, body: "body", data: {}, read, created_at: new Date().toISOString() });

function state(items: ReturnType<typeof n>[], over: Partial<NotificationsOverlayState> = {}): NotificationsOverlayState {
  return {
    notifications: items as never,
    isLoading: false,
    isInitialLoad: false,
    error: null,
    refresh: jest.fn(async () => {}),
    markAsRead: jest.fn(async () => {}),
    markAllAsRead: jest.fn(async () => {}),
    dismiss: jest.fn(async () => {}),
    dismissAll: jest.fn(async () => {}),
    unreadCount: items.filter((i) => !i.read).length,
    ...over,
  };
}

async function open(s: NotificationsOverlayState, language: "en" | "es" = "en") {
  await renderV2(<NotificationsOverlay visible onClose={jest.fn()} notificationsState={s} />, language);
  // The panel mounts on the next render (open animation).
  await screen.findByText(language === "es" ? "Notificaciones" : "Notifications");
}

describe("Clear all", () => {
  it("all read → clears right away, no question", async () => {
    const s = state([n("a", true), n("b", true)]);
    await open(s);
    await fireEvent.press(screen.getByText("Clear all"));
    await waitFor(() => expect(s.dismissAll).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Clear all notifications?")).toBeNull();
  });

  it("a failed clear says so", async () => {
    const s = state([n("a", true)], { dismissAll: jest.fn(async () => Promise.reject(new Error("rls"))) });
    await open(s);
    await fireEvent.press(screen.getByText("Clear all"));
    expect(await screen.findByText("We couldn’t clear your notifications. Try again.")).toBeTruthy();
  });

  it("Spanish", async () => {
    await open(state([n("a", false)]), "es");
    expect(screen.getByText("Notificaciones")).toBeTruthy();
    await fireEvent.press(screen.getByText("Borrar todo"));
    expect(await screen.findByText("¿Borrar todas las notificaciones?")).toBeTruthy();
  });
  it("with unread → asks first; cancel keeps them, confirm clears", async () => {
    const s = state([n("a", false), n("b", true)]);
    await open(s);
    await fireEvent.press(screen.getByText("Clear all"));
    expect(await screen.findByText("Clear all notifications?")).toBeTruthy();
    expect(screen.getByText("1 is still unread. This can’t be undone.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Cancel"));
    expect(s.dismissAll).not.toHaveBeenCalled();
    // [0] = the header button, last = the dialog's confirm button.
    await fireEvent.press(screen.getAllByText("Clear all")[0]);
    const buttons = await screen.findAllByText("Clear all");
    expect(buttons.length).toBe(2);
    await fireEvent.press(buttons[1]);
    await waitFor(() => expect(s.dismissAll).toHaveBeenCalledTimes(1));
  });

});
