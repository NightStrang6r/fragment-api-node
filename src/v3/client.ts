// Fragment API v3 client: your mnemonic stays in this process. The server prepares each
// payment, this client checks it and signs it, the server relays and confirms it.
// See the API's /docs/api-v3.
import axios, { AxiosInstance } from "axios";
import FragmentAPIError from "../FragmentAPIError.js";
import { Address } from "./address.js";
import { cellFromBase64 } from "./cell.js";
import { KeyPair, keyPairFromMnemonic } from "./keys.js";
import { FRAGMENT_ADDRESSES, PaymentRequest, TrustPolicy, UntrustedPayment, checkPayment } from "./payment.js";
import { cookiesPayload, tonProofSignature } from "./proof.js";
import { MAX_MESSAGES, WalletType, signExternal, walletAddress } from "./wallet.js";

export interface TrustOptions {
    fragmentAddresses?: string[];   // added to the pinned list, never replacing it
    feeWallets?: string[];
    middleWallets?: string[];
    trustServerConfig?: boolean;    // accept fee/middle wallets named by /v3/config (default true)
    maxFeePercent?: number;         // default 5
    maxTonPerOrder?: number;        // TON
    maxUsdtPerOrder?: number;       // USDT
}

export interface FragmentAPIv3Options {
    mnemonic: string | string[];
    walletType?: WalletType;
    fragmentCookies?: string;
    baseUrl?: string;
    trust?: TrustOptions;
    externalTtlSeconds?: number;    // how long a signed payment stays valid (default 120, max 300)
}

export interface CreateOrderParams {
    product: "stars" | "premium" | "ton";
    username: string;
    amount: number;
    kyc?: boolean;
    paymentMethod?: "ton" | "usdt_ton";
    showSender?: boolean;
    idempotencyKey?: string;
    customOrderInfo?: string;
}

export interface CreatedOrder {
    order: any;
    payment: PaymentRequest | null;
    recipientId?: string;   // Fragment's id for the recipient (fresh creates only)
}

