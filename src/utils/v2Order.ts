import FragmentAPIError from "../FragmentAPIError.js";

// How a KYC v2 purchase (buyStars, buyPremium) ends once its order exists.
//
// The rule: after a pay request may have reached the server, the order is never reported
// as failed-and-safe-to-buy-again unless the server says so. A proxy's 502/504, a dropped
// connection or an unclassified 500 say nothing about what the server behind them did -
// the payment may be on chain. The heuristic this replaces (`message.includes("4") ||
// message.includes("5")`) threw "HTTP Error: 502" straight back; the caller retried, the
// retry's idempotent create handed back the order the lost request had paid, pay answered
// ORDER_ALREADY_PROCESSED, and a delivered order was escalated as never paid.

type Product = "buyStars" | "buyPremium";

// Pay refusals the server gives BEFORE it claims the order (or after handing the claim
// back): nothing was sent, so paying again is safe.
const NOT_CHARGED_PAY_ERRORS = ["BALANCE_CHECK_ERROR", "TON_SERVICE_UNAVAILABLE", "TRANSFER_NOT_SENT", "FEE_RATE_UNAVAILABLE"];
const PAY_ATTEMPTS = 3;
// An order still unsettled this long after its pay went unanswered is ambiguous.
const SETTLE_WAIT_MS = 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 1000;

function ambiguous(orderId: string, reason: string) {
  return {
    success: false,
    message: `Transfer state unclear - ${reason}, manual verification required`,
    error_code: "TRANSFER_AMBIGUOUS",
    requires_manual_check: true,
    order_id: orderId,
  };
}

// What the server itself answers when a failed order is paid again.
function alreadyFailed(orderId: string, reason?: string | null): FragmentAPIError {
  return new FragmentAPIError(`Order already failed${reason ? `: ${reason}` : ""}`, 400, "ORDER_ALREADY_PROCESSED", { order_id: orderId });
}

/**
 * What an idempotent create's answer already decides. It hands back the order the key
 * names, status included, and paying that order again is never the answer: a paid one is
 * done, one being paid may land any moment, and a failed one needs a look first - v2 does
 * not say whether a failed order was charged. Returns null when the order still needs
 * paying (a fresh order, or one still `created`).
 */
export function settledByCreate(createResp: any): any | null {
  if (!createResp?.idempotent) return null;
  switch (createResp.status) {
    case "success": return createResp;
    case "processing": return ambiguous(createResp.order_id, "the order is already being paid");
    case "failed": throw alreadyFailed(createResp.order_id);
    default: return null;
  }
}

/**
 * Pay a created order and report what the server did with it: the pay answer, the
 * settled order, an ambiguous result (never paid again), or an error that says nothing
 * was charged.
 * `idempotent`: the order was created with an idempotency key, so a retry resolves to it.
 */
export async function payV2Order(client: any, product: Product, orderId: string, cost: number,
                                 authKey: string | undefined, idempotent: boolean): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    let err: any;
    try {
      const payResp = await client.post(`/v2/${product}/pay`, {
        order_uuid: orderId,
        auth_key: client.getAuthKey(authKey),
        cost,
        wallet_type: client.walletVersion,
      });
      if (payResp.success) return payResp;
      err = new FragmentAPIError(`Pay error: ${payResp.message}`, 200, payResp.error_code);
    } catch (e: any) {
      err = e;
    }

    const code = err?.error_code;
    if (NOT_CHARGED_PAY_ERRORS.includes(code)) {
      if (attempt < PAY_ATTEMPTS) {
        await client.delay(1000 * attempt);
        continue;
      }
      throw err;
    }
    if (code === "TRANSFER_AMBIGUOUS") throw err;
    // Claimed already (by a lost twin of this request, or another caller) or settled
    // already: the order's own status is the answer.
    if (code === "ORDER_ALREADY_PROCESSING" || code === "ORDER_ALREADY_PROCESSED") {
      return settleV2Order(client, product, orderId, idempotent);
    }
    // Any other answer below 500 is a refusal given before the claim: nothing was charged.
    if (typeof err?.status === "number" && err.status < 500) throw err;
    // No answer at all, or a 5xx: the payment may have gone through. Ask, never re-send.
    return settleV2Order(client, product, orderId, idempotent);
  }
}

/** Poll the order until the server settles it, for up to SETTLE_WAIT_MS. */
async function settleV2Order(client: any, product: Product, orderId: string, idempotent: boolean): Promise<any> {
  const deadline = Date.now() + SETTLE_WAIT_MS;
  let last: any = null;
  for (;;) {
    try {
      last = await client.get(`/v2/${product}/check?uuid=${orderId}`);
    } catch {
      last = null;   // a failed check says nothing either way - keep asking until the deadline
    }
    if (last?.status === "success") return { ...last, transaction_hash: last.transaction_hash ?? last.txid };
    if (last?.status === "failed") throw alreadyFailed(orderId, last.error_message);
    if (Date.now() >= deadline) break;
    await client.delay(CHECK_INTERVAL_MS);
  }

  // Still unclaimed a minute on: the lost request never took the order (a claim turns it
  // to processing; a transfer refused before sending hands it back to created). With an
  // idempotency key a retry resolves to this same order, whose atomic claim blocks a
  // second transfer, so this is reported as not charged. Without one a retry would be a
  // new order, and that stays ambiguous.
  if (last?.success && (last.status === "created" || last.status === null) && idempotent) {
    throw new FragmentAPIError("Payment was not taken - the order is still unpaid, retry it", 503, "TRANSFER_NOT_SENT", { order_id: orderId });
  }
  return ambiguous(orderId, last?.status ? `order still ${last.status}` : "order status unavailable");
}
