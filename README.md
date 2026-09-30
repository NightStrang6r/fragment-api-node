<h1 align="center">
    ⚡️ fragment-api ⚡️
</h1>

<h4 align="center">
    ✨ Simple NodeJS library for fast integration with Fragment (<a href="https://fragment.com">fragment.com</a>) ✨
</h4>

<p align="center">
	<img src="https://i.ibb.co/YNxYtn7/2025-01-25-213756244.png" alt="Fragment API"/>
</p>

<p align="center">
    <img src="https://i.ibb.co/9bG0D5Q/2025-01-25-214508436-1.png" alt="Fragment API"/>
</p>

## 🚀 **Info**

**fragment-api** is a simple NodeJS API client wrapper for Fragment, which uses fragment-api.net under the hood. It supports:

- 💸 **Purchase Telegram Stars & Premium**

- 💵 Pay in **TON** or **USDT** (jettons on TON)

- ♻️ **Idempotent** order creation — safe retries, no double-paying

- ✅ Works **with** or **without** KYC

- 🔂 Bypass Fragment **purchase limits**

- 🔐 **End-to-end encryption** supported

- 🧩 No **API key** or registration required

- 💙 No need to use the **TON API** directly

- 📦 Built-in request models for **clean integration**

- 📈 Supports **multi-order transactions**

- 🧠 Lightweight & **developer-friendly**

## 📌 **Requirements (without KYC)**

- ✅ TON Wallet v4r2 🪙

- ✅ TON Wallet should be Active (send any transaction from it) 🪙

## 📌 **Requirements (with KYC)**

- ✅ Fragment account with linked TON wallet and Telegram account 🔗

- ✅ KYC verification on Fragment 🆔

- ✅ Export cookies from Fragment 🍪 (as Header String using Cookie Editor extension)

## ➕ **Installation**

```
npm i fragment-api
```

## 🔐 **API v3: your seed never leaves your machine**

API v1/v2 send your wallet's mnemonic to the server, which signs your payments. v3 does not:
the server prepares each payment, this SDK checks it and signs it locally, the server relays
and confirms it. v1/v2 are deprecated.

```js
import { FragmentAPIv3 } from "fragment-api";

const api = new FragmentAPIv3({
    mnemonic: process.env.TON_SEED,          // used only here, never sent
    walletType: "v5r1",                      // the wallet you actually use: "v4r2" or "v5r1"
    fragmentCookies: process.env.FRAGMENT_COOKIES,   // for KYC orders (your Fragment account)
    trust: { maxTonPerOrder: 50, maxUsdtPerOrder: 200 },  // refuse to sign anything bigger
});

const result = await api.buy({ product: "stars", username: "durov", amount: 50, idempotencyKey: "shop:123" });
```

Before signing, the SDK refuses any payment that is not to Fragment (addresses pinned in the
SDK), to the operator's fee / no-KYC wallet, within the fee ceiling (default 5 %) and your
caps - so even a compromised server can not make it sign something else.

To survive a crash between signing and hearing back: `const p = await api.prepare([order])`,
store `p`, then `await api.submit(p)`. Submitting the same prepared payment again is always
safe. Never re-sign an order whose result was `TRANSFER_AMBIGUOUS` - check it first.

## ☑️ **Usage examples**

