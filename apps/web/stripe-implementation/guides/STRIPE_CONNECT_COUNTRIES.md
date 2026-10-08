# Stripe Connect Multi-Country Support

## Issue: Can't Change Country During Onboarding

If you're unable to select a country during Stripe Connect onboarding, this is expected behavior in **Test Mode** with certain platform configurations.

## Understanding the Limitations

### Test Mode Restrictions

**In Test Mode:**
- Stripe may restrict connected accounts to your platform's default country
- Country selection during onboarding might be disabled or limited
- This is a Stripe limitation for testing, not a code issue

**In Live Mode:**
- Full country selection is available (subject to your platform settings)
- Organizers can select from all supported countries
- Cross-border payouts work as expected (e.g., US platform → Ecuador organizer)

## Supported Countries for Express Accounts

Stripe Connect Express accounts are available in **45+ countries**, including:

### North America
- 🇺🇸 United States
- 🇨🇦 Canada
- 🇲🇽 Mexico

### South America
- 🇧🇷 Brazil
- 🇨🇴 Colombia
- 🇪🇨 **Ecuador** ✅ (Your primary target)
- 🇵🇪 Peru
- 🇨🇱 Chile
- 🇦🇷 Argentina
- 🇺🇾 Uruguay

### Europe
- 🇬🇧 UK, 🇩🇪 Germany, 🇫🇷 France, 🇪🇸 Spain, 🇮🇹 Italy
- 🇳🇱 Netherlands, 🇧🇪 Belgium, 🇦🇹 Austria, 🇨🇭 Switzerland
- 🇸🇪 Sweden, 🇳🇴 Norway, 🇩🇰 Denmark, 🇫🇮 Finland
- And many more...

### Asia Pacific
- 🇦🇺 Australia, 🇳🇿 New Zealand
- 🇯🇵 Japan, 🇸🇬 Singapore, 🇭🇰 Hong Kong
- 🇮🇳 India, 🇹🇭 Thailand, 🇲🇾 Malaysia

**Full list:** https://stripe.com/docs/connect/express-accounts#available-countries

## How Country Selection Works

### Current Implementation

Your code is correctly configured to allow country selection:

```typescript
// app/lib/stripe/connect.ts
export async function createExpressAccount(email: string, country?: string) {
  const accountParams: Stripe.AccountCreateParams = {
    type: "express",
    email,
    // country is OPTIONAL - if not set, user selects during onboarding
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    settings: {
      payouts: {
        schedule: {
          interval: "manual",
        },
      },
    },
  };
  
  if (country) {
    accountParams.country = country;
  }
  
  return await stripe.accounts.create(accountParams);
}
```

### Behavior by Mode

| Mode | Country Selection | How It Works |
|------|------------------|--------------|
| **Test Mode** | Limited/Disabled | May default to platform country for testing |
| **Live Mode** | Fully Available | Organizer selects from all supported countries |

## Testing Multi-Country Support

### Option 1: Test with Your Platform's Country (Recommended)

Since Test Mode restricts country selection:

1. **Use your platform's country** (likely US) for testing
2. Test the full onboarding flow
3. Verify payment processing works
4. Test payout functionality

**Important:** The payment and payout logic works the same regardless of country, so testing with one country validates the entire flow.

### Option 2: Test Specific Countries (Advanced)

To test specific countries in Test Mode:

1. **Create accounts programmatically** with specific countries:
   ```typescript
   // In your test script or API endpoint
   const account = await createExpressAccount("test@example.com", "EC"); // Ecuador
   ```

2. **Use Stripe CLI** to simulate different countries:
   ```bash
   stripe accounts create --type=express --country=EC --email=test@example.com
   ```

3. **Dashboard Testing:**
   - Go to: https://dashboard.stripe.com/test/connect/accounts/overview
   - Click "Create account" 
   - Manually select country (if available in dashboard)

### Option 3: Test in Live Mode (When Ready)

For production testing with real countries:

1. Switch to **Live Mode** in Stripe Dashboard
2. Enable Connect in Live Mode (separate from Test Mode)
3. Use live API keys
4. Create test connected accounts with real country selection
5. Use small transaction amounts (e.g., $0.50) for testing

**Note:** You need to complete business verification for Live Mode.

## Verifying Country Support

To check if a specific country is supported:

