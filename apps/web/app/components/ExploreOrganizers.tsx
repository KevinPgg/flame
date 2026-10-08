"use client";

import Link from "next/link";
import Image from "next/image";

interface Organizer {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
}

const DEFAULT_ORG_IMAGE = "https://jaoqfvugxmtomdufhswa.supabase.co/storage/v1/object/public/organization-images/default.jpg";

interface ExploreOrganizersProps {
  organizers?: Organizer[];
}

export function ExploreOrganizers({ organizers = [] }: ExploreOrganizersProps) {
  if (!organizers.length) return null;

  return (
    <div className="px-4">
      <h2 className="text-white-100 font-poppins-semibold text-lg mb-4 text-center">
        Explore Organizers
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-2 justify-center [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {organizers.map((org) => (
          <Link
            key={org.id}
            href={`/organizer/${encodeURIComponent(org.slug)}`}
            className="shrink-0 flex flex-col items-center gap-[7px] hover:opacity-90 transition-opacity"
          >
            <div className="w-[67px] h-[67px] rounded-full overflow-hidden bg-white-10 relative">
              <Image
                src={org.logo_url || DEFAULT_ORG_IMAGE}
                alt={org.name}
                fill
                className="object-cover"
                sizes="67px"
              />
            </div>
            <span className="text-white-100 text-sm font-poppins text-center max-w-[80px] truncate">
              {org.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
