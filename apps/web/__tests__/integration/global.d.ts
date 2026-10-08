/**
 * Global type declarations for integration tests
 */

declare global {
  var testHelpers: {
    generateTestEmail: () => string;
    generateTestSlug: (prefix: string) => string;
  };
}

export {};

