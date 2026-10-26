/** Organizer approvals for Flame support, 2.0 style (fase 1b.7). Same admin API as before. */
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { OrgApprovals, OrgApprovalsEntry } from "../../components/v2/support/OrgApprovals";
import { renderV2 } from "./helpers";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }) }));
const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockApiDelete = jest.fn();
jest.mock("../../lib/api", () => ({
  apiGet: (...a: unknown[]) => mockApiGet(...a),
  apiPost: (...a: unknown[]) => mockApiPost(...a),
  apiDelete: (...a: unknown[]) => mockApiDelete(...a),
  ApiError: class extends Error {},
}));
jest.mock("../../hooks/useOptionalAuth", () => ({ useOptionalAuth: () => ({ getToken: async () => "t", isSignedIn: true, isConfigured: true, userId: "u-support" }) }));

let admin = true;
const PENDING = [{ id: "o1", name: "Luna Club", slug: "luna", created_at: "2026-10-20T10:00:00Z", rejected_at: null, rejection_reason: null, owner_email: "luna@x.com", owner_name: "Lu" }];
const REJECTED = [{ id: "o2", name: "Bar Sur", slug: "sur", created_at: "2026-10-01T10:00:00Z", rejected_at: "2026-10-02T10:00:00Z", rejection_reason: "Sin RUC", owner_email: null, owner_name: null }];
beforeEach(() => {
  admin = true;
  [mockPush, mockApiPost, mockApiDelete].forEach((m) => m.mockReset());
  mockApiPost.mockResolvedValue({ success: true });
  mockApiDelete.mockResolvedValue({ success: true });
  mockApiGet.mockReset().mockImplementation(async (url: string) => {
    if (url === "/api/admin/status") return { isAdmin: admin };
    if (url.includes("status=pending")) return { organizations: PENDING };
    if (url.includes("status=rejected")) return { organizations: REJECTED };
    throw new Error(url);
  });
});

it("pending list; approve asks first", async () => {
  await renderV2(<OrgApprovals />);
  expect(await screen.findByText("Luna Club")).toBeTruthy();
  expect(screen.getByText("luna@x.com · Lu")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Approve Luna Club"));
  expect(screen.getByText("Approve Luna Club?")).toBeTruthy();
  expect(mockApiPost).not.toHaveBeenCalled();
  await fireEvent.press(screen.getAllByText("Approve").at(-1)!);
  await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith("/api/admin/organizations/o1/approve", {}, expect.any(Function)));
});

it("reject with a reason; rejected tab shows it", async () => {
  await renderV2(<OrgApprovals />);
  await fireEvent.press(await screen.findByLabelText("Reject Luna Club"));
  await fireEvent.changeText(screen.getByLabelText("Reason (optional, they’ll see it)"), " No pudimos verificar ");
  await fireEvent.press(screen.getAllByText("Reject").at(-1)!);
  await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith("/api/admin/organizations/o1/reject", { reason: "No pudimos verificar" }, expect.any(Function)));
  await fireEvent.press(screen.getByRole("tab", { name: /Rejected/ }));
  expect(await screen.findByText("Reason: Sin RUC")).toBeTruthy();
  expect(screen.queryByLabelText("Reject Bar Sur")).toBeNull();
});

it("not support → says so; the profile entry is hidden", async () => {
  admin = false;
  await renderV2(<OrgApprovals />);
  expect(await screen.findByText("This screen is only for Flame support.")).toBeTruthy();
});

it("profile entry with the pending count opens the screen", async () => {
  await renderV2(<OrgApprovalsEntry />);
  await fireEvent.press(await screen.findByText("1 waiting for review"));
  expect(mockPush).toHaveBeenCalledWith("/v2/support/organizations");
});
