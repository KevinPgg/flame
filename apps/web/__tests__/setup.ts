import "@testing-library/jest-dom";
import { vi } from "vitest";
import React from "react";
import { configure } from "@testing-library/react";

// The VM/CI runs with 2 CPUs: the default 1s for findBy/waitFor made v2 tests
// (Payouts, Team...) fail at random. Waiting longer only delays real failures.
configure({ asyncUtilTimeout: 4000 });

// Mock Next.js router - will be overridden in individual tests
vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock Next.js Script component
vi.mock("next/script", () => ({
  default: ({ children, ...props }: any) => {
    return React.createElement("script", props, children);
  },
}));

// Mock Next.js Link component
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => {
    return React.createElement("a", { href, ...props }, children);
  },
}));

// Mock getBaseUrl utility
vi.mock("../app/lib/utils/url", () => ({
  getBaseUrl: () => "http://localhost:3000",
}));

// Mock window.location and window.history for navigation
Object.defineProperty(window, "location", {
  value: {
    href: "http://localhost:3000/purchase",
    pathname: "/purchase",
    search: "",
  },
  writable: true,
});

Object.defineProperty(window, "history", {
  value: {
    back: vi.fn(),
    replaceState: vi.fn(),
    pushState: vi.fn(),
  },
  writable: true,
});

// Mock sessionStorage with proper vitest mocks
const sessionStorageMock = (() => {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
  };
})();

Object.defineProperty(window, "sessionStorage", {
  value: sessionStorageMock,
  writable: true,
  configurable: true,
});

// Mock navigator.mediaDevices for camera-related tests (QR scanner)
// Augment existing mediaDevices if present, otherwise create new
if (!navigator.mediaDevices) {
  Object.defineProperty(navigator, "mediaDevices", {
    value: {},
    writable: true,
    configurable: true,
  });
}

// Add mock methods to mediaDevices
Object.assign(navigator.mediaDevices, {
  getUserMedia: vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
  }),
  enumerateDevices: vi.fn().mockResolvedValue([
    { kind: "videoinput", deviceId: "test-camera-1", label: "Test Camera" },
  ]),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
