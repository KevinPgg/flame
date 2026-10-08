/**
 * Test setup for integration tests
 * npm run test:integration
 * This file runs before all integration tests and sets up the test environment.
 */

// Load environment variables for testing
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Verify required environment variables
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`Warning: ${envVar} is not set in environment`);
  }
}

// Global test utilities
global.testHelpers = {
  generateTestEmail: () => `test.${Date.now()}.${Math.random().toString(36).substring(7)}@example.com`,
  generateTestSlug: (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
};

// Add full Web Crypto API if not available (Node.js compatibility)
if (typeof global.crypto === 'undefined') {
  const { webcrypto } = require('crypto');
  (global as any).crypto = webcrypto;
}

console.log('✅ Integration test setup complete');

