import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import { auth } from "@clerk/nextjs/server";
import { getUserLanguage } from "./lib/user-language";
import V2Providers from "./V2Providers";
import "./v2.css";

/**
 * Flame 2.0 — web shell. Lives under /v2 while it is built, so the current screens keep
 * working untouched. At release the /v2 prefix is dropped (same paths and ?org= params as v1).
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-v2-ui",
  display: "swap",
});
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-v2-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Flame",
  robots: { index: false, follow: false },
};

export default async function V2Layout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  const language = await getUserLanguage(userId);

  return (
    // The root layout paints the v1 background/font on <body>; this layer covers it.
    <div
      className={`${inter.variable} ${interTight.variable} fixed inset-0 overflow-y-auto bg-v2-ink text-v2-cream font-v2-ui antialiased`}
      style={{ letterSpacing: "-0.005em" }}
    >
      <V2Providers language={language}>{children}</V2Providers>
    </div>
  );
}
