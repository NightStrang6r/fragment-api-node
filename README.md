<h1 align="center">
    ⚡️ fragment-api ⚡️
</h1>

<h4 align="center">
    ✨ NodeJS library for buying Telegram Stars, Premium and TON on Fragment (<a href="https://fragment.com">fragment.com</a>) ✨
</h4>

<p align="center">
	<img src="https://i.ibb.co/YNxYtn7/2025-01-25-213756244.png" alt="Fragment API"/>
</p>

<p align="center">
    <img src="https://i.ibb.co/9bG0D5Q/2025-01-25-214508436-1.png" alt="Fragment API"/>
</p>

## 🚀 **Info**

**fragment-api** is the NodeJS client for [Fragment API](https://fragment-api.net). Since
version 1.1.0 it speaks **API v3**: the server prepares each payment, this library checks
it and **signs it on your machine** - your seed phrase is never sent anywhere.

- 💸 Buy **Telegram Stars**, **Premium** and **TON** for any username

- 🔐 **Your seed stays with you** - payments are signed locally

- 🛡️ Checks every payment before signing: pinned Fragment addresses, a fee ceiling, your own limits

- 💵 Pay in **TON** or **USDT** (jettons on TON)

- ✅ Works **with** or **without** KYC

- 📦 Many orders in **one transaction** (up to 127 from a W5 wallet)

- ♻️ **Idempotent** order creation - safe retries, never a double purchase

- 🧩 No **API key** or registration: you sign in with your wallet

- 💙 No need to use the **TON API** directly

## 📌 **Requirements**

- ✅ A TON wallet **v4r2** or **W5 (v5r1)** and its 24-word seed phrase, with TON on it (and USDT to pay in USDT). A brand-new wallet is fine: the first payment deploys it.

**With KYC** (your own Fragment account):

- ✅ Fragment account with linked TON wallet and Telegram account, KYC-verified 🆔

- ✅ Fragment cookies 🍪 - export them with the [Cookie-Editor](https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm) extension as "Header String"

- ✅ USDT orders must be paid from the wallet linked to that Fragment account

**Without KYC** nothing else is needed: the order is bought through the service's verified account.

## ➕ **Installation**

```
npm i fragment-api
```

## ⚡ **Quick start**

```js
import { FragmentAPIv3 } from "fragment-api";

const api = new FragmentAPIv3({
    mnemonic: process.env.TON_SEED,                  // 24 words - used here to sign, never sent
    walletType: "v5r1",                              // your wallet: "v4r2" (default) or "v5r1" (W5)
    fragmentCookies: process.env.FRAGMENT_COOKIES,   // your Fragment account; not needed without KYC
    trust: { maxTonPerOrder: 50 },                   // refuse to sign any order above 50 TON
});

console.log("Paying from", api.address);             // must be your wallet's address

const result = await api.buy({
    product: "stars",
    username: "durov",
    amount: 50,
    idempotencyKey: "myshop:1001",                   // a retry with the same key never buys twice
});

console.log(result.success, result.orders[0].ref_id, result.transaction_hash);
```

Keep the seed phrase and cookies out of your code (environment variables, a secrets
manager). Check that `api.address` is your wallet: a wrong `walletType` gives a different
address, and payments would be signed for an empty wallet.

## 🔐 **How it works**

1. **Sign in** - `auth()` proves you own the wallet with a TON Connect `ton_proof`
   signature and gets an auth key. It runs by itself on the first call.
2. **Create the order** - the server finds the recipient on Fragment, gets the invoice and
   returns a payment request: what to send, to whom, until when.
3. **Check and sign** - this library checks the request (below) and signs it with your key.
4. **Submit** - the server verifies the signed message, sends it to the TON network and
   confirms it on chain.

## 🛡️ **What is checked before signing**

The server no longer holds your seed, but it still says what to sign - so nothing is
signed blindly:

- the payment is from your wallet, and has exactly the legs the order needs: Fragment's
  (plus the service fee) with KYC, one payment to the service's wallet without KYC;
- **Fragment's leg** goes to a Fragment address **pinned in this library** - never one the
  server names. For USDT the jetton recipient is checked, and the unused gas must come
  back to you;
- the **fee leg** and the **no-KYC leg** go only to the service wallets you trust;
- the fee is at most `maxFeePercent` (5 %) of the purchase;
- the order stays under your `maxTonPerOrder` / `maxUsdtPerOrder`;
- the signed message expires within 2 minutes (`externalTtlSeconds`).

A payment that fails any check throws `UNTRUSTED_PAYMENT` and nothing is sent.

By default the service wallets come from `/v3/config` when the client starts. For the
strictest setup, pin them yourself and turn that off:

```js
const api = new FragmentAPIv3({
    mnemonic, walletType: "v5r1", fragmentCookies,
    trust: {
        trustServerConfig: false,
        feeWallets: ["UQ..."],       // the fee wallet, from the operator
        middleWallets: ["UQ..."],    // the no-KYC wallet, from the operator
        maxTonPerOrder: 50,
        maxUsdtPerOrder: 200,
    },
});
```

## 📚 **API**

### `new FragmentAPIv3(options)`

| Option | Default | |
|---|---|---|
| `mnemonic` | - | 24 words (string or array). Only used to sign here |
| `walletType` | `"v4r2"` | `"v4r2"` or `"v5r1"` (W5) |
| `fragmentCookies` | - | Needed for KYC orders |
| `baseUrl` | `https://api.fragment-api.net` | |
| `trust` | `{}` | `fragmentAddresses` (added to the pinned ones), `feeWallets`, `middleWallets`, `trustServerConfig` (`true`), `maxFeePercent` (`5`), `maxTonPerOrder`, `maxUsdtPerOrder` |
| `externalTtlSeconds` | `120` | How long a signed payment stays valid (max 300) |

### Methods

| Method | Returns |
|---|---|
| `buy(order)` | Creates and pays one order |
| `createOrder(order)` | `{ order, payment, recipientId }` - nothing is paid yet |
| `checkOrder(created)` | Runs the checks above for one order without signing |
| `payOrders([created, ...])` | Pays several orders with one transaction |
| `prepare([created, ...])` | A signed payment `{ orders, boc, normalizedHash, validUntil }`, not sent yet |
| `submit(prepared, created?)` | Sends a prepared payment and waits for the result |
| `getOrder(id)` | `{ order, payment }` |
| `listOrders(limit = 10, offset = 0)` | Your orders, newest first |
| `userInfo(username)` | Looks a Telegram user up on Fragment |
| `walletInfo()` | `{ address, state, seqno, balance_nano, usdt_raw, ... }` |
| `config()` | The service's network, wallets and fees |
| `address` | Your wallet address (`UQ...`) |

The `order` object for `buy` / `createOrder`:

| Field | |
|---|---|
| `product` | `"stars"`, `"premium"` or `"ton"` |
| `username` | Telegram username: `durov`, `@durov` or `https://t.me/durov` |
| `amount` | Stars (min 50), TON (min 1), or Premium months (3, 6, 12) |
| `kyc` | `true` (default): your Fragment account. `false`: bought through the service |
| `paymentMethod` | `"ton"` (default) or `"usdt_ton"` |
| `showSender` | Show you as the sender (default `true`) |
| `idempotencyKey` | Your id for the order, e.g. `"myshop:1001"` - strongly recommended |
| `customOrderInfo` | Any note for your own reference |

A successful payment returns:

```js
{
    success: true,
    message: "Payment completed",
    transaction_hash: "…",
    orders: [{ id, ref_id, status: "success", product, amount, username, cost, currency, txid, … }],
}
```

## ☑️ **Examples**

Runnable versions of all of these: [example.js](https://github.com/NightStrang6r/fragment-api-node/blob/main/example.js).

### Premium without KYC

No Fragment account, no cookies:

```js
const api = new FragmentAPIv3({ mnemonic: process.env.TON_SEED, walletType: "v5r1" });

await api.buy({ product: "premium", username: "durov", amount: 3, kyc: false });
```

### Pay in USDT

```js
await api.buy({ product: "stars", username: "durov", amount: 500, paymentMethod: "usdt_ton" });
```

Keep a little TON on the wallet as well: every USDT transfer carries some TON for gas,
and what is not used comes back.

### Many orders in one transaction

```js
const orders = [];
for (const username of ["alice", "bob", "carol"]) {
    const created = await api.createOrder({ product: "stars", username, amount: 50, idempotencyKey: `myshop:${username}:50` });
    await api.checkOrder(created);        // a bad order is refused alone, not with the batch
    orders.push(created);
}
const result = await api.payOrders(orders);
```

One transaction carries up to 255 messages from a W5 wallet (4 from v4r2). A KYC order
usually takes two (Fragment and the fee), a no-KYC order one. Each signed payment uses the
wallet's next seqno, so pay from one wallet one payment at a time: batch concurrent
orders together, or queue them.

### Surviving a crash

Store the signed payment before sending it. Sending the same signed payment again is
always safe: it can be applied only once.

```js
const created = await api.createOrder({ product: "stars", username: "durov", amount: 50, idempotencyKey: "myshop:1002" });
const prepared = await api.prepare([created]);
await db.save("payment:myshop:1002", prepared);   // your storage

const result = await api.submit(prepared, [created]);

// After a restart, with the same prepared payment:
// await api.submit(await db.load("payment:myshop:1002"));
```

## ⚠️ **Errors**

Failures throw a `FragmentAPIError` with `message`, `status`, `error_code` and `details`
(the server's answer). The ones to handle:

| `error_code` | What happened | What to do |
|---|---|---|
| `UNTRUSTED_PAYMENT` | This library refused to sign | Nothing was sent. Check your `trust` settings |
| `INSUFFICIENT_BALANCE` | Not enough TON / USDT | Nothing was sent. Top up and pay again |
| `ORDER_EXPIRED` | Fragment's invoice expired | Create the order again (same `idempotencyKey` is fine) |
| `TRANSFER_FAILED` | The network rejected the payment | See `details.orders` |
| `TRANSFER_AMBIGUOUS` | The result is not known yet | The order stays `processing`. **Do not pay it again** - check it later with `getOrder` |
| `SUBMIT_OUTCOME_UNKNOWN` | No answer from the API | Submit the same `details.prepared` again later. **Never sign it anew** |
| `FRAGMENT_COOKIES_REQUIRED` | A KYC order without cookies | Pass `fragmentCookies`, or use `kyc: false` |
| `WALLET_NOT_CONNECTED_TO_FRAGMENT` | USDT from another wallet | Pay USDT orders from the wallet linked to your Fragment account |
| `NO_KYC_UNAVAILABLE` | No-KYC purchases are paused | Try later |

```js
try {
    await api.buy({ product: "stars", username: "durov", amount: 50, idempotencyKey: "myshop:1003" });
} catch (e) {
    if (e.error_code === "TRANSFER_AMBIGUOUS" || e.error_code === "SUBMIT_OUTCOME_UNKNOWN") {
        // money may have left the wallet: reconcile, never re-buy
    } else {
        console.error(e.error_code, e.message);
    }
}
```

## 🔁 **Migrating from API v2**

v1 and v2 send your seed phrase to the server. They are deprecated and will be switched
off - move to `FragmentAPIv3`:

| v2 (`FragmentAPIClient`) | v3 (`FragmentAPIv3`) |
|---|---|
| `new FragmentAPIClient({ walletVersion })` + `auth(cookies, seed)` | `new FragmentAPIv3({ mnemonic, walletType, fragmentCookies })` |
| `buyStars(username, amount, authKey, showSender, info, method, key)` | `buy({ product: "stars", username, amount, showSender, customOrderInfo, paymentMethod, idempotencyKey })` |
| `buyStarsWithoutKYC(username, amount, authKey)` | `buy({ product: "stars", username, amount, kyc: false })` |
| `buyPremium(username, months, ...)` | `buy({ product: "premium", username, amount: months })` |
| `buyTon(username, amount, ...)` | `buy({ product: "ton", username, amount })` |
| `createStarsOrder` → `payStarsOrder` → `getStarsOrderStatus` | `createOrder` → `payOrders` → `getOrder` |
| `getUserInfo(username)` | `userInfo(username)` |
| `getBalance(authKey)` | `walletInfo()` |
| `getOrders(authKey, limit, offset)` | `listOrders(limit, offset)` |

With the same wallet, v3 sees the orders and idempotency keys you made in v2, so an order
bought through v2 can not be bought again through v3.

## 🗄️ **Legacy API v2 client**

`import FragmentAPIClient from "fragment-api"` is the v2 client, unchanged, kept for
existing integrations until v2 is switched off. **It sends your seed phrase to the
server** - do not start new projects on it.

## 🎉 **Like it? Star it!**

Please rate this repository by giving it a star rating in the top right corner of the GitHub page (you must be logged in to your account). Thank you ❤️

![](https://i.ibb.co/x3hFFvf/2022-08-18-132617815.png)

## 📄 **License**

This repository is licensed under Apache Licence 2.0.

Made with ❤️ by NightStrang6r
