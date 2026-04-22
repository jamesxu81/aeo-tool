import Stripe from 'stripe';

export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export const REPORT_PRICE_CENTS = 9900; // $99
export const REPORT_PRODUCT_NAME = 'AEO Report';
