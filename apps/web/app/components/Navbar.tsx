"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { FiMenu, FiX } from "react-icons/fi";
import { SiInstagram, SiX } from "react-icons/si";
import {
  IoPersonCircleOutline,
  IoLogoWhatsapp,
  IoSettingsOutline,
} from "react-icons/io5";
import { useUser, SignInButton, UserButton } from "@clerk/nextjs";

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isSignedIn, isLoaded } = useUser();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Preserve query parameters (like promoter codes) in sign-in redirects
  // Handle SSR safely by checking if searchParams is available
  const fullUrl = searchParams?.toString()
    ? `${pathname}?${searchParams.toString()}`
    : pathname;

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const navLinks = [{ name: "DISCOVER", href: "/discover" }];

  const signedInLinks = [
    { name: "MY TICKETS", href: "/account" },
    { name: "PROFILE", href: "/profile" },
  ];

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/90 border-b border-white-20">
        <div className="max-w-[800px] mx-auto px-4">
          <nav className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center">
              <img
                src="/flame-logo-white.svg"
                alt="Flame"
                className="h-5 w-auto"
              />
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex md:items-center md:gap-8">
              {navLinks.map(link => (
                <Link
                  key={link.name}
                  href={link.href}
                  className="text-white-50 hover:text-white-100 font-poppins-medium text-sm tracking-widest uppercase transition-colors"
                >
                  {link.name}
                </Link>
              ))}

              {isLoaded && isSignedIn &&
                signedInLinks.map(link => (
                  <Link
                    key={link.name}
                    href={link.href}
                    className="text-white-50 hover:text-white-100 font-poppins-medium text-sm tracking-widest uppercase transition-colors"
                  >
                    {link.name}
                  </Link>
                ))}

              {/* Auth Section */}
              <div className="flex items-center gap-4">
                {!isLoaded ? (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 border-2 border-white-30 border-t-white-100 rounded-full animate-spin" />
                  </div>
                ) : isSignedIn ? (
                  <div className="flex items-center gap-4">
                    <UserButton
                      appearance={{
                        elements: {
                          avatarBox: "w-8 h-8 rounded-full",
                          userButtonPopoverCard:
                            "bg-white border border-neutral-300 shadow-lg",
                          userButtonPopoverActionButton: "hover:bg-neutral-100",
                        },
                      }}
                    />
                    <Link
                      href="/account?tab=settings"
                      aria-label="Settings"
                      className="bg-white-5 hover:bg-white-10 rounded-full size-8 flex items-center justify-center transition-colors"
                    >
                      <IoSettingsOutline size={20} className="text-white-100" />
                    </Link>
                  </div>
                ) : (
                  <SignInButton
                    mode="modal"
                    forceRedirectUrl={fullUrl}
                    signUpForceRedirectUrl={fullUrl}
                  >
                    <button className="text-white-50 hover:text-white-100 font-poppins-medium text-sm tracking-widest uppercase transition-colors flex items-center gap-2">
                      <IoPersonCircleOutline size={20} />
                      LOGIN
                    </button>
                  </SignInButton>
                )}
              </div>
            </div>

            {/* Mobile Hamburger */}
            <button
              className="text-white-100 md:hidden p-2 flex items-center justify-center bg-transparent border-none cursor-pointer"
              onClick={toggleMenu}
              aria-label="Toggle menu"
            >
              <FiMenu size={24} />
            </button>
          </nav>
        </div>
      </header>

      {/* Mobile Menu Modal */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/50 z-200"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                type: "spring",
                duration: 0.35,
                bounce: 0,
              }}
              onClick={toggleMenu}
            />

            {/* Menu Panel */}
            <motion.div
              className="fixed inset-y-0 right-0 w-80 bg-background border-l border-white-20 z-300 overflow-y-auto"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{
                type: "spring",
                duration: 0.35,
                bounce: 0,
              }}
            >
              <div className="p-8 h-full flex flex-col">
                {/* Close Button */}
                <button
                  className="absolute top-6 right-6 bg-transparent border-none text-white-100 cursor-pointer p-2 flex items-center justify-center"
                  onClick={toggleMenu}
                  aria-label="Close menu"
                >
                  <FiX size={24} />
                </button>

                {/* Brand */}
                <div className="mt-8 mb-12">
                  <img
                    src="/flame-logo-white.svg"
                    alt="Flame"
                    className="h-6 w-auto"
                  />
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 flex flex-col gap-4">

                  {navLinks.map(link => (
                    <Link
                      key={link.name}
                      href={link.href}
                      className="text-white-100 font-poppins-semibold text-3xl py-4 border-b border-white-10 block hover:text-white-80 transition-colors"
                      onClick={toggleMenu}
                    >
                      {link.name}
                    </Link>
                  ))}

                  {/* Mobile Auth Section */}
                  {!isLoaded ? (
                    <div className="text-white-100 font-poppins-semibold text-3xl py-4 border-b border-white-10 flex items-center justify-center">
                      <div className="w-9 h-9 border-2 border-white-30 border-t-white-100 rounded-full animate-spin" />
                    </div>
                  ) : isSignedIn ? (
                    <>
                      {signedInLinks.map(link => (
                        <Link
                          key={link.name}
                          href={link.href}
                          className="text-white-100 font-poppins-semibold text-3xl py-4 border-b border-white-10 block hover:text-white-80 transition-colors"
                          onClick={toggleMenu}
                        >
                          {link.name}
                        </Link>
                      ))}
                      <div className="flex items-center justify-center py-6 mt-2">
                        <UserButton
                          appearance={{
                            elements: {
                              avatarBox: "w-10 h-10 rounded-full",
                              userButtonPopoverCard:
                                "bg-white border border-neutral-300 shadow-lg",
                            },
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <SignInButton
                      mode="modal"
                      forceRedirectUrl={fullUrl}
                      signUpForceRedirectUrl={fullUrl}
                    >
                      <button
                        className="text-white-100 font-poppins-semibold text-3xl py-4 border-b border-white-10 w-full text-left hover:text-white-80 transition-colors flex items-center justify-between"
                        onClick={toggleMenu}
                      >
                        LOGIN
                        <IoPersonCircleOutline size={34} />
                      </button>
                    </SignInButton>
                  )}
                </nav>

                {/* Contact Info */}
                <div className="mt-auto pt-8">
                  <div className="w-full h-px bg-white-20 mb-8" />
                  <div className="flex gap-6 mb-8">
                    <a href="https://wa.me/593042510906" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="text-white-100 hover:text-white-80 transition-colors">
                      <IoLogoWhatsapp size={24} />
                    </a>
                    <a href="https://instagram.com/flame__app" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-white-100 hover:text-white-80 transition-colors">
                      <SiInstagram size={24} />
                    </a>
                    <a href="https://x.com/flame_ec" target="_blank" rel="noopener noreferrer" aria-label="Flame on X" className="text-white-100 hover:text-white-80 transition-colors">
                      <SiX size={24} />
                    </a>
                  </div>
                  <div className="mb-8">
                    <p className="my-2 text-base font-poppins-medium text-white-100">
                      <a href="tel:+59342510906" className="hover:text-primary transition-colors">+593 (04) 2510 9060</a>
                    </p>
                    <p className="my-2 text-base font-poppins-medium text-white-100">
                      <a href="mailto:support@flme.co" className="hover:text-primary transition-colors">support@flme.co</a>
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
