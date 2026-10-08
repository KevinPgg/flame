import Link from "next/link";
import { FiChevronRight } from "react-icons/fi";

/**
 * Web equivalent of mobile FeaturedEventsCta.
 * "Featured events, organizers and more" link to discover/events.
 */
export function FeaturedEventsCta() {
  return (
    <div className="px-4">
      <div className="flex justify-end">
        <Link
          href="/discover"
          className="inline-flex items-center gap-[7px] text-white-100 text-sm font-poppins hover:opacity-90 transition-opacity"
        >
          Featured events, organizers and more
          <FiChevronRight size={20} />
        </Link>
      </div>
    </div>
  );
}
