import FragmentAPIError from "../FragmentAPIError.js";

export async function buyPremium(this: any, username: string, duration: number = 3, authKey?: string, walletType: string = "v4r2", showSender: boolean = false, custom_order_info: string | null = null) {
  const createResp = await this.post("/v2/buyPremium/create", {
    username: username,
    duration: duration,
    auth_key: this.getAuthKey(authKey),
    show_sender: showSender,
    custom_order_info: custom_order_info
  });

  if (!createResp.success) {
    const retryableCreateErrors = ["SEARCH_ERROR", "ORDER_CREATION_FAILED"];
    if (retryableCreateErrors.includes(createResp.error_code)) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        await this.delay(1000 * attempt);
        const retryResp = await this.post("/v2/buyPremium/create", {
          username: username,
          duration: duration,
          auth_key: this.getAuthKey(authKey),
          show_sender: showSender
        });
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

  const orderId = createResp.order_id;
  const cost = createResp.cost;

  let lastError: any = null;
  let payResp: any = null;
  let networkErrorDuringPay = false;

  const retryablePayErrors = [
    "BALANCE_CHECK_ERROR",
    //"TRANSFER_FAILED"
  ];

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      payResp = await this.post("/v2/buyPremium/pay", {
        order_uuid: orderId,
        auth_key: this.getAuthKey(authKey),
        cost,
        wallet_type: walletType,
      });

      if (payResp.success) {
        return payResp;
      } else {
        const err = new FragmentAPIError(`Pay error: ${payResp.message}`);
        (err as any).error_code = payResp.error_code;
        throw err;
      }
    } catch (err: any) {
      lastError = err;

      if (err.error_code && !retryablePayErrors.includes(err.error_code)) {
        throw err;
      }
      if (err.message?.includes("4") || err.message?.includes("5")) {
        throw err;
      }

      networkErrorDuringPay = true;

      await this.delay(1000 * attempt);
    }
  }

  if (networkErrorDuringPay) {
    const maxCheckDurationMs = 2 * 60 * 1000;
    const checkIntervalMs = 15 * 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxCheckDurationMs) {
      try {
        const checkResp = await this.get(`/v2/buyPremium/check?uuid=${orderId}`);
        
        if ((checkResp.success && (checkResp.status == "success" || checkResp.status == "failed")) || ("error_code" in checkResp && checkResp.error_code !== "ORDER_ALREADY_PROCESSING")) {
          return checkResp;
        }
      } catch (checkErr: any) {
        if (checkErr?.error_code !== "ORDER_ALREADY_PROCESSING") {
          return checkErr;
        }
      }

      await this.delay(checkIntervalMs);
    }

    return {
      success: false,
      message: "Timed out waiting for processing to finish",
      error_code: "ORDER_ALREADY_PROCESSING_TIMEOUT"
    };
  }

  throw lastError;
}
