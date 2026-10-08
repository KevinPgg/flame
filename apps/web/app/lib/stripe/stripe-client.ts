import { loadStripe, Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null> | null = null;
let missingKeyLogged = false;

export const getStripe = (): Promise<Stripe | null> => {
  if (!stripePromise) {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    
    if (!publishableKey) {
      // Only log once to avoid spam
      if (!missingKeyLogged) {
        console.error("Stripe publishable key is not configured");
        missingKeyLogged = true;
      }
      stripePromise = Promise.resolve(null);
      return stripePromise;
    }
    
    stripePromise = loadStripe(publishableKey);
  }
  
  return stripePromise;
};