export interface PreparedPayment {
    orders: string[];
    boc: string;
    normalizedHash: string;
    validUntil: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class FragmentAPIv3 {
    readonly walletType: WalletType;
    readonly wallet: Address;
    private readonly keyPair: KeyPair;
    private readonly http: AxiosInstance;
    private readonly baseUrl: string;
    private authKey?: string;
    private policy?: TrustPolicy;

    constructor(private readonly opts: FragmentAPIv3Options) {
        this.walletType = opts.walletType ?? "v4r2";
        this.keyPair = keyPairFromMnemonic(opts.mnemonic);
        this.wallet = walletAddress(this.walletType, this.keyPair.publicKey);
        this.baseUrl = (opts.baseUrl ?? "https://api.fragment-api.net").replace(/\/$/, "");
        this.http = axios.create({ baseURL: this.baseUrl, validateStatus: () => true, timeout: 0 });
    }

    get address(): string {
        return this.wallet.toFriendly(false);
    }

    // Errors never carry the request: an axios error would, and bodies hold keys.
    private async call(method: "get" | "post", path: string, data?: any, auth = true): Promise<{ status: number; data: any }> {
        const headers: Record<string, string> = {};
        if (auth) headers.Authorization = "Bearer " + (await this.ensureAuth());
        try {
            const r = method === "get" ? await this.http.get(path, { headers, params: data })
                : await this.http.post(path, data, { headers });
            return { status: r.status, data: r.data };
        } catch (err: any) {
            const e: any = new FragmentAPIError(err?.message || "Request failed", undefined, "NETWORK_ERROR");
            e.code = err?.code;
            throw e;
        }
    }

    private fail(r: { status: number; data: any }): never {
        const d = r.data || {};
        throw new FragmentAPIError(d.message || `HTTP Error: ${r.status}`, r.status, d.error_code, d);
    }

    async auth(): Promise<string> {
        const domain = new URL(this.baseUrl).hostname;
        const timestamp = Math.floor(Date.now() / 1000);
        const payload = cookiesPayload(this.opts.fragmentCookies);
        const signature = tonProofSignature(this.keyPair, this.wallet, domain, timestamp, payload);
        const r = await this.call("post", "/v3/auth", {
            public_key: this.keyPair.publicKey.toString("hex"),
            wallet_type: this.walletType,
            fragment_cookies: this.opts.fragmentCookies ?? null,
            proof: { timestamp, domain, payload, signature: signature.toString("base64") },
        }, false);
        if (r.status !== 200 || !r.data?.auth_key) this.fail(r);
        if (!Address.parse(r.data.wallet.address).equals(this.wallet)) {
            throw new FragmentAPIError("Server derived a different wallet address", r.status, "WALLET_MISMATCH");
        }
        this.authKey = r.data.auth_key;
        return this.authKey!;
    }

    private async ensureAuth(): Promise<string> {
        return this.authKey ?? this.auth();
    }

    async config(): Promise<any> {
        const r = await this.call("get", "/v3/config", undefined, false);
        if (r.status !== 200) this.fail(r);
        return r.data;
    }

    async walletInfo(): Promise<any> {
        const r = await this.call("get", "/v3/wallet");
        if (r.status !== 200) this.fail(r);
        return r.data;
    }

    async userInfo(username: string): Promise<any> {
        const r = await this.call("get", "/v3/user_info", { username });
        if (r.status !== 200) this.fail(r);
        return r.data;
    }

    async getOrder(orderId: string): Promise<CreatedOrder> {
        const r = await this.call("get", `/v3/orders/${encodeURIComponent(orderId)}`);
        if (r.status !== 200) this.fail(r);
        return { order: r.data.order, payment: r.data.payment };
    }

    async listOrders(limit = 10, offset = 0): Promise<any[]> {
        const r = await this.call("get", "/v3/orders", { limit, offset });
        if (r.status !== 200) this.fail(r);
        return r.data.orders;
    }

    async createOrder(p: CreateOrderParams): Promise<CreatedOrder> {
        const r = await this.call("post", "/v3/orders", {
            product: p.product, username: p.username, amount: p.amount, kyc: p.kyc ?? true,
            payment_method: p.paymentMethod ?? "ton", show_sender: p.showSender ?? true,
            idempotency_key: p.idempotencyKey ?? null, custom_order_info: p.customOrderInfo ?? null,
        });
        if (r.status !== 200) this.fail(r);
        return { order: r.data.order, payment: r.data.payment, recipientId: r.data.recipient_id };
    }

    // The checks prepare() makes, for one order and without signing: lets a caller that
    // batches orders turn away a bad one alone instead of failing the whole batch.
    async checkOrder(created: CreatedOrder): Promise<void> {
        if (!created.payment) throw new FragmentAPIError(`Order ${created.order?.id} has nothing to pay`, undefined, "NOTHING_TO_PAY");
        try {
            checkPayment(created.payment, this.wallet, await this.trustPolicy(), created.order.kyc !== false);
        } catch (e) {
            if (e instanceof UntrustedPayment) throw new FragmentAPIError(`Refusing to sign: ${e.message}`, undefined, "UNTRUSTED_PAYMENT");
            throw e;
        }
    }

    private async trustPolicy(): Promise<TrustPolicy> {
        if (this.policy) return this.policy;
        const t = this.opts.trust ?? {};
        const fee = [...(t.feeWallets ?? [])];
        const middle = [...(t.middleWallets ?? [])];
        if (t.trustServerConfig ?? true) {
            const cfg = await this.config();
            if (cfg.fee_wallet) fee.push(cfg.fee_wallet);
            if (cfg.middle_wallet) middle.push(cfg.middle_wallet);
        }
        this.policy = {
            fragmentAddresses: [...FRAGMENT_ADDRESSES, ...(t.fragmentAddresses ?? [])],
            feeWallets: fee,
            middleWallets: middle,
            maxFeePercent: t.maxFeePercent ?? 5,
            maxTonPerOrder: t.maxTonPerOrder !== undefined ? BigInt(Math.round(t.maxTonPerOrder * 1e9)) : undefined,
            maxUsdtPerOrder: t.maxUsdtPerOrder !== undefined ? BigInt(Math.round(t.maxUsdtPerOrder * 1e6)) : undefined,
        };
        return this.policy;
    }

    // Check and sign one external paying these orders. Persist the result before submitting
    // it if you need to survive a crash: resubmitting the SAME external is always safe.
    async prepare(created: CreatedOrder[]): Promise<PreparedPayment> {
        if (!created.length) throw new Error("nothing to pay");
        const policy = await this.trustPolicy();
        const messages: { address: string; amount: bigint; body: ReturnType<typeof cellFromBase64> }[] = [];
        let deadline = Number.MAX_SAFE_INTEGER;
        for (const c of created) {
            if (!c.payment) throw new FragmentAPIError(`Order ${c.order?.id} has no payment to sign (status ${c.order?.status})`, undefined, "NOTHING_TO_PAY");
            try {
                checkPayment(c.payment, this.wallet, policy, c.order.kyc !== false);
            } catch (e) {
                if (e instanceof UntrustedPayment) throw new FragmentAPIError(`Refusing to sign: ${e.message}`, undefined, "UNTRUSTED_PAYMENT");
                throw e;
            }
            deadline = Math.min(deadline, c.payment.valid_until);
            for (const m of c.payment.messages) messages.push({ address: m.address, amount: BigInt(m.amount), body: cellFromBase64(m.payload) });
        }
        if (messages.length > MAX_MESSAGES[this.walletType]) {
            throw new FragmentAPIError(`${messages.length} messages exceed what a ${this.walletType} wallet sends at once`, undefined, "TOO_MANY_MESSAGES");
        }
        const w = await this.walletInfo();
        const ttl = Math.min(this.opts.externalTtlSeconds ?? 120, 300);
        const validUntil = Math.min(deadline, Math.floor(Date.now() / 1000) + ttl);
        const signed = signExternal({
            type: this.walletType, keyPair: this.keyPair, seqno: Number(w.seqno), validUntil, messages,
            includeStateInit: w.state !== "active",
        });
        return { orders: created.map((c) => String(c.order.id)), boc: signed.boc, normalizedHash: signed.normalizedHash, validUntil };
    }

    // Submit a prepared external. Retries what is safe to retry: the same external when the
    // outcome is unknown or nothing was sent; never a new signature unless the server says
    // the old one can not land. TRANSFER_AMBIGUOUS is thrown - reconcile, never re-sign.
    async submit(prepared: PreparedPayment, created?: CreatedOrder[]): Promise<any> {
        let current = prepared;
        let resigns = 0, retries = 0;
        for (;;) {
            let r: { status: number; data: any };
            try {
                r = await this.call("post", "/v3/orders/submit", { orders: current.orders, boc: current.boc });
            } catch (e: any) {
                if (++retries > 6) throw new FragmentAPIError(`Submit outcome unknown after ${retries} tries - resubmit the same external later`, undefined, "SUBMIT_OUTCOME_UNKNOWN", { prepared: current });
                await sleep(2000 * retries);
                continue;
            }
            if (r.status === 200) return r.data;
            const code = r.data?.error_code;
            const canResign = created && resigns < 3 && (
                (code === "TRANSFER_NOT_SENT" && r.data?.resign) ||
                (code === "INVALID_SIGNED_MESSAGE" && r.data?.released !== undefined && /seqno/.test(r.data?.reason ?? "")));
            if (canResign) {
                resigns++;
                current = await this.prepare(created!);
                continue;
            }
            if ((code === "TRANSFER_NOT_SENT" && !r.data?.resign) || code === "TON_SERVICE_UNAVAILABLE") {
                if (++retries > 6) this.fail(r);
                await sleep(2000 * retries);
                continue;
            }
            this.fail(r);
        }
    }

    async payOrders(created: CreatedOrder[]): Promise<any> {
        return this.submit(await this.prepare(created), created);
    }

    async buy(p: CreateOrderParams): Promise<any> {
        const created = await this.createOrder(p);
        if (created.order.status !== "created") return { success: created.order.status === "success", orders: [created.order], idempotent: true };
        return this.payOrders([created]);
    }
}
