// Fragment API v3 client: your mnemonic stays in this process. The server prepares each
// payment, this client checks it and signs it, the server relays and confirms it.
// See the API's /docs/api-v3.
import axios, { AxiosInstance } from "axios";
import FragmentAPIError from "../FragmentAPIError.js";
import { Address } from "./address.js";
import { cellFromBase64 } from "./cell.js";
import { KeyPair, keyPairFromMnemonic } from "./keys.js";
import {
    Expected, FRAGMENT_ADDRESSES, OPERATOR_FEE_WALLETS, OPERATOR_MIDDLE_WALLETS, PaymentRequest, TrustPolicy,
    UntrustedPayment, checkPayment,
} from "./payment.js";
import { proofPayload, tonProofSignature } from "./proof.js";
import { MAX_MESSAGES, WalletType, signExternal, walletAddress } from "./wallet.js";

export interface TrustOptions {
    maxTonPerOrder?: number;        // TON, all legs of one order. Required: nothing is signed without it
    maxUsdtPerOrder?: number;       // USDT. Required for USDT orders
    fragmentAddresses?: string[];   // added to the pinned list, never replacing it
    feeWallets?: string[];          // added to the pinned OPERATOR_FEE_WALLETS
    middleWallets?: string[];       // added to the pinned OPERATOR_MIDDLE_WALLETS
    trustServerConfig?: boolean;    // also accept the fee/middle wallets /v3/config names (default false)
    maxFeePercent?: number;         // default 5
    usdtWallet?: string;            // your USDT jetton wallet, if it is not the standard one
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
    recipientId?: string;           // Fragment's id for the recipient (fresh creates only)
    request?: CreateOrderParams;    // what was asked for - the checks use this, not the server's echo
}

export interface PreparedPayment {
    orders: string[];
    boc: string;
    normalizedHash: string;
    validUntil: number;
    seqno: number;                  // a re-signature of these orders keeps it (see submit)
    stateInit: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// After its valid_until an external can never be applied; this long past it, no block
// that could still carry it will come.
const EXPIRY_MARGIN_MS = 30_000;
const USERNAME = /(?:^https?:\/\/t\.me\/|^@|^)([a-zA-Z0-9_]{5,32})\/?$/;
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];

// The API gets the auth key and Fragment cookies: plain HTTP only to this machine (tests).
function checkedBaseUrl(value: string): string {
    const url = new URL(value);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.includes(url.hostname))) {
        throw new Error(`baseUrl must be https:// (got ${url.protocol}//${url.host})`);
    }
    return value.replace(/\/$/, "");
}

function untrusted(message: string): FragmentAPIError {
    return new FragmentAPIError(`Refusing to sign: ${message}`, undefined, "UNTRUSTED_PAYMENT");
}

// The server's copy of the order must be the order that was asked for.
function checkEcho(created: CreatedOrder): void {
    const p = created.request;
    const o = created.order ?? {};
    if (!p) return;
    const name = (s: string) => (USERNAME.exec(String(s ?? "").trim())?.[1] ?? "").toLowerCase();
    const same = o.product === p.product && Number(o.amount) === Number(p.amount)
        && (o.kyc !== false) === (p.kyc ?? true)
        && (o.payment_method ?? "ton") === (p.paymentMethod ?? "ton")
        && name(o.username) !== "" && name(o.username) === name(p.username);
    if (!same) throw untrusted("the order is not the one that was asked for");
}

function expectedOf(created: CreatedOrder): Expected {
    // Without the request (e.g. an order from getOrder) nothing but a KYC order in the
    // order's own currency is accepted: the no-KYC shape pays the service directly.
    const p = created.request;
    return {
        kyc: p ? (p.kyc ?? true) : true,
        paymentMethod: p ? (p.paymentMethod ?? "ton") : (created.order?.payment_method === "usdt_ton" ? "usdt_ton" : "ton"),
    };
}

export class FragmentAPIv3 {
    readonly walletType: WalletType;
    readonly wallet: Address;
    readonly #keyPair: KeyPair;          // private fields: never in console.log or JSON
    readonly #fragmentCookies?: string;
    #authKey?: string;
    readonly #http: AxiosInstance;
    readonly #baseUrl: string;
    readonly #trust: TrustOptions;
    readonly #ttl: number;
    #policy?: TrustPolicy;
    // Orders signed by this client: the seqno and expiry of their latest external.
    readonly #signed = new Map<string, { seqno: number; validUntil: number }>();

