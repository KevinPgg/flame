import { isOAuthCallbackPath } from "../../lib/oauth-callback";
import { redirectSystemPath } from "../../app/+native-intent";

describe("sign-in callback is not a route (Unmatched Route fix, 2026-10-27)", () => {
  it.each([
    "project-flame://callback?created_session_id=sess_3L&rotating_token_nonce=rjcqs",
    "com.projectflame.app://callback",
    "com.projectflame.app://callback/",
    "/callback?created_session_id=sess_1",
  ])("recognizes %s", (p) => {
    expect(isOAuthCallbackPath(p)).toBe(true);
  });

  it.each(["project-flame://event/abc", "/callbacks", "/v2/organizer?orgId=1", "project-flame://profile/callback-info", ""])(
    "leaves %s alone",
    (p) => {
      expect(isOAuthCallbackPath(p)).toBe(false);
    }
  );

  it("while open the callback is dropped; cold start goes home; other links pass through", () => {
    expect(redirectSystemPath({ path: "project-flame://callback?created_session_id=s", initial: false })).toBeNull();
    expect(redirectSystemPath({ path: "project-flame://callback?created_session_id=s", initial: true })).toBe("/");
    expect(redirectSystemPath({ path: "project-flame://event/abc", initial: false })).toBe("project-flame://event/abc");
  });
});
