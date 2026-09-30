// Fragment API v3 examples. Payments are signed here - your seed phrase is never sent.
//
//   TON_SEED="word1 ... word24" WALLET_TYPE=v5r1 FRAGMENT_COOKIES="stel_ssid=...; ..." node example.js
//
// It only reads (wallet, recipient, orders) unless BUY=1 and RECIPIENT=<username> are set:
// then it buys for real - TON leaves your wallet. FRAGMENT_API_URL picks another API host.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { FragmentAPIv3 } from "./index.js";

const api = new FragmentAPIv3({
    mnemonic: process.env.TON_SEED,                  // 24 words, used here to sign
    walletType: process.env.WALLET_TYPE || "v5r1",   // "v4r2" or "v5r1" (W5) - must be your wallet's
    fragmentCookies: process.env.FRAGMENT_COOKIES,   // your Fragment account, for KYC orders
    trust: { maxTonPerOrder: 10, maxUsdtPerOrder: 20 },   // refuse to sign anything bigger
    baseUrl: process.env.FRAGMENT_API_URL,           // default https://api.fragment-api.net
});
const RECIPIENT = process.env.RECIPIENT;

async function readOnly() {
    console.log("Wallet:", api.address);             // check that this is your wallet
    const w = await api.walletInfo();
    console.log(`Balance: ${Number(w.balance_nano) / 1e9} TON, ${Number(w.usdt_raw || 0) / 1e6} USDT (${w.state})`);
    console.log("Recipient lookup:", await api.userInfo(RECIPIENT || "durov"));
    console.log("Last orders:", await api.listOrders(5));
}

// Your Fragment account (KYC), paid in TON. Run it twice: the same idempotency key
// returns the same order instead of buying again.
async function buyStars() {
    const r = await api.buy({ product: "stars", username: RECIPIENT, amount: 50, idempotencyKey: "example:stars:1" });
    console.log("Stars:", r.success, r.orders[0].ref_id, r.idempotent ? "(bought before)" : r.transaction_hash);
}

// Without KYC: bought through the service's account - no Fragment account, no cookies.
async function buyPremiumWithoutKyc() {
    const r = await api.buy({ product: "premium", username: RECIPIENT, amount: 3, kyc: false, idempotencyKey: "example:premium:1" });
    console.log("Premium:", r.success, r.orders[0].ref_id);
}

// In USDT. Keep a little TON on the wallet too: the transfer carries some for gas.
async function buyStarsForUsdt() {
    const r = await api.buy({ product: "stars", username: RECIPIENT, amount: 100, paymentMethod: "usdt_ton", idempotencyKey: "example:usdt:1" });
    console.log("Stars for USDT:", r.success, r.orders[0].cost, r.orders[0].currency);
}

// Several orders, one transaction (up to 127 KYC orders from a W5 wallet, 2 from v4r2).
async function batch() {
    const orders = [];
    for (const i of [1, 2]) {
        const created = await api.createOrder({ product: "stars", username: RECIPIENT, amount: 50, idempotencyKey: `example:batch:${i}` });
        if (created.order.status !== "created") continue;     // paid on an earlier run
        await api.checkOrder(created);                         // a bad order is refused alone
        orders.push(created);
    }
    if (!orders.length) return console.log("Batch: paid before");
    const r = await api.payOrders(orders);
    console.log("Batch:", r.orders.map((o) => `${o.ref_id} ${o.status}`).join(", "), r.transaction_hash);
}

// Crash-safe: the signed payment is stored before it is sent, and a payment signed
// before a crash is sent again on the next run - never signed anew. Sending the same
// signed payment twice is safe: it can be applied only once.
const PENDING = "pending-payment.json";
const FINAL = ["TRANSFER_FAILED", "TRANSFER_NOT_SENT", "ORDER_EXPIRED", "INVALID_SIGNED_MESSAGE"];

async function send(prepared, created) {
    try {
        const r = await api.submit(prepared, created);
        rmSync(PENDING, { force: true });
        return r;
    } catch (e) {
        if (FINAL.includes(e.error_code)) rmSync(PENDING, { force: true });   // settled: nothing to resend
        throw e;                                                              // unknown: keep it for the next run
    }
}

async function crashSafe() {
    if (existsSync(PENDING)) {
        const r = await send(JSON.parse(readFileSync(PENDING, "utf8")));
        return console.log("Recovered a pending payment:", r.success, r.transaction_hash);
    }
    const created = await api.createOrder({ product: "stars", username: RECIPIENT, amount: 50, idempotencyKey: "example:crash-safe:1" });
    if (created.order.status !== "created") return console.log("Crash-safe: order already", created.order.status);
    const prepared = await api.prepare([created]);
    writeFileSync(PENDING, JSON.stringify(prepared));
    const r = await send(prepared, [created]);
    console.log("Crash-safe:", r.success, r.transaction_hash);
}

async function main() {
    await readOnly();
    if (process.env.BUY !== "1" || !RECIPIENT) {
        console.log("Set BUY=1 and RECIPIENT=<username> to run the purchases.");
        return;
    }
    await buyStars();
    await buyPremiumWithoutKyc();
    await buyStarsForUsdt();
    await batch();
    await crashSafe();
}

main().catch((e) => {
    if (e.error_code === "TRANSFER_AMBIGUOUS" || e.error_code === "SUBMIT_OUTCOME_UNKNOWN") {
        // The money may have left the wallet: check the order later, never buy it again.
        console.error("Outcome unknown - reconcile before retrying:", e.message);
    } else {
        console.error("Error:", e.error_code ?? "", e.message);
    }
    process.exitCode = 1;
});
