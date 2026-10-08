"use client";

import { useState, FormEvent } from "react";
export default function MaintenancePage() {
  const [showTestingInput, setShowTestingInput] = useState(false);
  const [testingCode, setTestingCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleTestingSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!testingCode.trim()) {
      setError("Please enter an access code");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/verify-testing-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: testingCode }),
      });

      if (response.ok) {
        // Reload to let middleware redirect to home
        window.location.href = "/";
      } else {
        setError("Invalid access code");
      }
    } catch (_err) {
      setError("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen max-h-screen items-center justify-center bg-background px-4">
      <div className="flex max-w-[600px] flex-col items-center text-center">
        {/* FLAME Logo */}
        <img
          src="/flame-logo-white.svg"
          alt="FLAME"
          className="h-12 w-auto"
        />
        <div className="my-6 h-0.5 w-38 bg-primary" aria-hidden />

        {/* Maintenance Message */}
        <p className="max-w-[600px] text-center text-base leading-[22px] text-white-80">
          We&apos;ll be announcing our new
          features in no time. Stay tuned{" "}
          <a
            href="https://www.instagram.com/flame__app/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white-100 underline hover:opacity-80 transition-opacity"
          >
            @flame__app
          </a>
        </p>

        {/* Account Management commented out until we need it*/}
        {/* <p
          style={{
            marginTop: "calc(var(--gap) * 1.5)",
            marginBottom: "calc(var(--gap) * 0.75)",
            fontSize: "0.875em",
          }}
        >
          If you need to manage your account click below.
        </p>
        <Link href="/organizer" className="btn is--primary">
          Go to Dashboard
        </Link> */}

        {/* User Testing Access enabled again */}
        <div className="mt-8">
          {!showTestingInput ? (
            <button
              onClick={() => setShowTestingInput(true)}
              className="bg-transparent border-none text-white-50 text-xs underline cursor-pointer"
            >
              User testing Access
            </button>
          ) : (
            <form
              onSubmit={handleTestingSubmit}
              className="flex flex-col items-center gap-2"
            >
              <label htmlFor="testing-code-input" className="sr-only">
                Access Code
              </label>
              <input
                id="testing-code-input"
                type="password"
                value={testingCode}
                onChange={e => setTestingCode(e.target.value)}
                placeholder="Enter access code"
                className="px-2 py-2 rounded border border-white-30 bg-transparent text-white-100 text-sm placeholder:text-white-50 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="text-xs px-3 py-1 rounded bg-white-100 text-dark font-poppins-medium disabled:opacity-50"
              >
                {isLoading ? "Verifying..." : "Enter"}
              </button>
              {error && (
                <p role="alert" className="text-red-400 text-xs">
                  {error}
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
