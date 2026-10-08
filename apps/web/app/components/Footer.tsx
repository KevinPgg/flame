import Link from "next/link";
import { SiInstagram } from "react-icons/si";

export default function Footer() {
  const companyLinks = [
    { name: "About FLAME", href: "/about-flame" },
    { name: "Careers", href: "/contact" },
  ];

  const supportLinks = [
    { name: "FAQs", href: "/faqs" },
    { name: "Contact Us", href: "/contact" },
    { name: "Request a refund", href: "/contact" },
  ];

  const legalLinks = [
    { name: "Privacy Policy", href: "/privacy-policy" },
    { name: "Terms of Use", href: "/terms-of-use" },
    { name: "Purchase Terms", href: "/purchase-terms" },
    { name: "Organizer Agreement", href: "/organizer-agreement" },
    { name: "Cookie Settings", href: "/cookie-settings" },
  ];

  return (
    <footer className="py-12 md:py-16 bg-surface text-white-70">
      <div className="max-w-[800px] mx-auto px-4">
        <div className="mb-8">
          <span className="text-white-100 text-xl font-poppins-semibold tracking-wider">
            FLAME
          </span>
        </div>
        <hr className="border-0 h-px bg-white-30 mb-8" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <div className="flex flex-col gap-4">
            <h3 className="text-white-70 text-sm font-poppins-medium uppercase tracking-wider m-0">
              Our Company
            </h3>
            <ul className="list-none p-0 m-0 flex flex-col gap-3">
              {companyLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-white-50 hover:text-white-100 transition-colors text-sm"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-white-70 text-sm font-poppins-medium uppercase tracking-wider m-0">
              Fan Support
            </h3>
            <ul className="list-none p-0 m-0 flex flex-col gap-3">
              {supportLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-white-50 hover:text-white-100 transition-colors text-sm"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mb-8">
          <p className="m-0 mb-2">
            <a
              href="tel:+59342510906"
              className="text-white-50 hover:text-white-100 transition-colors text-sm font-poppins-medium"
            >
              +593 (04) 2510 9060
            </a>
          </p>
          <p className="m-0 mb-4">
            <a
              href="mailto:support@flme.co"
              className="text-white-50 hover:text-white-100 transition-colors text-sm font-poppins-medium"
            >
              support@flme.co
            </a>
          </p>
          <div className="flex gap-4">
            <a
              href="https://instagram.com/flame__app"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="FLAME on Instagram"
              className="text-white-50 hover:text-white-100 transition-colors"
            >
              <SiInstagram size={24} />
            </a>
          </div>
        </div>

        <div className="pt-8 border-t border-white-30 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <span className="text-white-50 text-sm font-poppins-medium">
            © {new Date().getFullYear()} FLAME LLC. All rights reserved.
          </span>
          <div className="flex flex-wrap gap-4 md:gap-6">
            {legalLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="text-white-50 hover:text-white-100 transition-colors text-sm"
              >
                {link.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
