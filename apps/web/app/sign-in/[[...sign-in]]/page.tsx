import { SignIn } from "@clerk/nextjs";
import { WelcomeFrame, attendeeV2Web, clerkDarkAppearance } from "../../components/auth/WelcomeFrame";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  // Flame 2.0 welcome (fase 2.6) unless ATTENDEE_V1=true.
  if (attendeeV2Web()) {
    return (
      <WelcomeFrame>
        <SignIn appearance={clerkDarkAppearance} />
      </WelcomeFrame>
    );
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <SignIn 
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
