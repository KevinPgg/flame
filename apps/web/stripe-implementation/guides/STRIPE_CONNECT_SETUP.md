# Stripe Connect Setup Guide

## Issue
When trying to connect Stripe as an organizer, you're getting a 500 error because **Stripe Connect is not enabled on your Stripe account**.

## Error Message
```text
You can only create new accounts if you've signed up for Connect
```

## Solution

### 1. Enable Stripe Connect
1. Go to your **Stripe Dashboard**: https://dashboard.stripe.com
2. Navigate to **Settings** → **Connect** → **Overview**
3. Click **"Get Started with Connect"** or **"Enable Connect"**
4. Follow the setup wizard to enable Stripe Connect for your account

### 2. Understand the Platform Types
Stripe Connect offers different integration types:

- **Standard Accounts**: Users manage their own Stripe accounts (full control)
- **Express Accounts**: Simplified onboarding with Stripe-hosted forms (recommended for most platforms)
- **Custom Accounts**: Complete control over the user experience (most complex)

**Our app uses Express Accounts**, which provides a good balance between ease of use and functionality.

### 3. Configure Your Platform Settings
After enabling Connect:

1. Set your **platform name** (e.g., "Project Flame", "Your Event Platform")
2. Configure **branding** (logo, colors) - this will appear during organizer onboarding
3. Set up **notification preferences** for connected accounts
4. Review and accept Stripe's Connect Terms of Service

### 4. Test Mode vs Live Mode
- **Test Mode**: Use test API keys for development
  - Enable Connect in test mode first
  - Create test connected accounts
  - No real money is processed
  
- **Live Mode**: Use live API keys for production
  - Must enable Connect separately in live mode
  - Requires business verification
  - Real payments are processed

### 5. Verify Your Setup
After enabling Connect, verify your API keys:

**Test Mode Keys** (for development):
- Located at: https://dashboard.stripe.com/test/apikeys
- Should start with `pk_test_` and `sk_test_`

**Live Mode Keys** (for production):
- Located at: https://dashboard.stripe.com/apikeys
- Should start with `pk_live_` and `sk_live_`

### 6. Update Environment Variables
Ensure your `.env.local` has the correct Stripe keys:

```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
```

## Important Notes

### Platform Fees
With Stripe Connect, you can collect **application fees** from transactions:
- **Pricing Model:** "Guaranteed Net" model
- **Fee Structure:** 12.5% + $0.30 per transaction
- Fees are automatically transferred to your platform account
- Organizers receive payouts minus this fee (Guaranteed Net amount)
- See `PRICING_MODEL_ANALYSIS.md` for detailed calculations

### Payouts
Our app is configured for **manual payouts**:
- Organizers control when they receive funds
- Reduces risk of chargebacks affecting payouts
- Organizers can withdraw funds through their Stripe dashboard

### Compliance
As a platform using Stripe Connect:
- You're responsible for your platform's compliance (KYC, AML)
- Stripe handles compliance for connected accounts
- Express accounts have streamlined onboarding requirements

## Testing the Integration

### 1. Enable Connect in Test Mode
1. Switch to Test Mode in your Stripe Dashboard (toggle in top-left)
2. Enable Connect: Settings → Connect → Get Started
3. Complete the test mode setup

### 2. Test the Connection Flow
1. In your app, go to the organizer dashboard
2. Click "Connect with Stripe"
3. You should now see the Stripe Connect onboarding form
4. Fill out with test information
5. Complete the flow

### 3. Test Connected Account
After connecting, verify:
- Account shows as "Connected" in your dashboard
- You can create events with ticket tiers
- Test purchases work correctly
- Connected account appears in Stripe Dashboard → Connect → Accounts

## Resources

- **Stripe Connect Documentation**: https://stripe.com/docs/connect
- **Express Accounts Guide**: https://stripe.com/docs/connect/express-accounts
- **Testing Connect**: https://stripe.com/docs/connect/testing
- **Platform Fees**: https://stripe.com/docs/connect/charges#collecting-fees
- **Stripe Dashboard**: https://dashboard.stripe.com

## Common Issues

### "Connect not available"
- Solution: Your Stripe account may need additional verification
- Contact Stripe support to enable Connect for your account

### "Invalid API Key"
- Solution: Ensure you're using keys from the correct mode (test vs live)
- Verify keys are copied correctly without extra spaces

### "Account already exists"
- Solution: Check if the connected account already exists in Stripe Dashboard
- Delete the test account or use a different email

## Next Steps

Once Stripe Connect is enabled:
1. ✅ The error should be resolved
2. ✅ Organizers can connect their Stripe accounts
3. ✅ Events can accept payments through connected accounts
4. ✅ Platform fees are automatically collected
5. ✅ Organizers can manage payouts through their Stripe dashboard
