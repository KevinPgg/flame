import QRScannerApp from "../components/QRScannerApp";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "QR Code Scanner | Flame Events",
  description: "Scan and verify event tickets",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Enable user scaling for accessibility
  userScalable: true,
};

export default function QRScannerPage() {
  // Authentication is now handled by the client-side QRScannerApp component
  // which supports both user login (organizers) and access codes (staff)
  return (
    <div className="qr-scanner-page">
      <QRScannerApp />
    </div>
  );
}
