import { SignUp } from "@clerk/nextjs";
import { WelcomeFrame, attendeeV2Web, clerkDarkAppearance } from "../../components/auth/WelcomeFrame";

export const dynamic = "force-dynamic";

// Note: primary sign-up happens via Clerk's modal (triggered by <SignInButton mode="modal">
// in Navbar.tsx — users click LOGIN, modal opens, toggle to "Sign up" inside it). This page
// is a required Clerk catchall route used for email verification links, password reset
// continuations, and direct URL access, but isn't a primary user entry point.
//
// Terms & Privacy acceptance on web is handled by Clerk's built-in Legal Consent feature
// (Dashboard → Configure → Customization → Legal → enable + set Terms/Privacy URLs).
// That injects an enforced checkbox into <SignUp> wherever it renders — modal and this
// page — so no additional consent UI is needed here. See APRIL_2026_FIXES.md #109.
export default function SignUpPage() {
  // Flame 2.0 welcome (fase 2.6) unless ATTENDEE_V1=true.
  if (attendeeV2Web()) {
    return (
      <WelcomeFrame>
        <SignUp appearance={clerkDarkAppearance} />
      </WelcomeFrame>
    );
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <SignUp
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-xl",
          },
        }}
      />
    </div>
  );
}
