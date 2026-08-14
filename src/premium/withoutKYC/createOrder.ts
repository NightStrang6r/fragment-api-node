import { assertPaymentMethod, DEFAULT_PAYMENT_METHOD } from "../../utils/paymentMethod.js";

interface CreatePremiumWithoutKYCOrderRequest {
  username: string;
  duration?: number;
  auth_key: string;
  custom_order_info?: string | null;
  payment_method?: string;
}

export function createPremiumWithoutKYCOrder(
  this: any,
  username: string,
  duration = 3,
  authKey?: string,
  custom_order_info: string | null = null,
  payment_method: string = DEFAULT_PAYMENT_METHOD
) {
  const req: CreatePremiumWithoutKYCOrderRequest = {
    username,
    duration,
    auth_key: this.getAuthKey(authKey),
    custom_order_info,
    payment_method: assertPaymentMethod(payment_method),
  };
  return this.post("/v2/buyPremiumWithoutKYC/create", req);
}
