import FragmentAPIClient from "./index.js";

// Replace with your 24 words seed phrase from TON v4r2 Wallet
const seed = "your_24_words_seed_phrase"; 

// Replace with your Fragment cookies exported from Cookie-Editor extension as Header String
// https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm
const fragmentCookies = "your_fragment_cookies";

const fragment = new FragmentAPIClient();

async function main() {
  try {
    // Ping
    const ping = await fragment.ping();
    console.log("API ping:", ping);

    // Get balance
    const balance = await fragment.getBalance(seed);
    console.log("Balance:", balance);

    // Get user info
    const userInfo = await fragment.getUserInfo("Night", fragmentCookies);
    console.log("User info:", userInfo);

    // Buy stars without KYC
    const starsNoKYC = await fragment.buyStarsWithoutKYC("Night", 100, seed);
    console.log("Buy stars without KYC response:", starsNoKYC);

    // Buy stars
    const stars = await fragment.buyStars("Night", 100, false, fragmentCookies, seed);
    console.log("Buy stars response:", stars);

    // Buy Telegram Premium without KYC
    const premiumNoKYC = await fragment.buyPremiumWithoutKYC("Night", 3, seed);
    console.log("Buy Telegram Premium without KYC response:", premiumNoKYC);

    // Buy Telegram Premium
    const premium = await fragment.buyPremium("Night", 3, false, fragmentCookies, seed);
    console.log("Buy Telegram Premium response:", premium);

    // Get orders
    const orders = await fragment.getOrders(seed, 10, 0);
    console.log("Orders:", orders);
  } catch (error) {
    console.error("Error:", error);
  }
}

main();