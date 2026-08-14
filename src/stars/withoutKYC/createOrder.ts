import { assertPaymentMethod, DEFAULT_PAYMENT_METHOD } from "../../utils/paymentMethod.js";

interface CreateStarsWithoutKYCOrderRequest {
  username: string;
  amount: number;
  auth_key: string;
  custom_order_info?: string | null;
  payment_method?: string;
}

export function createStarsWithoutKYCOrder(
  this: any,
  username: string,
  amount: number,
  authKey?: string,
  custom_order_info: string | null = null,
  payment_method: string = DEFAULT_PAYMENT_METHOD
) {
  const req: CreateStarsWithoutKYCOrderRequest = {
    username,
    amount,
    auth_key: this.getAuthKey(authKey),
    custom_order_info,
    payment_method: assertPaymentMethod(payment_method),
  };
  return this.post("/v2/buyStarsWithoutKYC/create", req);
}
