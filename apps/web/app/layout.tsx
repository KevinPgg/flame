import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next"
import QueryProvider from "./lib/providers/QueryProvider";
import { MemberRoleProvider } from "./contexts/MemberRoleContext";
import {
  generateMetadata as generateSEOMetadata,
  organizationSchema,
} from "./lib/seo-config";
import "./globals.css";

const poppins = Poppins({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = generateSEOMetadata({});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="es">
        <head>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(organizationSchema),
            }}
          />
        </head>
        <body
          className={`${poppins.className} bg-background text-white-100 font-poppins antialiased`}
          suppressHydrationWarning
        >
          <QueryProvider>
            <MemberRoleProvider>{children}</MemberRoleProvider>
          </QueryProvider>
          <Analytics />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
