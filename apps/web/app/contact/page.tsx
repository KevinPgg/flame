import type { Metadata } from "next";
import { Navbar, Footer } from "../components";
import ContactForm from "../components/forms/ContactForm";
import { generateMetadata as generateSEOMetadata } from "../lib/seo-config";

export const metadata: Metadata = generateSEOMetadata({
  title: "Contact Us",
  description:
    "Have questions about Flame events or need support? Contact us and we'll get back to you as soon as possible. We're here to help with any inquiries.",
  url: "/contact",
});

export default function ContactPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <div className="flex-1 pt-16">
        <div className="max-w-[800px] mx-auto px-4 py-12">
          <div className="text-center mb-10">
            <h1 className="text-2xl leading-8 font-poppins-semibold text-white-100 mb-3">
              Contact Us
            </h1>
            <p className="text-sm leading-[22px] font-poppins text-white-80 max-w-[520px] mx-auto">
              Have questions about FLAME events or need support? We're here to
              help! Send us a message and we'll get back to you as soon as
              possible.
            </p>
          </div>

          <ContactForm />
        </div>
      </div>
      <Footer />
    </div>
  );
}
