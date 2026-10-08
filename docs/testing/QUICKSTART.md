# Quick Start - Run Tests in 2 Minutes

## 🚀 Fastest Path to Running Tests

### 1. Install Vitest (Recommended)

```bash
pnpm add -D vitest @vitest/ui
```

### 2. Create Config File

Create `vitest.config.ts` in your project root:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./app"),
    },
  },
});
```

### 3. Add Test Scripts to package.json

Add these lines to your `"scripts"` section:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:ui": "vitest --ui"
  }
}
```

### 4. Run Tests!

```bash
pnpm test
```

That's it! ✅

---

## 🎯 What You'll See

```
✓ __tests__/purchase-flow.test.ts (58)
✓ __tests__/purchase-page.integration.test.tsx (19)
✓ __tests__/qr-scanner.integration.test.tsx (15)
✓ __tests__/api/purchase/create-payment-intent.test.ts (15)
✓ __tests__/api/webhooks/stripe.test.ts (23)
✓ __tests__/stripe-fees.test.ts (13)
... and more

Test Files  17 passed | 5 skipped (22)
     Tests  377 passed | 77 skipped (454)
  Duration  21.17s
```

**Note:** 77 tests are skipped because they require a Supabase development branch (not production).

---

## 🔍 Test Commands Cheat Sheet

```bash
# Watch mode (auto-rerun on changes)
pnpm test

# Run once and exit
pnpm test:run

# Visual UI (best for debugging)
pnpm test:ui

# Run specific test file
pnpm vitest __tests__/ticket-stages.test.ts

# Run tests matching pattern
pnpm vitest -t "Stage Transition"

# Show coverage
pnpm vitest run --coverage
```

---

## 🎨 UI Mode (Highly Recommended!)

The UI mode provides a visual interface for running and debugging tests:

```bash
pnpm test:ui
```

Then open `http://localhost:51204/__vitest__/` in your browser.

**Features:**

- ✅ See all tests in a tree view
- ✅ Click to run individual tests
- ✅ View test output and errors
- ✅ See code coverage highlights
- ✅ Debug with breakpoints

---

## 🐛 Common Issues & Fixes

### Issue: "vitest not found"

```bash
# Make sure it's installed
pnpm add -D vitest
```

### Issue: "Cannot find module"

```bash
# Install missing types
pnpm add -D @types/node
```

### Issue: Tests not found

```bash
# Check your test file is in __tests__ directory
# and ends with .test.ts
```

---

## 📚 Next Steps

1. ✅ Run the tests to verify everything works
2. 📖 Read `__tests__/README.md` for detailed docs
3. 🧪 Add your own tests using existing patterns
4. 🚀 Set up CI/CD to run tests automatically

---

## 💡 Pro Tips

**Watch Mode is Your Friend**

- Leave `pnpm test` running while coding
- Tests automatically re-run when you save
- Instant feedback on changes

**Use `.only()` for Focused Testing**

```typescript
it.only("should test this one thing", () => {
  // Only this test will run
});
```

**Use `.skip()` to Temporarily Disable**

```typescript
it.skip("should test this later", () => {
  // This test will be skipped
});
```

---

## 🎯 What These Tests Verify

✅ **Purchase Flow** - Stage pricing, promo codes, free tickets  
✅ **Payment Processing** - PaymentIntent creation, Stripe webhooks  
✅ **Component Integration** - Purchase page, QR scanner rendering  
✅ **API Routes** - Payment endpoints, webhook handlers  
✅ **Stage Transitions** - Early Bird → Regular → Last Chance  
✅ **Edge Cases** - Invalid inputs, error conditions, retries

Total: **377 tests** passing (77 more require Supabase dev branch)

---

## ❓ Questions?

Check the full documentation in `__tests__/README.md` or review the test file itself - it's heavily commented with examples.

Happy testing! 🎉
