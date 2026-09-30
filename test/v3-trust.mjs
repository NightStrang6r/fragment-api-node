// What the SDK refuses to sign when the API server is compromised, against a mock server
// that answers like one. Throwaway test wallets (test/v3-vectors.json), nothing is sent
// anywhere. Run after `npm run build`:
//   node test/v3-trust.mjs            (about 35 s: one check waits out a signature's expiry)
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { inspect } from "node:util";
import { FragmentAPIv3 } from "../lib/v3/client.js";
import { Address, loadAddress, storeAddress } from "../lib/v3/address.js";
import { beginCell, cellFromBase64 } from "../lib/v3/cell.js";
import { usdtWalletOf, USDT_MASTER } from "../lib/v3/payment.js";

const vectors = JSON.parse(readFileSync(new URL("./v3-vectors.json", import.meta.url)));
const usdtVectors = JSON.parse(readFileSync(new URL("./usdt-wallet-vectors.json", import.meta.url)));
const mnemonic = vectors.cases.find((c) => c.wallet_type === "v5r1").mnemonic;
let ok = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) ok++; else { fail++; console.log("FAIL:", name, extra ?? ""); } };
const refuses = async (name, fn, code = "UNTRUSTED_PAYMENT") => {
    try { await fn(); check(name, false, "no error"); } catch (e) { check(name, e.error_code === code, `${e.error_code}: ${e.message}`); }
};

const FRAGMENT = "UQBAjaOyi2wGWlk-EDkSabqqnF-MrrwMadnwqrurKpkla4QB";
const FRAGMENT_USDT = "UQCFJEP4WZ_mpdo0_kMEmsTgvrMHG7K_tWY16pQhKHwoOtFz";
const FEE = new Address(0, Buffer.alloc(32, 0x11)).toFriendly(false);
const MIDDLE = new Address(0, Buffer.alloc(32, 0x22)).toFriendly(false);
const EVIL = new Address(0, Buffer.alloc(32, 0x66)).toFriendly(false);
const b64 = (cell) => cell.toBase64();
const comment = (t) => beginCell().storeUint(0, 32).storeBuffer(Buffer.from(t)).endCell();
const jettonTransfer = (amount, to, response) => {
    const b = beginCell().storeUint(0x0f8a7ea5, 32).storeUint(0, 64).storeCoins(amount);
    storeAddress(b, Address.parse(to)); storeAddress(b, response);
    return b.storeBit(0).storeCoins(1n).storeBit(0).endCell();
};

// --- USDT jetton wallet, computed offline: the same as tonutils --------------------------
for (const c of usdtVectors.cases) {
    check(`USDT wallet of ${c.owner.slice(0, 10)}`, usdtWalletOf(Address.parse(c.owner)).toRaw() === c.usdt_wallet);
}
check("USDT master constant", Address.parse(USDT_MASTER).equals(Address.parse(usdtVectors.master)));

// --- a mock API that answers like a compromised server -----------------------------------
let scenario = null;          // (body) => { order, payment } for the next create
let submits = [];             // BoCs the client submitted
let submitAnswers = [];       // queued submit answers
let walletSeqno = 5;
const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
        const body = raw ? JSON.parse(raw) : {};
        const send = (status, data) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
        const path = req.url.split("?")[0];
        if (path === "/v3/auth") return send(200, { success: true, auth_key: "k".repeat(64), wallet: { address: payer.toRaw() } });
        if (path === "/v3/config") return send(200, { fee_wallet: EVIL, middle_wallet: EVIL });
        if (path === "/v3/wallet") return send(200, { address: payer.toRaw(), state: "active", seqno: walletSeqno });
        if (path === "/v3/orders" && req.method === "POST") return send(200, { success: true, ...scenario(body) });
        if (path === "/v3/orders/submit") {
            submits.push(body.boc);
            const [status, data] = submitAnswers.shift() ?? [200, { success: true, orders: [] }];
            return send(status, data);
        }
        send(404, {});
    });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const make = (trust, extra = {}) => new FragmentAPIv3({ mnemonic, walletType: "v5r1", fragmentCookies: "stel_ssid=t", baseUrl, trust, ...extra });
