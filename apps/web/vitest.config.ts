import { defineConfig } from "vitest/config";
import path from "path";
import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";

// Load environment variables from .env files
function loadEnvFile(filename: string): Record<string, string> {
  try {
    const envFile = readFileSync(filename, "utf-8");
    const env: Record<string, string> = {};
    envFile.split("\n").forEach(line => {
      // Skip comments and empty lines
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").trim();
          // Remove quotes if present
          env[key.trim()] = value.replace(/^["']|["']$/g, "");
        }
      }
    });
    return env;
  } catch {
    return {};
  }
}

// Load env files in priority order: process.env > .env.test > .env.local
// (process.env overrides file-based envs)
function loadTestEnv() {
  const envTest = loadEnvFile(".env.test");
  const envLocal = loadEnvFile(".env.local");

  // .env.test takes precedence over .env.local
  return {
    ...envLocal,
    ...envTest,
  };
}

export default defineConfig(({ mode }) => {
  // Load env from .env.test file
  const testEnv = loadTestEnv();

  // Also load from process.env (for CI/CD or manual export)
  // process.env has highest precedence and overrides file-based envs
  const env = {
    ...testEnv,
    ...process.env,
  };

  // Validate required environment variables
  const requiredEnvVars = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ] as const;

  // Prioritize TEST_ prefixed variables if available
  if (env.TEST_SUPABASE_URL) {
    env.NEXT_PUBLIC_SUPABASE_URL = env.TEST_SUPABASE_URL;
  }
  if (env.TEST_SUPABASE_SERVICE_ROLE_KEY) {
    env.SUPABASE_SERVICE_ROLE_KEY = env.TEST_SUPABASE_SERVICE_ROLE_KEY;
  }

  const missingVars = requiredEnvVars.filter(
    key => !env[key] || env[key].trim() === "",
  );

  // Only set the skip flag if credentials are missing and flag is not already set
  if (missingVars.length > 0 && !env.SKIP_DATABASE_TESTS) {
    const errorMessage =
      `Missing required test environment variables: ${missingVars.join(
        ", ",
      )}\n` +
      `Please ensure these are set in .env.test, .env.local, or as environment variables.`;
    console.error(`\n❌ ${errorMessage}\n`);
    console.warn(
      "⚠️ Database tests will be skipped. Other tests will continue.\n",
    );
    console.warn(
      `💡 Tests can check process.env.SKIP_DATABASE_TESTS === 'true' to conditionally skip.\n`,
    );

    // Set explicit flag to skip database tests
    env.SKIP_DATABASE_TESTS = "true";

    // Set empty values to prevent undefined errors
    missingVars.forEach(key => {
      env[key] = "";
    });
  }

  return {
    plugins: [react()],
    test: {
      globals: true,
      environment: "jsdom", // Default to jsdom for React components
      setupFiles: ["./__tests__/setup.ts"], // Setup file for testing-library
      // Unit tests (.test.ts) can override to 'node' if needed
      // Integration tests (.test.tsx) will use jsdom
      env: {
        // Use validated env vars (may be empty when SKIP_DATABASE_TESTS is true)
        NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL || "",
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY || "",
        // Optional: anon key can be empty for some tests
        NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
        // Flag to skip database tests when credentials are missing
        SKIP_DATABASE_TESTS: env.SKIP_DATABASE_TESTS || "false",
      },
      // Skip CSS module processing in tests to avoid PostCSS plugin issues
      css: {
        postcss: {
          plugins: [],
        },
        modules: {
          classNameStrategy: "non-scoped",
        },
      },
    },
    resolve: {
      alias: [
        { find: "@", replacement: path.resolve(__dirname, "./") },
        {
          find: /.*\.module\.css$/,
          replacement: path.resolve(
            __dirname,
            "./__tests__/mocks/styleMock.js",
          ),
        },
        {
          find: /\.css$/,
          replacement: path.resolve(
            __dirname,
            "./__tests__/mocks/styleMock.js",
          ),
        },
      ],
    },
  };
});
