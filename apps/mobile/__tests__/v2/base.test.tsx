/** Fase 1b.0: language from the account, organization lookup, emergency switch. */
import { Text } from "react-native";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { LanguageProvider } from "../../components/v2/LanguageProvider";
import { useI18n } from "../../lib/i18n";
import { findOrganization } from "../../hooks/v2/useOrganizerModel";
import { organizerV2Enabled } from "../../lib/v2/flags";
import { org, renderV2 } from "./helpers";

const mockAuth = { isSignedIn: true as boolean, getToken: async () => "t" };
jest.mock("../../hooks/useOptionalAuth", () => ({ useOptionalAuth: () => mockAuth }));
const mockApiGet = jest.fn();
const mockApiClient = jest.fn(async () => ({}));
jest.mock("../../lib/api", () => ({
  apiGet: (...a: unknown[]) => mockApiGet(...a),
  apiClient: (...a: unknown[]) => mockApiClient(...(a as [])),
}));

function Probe() {
  const { t, setLanguage } = useI18n();
  return (
    <>
      <Text>{t("organizer.createEvent")}</Text>
      <Text onPress={() => setLanguage("en")}>switch</Text>
    </>
  );
}

describe("LanguageProvider", () => {
  it("loads the saved language and saves a change", async () => {
    mockApiGet.mockResolvedValue({ language: "es" });
    await renderV2(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(await screen.findByText("Crear evento")).toBeTruthy();
    expect(mockApiGet).toHaveBeenCalledWith("/api/me/language", expect.any(Function));

    await fireEvent.press(screen.getByText("switch"));
    expect(await screen.findByText("Create event")).toBeTruthy();
    expect(mockApiClient).toHaveBeenCalledWith("/api/me/language", expect.objectContaining({ method: "PUT", body: '{"language":"en"}' }));
  });

  it("signed out: English, nothing loaded", async () => {
    mockAuth.isSignedIn = false;
    mockApiGet.mockReset();
    await renderV2(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByText("Create event")).toBeTruthy();
    await act(async () => {});
    expect(mockApiGet).not.toHaveBeenCalled();
    mockAuth.isSignedIn = true;
  });
});

describe("findOrganization", () => {
  const data = {
    hasOrganization: true,
    organizations: [org("owner"), org("admin", { id: "org-2", slug: "pend", approved: false })],
  };
  it("by slug or by id; pending or unknown → null; loading → undefined", async () => {
    expect(findOrganization(data, { slug: "kora" })?.id).toBe("org-1");
    expect(findOrganization(data, { id: "org-1" })?.slug).toBe("kora");
    expect(findOrganization(data, { slug: "pend" })).toBeNull();
    expect(findOrganization(data, { slug: "nope" })).toBeNull();
    expect(findOrganization(undefined, { slug: "kora" })).toBeUndefined();
  });
});

describe("organizerV2Enabled", () => {
  it("on unless EXPO_PUBLIC_ORGANIZER_V1=true", async () => {
    expect(organizerV2Enabled()).toBe(true);
    process.env.EXPO_PUBLIC_ORGANIZER_V1 = "true";
    expect(organizerV2Enabled()).toBe(false);
    delete process.env.EXPO_PUBLIC_ORGANIZER_V1;
  });
});

void waitFor;