const payer = make({}).wallet;
const usdtWallet = usdtWalletOf(payer).toFriendly(true);
const validUntil = () => Math.floor(Date.now() / 1000) + 600;
let n = 0;
const order = (body, over = {}) => ({ id: `o${++n}`, status: "created", product: body.product, amount: body.amount,
    username: String(body.username).replace(/^@/, ""), kyc: body.kyc, payment_method: body.payment_method, ...over });
const request = (messages) => ({ valid_until: validUntil(), network: "-239", from: payer.toRaw(), messages });
const msg = (role, address, amount, payload) => ({ role, address, amount: String(amount), payload: b64(payload) });
const tonKyc = (body) => ({ order: order(body), payment: request([
    msg("fragment", FRAGMENT, 250_000_000n, comment("Ref#1")), msg("fee", FEE, 5_000_000n, comment("fee"))]) });
const caps = { maxTonPerOrder: 5, maxUsdtPerOrder: 50, feeWallets: [FEE], middleWallets: [MIDDLE] };
const stars = { product: "stars", username: "durov", amount: 50 };

// an honest KYC order passes, and pays
scenario = tonKyc;
const good = make(caps);
const paid = await good.payOrders([await good.createOrder(stars)]);
check("an honest KYC order is signed and paid", paid.success === true && submits.length === 1, JSON.stringify(paid));

// the server turns a KYC order into a no-KYC payment to its own wallet
scenario = (body) => ({ order: order(body, { kyc: false }), payment: request([msg("middle", EVIL, 4_000_000_000n, comment("Ref#2"))]) });
await refuses("kyc flipped by the server is refused", () => make(caps).createOrder(stars));
scenario = (body) => ({ order: order(body), payment: request([msg("middle", MIDDLE, 250_000_000n, comment("Ref#3"))]) });
await refuses("a middle leg in a KYC order is refused", async () => { const a = make(caps); await a.payOrders([await a.createOrder(stars)]); });

// no per-order limit: nothing is signed
scenario = tonKyc;
await refuses("no maxTonPerOrder, no signature", async () => { const a = make({ feeWallets: [FEE] }); await a.payOrders([await a.createOrder(stars)]); });

// service wallets from /v3/config are not trusted by default
await refuses("fee wallet named only by /v3/config is refused", async () => {
    const a = make({ maxTonPerOrder: 5 });
    scenario = (body) => ({ order: order(body), payment: request([msg("fragment", FRAGMENT, 250_000_000n, comment("Ref#4")), msg("fee", EVIL, 5_000_000n, comment("fee"))]) });
    await a.payOrders([await a.createOrder(stars)]);
});
{
    const a = make({ maxTonPerOrder: 5, trustServerConfig: true });
    scenario = (body) => ({ order: order(body), payment: request([msg("fragment", FRAGMENT, 250_000_000n, comment("Ref#5")), msg("fee", EVIL, 5_000_000n, comment("fee"))]) });
    await a.payOrders([await a.createOrder(stars)]);
    check("... unless trustServerConfig is on", true);
}

// an inflated Fragment leg makes 5 % of it the whole wallet: the cap holds
scenario = (body) => ({ order: order(body), payment: request([msg("fragment", FRAGMENT, 100_000_000_000n, comment("Ref#6")), msg("fee", FEE, 5_000_000_000n, comment("fee"))]) });
await refuses("an inflated purchase is over the cap", async () => { const a = make(caps); await a.payOrders([await a.createOrder(stars)]); });

// USDT: only to the payer's own USDT wallet, and only in USDT orders
const usdtStars = { ...stars, paymentMethod: "usdt_ton" };
const usdtOrder = (walletAddr) => (body) => ({ order: order(body), payment: request([
    msg("fragment", walletAddr, 50_000_000n, jettonTransfer(1_500_000n, FRAGMENT_USDT, payer)),
    msg("fee", walletAddr, 50_000_000n, jettonTransfer(30_000n, FEE, payer))]) });
