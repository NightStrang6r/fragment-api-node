import axios, { AxiosInstance } from "axios";
import {
  BuyPremiumRequest,
  BuyPremiumWithoutKYCRequest,
  BuyStarsRequest,
  BuyStarsWithoutKYCRequest,
  FragmentAPIError,
  GetOrdersRequest,
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

  getBalance(seed?: string) {
    return this.post("/getBalance", { seed: this.getSeed(seed) });
  }

  getUserInfo(username: string, fragmentCookies?: string) {
    return this.post("/getUserInfo", {
      username,
      fragment_cookies: this.getFragmentCookies(fragmentCookies),
    });
  }

  buyStars(username: string, amount: number, showSender = false, fragmentCookies?: string, seed?: string) {
    const req: BuyStarsRequest = {
      username,
      amount,
      fragment_cookies: this.getFragmentCookies(fragmentCookies),
      seed: this.getSeed(seed),
      show_sender: showSender,
    };
    return this.post("/buyStars", req);
  }

  buyStarsWithoutKYC(username: string, amount: number, seed?: string) {
    const req: BuyStarsWithoutKYCRequest = {
      username,
      amount,
      seed: this.getSeed(seed),
    };
    return this.post("/buyStarsWithoutKYC", req);
  }

  buyPremium(username: string, duration = 3, showSender = false, fragmentCookies?: string, seed?: string) {
    const req: BuyPremiumRequest = {
      username,
      fragment_cookies: this.getFragmentCookies(fragmentCookies),
      seed: this.getSeed(seed),
      duration,
      show_sender: showSender,
    };
    return this.post("/buyPremium", req);
  }

  buyPremiumWithoutKYC(username: string, duration = 3, seed?: string) {
    const req: BuyPremiumWithoutKYCRequest = {
      username,
      seed: this.getSeed(seed),
      duration,
    };
    return this.post("/buyPremiumWithoutKYC", req);
  }

  getOrders(seed?: string, limit = 10, offset = 0) {
    const req: GetOrdersRequest = {
      seed: this.getSeed(seed),
      limit,
      offset,
    };
    return this.post("/getOrders", req);
  }
}