    constructor(opts: FragmentAPIv3Options) {
        this.walletType = opts.walletType ?? "v4r2";
        this.#keyPair = keyPairFromMnemonic(opts.mnemonic);
        this.wallet = walletAddress(this.walletType, this.#keyPair.publicKey);
        this.#fragmentCookies = opts.fragmentCookies;
        this.#baseUrl = checkedBaseUrl(opts.baseUrl ?? "https://api.fragment-api.net");
        this.#http = axios.create({ baseURL: this.#baseUrl, validateStatus: () => true, timeout: 0 });
        this.#trust = { ...(opts.trust ?? {}) };
        this.#ttl = Math.min(opts.externalTtlSeconds ?? 120, 300);
    }

    get address(): string {
        return this.wallet.toFriendly(false);
    }

    // Errors never carry the request: an axios error would, and bodies hold keys.
    private async call(method: "get" | "post" | "delete", path: string, data?: any, auth = true): Promise<{ status: number; data: any }> {
        const headers: Record<string, string> = {};
        if (auth) headers.Authorization = "Bearer " + (await this.ensureAuth());
        try {
            const r = method === "get" ? await this.#http.get(path, { headers, params: data })
                : method === "delete" ? await this.#http.delete(path, { headers })
                : await this.#http.post(path, data, { headers });
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
        const challenge = await this.call("get", "/v3/auth/challenge", undefined, false);
        if (challenge.status !== 200 || !challenge.data?.nonce) this.fail(challenge);
        const domain = new URL(this.#baseUrl).hostname;
        const timestamp = Math.floor(Date.now() / 1000);
        const payload = proofPayload(String(challenge.data.nonce), this.#fragmentCookies);
        const signature = tonProofSignature(this.#keyPair, this.wallet, domain, timestamp, payload);
        const r = await this.call("post", "/v3/auth", {
            public_key: this.#keyPair.publicKey.toString("hex"),
            wallet_type: this.walletType,
            fragment_cookies: this.#fragmentCookies ?? null,
            proof: { timestamp, domain, payload, signature: signature.toString("base64") },
        }, false);
        if (r.status !== 200 || !r.data?.auth_key) this.fail(r);
        if (!Address.parse(r.data.wallet.address).equals(this.wallet)) {
            throw new FragmentAPIError("Server derived a different wallet address", r.status, "WALLET_MISMATCH");
        }
        this.#authKey = r.data.auth_key;
        return this.#authKey!;
    }

    private async ensureAuth(): Promise<string> {
        return this.#authKey ?? this.auth();
    }

    // Revoke the auth key this client holds (e.g. when retiring a machine). The next call
    // signs in again.
    async revoke(): Promise<void> {
        if (!this.#authKey) return;
        const r = await this.call("delete", "/v3/auth");
        if (r.status !== 200) this.fail(r);
        this.#authKey = undefined;
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
        const created: CreatedOrder = { order: r.data.order, payment: r.data.payment, recipientId: r.data.recipient_id, request: { ...p } };
        checkEcho(created);
        return created;
    }

    // The checks prepare() makes, for one order and without signing: lets a caller that
    // batches orders turn away a bad one alone instead of failing the whole batch.
    async checkOrder(created: CreatedOrder): Promise<void> {
        if (!created.payment) throw new FragmentAPIError(`Order ${created.order?.id} has nothing to pay`, undefined, "NOTHING_TO_PAY");
        checkEcho(created);
        try {
            checkPayment(created.payment, this.wallet, await this.trustPolicy(), expectedOf(created));
        } catch (e) {
            if (e instanceof UntrustedPayment) throw untrusted(e.message);
            throw e;
        }
    }

    private async trustPolicy(): Promise<TrustPolicy> {
        if (this.#policy) return this.#policy;
        const t = this.#trust;
        const fee = [...OPERATOR_FEE_WALLETS, ...(t.feeWallets ?? [])];
        const middle = [...OPERATOR_MIDDLE_WALLETS, ...(t.middleWallets ?? [])];
        if (t.trustServerConfig === true) {
            const cfg = await this.config();
            if (cfg.fee_wallet) fee.push(cfg.fee_wallet);
            if (cfg.middle_wallet) middle.push(cfg.middle_wallet);
        }
        this.#policy = {
            fragmentAddresses: [...FRAGMENT_ADDRESSES, ...(t.fragmentAddresses ?? [])],
            feeWallets: fee,
            middleWallets: middle,
            maxFeePercent: t.maxFeePercent ?? 5,
            maxTonPerOrder: t.maxTonPerOrder !== undefined ? BigInt(Math.round(t.maxTonPerOrder * 1e9)) : undefined,
            maxUsdtPerOrder: t.maxUsdtPerOrder !== undefined ? BigInt(Math.round(t.maxUsdtPerOrder * 1e6)) : undefined,
            usdtWallet: t.usdtWallet ? Address.parse(t.usdtWallet) : undefined,
        };
        return this.#policy;
    }

    // Check and sign one external paying these orders. Persist the result before submitting
    // it if you need to survive a crash: resubmitting the SAME external is always safe.
    //
    // `seqno` re-signs with the seqno of an earlier external for the same orders: both
    // can not land, so it is the only safe re-signature. With a different seqno, an
    // earlier external of these orders that is still valid could land as well - so this
    // waits until every such external has expired before signing.
    async prepare(created: CreatedOrder[], resign?: { seqno: number; stateInit: boolean }): Promise<PreparedPayment> {
        if (!created.length) throw new Error("nothing to pay");
        const policy = await this.trustPolicy();
        const messages: { address: string; amount: bigint; body: ReturnType<typeof cellFromBase64> }[] = [];
        let deadline = Number.MAX_SAFE_INTEGER;
        for (const c of created) {
            if (!c.payment) throw new FragmentAPIError(`Order ${c.order?.id} has no payment to sign (status ${c.order?.status})`, undefined, "NOTHING_TO_PAY");
            checkEcho(c);
            try {
                checkPayment(c.payment, this.wallet, policy, expectedOf(c));
            } catch (e) {
                if (e instanceof UntrustedPayment) throw untrusted(e.message);
                throw e;
            }
            deadline = Math.min(deadline, c.payment.valid_until);
            for (const m of c.payment.messages) messages.push({ address: m.address, amount: BigInt(m.amount), body: cellFromBase64(m.payload) });
        }
        if (messages.length > MAX_MESSAGES[this.walletType]) {
            throw new FragmentAPIError(`${messages.length} messages exceed what a ${this.walletType} wallet sends at once`, undefined, "TOO_MANY_MESSAGES");
        }
        const ids = created.map((c) => String(c.order.id));
        let seqno: number, stateInit: boolean;
        if (resign) {
            ({ seqno, stateInit } = resign);
        } else {
            const w = await this.walletInfo();
            seqno = Number(w.seqno);
            stateInit = w.state !== "active";
            const live = Math.max(0, ...ids.map((id) => this.#signed.get(id))
                .filter((s): s is { seqno: number; validUntil: number } => !!s && s.seqno !== seqno)
                .map((s) => s.validUntil * 1000 + EXPIRY_MARGIN_MS - Date.now()));
            if (live > 360_000) throw new FragmentAPIError("An earlier signature of these orders is still valid", undefined, "EARLIER_SIGNATURE_VALID");
            if (live > 0) await sleep(live);
        }
        const ttl = this.#ttl;
        const validUntil = Math.min(deadline, Math.floor(Date.now() / 1000) + ttl);
        const signed = signExternal({ type: this.walletType, keyPair: this.#keyPair, seqno, validUntil, messages, includeStateInit: stateInit });
        for (const id of ids) this.#signed.set(id, { seqno, validUntil });
        return { orders: ids, boc: signed.boc, normalizedHash: signed.normalizedHash, validUntil, seqno, stateInit };
    }

    // Submit a prepared external. Retries what is safe to retry: the same external when the
    // outcome is unknown or nothing was sent. Re-signs only when the server says it can not
    // land - and then with the SAME seqno, so that even a lying server can not get these
    // orders paid twice. TRANSFER_AMBIGUOUS is thrown - reconcile, never re-sign.
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
            if (created && resigns < 3 && code === "TRANSFER_NOT_SENT" && r.data?.resign) {
                resigns++;
                current = await this.prepare(created, { seqno: current.seqno, stateInit: current.stateInit });
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
