// What the SDK checks before it signs a payment the server asked for (docs/api-v3.md).
//
// The server no longer holds the seed, but it still says what to sign. Signing whatever
// arrives would let a compromised server spend as before, one order at a time, so every
// message is checked against things the server does not control: Fragment's addresses
// pinned here, the fee / middle wallets the caller trusts, a fee ceiling, amount caps.
import { Address, loadAddress } from "./address.js";
import { Cell, cellFromBase64 } from "./cell.js";

// tonapi names all three "Fragment": UQBAjaOy... (wallet v3r2), UQCFJEP4... and UQBeab7D...
// (highload v3). Jetton (USDT) payments are addressed to UQCFJEP4... inside the transfer.
export const FRAGMENT_ADDRESSES: readonly string[] = [
    "UQBAjaOyi2wGWlk-EDkSabqqnF-MrrwMadnwqrurKpkla4QB",
    "UQCFJEP4WZ_mpdo0_kMEmsTgvrMHG7K_tWY16pQhKHwoOtFz",
    "UQBeab7D38RIwypegbN7YZgQzwDbb8QfMMwY8ouJc3qPl4CJ",
];

const JETTON_TRANSFER = 0x0f8a7ea5n;
const MAX_JETTON_GAS = 300_000_000n;   // 0.3 TON: the gas on a jetton leg, never a price

export type Role = "fragment" | "fee" | "middle";

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
    maxTonPerOrder?: bigint;       // nanotons across all legs of one order
    maxUsdtPerOrder?: bigint;      // raw USDT units (6 decimals) across all legs
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

function inList(address: Address | null, list: string[]): boolean {
    return !!address && list.some((a) => Address.parse(a).equals(address));
}

export class UntrustedPayment extends Error {}

// Throws UntrustedPayment unless every message of this order's request is acceptable.
export function checkPayment(request: PaymentRequest, payer: Address, policy: TrustPolicy, kyc: boolean): void {
    const fail = (why: string) => { throw new UntrustedPayment(why); };
    if (!sameWallet(request.from, payer)) fail("payment request is for another wallet");
    // A KYC order is Fragment's own message, optionally followed by our fee; a no-KYC
    // order is one payment to the middle wallet. Anything else is not what was ordered.
    const shape = request.messages.map((m) => m.role).join(",");
    const allowed = kyc ? ["fragment", "fragment,fee"] : ["middle"];
    if (!allowed.includes(shape)) fail(`unexpected legs [${shape}] for a ${kyc ? "KYC" : "no-KYC"} order`);

    let ton = 0n, usdt = 0n;
    let fragmentTon = 0n, fragmentUsdt = 0n;
    for (const m of request.messages) {
        const amount = BigInt(m.amount);
        const to = Address.parse(m.address);
        const jetton = parseJettonTransfer(cellFromBase64(m.payload));
        ton += amount;
        if (jetton) {
            if (amount > MAX_JETTON_GAS) fail(`${m.role}: ${amount} nanotons attached to a jetton transfer`);
            if (!jetton.response || !jetton.response.equals(payer)) fail(`${m.role}: jetton excess would go to someone else`);
            if (jetton.forwardTon > 100_000_000n) fail(`${m.role}: forwards too much TON`);
            usdt += jetton.amount;
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
    if (policy.maxTonPerOrder !== undefined && ton > policy.maxTonPerOrder) fail(`order needs ${ton} nanotons, cap is ${policy.maxTonPerOrder}`);
    if (policy.maxUsdtPerOrder !== undefined && usdt > policy.maxUsdtPerOrder) fail(`order needs ${usdt} USDT units, cap is ${policy.maxUsdtPerOrder}`);
}

function sameWallet(a: string, b: Address): boolean {
    try {
        return Address.parse(a).equals(b);
    } catch {
        return false;
    }
}
