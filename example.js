import FragmentAPIClient from "./index.js";

// Replace with your 24 words seed phrase from TON Wallet
const seed = "your_24_words_seed_phrase";

// Define wallet type, can be "v4r2" or "v5r1" based on your wallet version
const walletType = "v5r1";

// Replace with your Fragment cookies exported from Cookie-Editor extension as Header String
// https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm
const fragmentCookies = "your_fragment_cookies";

/*
  This example demonstrates the Fragment API client using the v2 API:
  
  All methods now use the v2 API for better performance and features:
  - getBalance, getUserInfo, getOrders use v2 endpoints with enhanced functionality
  - Purchase methods (buyStars, buyPremium, etc.) use v2 with auth keys
  - Improved error handling with automatic retries
  - Support for different wallet types (v4r2, v5r1)
  - Manual order management available for advanced use cases
*/

const fragment = new FragmentAPIClient();

async function main() {
  try {
    // Ping
    const ping = await fragment.ping();
    console.log("API ping:", ping);

    // Get balance (now uses v2 API with wallet type support)
    const balance = await fragment.getBalance(seed, walletType);
    console.log("Balance:", balance);

    // Get user info (now uses v2 API)
    const userInfo = await fragment.getUserInfo("NightStrang6r", fragmentCookies);
    console.log("User info:", userInfo);

    // Create auth key (for purchase methods that require authentication)
    const authKeyResp = await fragment.createAuthKey(fragmentCookies, seed);
    console.log("Auth key response:", authKeyResp);
    const authKey = authKeyResp.auth_key; // Extract auth key from response

    // Buy stars without KYC (v2 API)
    const starsNoKYC = await fragment.buyStarsWithoutKYC("NightStrang6r", 100, authKey, "v4r2");
    console.log("Buy stars without KYC response:", starsNoKYC);

    // Buy stars (v2 API)
    const stars = await fragment.buyStars("NightStrang6r", 100, authKey, walletType, false);
    console.log("Buy stars response:", stars);

    // Buy Telegram Premium without KYC (v2 API)
    const premiumNoKYC = await fragment.buyPremiumWithoutKYC("NightStrang6r", 3, authKey, walletType);
    console.log("Buy Telegram Premium without KYC response:", premiumNoKYC);

    // Buy Telegram Premium (v2 API)
    const premium = await fragment.buyPremium("NightStrang6r", 3, authKey, walletType, false);
    console.log("Buy Telegram Premium response:", premium);

    // Get orders (v2 API)
    const orders = await fragment.getOrders(seed, 10, 0);
    console.log("Orders:", orders);

    // === Manual Order Management Examples ===

    // Create premium order manually
    const premiumOrder = await fragment.createPremiumOrder("NightStrang6r", 3, fragmentCookies, false);
    console.log("Created premium order:", premiumOrder);

    // Pay premium order manually
    if (premiumOrder.success) {
      const payResult = await fragment.payPremiumOrder(
        premiumOrder.order_id, 
        seed, 
        fragmentCookies, 
        premiumOrder.cost, 
        walletType
      );
      console.log("Pay premium order result:", payResult);

      // Check premium order status
      const orderStatus = await fragment.getPremiumOrderStatus(premiumOrder.order_id);
      console.log("Premium order status:", orderStatus);
    }

    // Create stars order manually
    const starsOrder = await fragment.createStarsOrder("NightStrang6r", 100, fragmentCookies, false);
    console.log("Created stars order:", starsOrder);

    // Pay stars order manually
    if (starsOrder.success) {
      const payResult = await fragment.payStarsOrder(
        starsOrder.order_id, 
        seed, 
        fragmentCookies, 
        starsOrder.cost, 
        walletType
      );
      console.log("Pay stars order result:", payResult);

      // Check stars order status
      const orderStatus = await fragment.getStarsOrderStatus(starsOrder.order_id);
      console.log("Stars order status:", orderStatus);
    }

  } catch (error) {
    console.error("Error:", error);
  }
}

main();