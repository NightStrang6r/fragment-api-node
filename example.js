import FragmentAPIClient from "./index.js";

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
