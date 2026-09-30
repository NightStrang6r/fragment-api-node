// What the SDK checks before it signs a payment the server asked for (docs/api-v3.md).
//
// The server no longer holds the seed, but it still says what to sign. Signing whatever
// arrives would let a compromised server spend as before, so every message is checked
// against things the server does not control: the order the CALLER asked for (not the
// server's echo of it), Fragment's addresses and the service's wallets pinned here, the
// payer's own USDT wallet (derived here), a fee ceiling, and the caller's per-order caps
// - required, because Fragment's payload can not be checked: a compromised server could
// hand over an invoice for someone else's purchase, and the cap is what bounds that.
import { Address, loadAddress, storeAddress } from "./address.js";
import { Cell, beginCell, cellFromBase64, libraryCell } from "./cell.js";

// tonapi names all three "Fragment": UQBAjaOy... (wallet v3r2), UQCFJEP4... and UQBeab7D...
// (highload v3). Jetton (USDT) payments are addressed to UQCFJEP4... inside the transfer.
export const FRAGMENT_ADDRESSES: readonly string[] = [
    "UQBAjaOyi2wGWlk-EDkSabqqnF-MrrwMadnwqrurKpkla4QB",
    "UQCFJEP4WZ_mpdo0_kMEmsTgvrMHG7K_tWY16pQhKHwoOtFz",
    "UQBeab7D38RIwypegbN7YZgQzwDbb8QfMMwY8ouJc3qPl4CJ",
];

// The service's own wallets, pinned at release like Fragment's: the fee wallet (`fee`
// legs) and the middle wallet (no-KYC `middle` legs). Fill in before publishing. Empty
// trusts none: such legs are refused unless the caller names the wallets
// (trust.feeWallets / trust.middleWallets) or opts into trust.trustServerConfig.
export const OPERATOR_FEE_WALLETS: readonly string[] = [];
export const OPERATOR_MIDDLE_WALLETS: readonly string[] = [];

export const USDT_MASTER = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
// USDT's jetton wallet code is a library cell referencing this hash - what the USDT master's
// get_jetton_data returns (2026-09-30), checked against its get_wallet_address for new and
// old holders (test/usdt-wallet-vectors.json). Its data is status:uint4 balance:Coins
// owner master. Should Tether change the code, USDT payments are refused until this is
// updated (or the caller sets trust.usdtWallet).
const USDT_WALLET_CODE_HASH = "8f452d7a4dfd74066b682365177259ed05734435be76b5fd4bd5d8af2b7c3d68";

const JETTON_TRANSFER = 0x0f8a7ea5n;
const MAX_JETTON_GAS = 300_000_000n;   // 0.3 TON: the gas on a jetton leg, never a price

export type Role = "fragment" | "fee" | "middle";
export type PaymentMethod = "ton" | "usdt_ton";

export interface PaymentMessage {
    address: string;
    amount: string;
    payload: string;
    role: Role;
}

export interface PaymentRequest {
    valid_until: number;
    network: string;
    from: string;
    messages: PaymentMessage[];
}

export interface TrustPolicy {
    fragmentAddresses: string[];   // pinned + caller's extras
    feeWallets: string[];          // who may receive a `fee` leg
    middleWallets: string[];       // who may receive a no-KYC `middle` leg
    maxFeePercent: number;         // fee leg ceiling, % of the Fragment leg in its currency
    maxTonPerOrder?: bigint;       // nanotons across all legs of one order - required
    maxUsdtPerOrder?: bigint;      // raw USDT units (6 decimals) - required for USDT orders
    usdtWallet?: Address;          // the payer's USDT jetton wallet, if not the derived one
}

// What the caller asked for: the server's copy of it is never what is checked against.
export interface Expected {
    kyc: boolean;
    paymentMethod: PaymentMethod;
}

export interface JettonTransfer {
    amount: bigint;
    destination: Address | null;
    response: Address | null;
    forwardTon: bigint;
}

export function parseJettonTransfer(body: Cell): JettonTransfer | null {
    const s = body.beginParse();
    if (s.remainingBits < 32 || s.loadUint(32) !== JETTON_TRANSFER) return null;
    s.loadUint(64);                              // query_id
    const amount = s.loadCoins();
    const destination = loadAddress(s);
    const response = loadAddress(s);
    s.loadMaybeRef();                            // custom payload
    const forwardTon = s.loadCoins();
    return { amount, destination, response, forwardTon };
}

