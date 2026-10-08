import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is missing. Please set it in your environment variables.');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  // Pin to the same API version the Stripe iOS SDK (25.x / stripe-react-native 0.58) uses for
  // POST /v1/payment_intents/{id}/confirm. Mismatching server-create vs client-confirm API versions
  // causes Stripe to return a generic 500 on live-mode PIs. The `as` cast is the stripe-node
  // documented pattern for pinning to a specific version when LatestApiVersion doesn't match.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiVersion: '2020-08-27' as any,
  typescript: true,
  appInfo: {
    name: 'Project Flame',
    version: '0.1.0',
  },
});

