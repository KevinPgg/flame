"use client";

import Link from "next/link";
import { FiAlertTriangle } from "react-icons/fi";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  void error;
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="w-full border-b border-white-10 py-4 px-4">
        <div className="max-w-[800px] mx-auto px-4">
          <span className="text-white-100 text-lg font-poppins-semibold">
            Flame
          </span>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-[800px] mx-auto px-4 w-full flex justify-center">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-error/15 border border-error/30 flex items-center justify-center">
              <FiAlertTriangle size={28} className="text-error" />
            </div>
            <h1 className="text-white-100 text-xl font-poppins-semibold m-0">
              Something went wrong
            </h1>
            <p className="text-white-50 text-sm font-poppins m-0 max-w-[320px]">
              An unexpected error occurred. Please try again or go back to the
              home page.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={reset}
                className="bg-white-100 text-dark rounded-pill px-6 py-2.5 text-sm font-poppins-semibold border-none cursor-pointer hover:opacity-90 transition-opacity"
              >
                Try Again
              </button>
              <Link
                href="/"
                className="border border-white-30 text-white-100 rounded-pill px-6 py-2.5 text-sm font-poppins-semibold no-underline hover:bg-white-10 transition-colors"
              >
                Go Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
