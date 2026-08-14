import { assertPaymentMethod, DEFAULT_PAYMENT_METHOD } from "../../utils/paymentMethod.js";

interface CreateTonWithoutKYCOrderRequest {
  username: string;
  amount: number;
  auth_key: string;
  custom_order_info?: string | null;
  payment_method?: string;
}

// /v2/buyTonWithoutKYC/create does accept payment_method: the no-KYC TON gift is
// settled by the user sending USDT to the middle wallet, which then pays Fragment.
export function createTonWithoutKYCOrder(
  this: any,
  username: string,
  amount: number,
  authKey?: string,
  custom_order_info: string | null = null,
  payment_method: string = DEFAULT_PAYMENT_METHOD
) {
  const req: CreateTonWithoutKYCOrderRequest = {
    username,
    amount,
    auth_key: this.getAuthKey(authKey),
    custom_order_info,
    payment_method: assertPaymentMethod(payment_method),
  };
  return this.post("/v2/buyTonWithoutKYC/create", req);
}
