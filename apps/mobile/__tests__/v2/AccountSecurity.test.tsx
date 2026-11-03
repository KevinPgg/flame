/** Password, e-mails and devices in the app with the Clerk SDK (2026-11-02, no accounts.dev). */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { AccountSecurity } from "../../components/v2/settings/AccountSecurity";
import { renderV2 } from "./helpers";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }) }));

const mockUser: any = {};
jest.mock("../../hooks/v2/useClerkUser", () => {
  const actual = jest.requireActual("../../hooks/v2/useClerkUser");
  return { ...actual, useClerkUser: () => ({ isLoaded: true, isSignedIn: true, user: mockUser }), useCurrentSessionId: () => "sess_me" };
});

const email = (id: string, address: string, status = "verified") => ({
  id,
  emailAddress: address,
  verification: { status },
  prepareVerification: jest.fn(async () => ({})),
  attemptVerification: jest.fn(async () => ({})),
  destroy: jest.fn(async () => undefined),
});

beforeEach(() => {
  const added = email("e3", "nuevo@x.com", "unverified");
  Object.assign(mockUser, {
    id: "u1",
    passwordEnabled: true,
    primaryEmailAddressId: "e1",
    emailAddresses: [email("e1", "ana@x.com"), email("e2", "otro@x.com")],
    externalAccounts: [{ id: "x1", provider: "oauth_google", emailAddress: "ana@gmail.com" }],
    updatePassword: jest.fn(async () => ({})),
    createEmailAddress: jest.fn(async () => added),
    update: jest.fn(async () => ({})),
    reload: jest.fn(async () => ({})),
    getSessions: jest.fn(async () => [
      { id: "sess_me", lastActiveAt: new Date(), latestActivity: { browserName: "Flame", deviceType: "iPhone", isMobile: true }, revoke: jest.fn() },
      { id: "sess_2", lastActiveAt: new Date(Date.now() - 3600_000), latestActivity: { browserName: "Chrome", deviceType: "Windows" }, revoke: jest.fn(async () => ({})) },
    ]),
    _added: added,
  });
});

it("lists e-mails, connected accounts and devices; makes one primary; signs out another device", async () => {
  await renderV2(<AccountSecurity />);
  expect(screen.getByText("ana@x.com")).toBeTruthy();
  expect(screen.getByText("Primary")).toBeTruthy();
  expect(screen.getByText("Google")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Make primary" }));
  await waitFor(() => expect(mockUser.update).toHaveBeenCalledWith({ primaryEmailAddressId: "e2" }));
  expect(await screen.findByText("This device")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
  const sessions = await mockUser.getSessions.mock.results[0].value;
  await waitFor(() => expect(sessions[1].revoke).toHaveBeenCalled());
});

it("adds an e-mail with a code", async () => {
  await renderV2(<AccountSecurity />);
  await fireEvent.press(screen.getByRole("button", { name: "Add e-mail" }));
  await fireEvent.changeText(screen.getByLabelText("New e-mail"), "nuevo@x.com");
  await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
  expect(await screen.findByText("We sent a 6-digit code to nuevo@x.com.")).toBeTruthy();
  expect(mockUser._added.prepareVerification).toHaveBeenCalledWith({ strategy: "email_code" });
  await fireEvent.changeText(screen.getByLabelText("Code"), "123456");
  await fireEvent.press(screen.getByRole("button", { name: "Verify" }));
  await waitFor(() => expect(mockUser._added.attemptVerification).toHaveBeenCalledWith({ code: "123456" }));
  expect(await screen.findByText("E-mail added")).toBeTruthy();
});

it("changes the password; mismatch and Clerk errors are shown", async () => {
  await renderV2(<AccountSecurity />);
  await fireEvent.changeText(screen.getByLabelText("Current password"), "old-pass-1");
  await fireEvent.changeText(screen.getByLabelText("New password"), "new-pass-123");
  await fireEvent.changeText(screen.getByLabelText("Repeat the new password"), "different-1");
  await fireEvent.press(screen.getByRole("button", { name: "Save password" }));
  expect(screen.getByText("The passwords don’t match.")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Repeat the new password"), "new-pass-123");
  mockUser.updatePassword.mockRejectedValueOnce({ errors: [{ code: "form_password_incorrect", longMessage: "Password is incorrect. Try again." }] });
  await fireEvent.press(screen.getByRole("button", { name: "Save password" }));
  expect(await screen.findByText("Password is incorrect. Try again.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Save password" }));
  await waitFor(() => expect(mockUser.updatePassword).toHaveBeenLastCalledWith({ newPassword: "new-pass-123", currentPassword: "old-pass-1", signOutOfOtherSessions: true }));
  expect(await screen.findByText("Password saved")).toBeTruthy();
});
