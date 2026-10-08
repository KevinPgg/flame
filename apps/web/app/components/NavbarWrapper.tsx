"use client";

import { Suspense } from "react";
import Navbar from "./Navbar";

// Wrapper component to handle Suspense boundary for useSearchParams in Navbar
export default function NavbarWrapper() {
  return (
    <Suspense fallback={<div className="fixed top-0 left-0 right-0 z-50 h-16 bg-background/90 border-b border-white-20 backdrop-blur-md" />}>
      <Navbar />
    </Suspense>
  );
}
