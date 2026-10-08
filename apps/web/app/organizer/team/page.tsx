import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { supabaseAdmin } from "../../lib/supabase/server";
import NavbarWrapper from "../../components/NavbarWrapper";
import OrganizerTeamView from "../../components/organizer/OrganizerTeamView";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ org?: string }>;
}

export default async function OrganizerTeamPage({ searchParams }: PageProps) {
  const { userId } = await auth();
  if (!userId) redirect("/");
  if (!supabaseAdmin) notFound();

  const params = await searchParams;
  const orgParam = params.org?.trim();
  if (!orgParam) redirect("/profile");

  // Resolve org by slug, or by id if the param looks like a UUID.
  // Combining slug.eq + id.eq in a single .or() fails because Postgres
  // tries to cast a slug to uuid and throws an invalid-input error.
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      orgParam,
    );

  const orgQuery = supabaseAdmin
    .from("organizations")
    .select("id, name, slug")
    .limit(1);

  const { data: org } = isUuid
    ? await orgQuery.eq("id", orgParam).maybeSingle()
    : await orgQuery.eq("slug", orgParam).maybeSingle();

  if (!org) notFound();

  // Check caller role.
  const { data: caller } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("clerk_id", userId)
    .single();
  if (!caller) redirect("/");

  const { data: membership } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("user_id", caller.id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return (
      <div className="min-h-screen bg-background">
        <NavbarWrapper />
        <main className="pt-16">
          <div className="max-w-[800px] mx-auto px-4 py-12 flex flex-col items-center gap-3 text-center">
            <h1 className="text-white-100 text-lg leading-7 font-poppins-semibold">
              No access
            </h1>
            <p className="text-white-50 text-sm font-poppins max-w-md">
              You need to be an owner or admin of this organization to manage
              its team.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavbarWrapper />
      <main className="pt-16">
        <div className="max-w-[800px] mx-auto px-4 py-6">
          <OrganizerTeamView org={org} />
        </div>
      </main>
    </div>
  );
}
