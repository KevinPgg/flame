import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserRole, getUserOrganization } from "../../../lib/roles";

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user role
    const role = await getUserRole(userId);

    // Check if user has organization
    const organization = await getUserOrganization(userId);
    const hasOrganization = !!organization;

    return NextResponse.json({
      role,
      hasOrganization,
      organization,
    });
  } catch (error) {
    console.error("Error fetching user role:", error);
    return NextResponse.json(
      { error: "Failed to fetch user role" },
      { status: 500 }
    );
  }
}

