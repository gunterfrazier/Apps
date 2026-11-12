import Stripe from "npm:stripe@16.12.0";
import { env } from "./util.ts";
export const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
export const cryptoProvider = Stripe.createSubtleCryptoProvider();
export type { Stripe };
