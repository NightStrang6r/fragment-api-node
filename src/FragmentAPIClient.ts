import axios, { AxiosInstance } from "axios";

import FragmentAPIError from "./FragmentAPIError.js";

// General methods
import { ping } from "./general/ping.js";
import { getBalance } from "./general/getBalance.js";
import { getUserInfo } from "./general/getUserInfo.js";
import { getOrders } from "./orders/getOrders.js";
import { auth } from "./auth/auth.js";

// Stars
import { buyStars } from "./stars/buy.js";
import { createStarsOrder } from "./stars/createOrder.js";
import { payStarsOrder } from "./stars/pay.js";
import { getStarsOrderStatus } from "./stars/check.js";
// Stars Without KYC
import { buyStarsWithoutKYC } from "./stars/withoutKYC/buy.js";
import { createStarsWithoutKYCOrder } from "./stars/withoutKYC/createOrder.js";
import { payStarsWithoutKYCOrder } from "./stars/withoutKYC/pay.js";
import { getStarsWithoutKYCOrderStatus } from "./stars/withoutKYC/check.js";

// Ton
import { buyTon } from "./ton/buy.js";
import { createTonOrder } from "./ton/createOrder.js";
import { payTonOrder } from "./ton/pay.js";
import { getTonOrderStatus } from "./ton/check.js";
// Ton Without KYC
import { buyTonWithoutKYC } from "./ton/withoutKYC/buy.js";
import { createTonWithoutKYCOrder } from "./ton/withoutKYC/createOrder.js";
import { payTonWithoutKYCOrder } from "./ton/withoutKYC/pay.js";
import { getTonWithoutKYCOrderStatus } from "./ton/withoutKYC/check.js";

// Premium
import { buyPremium } from "./premium/buy.js";
import { createPremiumOrder } from "./premium/createOrder.js";
import { payPremiumOrder } from "./premium/pay.js";
import { getPremiumOrderStatus } from "./premium/check.js";
// Premium Without KYC
import { buyPremiumWithoutKYC } from "./premium/withoutKYC/buy.js";
import { createPremiumWithoutKYCOrder } from "./premium/withoutKYC/createOrder.js";
import { payPremiumWithoutKYCOrder } from "./premium/withoutKYC/pay.js";
import { getPremiumWithoutKYCOrderStatus } from "./premium/withoutKYC/check.js";

export default class FragmentAPIClient {
    private baseUrl: string;
    private authKey?: string;
    private walletVersion: string;
    private defaultSeed?: string;
    private defaultFragmentCookies?: string;
    private http: AxiosInstance;
    
    public bannedRecipientIDs: Array<string> = [];

    // Method bindings (delegated to feature modules)
    public ping = ping;
    public getBalance = getBalance;
    public getUserInfo = getUserInfo;
    public getOrders = getOrders;
    public auth = auth;

    public buyStars = buyStars;
    public createStarsOrder = createStarsOrder;
    public payStarsOrder = payStarsOrder;
    public getStarsOrderStatus = getStarsOrderStatus;

    public buyStarsWithoutKYC = buyStarsWithoutKYC;
    public createStarsWithoutKYCOrder = createStarsWithoutKYCOrder;
    public payStarsWithoutKYCOrder = payStarsWithoutKYCOrder;
    public getStarsWithoutKYCOrderStatus = getStarsWithoutKYCOrderStatus;

    public buyTon = buyTon;
    public createTonOrder = createTonOrder;
    public payTonOrder = payTonOrder;
    public getTonOrderStatus = getTonOrderStatus;

    public buyTonWithoutKYC = buyTonWithoutKYC;
    public createTonWithoutKYCOrder = createTonWithoutKYCOrder;
    public payTonWithoutKYCOrder = payTonWithoutKYCOrder;
    public getTonWithoutKYCOrderStatus = getTonWithoutKYCOrderStatus;

    public buyPremium = buyPremium;
    public createPremiumOrder = createPremiumOrder;
    public payPremiumOrder = payPremiumOrder;
    public getPremiumOrderStatus = getPremiumOrderStatus;

    public buyPremiumWithoutKYC = buyPremiumWithoutKYC;
    public createPremiumWithoutKYCOrder = createPremiumWithoutKYCOrder;
    public payPremiumWithoutKYCOrder = payPremiumWithoutKYCOrder;
    public getPremiumWithoutKYCOrderStatus = getPremiumWithoutKYCOrderStatus;

    constructor(options: { baseUrl?: string; walletVersion?: string; seed?: string; fragmentCookies?: string, authKey?: string } = {}) {
        const { 
            baseUrl = "https://api.fragment-api.net",
            walletVersion = "v5r1",
            seed, 
            fragmentCookies,
            authKey
        } = options;

        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.authKey = authKey;
        this.walletVersion = walletVersion;
        this.defaultSeed = seed;
        this.defaultFragmentCookies = fragmentCookies;
        this.http = axios.create({ 
            baseURL: this.baseUrl,
            validateStatus: status => true, // Handle HTTP codes manually
        });
    }

    private async get(path: string) {
        try {
            const response = await this.http.get(path);

            if (response.status >= 400) {
                throw new FragmentAPIError(response?.data?.message || `HTTP Error: ${response.status}`, response.status);
            }

            return response.data;
        } catch (err: any) {
            throw err;
        }
    }

    private async post(path: string, data: any) {
        try {
            const response = await this.http.post(path, data);

            if (response.status >= 400) {
                throw new FragmentAPIError(response?.data?.message || `HTTP Error: ${response.status}`, response.status);
            }

            return response.data;
        } catch (err: any) {
            throw err;
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

    private getAuthKey(authKey?: string): string {
        const usedKey = authKey?.trim() || this.authKey?.trim();
        if (!usedKey) throw new FragmentAPIError("Auth key not provided and no default auth key set.");
        return usedKey;
    }
    
    private async delay(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}