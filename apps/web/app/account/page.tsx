import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getUserWithRole } from "../lib/roles";
import { Navbar } from "../components";
import { UserDashboard } from "../components/UserDashboard";

export default async function AccountPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  // Get user data with role
  const user = await getUserWithRole(userId);

  if (!user) {
    redirect("/");
  }

  // Data fetching is now handled by React Query in the UserDashboard component

  // Serialize user data for client component
  const serializedUser = {
    id: user.id,
    email: user.email,
    clerk_id: user.clerk_id,
    first_name: user.first_name,
    last_name: user.last_name,
    role: user.role,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };

  return (
    <>
      <Navbar />
      <UserDashboard user={serializedUser} />
    </>
  );
}
