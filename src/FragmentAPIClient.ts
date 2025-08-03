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

  private base64Encode(data: string): string {
    return Buffer.from(data, "utf-8").toString("base64");
  }

  private getSeed(seed?: string): string {
    const usedSeed = seed?.trim() || this.defaultSeed?.trim();
    if (!usedSeed) throw new FragmentAPIError("Seed not provided and no default seed set.");
    const wordCount = usedSeed.split(" ").length;
    if (![12, 24].includes(wordCount)) throw new FragmentAPIError("Seed must be 12 or 24 space-separated words.");
    return this.base64Encode(usedSeed);
  }

  private getFragmentCookies(cookies?: string): string {
    const usedCookies = cookies?.trim() || this.defaultFragmentCookies?.trim();
    if (!usedCookies) throw new FragmentAPIError("Fragment cookies not provided and no default set.");
    if (!usedCookies.includes("stel_ssid=")) {
      throw new FragmentAPIError(
        "Fragment cookies must be in Header String format exported from Cookie-Editor extension: https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm"
      );
    }
    return this.base64Encode(usedCookies);
  }

  ping() {
    return this.get("/ping");
  }

  getBalance(seed?: string, walletType = "v4r2") {
    const encodedSeed = this.getSeed(seed);
    return this.get(`/v2/getBalance?seed=${encodeURIComponent(encodedSeed)}&wallet_type=${encodeURIComponent(walletType)}`);
  }

  getUserInfo(username: string, fragmentCookies?: string) {
    const encodedCookies = this.getFragmentCookies(fragmentCookies);
    return this.get(`/v2/getUserInfo?username=${encodeURIComponent(username)}&fragment_cookies=${encodeURIComponent(encodedCookies)}`);
  }

  async buyStars(username: string, amount: number, authKey?: string, walletType = "v4r2", showSender = false) {
    const createResp = await this.post("/v2/buyStars/create", {
      username,
      amount,
      auth_key: authKey,
      show_sender: showSender
    });

    if (!createResp.success) {
      throw new FragmentAPIError(`Create order failed: ${createResp.message}`);
    }

    const orderId = createResp.order_id;
    const cost = createResp.cost;

    let lastError: any = null;
    let payResp: any = null;

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
          throw new FragmentAPIError(`Pay error: ${payResp.message}`);
        }
      } catch (err: any) {
        lastError = err;

        if (err.message?.startsWith("4")) {
          throw err;
        }

        await this.delay(1000);
      }
    }

    try {
      const checkResp = await this.get(`/v2/buyStars/check?uuid=${orderId}`);
      if (checkResp.success) {
        return checkResp;
      } else {
        throw new FragmentAPIError(`Check failed: ${checkResp.message}`);
      }
    } catch (checkErr) {
      throw lastError || checkErr;
    }
  }

  async buyStarsWithoutKYC(username: string, amount: number, authKey?: string, walletType = "v4r2") {
    const createResp = await this.post("/v2/buyStarsWithoutKYC/create", {
      username,
      amount
    });

    if (!createResp.success) {
      throw new FragmentAPIError(`Create order failed: ${createResp.message}`);
    }

    const orderId = createResp.order_id;
    const cost = createResp.cost;

    let lastError: any = null;
    let payResp: any = null;

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
          throw new FragmentAPIError(`Pay error: ${payResp.message}`);
        }
      } catch (err: any) {
        lastError = err;

        if (err.message?.startsWith("4")) {
          throw err;
        }

        await this.delay(1000);
      }
    }

    try {
      const checkResp = await this.get(`/v2/buyStarsWithoutKYC/check?uuid=${orderId}`);
      if (checkResp.success) {
        return checkResp;
      } else {
        throw new FragmentAPIError(`Check failed: ${checkResp.message}`);
      }
    } catch (checkErr) {
      throw lastError || checkErr;
    }
  }

  async buyPremium(username: string, duration = 3, authKey?: string, walletType = "v4r2", showSender = false) {
    const createResp = await this.post("/v2/buyPremium/create", {
      username,
      duration,
      auth_key: authKey,
      show_sender: showSender
    });

    if (!createResp.success) {
      throw new FragmentAPIError(`Create order failed: ${createResp.message}`);
    }

    const orderId = createResp.order_id;
    const cost = createResp.cost;

    let lastError: any = null;
    let payResp: any = null;

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
          throw new FragmentAPIError(`Pay error: ${payResp.message}`);
        }
      } catch (err: any) {
        lastError = err;

        if (err.message?.startsWith("4")) {
          throw err;
        }

        await this.delay(1000);
      }
    }

    try {
      const checkResp = await this.get(`/v2/buyPremium/check?uuid=${orderId}`);
      if (checkResp.success) {
        return checkResp;
      } else {
        throw new FragmentAPIError(`Check failed: ${checkResp.message}`);
      }
    } catch (checkErr) {
      throw lastError || checkErr;
    }
  }

  async buyPremiumWithoutKYC(username: string, duration = 3, authKey?: string, walletType = "v4r2") {
    const createResp = await this.post("/v2/buyPremiumWithoutKYC/create", {
      username,
      duration
    });

    if (!createResp.success) {
      throw new FragmentAPIError(`Create order failed: ${createResp.message}`);
    }

    const orderId = createResp.order_id;
    const cost = createResp.cost;

    let lastError: any = null;
    let payResp: any = null;

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
          throw new FragmentAPIError(`Pay error: ${payResp.message}`);
        }
      } catch (err: any) {
        lastError = err;

        if (err.message?.startsWith("4")) {
          throw err;
        }

        await this.delay(1000);
      }
    }

    try {
      const checkResp = await this.get(`/v2/buyPremiumWithoutKYC/check?uuid=${orderId}`);
      if (checkResp.success) {
        return checkResp;
      } else {
        throw new FragmentAPIError(`Check failed: ${checkResp.message}`);
      }
    } catch (checkErr) {
      throw lastError || checkErr;
    }
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
