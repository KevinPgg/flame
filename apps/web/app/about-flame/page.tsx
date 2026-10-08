import type { Metadata } from "next";
import { Navbar, Footer } from "../components";
import { generateMetadata as generateSEOMetadata } from "../lib/seo-config";

export const metadata: Metadata = generateSEOMetadata({
  title: "About Flame",
  description:
    "Learn more about Flame, a global event ticketing platform. Discover how we're making event experiences better for organizers and attendees worldwide.",
  url: "/about-flame",
});

const proseClasses =
  "[&_h1]:text-2xl [&_h1]:leading-8 [&_h1]:font-poppins-semibold [&_h1]:text-white-100 [&_h1]:mb-6 " +
  "[&_h2]:text-lg [&_h2]:font-poppins-semibold [&_h2]:text-white-100 [&_h2]:mt-8 [&_h2]:mb-3 " +
  "[&_h3]:text-base [&_h3]:font-poppins-semibold [&_h3]:text-white-100 [&_h3]:mt-6 [&_h3]:mb-2 " +
  "[&_p]:text-sm [&_p]:leading-[22px] [&_p]:font-poppins [&_p]:text-white-80 [&_p]:mb-3 " +
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 " +
  "[&_li]:text-sm [&_li]:leading-[22px] [&_li]:font-poppins [&_li]:text-white-80 [&_li]:mb-1 " +
  "[&_strong]:text-white-100 [&_strong]:font-poppins-semibold " +
  "[&_a]:text-white-100 [&_a]:underline [&_a]:transition-colors";

export default function AboutFlamePage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <div className="flex-1 pt-16">
        <div className="max-w-[800px] mx-auto px-4 py-12">
          <div className={proseClasses}>
            <h1>About Flame</h1>

            <h2>No-Fuss Fun Fetching</h2>
            <p>
              We believe getting tickets to the events you love shouldn't be a
              headache. That's why we built Flame, a global straightforward
              event ticketing platform designed for good times, not gotchas.
            </p>

            <h3>What We're About</h3>

            <p>
              <strong>Effortless Experience.</strong> Quick checkout, instant
              confirmation, and digital tickets that work. We cut through the
              complications so you can focus on what matters, having a great
              time.
            </p>

            <p>
              <strong>Events You'll Love.</strong> From concerts to workshops,
              festivals to classes, discover experiences that light you up, all
              in one place.
            </p>

            <h3>Our Promise</h3>
            <p>
              We're here to make event ticketing simple, transparent, and
              enjoyable. No fuss, just the fun stuff.
            </p>

            <h3>Who We Are</h3>
            <p>
              We share a passion: making events more accessible and convenient
              for everyone. We believe great experiences shouldn't come with
              barriers, and getting tickets shouldn't be a hassle.
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
