import FragmentAPIError from "../FragmentAPIError.js";

/**
 * Settlement currencies accepted by the create-order endpoints.
 * "ton" pays Fragment in native TON, "usdt_ton" pays in USDT jettons on TON.
 */
export const PAYMENT_METHODS = ["ton", "usdt_ton"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const DEFAULT_PAYMENT_METHOD: PaymentMethod = "ton";

/**
 * Validated client-side so a typo fails before the API creates an order row —
 * a rejected create still burns a Fragment search round-trip otherwise.
 */
export function assertPaymentMethod(paymentMethod: string): PaymentMethod {
  const normalized = String(paymentMethod ?? "").toLowerCase() as PaymentMethod;
  if (!PAYMENT_METHODS.includes(normalized)) {
    throw new FragmentAPIError(
      `Invalid payment_method "${paymentMethod}" (allowed: ${PAYMENT_METHODS.join(", ")}).`
    );
  }
  return normalized;
}
