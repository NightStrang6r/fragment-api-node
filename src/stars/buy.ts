import FragmentAPIError from "../FragmentAPIError.js";
import { assertPaymentMethod, DEFAULT_PAYMENT_METHOD } from "../utils/paymentMethod.js";
import { settledByCreate, payV2Order } from "../utils/v2Order.js";

export async function buyStars(this: any, username: string, amount: number, authKey?: string, showSender: boolean = false, custom_order_info: string | null = null, payment_method: string = DEFAULT_PAYMENT_METHOD, idempotency_key: string | null = null) {
  // Built once and reused for the retries below, so a retry cannot silently drop
  // fields (an idempotency_key that went missing would create a duplicate order).
  const createReq = {
    username: username,
    amount,
    auth_key: this.getAuthKey(authKey),
    show_sender: showSender,
    custom_order_info: custom_order_info,
    payment_method: assertPaymentMethod(payment_method),
    idempotency_key: idempotency_key
  };

  const createResp = await this.post("/v2/buyStars/create", createReq);

  if (!createResp.success) {
    const retryableCreateErrors = ["SEARCH_ERROR", "ORDER_CREATION_FAILED", "BAD_REQUEST"];
    if (retryableCreateErrors.includes(createResp.error_code)) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        await this.delay(1000 * attempt);
        const retryResp = await this.post("/v2/buyStars/create", createReq);
        if (retryResp.success) {
          Object.assign(createResp, retryResp);
          break;
        }
        if (!retryableCreateErrors.includes(retryResp.error_code)) {
          throw new FragmentAPIError(`Create order failed: ${retryResp.message}`);
        }
      }
      if (!createResp.success) {
        throw new FragmentAPIError(`Create order failed after retries: ${createResp.message}`);
      }
    } else {
      throw new FragmentAPIError(`Create order failed: ${createResp.message}`);
    }
  }

  // An idempotent create answers with the order the key already names: a paid one is
  // done, one in flight or failed is never paid again (see utils/v2Order.ts).
  const settled = settledByCreate(createResp);
  if (settled) return settled;

  const orderId = createResp.order_id;
  const cost = createResp.cost;
  const recipient_id = createResp.recipient_id;

  if (this.bannedRecipientIDs.includes(recipient_id)) {
    throw new FragmentAPIError(`Recipient ID ${recipient_id} (${username}) is banned.`);
  }

  return payV2Order(this, "buyStars", orderId, cost, authKey, !!idempotency_key);
}