// The owner's USDT jetton wallet, computed here - never taken from the server, which could
// otherwise point a "USDT" transfer at the owner's wallet of some other token.
export function usdtWalletOf(owner: Address): Address {
    const data = beginCell().storeUint(0, 4).storeCoins(0n);
    storeAddress(data, owner);
    storeAddress(data, Address.parse(USDT_MASTER));
    const init = beginCell().storeBit(0).storeBit(0)
        .storeMaybeRef(libraryCell(Buffer.from(USDT_WALLET_CODE_HASH, "hex")))
        .storeMaybeRef(data.endCell())
        .storeBit(0).endCell();
    return new Address(0, init.hash());
}

function inList(address: Address | null, list: readonly string[]): boolean {
    return !!address && list.some((a) => Address.parse(a).equals(address));
}

export class UntrustedPayment extends Error {}

// Throws UntrustedPayment unless every message of this order's request is acceptable.
export function checkPayment(request: PaymentRequest, payer: Address, policy: TrustPolicy, expected: Expected): void {
    const fail = (why: string) => { throw new UntrustedPayment(why); };
    if (!sameWallet(request.from, payer)) fail("payment request is for another wallet");
    // A KYC order is Fragment's own message, optionally followed by our fee; a no-KYC
    // order is one payment to the middle wallet. Anything else is not what was ordered.
    const shape = request.messages.map((m) => m.role).join(",");
    const allowed = expected.kyc ? ["fragment", "fragment,fee"] : ["middle"];
    if (!allowed.includes(shape)) fail(`unexpected legs [${shape}] for a ${expected.kyc ? "KYC" : "no-KYC"} order`);
    if (policy.maxTonPerOrder === undefined) fail("no per-order TON limit: set trust.maxTonPerOrder");

    const usdtWallet = policy.usdtWallet ?? usdtWalletOf(payer);
    let ton = 0n, usdt = 0n;
    let fragmentTon = 0n, fragmentUsdt = 0n;
    for (const m of request.messages) {
        const amount = BigInt(m.amount);
        const to = Address.parse(m.address);
        const jetton = parseJettonTransfer(cellFromBase64(m.payload));
        ton += amount;
        if (jetton) {
            if (expected.paymentMethod !== "usdt_ton") fail(`${m.role}: a jetton transfer in a TON order`);
            if (!to.equals(usdtWallet)) fail(`${m.role}: the transfer is not sent to your USDT wallet`);
            if (amount > MAX_JETTON_GAS) fail(`${m.role}: ${amount} nanotons attached to a jetton transfer`);
            if (!jetton.response || !jetton.response.equals(payer)) fail(`${m.role}: jetton excess would go to someone else`);
            if (jetton.forwardTon > 100_000_000n) fail(`${m.role}: forwards too much TON`);
            usdt += jetton.amount;
        } else if (m.role === "fragment" && expected.paymentMethod === "usdt_ton") {
            fail("fragment: a USDT order paid in TON");
        }
        const recipient = jetton ? jetton.destination : to;
        if (m.role === "fragment") {
            if (!inList(recipient, policy.fragmentAddresses)) fail("fragment leg is not addressed to Fragment");
            if (jetton) fragmentUsdt += jetton.amount; else fragmentTon += amount;
        } else if (m.role === "fee") {
            if (!inList(recipient, policy.feeWallets)) fail("fee leg goes to an unknown wallet");
        } else if (m.role === "middle") {
            if (!inList(recipient, policy.middleWallets)) fail("no-KYC payment goes to an unknown wallet");
        }
    }
    for (const m of request.messages.filter((x) => x.role === "fee")) {
        const jetton = parseJettonTransfer(cellFromBase64(m.payload));
        const fee = jetton ? jetton.amount : BigInt(m.amount);
        const base = jetton ? fragmentUsdt : fragmentTon;
        // fee * 100 <= base * maxFeePercent, in integers (percent to 1/100 precision)
        if (fee * 10000n > base * BigInt(Math.round(policy.maxFeePercent * 100))) {
            fail(`fee exceeds ${policy.maxFeePercent}% of the purchase`);
        }
    }
    if (ton > policy.maxTonPerOrder!) fail(`order needs ${ton} nanotons, the limit is ${policy.maxTonPerOrder}`);
    if (usdt > 0n) {
        if (policy.maxUsdtPerOrder === undefined) fail("no per-order USDT limit: set trust.maxUsdtPerOrder");
        if (usdt > policy.maxUsdtPerOrder!) fail(`order needs ${usdt} USDT units, the limit is ${policy.maxUsdtPerOrder}`);
    }
}

function sameWallet(a: string, b: Address): boolean {
    try {
        return Address.parse(a).equals(b);
    } catch {
        return false;
    }
}
