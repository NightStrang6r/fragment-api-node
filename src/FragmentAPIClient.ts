import axios, { AxiosInstance } from "axios";
import {
  BuyPremiumRequest,
  BuyPremiumWithoutKYCRequest,
  BuyStarsRequest,
  BuyStarsWithoutKYCRequest,
  CreatePremiumOrderRequest,
  CreatePremiumWithoutKYCOrderRequest,
  CreateStarsOrderRequest,
  CreateStarsWithoutKYCOrderRequest,
  PayPremiumOrderRequest,
  PayPremiumWithoutKYCOrderRequest,
  PayStarsOrderRequest,
  PayStarsWithoutKYCOrderRequest,
  FragmentAPIError,
  GetOrdersRequest,
  CreateAuthKeyRequest
} from "./models.js";

export default class FragmentAPIClient {
  private baseUrl: string;
  private defaultSeed?: string;
  private defaultFragmentCookies?: string;
  private http: AxiosInstance;

  constructor(seed?: string, fragmentCookies?: string, baseUrl = "https://api.fragment-api.net") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.defaultSeed = seed;
    this.defaultFragmentCookies = fragmentCookies;
    this.http = axios.create({ baseURL: this.baseUrl });
  }

  private async get(path: string) {
    try {
      const response = await this.http.get(path);
      return response.data;
    } catch (err: any) {
      throw new FragmentAPIError(`${err.response?.status} | ${JSON.stringify(err.response?.data)}`);
    }
  }

  private async post(path: string, data: any) {
    try {
      const response = await this.http.post(path, data);
      return response.data;
    } catch (err: any) {
      throw new FragmentAPIError(`${err.response?.status} | ${JSON.stringify(err.response?.data)}`);
    }
  }

  private getSeed(seed?: string): string {
    const usedSeed = seed?.trim() || this.defaultSeed?.trim();
    if (!usedSeed) throw new FragmentAPIError("Seed not provided and no default seed set.");
    const wordCount = usedSeed.split(" ").length;
    if (![12, 24].includes(wordCount)) throw new FragmentAPIError("Seed must be 12 or 24 space-separated words.");
    return usedSeed;
  }

  private getFragmentCookies(cookies?: string): string {
    const usedCookies = cookies?.trim() || this.defaultFragmentCookies?.trim();
    if (!usedCookies) throw new FragmentAPIError("Fragment cookies not provided and no default set.");
    if (!usedCookies.includes("stel_ssid=")) {
      throw new FragmentAPIError(
        "Fragment cookies must be in Header String format exported from Cookie-Editor extension: https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm"
      );
    }
    return usedCookies;
  }

  ping() {
    return this.get("/v2/ping");
  }

  getBalance(seed?: string, walletType = "v4r2") {
    const encodedSeed = this.getSeed(seed);
    return this.get(`/v2/getBalance?seed=${encodeURIComponent(encodedSeed)}&wallet_type=${encodeURIComponent(walletType)}`);
  }

  getUserInfo(username: string, fragmentCookies?: string) {
    const encodedCookies = this.getFragmentCookies(fragmentCookies);
    return this.get(`/v2/getUserInfo?username=${encodeURIComponent(username)}&fragment_cookies=${encodeURIComponent(encodedCookies)}`);
  }

  async buyStars(username: string, amount = 3, authKey?: string, walletType = "v4r2", showSender = false) {
    const createResp = await this.post("/v2/buyStars/create", {
      username: username,
      amount,
      auth_key: authKey,
      show_sender: showSender
    });

    if (!createResp.success) {
      const retryableCreateErrors = ["SEARCH_ERROR", "ORDER_CREATION_FAILED", "INTERNAL_SERVER_ERROR", "BAD_REQUEST"];
      if (retryableCreateErrors.includes(createResp.error_code)) {
        for (let attempt = 1; attempt <= 5; attempt++) {
          await this.delay(1000 * attempt);
          const retryResp = await this.post("/v2/buyStars/create", {
            username: username,
            amount: amount,
            auth_key: authKey,
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
      "TRANSFER_FAILED",
      "INTERNAL_SERVER_ERROR"
    ];

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        payResp = await this.post("/v2/buyStars/pay", {
          order_uuid: orderId,
          auth_key: authKey,
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
        if (err.message?.startsWith("4")) {
          throw err;
        }

        networkErrorDuringPay = true;

        await this.delay(1000 * attempt);
      }
    }

    if (networkErrorDuringPay) {
      const maxCheckRetries = 5;
      const checkDelayMs = 1000;

      for (let checkAttempt = 1; checkAttempt <= maxCheckRetries; checkAttempt++) {
        try {
          const checkResp = await this.get(`/v2/buyStars/check?uuid=${orderId}`);
          if (checkResp.success) {
            return checkResp;
          }
        } catch (checkErr) {
          if (checkAttempt === maxCheckRetries) {
            throw lastError || checkErr;
          }
          await this.delay(checkDelayMs);
        }
      }
    }

    throw lastError;
  }


    async buyStarsWithoutKYC(username: string, amount = 3, authKey?: string, walletType = "v4r2", showSender = false) {
    const createResp = await this.post("/v2/buyStarsWithoutKYC/create", {
      username: username,
      amount: amount
    });

    if (!createResp.success) {
      throw new FragmentAPIError(`Create order failed: ${createResp.message}`);
    }

    if (!createResp.success) {
      const retryableCreateErrors = ["SEARCH_ERROR", "ORDER_CREATION_FAILED", "INTERNAL_SERVER_ERROR", "BAD_REQUEST"];
      if (retryableCreateErrors.includes(createResp.error_code)) {
        for (let attempt = 1; attempt <= 5; attempt++) {
          await this.delay(1000 * attempt);
          const retryResp = await this.post("/v2/buyStarsWithoutKYC/create", {
            username: username,
            amount: amount,
            auth_key: authKey,
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
      "TRANSFER_FAILED",
      "TRANSFER_TO_MIDDLE_FAILED",
      "INTERNAL_SERVER_ERROR"
    ];

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        payResp = await this.post("/v2/buyStarsWithoutKYC/pay", {
          order_uuid: orderId,
          auth_key: authKey,
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
        if (err.message?.startsWith("4")) {
          throw err;
        }

        networkErrorDuringPay = true;

        await this.delay(1000 * attempt);
      }
    }

    if (networkErrorDuringPay) {
      const maxCheckRetries = 5;
      const checkDelayMs = 1000;

      for (let checkAttempt = 1; checkAttempt <= maxCheckRetries; checkAttempt++) {
        try {
          const checkResp = await this.get(`/v2/buyStarsWithoutKYC/check?uuid=${orderId}`);
          if (checkResp.success) {
            return checkResp;
          }
        } catch (checkErr) {
          if (checkAttempt === maxCheckRetries) {
            throw lastError || checkErr;
          }
          await this.delay(checkDelayMs);
        }
      }
    }

    throw lastError;
  }

  async buyPremium(username: string, duration = 3, authKey?: string, walletType = "v4r2", showSender = false) {
    const createResp = await this.post("/v2/buyPremium/create", {
      username: username,
      duration: duration,
      auth_key: authKey,
      show_sender: showSender
    });

    if (!createResp.success) {
      const retryableCreateErrors = ["SEARCH_ERROR", "ORDER_CREATION_FAILED", "INTERNAL_SERVER_ERROR"];
      if (retryableCreateErrors.includes(createResp.error_code)) {
        for (let attempt = 1; attempt <= 5; attempt++) {
          await this.delay(1000 * attempt);
          const retryResp = await this.post("/v2/buyPremium/create", {
            username: username,
            duration: duration,
            auth_key: authKey,
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
      "TRANSFER_FAILED",
      "INTERNAL_SERVER_ERROR"
    ];

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        payResp = await this.post("/v2/buyPremium/pay", {
          order_uuid: orderId,
          auth_key: authKey,
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
        if (err.message?.startsWith("4")) {
          throw err;
        }

        networkErrorDuringPay = true;

        await this.delay(1000 * attempt);
      }
    }

    if (networkErrorDuringPay) {
      const maxCheckRetries = 5;
      const checkDelayMs = 1000;

      for (let checkAttempt = 1; checkAttempt <= maxCheckRetries; checkAttempt++) {
        try {
          const checkResp = await this.get(`/v2/buyPremium/check?uuid=${orderId}`);
          if (checkResp.success) {
            return checkResp;
          }
        } catch (checkErr) {
          if (checkAttempt === maxCheckRetries) {
            throw lastError || checkErr;
          }
          await this.delay(checkDelayMs);
        }
      }
    }

    throw lastError;
  }


  async buyPremiumWithoutKYC(username: string, duration = 3, authKey?: string, walletType = "v4r2", showSender = false) {
    const createResp = await this.post("/v2/buyPremiumWithoutKYC/create", {
      username: username,
      duration: duration
    });

    if (!createResp.success) {
      const retryableCreateErrors = ["SEARCH_ERROR", "ORDER_CREATION_FAILED", "INTERNAL_SERVER_ERROR"];
      if (retryableCreateErrors.includes(createResp.error_code)) {
        for (let attempt = 1; attempt <= 5; attempt++) {
          await this.delay(1000 * attempt);
          const retryResp = await this.post("/v2/buyPremiumWithoutKYC/create", {
            username: username,
            duration: duration,
            auth_key: authKey,
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
      "TRANSFER_FAILED",
      "TRANSFER_TO_MIDDLE_FAILED",
      "INTERNAL_SERVER_ERROR"
    ];

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        payResp = await this.post("/v2/buyPremiumWithoutKYC/pay", {
          order_uuid: orderId,
          auth_key: authKey,
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
        if (err.message?.startsWith("4")) {
          throw err;
        }

        networkErrorDuringPay = true;

        await this.delay(1000 * attempt);
      }
    }

    if (networkErrorDuringPay) {
      const maxCheckRetries = 5;
      const checkDelayMs = 1000;

      for (let checkAttempt = 1; checkAttempt <= maxCheckRetries; checkAttempt++) {
        try {
          const checkResp = await this.get(`/v2/buyPremiumWithoutKYC/check?uuid=${orderId}`);
          if (checkResp.success) {
            return checkResp;
          }
        } catch (checkErr) {
          if (checkAttempt === maxCheckRetries) {
            throw lastError || checkErr;
          }
          await this.delay(checkDelayMs);
        }
      }
    }

    throw lastError;
  }

  getOrders(seed?: string, limit = 10, offset = 0) {
    const encodedSeed = this.getSeed(seed);
    return this.get(`/v2/getOrders?seed=${encodeURIComponent(encodedSeed)}&limit=${limit}&offset=${offset}`);
  }

  private async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  createAuthKey(fragmentCookies: string, seed: string) {
    const req: CreateAuthKeyRequest = {
      fragment_cookies: fragmentCookies,
      seed: seed
    };
    return this.post("/v2/auth", req);
  }

  createPremiumOrder(username: string, duration = 3, fragmentCookies: string, showSender = false) {
    const req: CreatePremiumOrderRequest = {
      username,
      duration,
      fragment_cookies: this.getFragmentCookies(fragmentCookies),
      show_sender: showSender,
    };
    return this.post("/v2/buyPremium/create", req);
  }

  createPremiumWithoutKYCOrder(username: string, duration = 3) {
    const req: CreatePremiumWithoutKYCOrderRequest = {
      username,
      duration
    };
    return this.post("/v2/buyPremiumWithoutKYC/create", req);
  }

  createStarsOrder(username: string, amount: number, fragmentCookies: string, showSender = false) {
    const req: CreateStarsOrderRequest = {
      username,
      amount,
      fragment_cookies: this.getFragmentCookies(fragmentCookies),
      show_sender: showSender,
    };
    return this.post("/v2/buyStars/create", req);
  }

  createStarsWithoutKYCOrder(username: string, amount: number) {
    const req: CreateStarsWithoutKYCOrderRequest = {
      username,
      amount
    };
    return this.post("/v2/buyStarsWithoutKYC/create", req);
  }

  payPremiumOrder(order_uuid: string, seed: string, fragmentCookies: string, cost: number, walletType?: string) {
    const req: PayPremiumOrderRequest = {
      order_uuid,
      seed: this.getSeed(seed),
      fragment_cookies: this.getFragmentCookies(fragmentCookies),
      cost,
      wallet_type: walletType,
    };
    return this.post("/v2/buyPremium/pay", req);
  }

  payPremiumWithoutKYCOrder(order_uuid: string, seed: string, cost: number, walletType?: string) {
    const req: PayPremiumWithoutKYCOrderRequest = {
      order_uuid,
      seed: this.getSeed(seed),
      cost,
      wallet_type: walletType,
    };
    return this.post("/v2/buyPremiumWithoutKYC/pay", req);
  }

  payStarsOrder(order_uuid: string, seed: string, fragmentCookies: string, cost: number, walletType?: string) {
    const req: PayStarsOrderRequest = {
      order_uuid,
      seed: this.getSeed(seed),
      fragment_cookies: this.getFragmentCookies(fragmentCookies),
      cost,
      wallet_type: walletType,
    };
    return this.post("/v2/buyStars/pay", req);
  }

  payStarsWithoutKYCOrder(order_uuid: string, seed: string, cost: number, walletType?: string) {
    const req: PayStarsWithoutKYCOrderRequest = {
      order_uuid,
      seed: this.getSeed(seed),
      cost,
      wallet_type: walletType,
    };
    return this.post("/v2/buyStarsWithoutKYC/pay", req);
  }

  getPremiumOrderStatus(order_uuid: string) {
    return this.get(`/v2/buyPremium/check?uuid=${order_uuid}`);
  }

  getPremiumWithoutKYCOrderStatus(order_uuid: string) {
    return this.get(`/v2/buyPremiumWithoutKYC/check?uuid=${order_uuid}`);
  }

  getStarsOrderStatus(order_uuid: string) {
    return this.get(`/v2/buyStars/check?uuid=${order_uuid}`);
  }

  getStarsWithoutKYCOrderStatus(order_uuid: string) {
    return this.get(`/v2/buyStarsWithoutKYC/check?uuid=${order_uuid}`);
  }
}