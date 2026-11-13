// The platform's own Stripe account, used for Stripe Connect (optional; see SETUP.md). Churches that connect their
// own Stripe, PayPal or Square keys don't need it.
import { env } from "./util.ts";
import { stripeApi } from "./payments.ts";
export { cryptoProvider } from "./payments.ts";
export const platformStripe = () => stripeApi(env("STRIPE_SECRET_KEY"));
