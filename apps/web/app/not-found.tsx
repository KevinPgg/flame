import Link from "next/link";
import { FiAlertTriangle } from "react-icons/fi";

export default function NotFound() {
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
              Page Not Found
            </h1>
            <p className="text-white-50 text-sm font-poppins m-0 max-w-[320px]">
              The page you&apos;re looking for doesn&apos;t exist or has been moved.
            </p>
            <Link
              href="/"
              className="bg-white-100 text-dark rounded-pill px-6 py-2.5 text-sm font-poppins-semibold no-underline hover:opacity-90 transition-opacity mt-2"
            >
              Go Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
