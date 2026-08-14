import { assertPaymentMethod, DEFAULT_PAYMENT_METHOD } from "../utils/paymentMethod.js";

interface CreatePremiumOrderRequest {
  username: string;
  duration?: number;
  auth_key: string;
  show_sender?: boolean;
  custom_order_info?: string | null;
  payment_method?: string;
  idempotency_key?: string | null;
}

export function createPremiumOrder(
  this: any,
  username: string,
  duration = 3,
  authKey?: string,
  showSender = false,
  custom_order_info: string | null = null,
  payment_method: string = DEFAULT_PAYMENT_METHOD,
  idempotency_key: string | null = null
) {
  const req: CreatePremiumOrderRequest = {
    username,
    duration,
    auth_key: this.getAuthKey(authKey),
    show_sender: showSender,
    custom_order_info,
    payment_method: assertPaymentMethod(payment_method),
    idempotency_key,
  };
  return this.post("/v2/buyPremium/create", req);
}