scenario = usdtOrder(usdtWallet);
{
    const a = make(caps);
    await a.payOrders([await a.createOrder(usdtStars)]);
    check("an honest USDT order to the derived USDT wallet is signed", true);
}
scenario = usdtOrder(EVIL);
await refuses("a jetton transfer to another token's wallet is refused", async () => { const a = make(caps); await a.payOrders([await a.createOrder(usdtStars)]); });
scenario = usdtOrder(usdtWallet);
await refuses("no maxUsdtPerOrder, no USDT signature", async () => { const a = make({ maxTonPerOrder: 5, feeWallets: [FEE] }); await a.payOrders([await a.createOrder(usdtStars)]); });
await refuses("a jetton transfer in a TON order is refused", async () => { const a = make(caps); await a.payOrders([await a.createOrder(stars)]); });

// the server's copy of the order must be what was asked
scenario = (body) => ({ ...tonKyc(body), order: order(body, { username: "someoneelse" }) });
await refuses("another recipient in the order is refused", () => make(caps).createOrder(stars));
scenario = (body) => ({ ...tonKyc(body), order: order(body, { amount: 5000 }) });
await refuses("another amount in the order is refused", () => make(caps).createOrder(stars));

// re-signing after "not sent" keeps the seqno; a seqno complaint is not re-signed
const seqnoOf = (boc) => {
    const s = cellFromBase64(boc).beginParse();
    s.loadUint(2); s.loadUint(2); loadAddress(s); s.loadCoins();
    if (s.loadBit()) { if (s.loadBit()) s.loadRef(); else throw new Error("inline init"); }
    const body = s.loadBit() ? s.loadRef().beginParse() : s;
    body.loadUint(32); body.loadUint(32); body.loadUint(32);
    return Number(body.loadUint(32));
};
scenario = tonKyc;
{
    const a = make(caps);
    const c = await a.createOrder(stars);
    submits = [];
    walletSeqno = 5;
    submitAnswers = [[503, { success: false, error_code: "TRANSFER_NOT_SENT", resign: true }]];
    const p = await a.prepare([c]);
    walletSeqno = 9;   // a lying server now reports a higher seqno
    await a.submit(p, [c]);
    check("re-signature after not_sent keeps the seqno", submits.length === 2 && seqnoOf(submits[0]) === 5 && seqnoOf(submits[1]) === 5,
        submits.map(seqnoOf).join(","));
}
{
    const a = make(caps);
    const c = await a.createOrder(stars);
    submits = [];
    submitAnswers = [[400, { success: false, error_code: "INVALID_SIGNED_MESSAGE", released: 1, reason: "signed for seqno 5 but the wallet is at 4" }]];
    const p = await a.prepare([c]);
    try { await a.submit(p, [c]); check("INVALID_SIGNED_MESSAGE is thrown", false); } catch (e) { check("INVALID_SIGNED_MESSAGE is thrown, one submit", e.error_code === "INVALID_SIGNED_MESSAGE" && submits.length === 1, submits.length); }
}

// the mnemonic, the private key and the cookies are not in what the client shows of itself
{
    const a = make(caps);
    const shown = inspect(a, { depth: 8, showHidden: true }) + JSON.stringify(a);
    const words = mnemonic.split(" ");
    check("the client object shows no mnemonic", !shown.includes(words.slice(0, 3).join(" ")) && !shown.includes(words.slice(-3).join(" ")));
    check("the client object holds no key pair", !/keyPair|secretKey|privateKey/i.test(shown));
    check("the client object shows no cookie", !shown.includes("stel_ssid"));
}

// a different seqno for an order signed before waits until that signature has expired
{
    const a = make(caps, { externalTtlSeconds: 1 });
    const c = await a.createOrder(stars);
    walletSeqno = 20;
    const first = await a.prepare([c]);
    walletSeqno = 21;
    const t0 = Date.now();
    const second = await a.prepare([c]);
    const waited = Date.now() - t0;
    check("a new seqno waits for the old signature to expire", second.seqno === 21 && waited >= first.validUntil * 1000 + 29_000 - t0, `${waited} ms`);
}

server.close();
console.log(`passed ${ok}, failed ${fail}`);
process.exit(fail ? 1 : 0);