```js
import FragmentAPIClient from "fragment-api";

// Replace with your 24 words seed phrase from TON Wallet
const seed = "your_24_words_seed_phrase";

// Define wallet type, can be "v4r2" or "v5r1" based on your wallet version
const walletType = "v5r1";

// Replace with your Fragment cookies exported from Cookie-Editor extension as Header String
// https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm
const fragmentCookies = "your_fragment_cookies";

// walletVersion is used as the wallet_type for every pay call
const fragment = new FragmentAPIClient({ walletVersion: walletType });

async function main() {
  try {
    // Ping
    const ping = await fragment.ping();
    console.log("API ping:", ping);

    // Create auth key (stored on the client, so authKey can be omitted below)
    const authKeyResp = await fragment.auth(fragmentCookies, seed);
    console.log("Auth key response:", authKeyResp);
    const authKey = authKeyResp.auth_key;

    // Get balance
    const balance = await fragment.getBalance(authKey);
    console.log("Balance:", balance);

    // Get user info
    const userInfo = await fragment.getUserInfo("NightStrang6r", authKey);
    console.log("User info:", userInfo);

    // Buy stars without KYC
    const starsNoKYC = await fragment.buyStarsWithoutKYC("NightStrang6r", 100, authKey);
    console.log("Buy stars without KYC response:", starsNoKYC);

    // Buy stars, paying in TON
    const stars = await fragment.buyStars("NightStrang6r", 100, authKey, false);
    console.log("Buy stars response:", stars);

    // Buy stars, paying in USDT (jettons on TON), with your own order id and an
    // idempotency key — repeating the same key returns the SAME order instead of
    // creating (and paying for) a second one
    const starsUsdt = await fragment.buyStars(
      "NightStrang6r", 100, authKey, false, "my-order-42", "usdt_ton", "myshop:42"
    );
    console.log("Buy stars for USDT response:", starsUsdt);

    // Buy Telegram Premium without KYC
    const premiumNoKYC = await fragment.buyPremiumWithoutKYC("NightStrang6r", 3, authKey);
    console.log("Buy Telegram Premium without KYC response:", premiumNoKYC);

    // Buy Telegram Premium, paying in USDT
    const premium = await fragment.buyPremium(
      "NightStrang6r", 3, authKey, false, null, "usdt_ton", "myshop:43"
    );
    console.log("Buy Telegram Premium response:", premium);

    // Transfer TON to Telegram account without KYC
    const tonNoKYC = await fragment.buyTonWithoutKYC("NightStrang6r", 1, authKey);
    console.log("Buy TON without KYC response:", tonNoKYC);

    // Transfer TON to Telegram account
    const ton = await fragment.buyTon("NightStrang6r", 1, authKey, false);
    console.log("Buy TON response:", ton);

    // Or drive the order yourself: create → pay → check
    const created = await fragment.createStarsOrder(
      "NightStrang6r", 100, authKey, false, "my-order-44", "usdt_ton", "myshop:44"
    );
    const paid = await fragment.payStarsOrder(created.order_id, created.cost, authKey, walletType);
    const status = await fragment.getStarsOrderStatus(created.order_id);
    console.log("Create/pay/check:", created, paid, status);

    // Get orders
    const orders = await fragment.getOrders(authKey, 10, 0);
    console.log("Orders:", orders);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
```

## 💵 **Paying in USDT**

Pass `payment_method: "usdt_ton"` to any KYC create/buy call to settle the order in
USDT jettons on TON instead of native TON. Anything other than `"ton"` or
`"usdt_ton"` throws a `FragmentAPIError` before a request is sent.

Your wallet still needs a small amount of **TON for gas** on top of the USDT balance.

| Method | `custom_order_info` | `payment_method` | `idempotency_key` |
|---|---|---|---|
| `buyStars` / `createStarsOrder` | ✅ | ✅ | ✅ |
| `buyPremium` / `createPremiumOrder` | ✅ | ✅ | ✅ |
| `buyTon` / `createTonOrder` | ✅ | ✅ | ✅ |
| `buyStarsWithoutKYC` / `createStarsWithoutKYCOrder` | ✅ | ✅ | ❌ |
| `buyPremiumWithoutKYC` / `createPremiumWithoutKYCOrder` | ✅ | ✅ | ❌ |
| `buyTonWithoutKYC` / `createTonWithoutKYCOrder` | ✅ | ✅ | ❌ |

No-KYC USDT orders settle in two legs: your wallet sends USDT to the service's middle
wallet, which then pays Fragment. Your wallet still needs a little TON for the jetton
leg's gas. The v1 single-call endpoints (`buyStarsWithoutKYC` on `/buyStars...`) remain
TON-only.

## ♻️ **Idempotency**

`idempotency_key` makes order creation safe to retry: repeating a create with the same
key returns the **same** order instead of creating a new one, so a network hiccup on
your side cannot turn into two paid orders. Namespace it to your system, e.g.
`"myshop:12345"` (max 200 chars).

## 🎉 **Like it? Star it!**

Please rate this repository by giving it a star rating in the top right corner of the GitHub page (you must be logged in to your account). Thank you ❤️

![](https://i.ibb.co/x3hFFvf/2022-08-18-132617815.png)

## 📄 **License**

This repository is licensed under Apache Licence 2.0.

Made with ❤️ by NightStrang6r