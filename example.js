import FragmentAPIClient from "./index.js";

// Replace with your 24 words seed phrase from TON Wallet
const seed = "your_24_words_seed_phrase";

// Define wallet type, can be "v4r2" or "v5r1" based on your wallet version
const walletType = "v5r1";

// Replace with your Fragment cookies exported from Cookie-Editor extension as Header String
// https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm
const fragmentCookies = "your_fragment_cookies";

const fragment = new FragmentAPIClient();

async function main() {
  try {
    // Ping
    const ping = await fragment.ping();
    console.log("API ping:", ping);

    // Create auth key
    const authKeyResp = await fragment.createAuthKey(fragmentCookies, seed);
    console.log("Auth key response:", authKeyResp);
    const authKey = authKeyResp.auth_key;

    // Get balance (now uses v2 API with wallet type support)
    const balance = await fragment.getBalance(authKey, walletType);
    console.log("Balance:", balance);

    // Get user info
    const userInfo = await fragment.getUserInfo("NightStrang6r", authKey);
    console.log("User info:", userInfo);

    // Buy stars without KYC
    const starsNoKYC = await fragment.buyStarsWithoutKYC("NightStrang6r", 100, authKey, "v4r2");
    console.log("Buy stars without KYC response:", starsNoKYC);

    // Buy stars
    const stars = await fragment.buyStars("NightStrang6r", 100, authKey, walletType, false);
    console.log("Buy stars response:", stars);

    // Buy Telegram Premium without KYC
    const premiumNoKYC = await fragment.buyPremiumWithoutKYC("NightStrang6r", 3, authKey, walletType);
    console.log("Buy Telegram Premium without KYC response:", premiumNoKYC);

    // Buy Telegram Premium
    const premium = await fragment.buyPremium("NightStrang6r", 3, authKey, walletType, false);
    console.log("Buy Telegram Premium response:", premium);

    // Transfer TON to Telegram account without KYC
    const tonNoKYC = await fragment.buyTonWithoutKYC("NightStrang6r", 1, authKey, "v4r2");
    console.log("Buy TON without KYC response:", tonNoKYC);

    // Transfer TON to Telegram account
    const ton = await fragment.buyTon("NightStrang6r", 1, authKey, walletType, false);
    console.log("Buy TON response:", ton);

    // Get orders
    const orders = await fragment.getOrders(authKey, 10, 0);
    console.log("Orders:", orders);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();