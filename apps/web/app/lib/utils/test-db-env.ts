/**
 * Test Database Environment Validation
 * 
 * Shared utility for validating that database operations are being performed
 * against a test/dev database, not production. Used by both test utilities
 * and cleanup scripts to prevent accidental production data deletion.
 * 
 * This is a safety-critical function - any changes to allowed indicators
 * should be carefully reviewed and applied consistently.
 */

/**
 * Validate that we're running against a test/dev database, not production
 * 
 * @param supabaseUrl - The Supabase project URL to validate
 * @returns true if the URL appears to be a test/dev environment
 */
export function validateTestEnvironment(supabaseUrl: string): boolean {
  // Allow override for emergency situations (with explicit confirmation)
  if (process.env.TEST_DATABASE_CONFIRMED === "true") {
    console.warn("⚠️  WARNING: TEST_DATABASE_CONFIRMED override is active!");
    console.warn("   Proceeding without environment validation.");
    return true;
  }

  const lowerUrl = supabaseUrl.toLowerCase();

  // Local development is always safe
  if (lowerUrl.includes("localhost") || lowerUrl.includes("127.0.0.1")) {
    return true;
  }

  // For Supabase-hosted projects, require explicit test/dev indicators in the project ref
  const testIndicators = [
    "-test",
    "-dev",
    "-staging",
    "-sandbox",
    "-qa",
    "-local",
    "test-",
    "dev-",
    "staging-",
    "sandbox-",
    "qa-",
    "local-",
    "_test",
    "_dev",
    "_staging",
    "_sandbox",
    "_qa",
    "_local",
  ];

  const hasTestIndicator = testIndicators.some((indicator) =>
    lowerUrl.includes(indicator)
  );

  if (!hasTestIndicator) {
    console.error(
      "❌ SAFETY CHECK FAILED: Supabase URL does not appear to be a test environment"
    );
    console.error(`   URL: ${supabaseUrl}`);
    console.error(
      "   For Supabase projects, the project ref must contain a test indicator:"
    );
    console.error(`   ${testIndicators.join(", ")}`);
    console.error(
      "   Example: myproject-test.supabase.co or test-myproject.supabase.co"
    );
    console.error("");
    console.error(
      "   To run against this database anyway, set TEST_DATABASE_CONFIRMED=true"
    );
    console.error(
      "   ⚠️  WARNING: Only use this override if you're certain this is not production!"
    );
    return false;
  }

  return true;
}

