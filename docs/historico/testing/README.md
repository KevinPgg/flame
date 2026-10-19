# Testing Documentation

This folder contains all testing-related documentation, test suites, and testing guides.

## Getting Started

- **[TESTING_GUIDE.md](./TESTING_GUIDE.md)** - Comprehensive testing guide
- **[QUICKSTART.md](./QUICKSTART.md)** - Quick start guide for testing
- **[QUICK_START_ENV.md](./QUICK_START_ENV.md)** - Environment setup for testing
- **[TEST_ENV_SETUP.md](./TEST_ENV_SETUP.md)** - Detailed test environment setup

## Test Suites

### Availability & Stage Tests
- **AVAILABILITY_TEST_SUITE.md** - Availability testing suite
- **STAGE_AVAILABILITY_TESTS_README.md** - Stage availability tests

### Pricing & Payment Tests
- **PRICING_TEST_COVERAGE.md** - Pricing test coverage
- **PURCHASE_FLOW_TESTS.md** - Purchase flow tests

### Promoter & Tracking Tests
- **PROMOTER_QUICK_TEST.md** - Quick promoter tests
- **PROMOTER_TRACKING_TESTS.md** - Promoter tracking test suite

### QR Code Tests
- **QR_CODE_TEST_GAP_ANALYSIS.md** - QR code test gap analysis

### Security Tests
- **SECURITY_FEATURES_SPECIFICATION.md** - Security features spec

## Cross-Platform Testing

- **MOBILE_WEB_TESTING_AUDIT.md** - Complete mobile vs web testing audit with parity checklists and manual QA matrices (Logic Porting Protocol, Web Parity Gate)

## Coverage & Verification

- **COVERAGE_VERIFICATION.md** - Test coverage verification
- **INTEGRATION_TEST_COVERAGE_REVIEW.md** - Integration test coverage review

## Running Tests

```bash
# Run all tests (see current pass/skip counts in output)
pnpm test:run

# Watch mode - auto-reruns on changes
pnpm test

# Run specific test file
pnpm test:run path/to/test.test.ts

# Run database integration tests (requires Supabase dev branch)
pnpm test:integration

# Visual UI mode
pnpm test:ui
```

**Current Status:** Run all tests to see current pass/skip counts. Database tests are skipped without dev branch.

## See Also

- [Security Documentation](../security/) - Security testing guides
- [Guides Documentation](../guides/) - General development guides
- [Cursor Rules - Testing Section](../../.cursor/rules/nextjs-typescript.mdc) - AI-assisted testing patterns and mocking examples (auto-loaded when editing TS/TSX files)
