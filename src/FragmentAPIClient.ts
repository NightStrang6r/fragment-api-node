import axios, { AxiosInstance } from "axios";
import {
  CreatePremiumOrderRequest,
  CreatePremiumWithoutKYCOrderRequest,
  CreateStarsOrderRequest,
  CreateStarsWithoutKYCOrderRequest,
  CreateTonOrderRequest,
  CreateTonWithoutKYCOrderRequest,
  PayPremiumOrderRequest,
  PayPremiumWithoutKYCOrderRequest,
  PayStarsOrderRequest,
  PayStarsWithoutKYCOrderRequest,
  PayTonOrderRequest,
  PayTonWithoutKYCOrderRequest,
  FragmentAPIError,
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
      throw new FragmentAPIError(err);
    }
  }

  private async post(path: string, data: any) {
    try {
      const response = await this.http.post(path, data);
      return response.data;
    } catch (err: any) {
      throw new FragmentAPIError(err);
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

  getBalance(authKey: string, walletType = "v4r2") {
    return this.get(`/v2/getBalance?auth_key=${encodeURIComponent(authKey)}&wallet_type=${encodeURIComponent(walletType)}`);
  }

  getUserInfo(username: string, authKey: string) {
    return this.get(`/v2/getUserInfo?username=${encodeURIComponent(username)}&auth_key=${encodeURIComponent(authKey)}`);
  }

  async buyStars(username: string, amount: number, authKey: string, walletType: string = "v4r2", showSender: boolean = false, custom_order_info: string | null = null) {
    const createResp = await this.post("/v2/buyStars/create", {
      username: username,
      amount,
      auth_key: authKey,
      show_sender: showSender,
      custom_order_info: custom_order_info
    });

    if (!createResp.success) {
      const retryableCreateErrors = ["SEARCH_ERROR", "ORDER_CREATION_FAILED", "BAD_REQUEST"];
      if (retryableCreateErrors.includes(createResp.error_code)) {
        for (let attempt = 1; attempt <= 3; attempt++) {
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
      //"TRANSFER_FAILED"
    ];

    for (let attempt = 1; attempt <= 3; attempt++) {
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
          const checkResp = await this.get(`/v2/buyStars/check?uuid=${orderId}`);
          
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

  async buyStarsWithoutKYC(username: string, amount: number, authKey: string, walletType = "v4r2") {
    const createResp = await this.post("/v2/buyStarsWithoutKYC/create", {
      username: username,
      amount: amount,
      auth_key: authKey
    });

    if (!createResp.success) {
      const retryableCreateErrors = ["SEARCH_ERROR", "ORDER_CREATION_FAILED", "BAD_REQUEST"];
      if (retryableCreateErrors.includes(createResp.error_code)) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          await this.delay(1000 * attempt);
          const retryResp = await this.post("/v2/buyStarsWithoutKYC/create", {
            username: username,
            amount: amount,
            auth_key: authKey
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
      //"TRANSFER_FAILED",
      //"TRANSFER_TO_MIDDLE_FAILED"
    ];

    for (let attempt = 1; attempt <= 3; attempt++) {
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
          const checkResp = await this.get(`/v2/buyStarsWithoutKYC/check?uuid=${orderId}`);
          
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

  async buyTon(username: string, amount: number = 1, authKey: string, walletType: string = "v4r2", showSender: boolean = false, custom_order_info: string | null = null) {
    const createResp = await this.post("/v2/buyTon/create", {
      username: username,
      amount,
      auth_key: authKey,
      show_sender: showSender,
      custom_order_info: custom_order_info
    });

    if (!createResp.success) {
      const retryableCreateErrors = ["SEARCH_ERROR", "ORDER_CREATION_FAILED", "BAD_REQUEST"];
      if (retryableCreateErrors.includes(createResp.error_code)) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          await this.delay(1000 * attempt);
          const retryResp = await this.post("/v2/buyTon/create", {
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
      //"TRANSFER_FAILED"
    ];

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        payResp = await this.post("/v2/buyTon/pay", {
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
          const checkResp = await this.get(`/v2/buyTon/check?uuid=${orderId}`);
          
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

  async buyTonWithoutKYC(username: string, amount = 1, authKey: string, walletType = "v4r2") {
    const createResp = await this.post("/v2/buyTonWithoutKYC/create", {
      username: username,
      amount: amount,
      auth_key: authKey
    });

    if (!createResp.success) {
      const retryableCreateErrors = ["SEARCH_ERROR", "ORDER_CREATION_FAILED", "BAD_REQUEST"];
      if (retryableCreateErrors.includes(createResp.error_code)) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          await this.delay(1000 * attempt);
          const retryResp = await this.post("/v2/buyTonWithoutKYC/create", {
            username: username,
            amount: amount,
            auth_key: authKey
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
      //"TRANSFER_FAILED",
      //"TRANSFER_TO_MIDDLE_FAILED"
    ];

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        payResp = await this.post("/v2/buyTonWithoutKYC/pay", {
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
          const checkResp = await this.get(`/v2/buyTonWithoutKYC/check?uuid=${orderId}`);
          
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

  async buyPremium(username: string, duration: number = 3, authKey: string, walletType: string = "v4r2", showSender: boolean = false, custom_order_info: string | null = null) {
    const createResp = await this.post("/v2/buyPremium/create", {
      username: username,
      duration: duration,
      auth_key: authKey,
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
      //"TRANSFER_FAILED"
    ];

    for (let attempt = 1; attempt <= 3; attempt++) {
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


  async buyPremiumWithoutKYC(username: string, duration = 3, authKey: string, walletType = "v4r2") {
    const createResp = await this.post("/v2/buyPremiumWithoutKYC/create", {
      username: username,
      duration: duration,
      auth_key: authKey
    });

    if (!createResp.success) {
      const retryableCreateErrors = ["SEARCH_ERROR", "ORDER_CREATION_FAILED"];
      if (retryableCreateErrors.includes(createResp.error_code)) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          await this.delay(1000 * attempt);
          const retryResp = await this.post("/v2/buyPremiumWithoutKYC/create", {
            username: username,
            duration: duration,
            auth_key: authKey
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
      //"TRANSFER_FAILED",
      //"TRANSFER_TO_MIDDLE_FAILED"
    ];

    for (let attempt = 1; attempt <= 3; attempt++) {
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
          const checkResp = await this.get(`/v2/buyPremiumWithoutKYC/check?uuid=${orderId}`);
          
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

  getOrders(authKey: string, limit = 10, offset = 0) {
    return this.get(`/v2/getOrders?auth_key=${encodeURIComponent(authKey)}&limit=${limit}&offset=${offset}`);
  }

  private async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async createAuthKey(fragmentCookies?: string, seed?: string) {
    const req: CreateAuthKeyRequest = {
      fragment_cookies: this.getFragmentCookies(fragmentCookies),
      seed: this.getSeed(seed),
    };

    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const resp = await this.post("/v2/auth", req);
        return resp;
      } catch (err: any) {
        const status = err?.response?.status;
        const isRetryable = !status || (status >= 500 && status < 600);

        if (!isRetryable || attempt === maxRetries) {
          throw err;
        }

        await this.delay(500 * attempt);
      }
    }
  }

  createPremiumOrder(username: string, duration = 3, authKey: string, showSender = false) {
    const req: CreatePremiumOrderRequest = {
      username,
      duration,
      auth_key: authKey,
      show_sender: showSender,
    };
    return this.post("/v2/buyPremium/create", req);
  }

  createPremiumWithoutKYCOrder(username: string, duration = 3, authKey: string) {
    const req: CreatePremiumWithoutKYCOrderRequest = {
      username,
      duration,
      auth_key: authKey
    };
    return this.post("/v2/buyPremiumWithoutKYC/create", req);
  }

  createStarsOrder(username: string, amount: number, authKey: string, showSender = false) {
    const req: CreateStarsOrderRequest = {
      username,
      amount,
      auth_key: authKey,
      show_sender: showSender,
    };
    return this.post("/v2/buyStars/create", req);
  }

  createStarsWithoutKYCOrder(username: string, amount: number, authKey: string) {
    const req: CreateStarsWithoutKYCOrderRequest = {
      username,
      amount,
      auth_key: authKey
    };
    return this.post("/v2/buyStarsWithoutKYC/create", req);
  }

  createTonOrder(username: string, amount: number, authKey: string, showSender = false) {
    const req: CreateTonOrderRequest = {
      username,
      amount,
      auth_key: authKey,
      show_sender: showSender,
    };
    return this.post("/v2/buyTon/create", req);
  }

  createTonWithoutKYCOrder(username: string, amount: number, authKey: string) {
    const req: CreateTonWithoutKYCOrderRequest = {
      username,
      amount,
      auth_key: authKey
    };
    return this.post("/v2/buyTonWithoutKYC/create", req);
  }

  payPremiumOrder(order_uuid: string, authKey: string, cost: number, walletType?: string) {
    const req: PayPremiumOrderRequest = {
      order_uuid,
      auth_key: authKey,
      cost,
      wallet_type: walletType,
    };
    return this.post("/v2/buyPremium/pay", req);
  }

  payPremiumWithoutKYCOrder(order_uuid: string, authKey: string, cost: number, walletType?: string) {
    const req: PayPremiumWithoutKYCOrderRequest = {
      order_uuid,
      auth_key: authKey,
      cost,
      wallet_type: walletType,
    };
    return this.post("/v2/buyPremiumWithoutKYC/pay", req);
  }

  payStarsOrder(order_uuid: string, authKey: string, cost: number, walletType?: string) {
    const req: PayStarsOrderRequest = {
      order_uuid,
      auth_key: authKey,
      cost,
      wallet_type: walletType,
    };
    return this.post("/v2/buyStars/pay", req);
  }

  payStarsWithoutKYCOrder(order_uuid: string, authKey: string, cost: number, walletType?: string) {
    const req: PayStarsWithoutKYCOrderRequest = {
      order_uuid,
      auth_key: authKey,
      cost,
      wallet_type: walletType,
    };
    return this.post("/v2/buyStarsWithoutKYC/pay", req);
  }

  payTonOrder(order_uuid: string, authKey: string, cost: number, walletType?: string) {
    const req: PayTonOrderRequest = {
      order_uuid,
      auth_key: authKey,
      cost,
      wallet_type: walletType,
    };
    return this.post("/v2/buyTon/pay", req);
  }

  payTonWithoutKYCOrder(order_uuid: string, authKey: string, cost: number, walletType?: string) {
    const req: PayTonWithoutKYCOrderRequest = {
      order_uuid,
      auth_key: authKey,
      cost,
      wallet_type: walletType,
    };
    return this.post("/v2/buyTonWithoutKYC/pay", req);
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

  getTonOrderStatus(order_uuid: string) {
    return this.get(`/v2/buyTon/check?uuid=${order_uuid}`);
  }

  getTonWithoutKYCOrderStatus(order_uuid: string) {
    return this.get(`/v2/buyTonWithoutKYC/check?uuid=${order_uuid}`);
  }
}