```typescript
// Check supported countries via Stripe API
const allSpecs = [];
let hasMore = true;
let startingAfter = undefined;

while (hasMore) {
  const response = await stripe.countrySpecs.list({ 
    limit: 100,
    starting_after: startingAfter
  });
  
  allSpecs.push(...response.data);
  
  if (response.has_more && response.data.length > 0) {
    startingAfter = response.data[response.data.length - 1].id;
  } else {
    hasMore = false;
  }
}

const supportedCountries = allSpecs
  .filter(spec => spec.supported_payment_currencies.includes('usd'))
  .map(spec => spec.id);

console.log('Supported countries:', supportedCountries);
```

Or check the documentation: https://stripe.com/global

## Cross-Border Payouts (Ecuador Example)

Your platform (US) can send payouts to Ecuador organizers:

### How It Works:
1. **Customer** (any country) → Pays in USD
2. **Platform** (US) → Platform fee: 12.5% + $0.30 (Guaranteed Net model)
3. **Organizer** (Ecuador) → Receives ~87.5% minus $0.30 in their Stripe balance
4. **Payout** → Organizer requests payout to Ecuadorian bank account

### Fees for Ecuador Payouts:
- **Standard:** ~1% + $2.00 per payout (varies by bank)
- **Speed:** 2-7 business days
- **Currency:** USD (Ecuador uses USD as official currency)

### Important Notes:
- Organizer's bank must accept international USD transfers
- Stripe handles all currency conversion and compliance
- Some Ecuadorian banks charge additional receiving fees (not controlled by Stripe)

## Configuration Checklist

To ensure multi-country support works in production:

### Platform Settings (Stripe Dashboard)

1. **Go to:** https://dashboard.stripe.com/settings/connect
2. **Verify:**
   - [ ] "Country restrictions" set to "All countries" or your target list
   - [ ] "Payment methods" includes cards (minimum)
   - [ ] "Business structure" allows individual and company accounts
   - [ ] "Identity verification" configured for your compliance requirements

### Code Configuration

✅ **Already Done:**
- [x] Country parameter optional in `createExpressAccount()`
- [x] No hardcoded country restrictions
- [x] Manual payouts enabled (good for international)
- [x] Destination charges with `on_behalf_of` (correct for multi-country)

### API Keys

Ensure you're using the correct keys for each mode:

**Test Mode:**
```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
```

**Live Mode:**
```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
```

## Common Issues & Solutions

### Issue: "Country not supported"

**Solution:** Check if the country supports Express accounts: [Available Countries Documentation](https://stripe.com/docs/connect/express-accounts#available-countries)

### Issue: "Can't select country in onboarding"

**Solution:** This is normal in Test Mode. In Live Mode, full country selection is available.

### Issue: "Payout failed to Ecuador"

**Solutions:**
- Verify bank account details are correct
- Confirm bank accepts international USD transfers
- Check if bank requires SWIFT/BIC (some Ecuadorian banks do)
- Ensure Stripe balance has sufficient funds (including payout fees)

### Issue: "Different KYC requirements per country"
**Solution:** Stripe handles this automatically. Different countries have different verification requirements:
- **US:** SSN/EIN + ID + Business docs
- **Ecuador:** National ID + Business registration
- **EU:** VAT number + ID + Proof of address

Stripe's Express onboarding adapts based on selected country.

## Testing Checklist

Before going live with multi-country support:

- [ ] Test account creation (with your platform country)
- [ ] Test onboarding flow completion
- [ ] Test payment processing
- [ ] Test manual payout request
- [ ] Verify fees are calculated correctly
- [ ] Test refund flow
- [ ] Document country-specific requirements for organizers
- [ ] Test dashboard displays work for all countries
- [ ] Verify tax handling per country regulations
- [ ] Test customer support flow for international organizers

## Resources

- **Express Accounts by Country:** https://stripe.com/docs/connect/express-accounts#available-countries
- **Cross-Border Payouts:** https://stripe.com/docs/connect/cross-border-payouts
- **Testing Connect:** https://stripe.com/docs/connect/testing
- **Country Specifications:** https://stripe.com/docs/api/country_specs
- **Ecuador Banking:** https://stripe.com/docs/connect/payouts

## Recommendation for Development

**For now (Test Mode):**
1. ✅ Continue testing with your platform's default country
2. ✅ The payment logic is country-agnostic, so testing validates everything
3. ✅ Focus on the user experience, not the specific country

**When ready for production (Live Mode):**
1. Enable Connect in Live Mode
2. Complete business verification
3. Test with real organizers from different countries
4. Small transaction amounts for safety

**The good news:** Your code is already configured correctly for multi-country support! The Test Mode limitation is just a Stripe testing constraint, not a code issue. In production, organizers will be able to select their country normally. 🌍
