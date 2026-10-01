# Changelog

## 2.0.0

The first release since 1.0.3 (May 2025). The library now speaks API v3, and the API v1
methods are gone.

### Breaking

- `new FragmentAPIClient(seed, cookies, baseUrl)` is now
  `new FragmentAPIClient({ seed, fragmentCookies, baseUrl, walletVersion, authKey })`.
- The API v1 methods (`buyStars(username, amount, showSender, cookies, seed)` and the
  rest) are gone. Use `FragmentAPIv3` (see "Migrating from API v2" in the README).

### API v3: payments are signed on your machine

- `FragmentAPIv3` signs in with your wallet (a TON Connect proof), creates orders, checks
  every payment the server prepares and signs it locally. The seed phrase never leaves
  the process.
- Before signing it checks the order against your own request, Fragment's addresses and
  the service's wallets pinned in this release, your own USDT wallet, a fee ceiling and
  your per-order limits (`trust.maxTonPerOrder`, `trust.maxUsdtPerOrder`). The limits are
  required: nothing is signed without them.
- The service wallet pinned for fee and no-KYC payments:
  `UQDXImli_ztqzCuDYTDLH0z6PU56BhYtTHHdAWS2SfuJtCAT`.
- Stars, Premium and TON, with or without KYC, paid in TON or USDT; many orders in one
  transaction; idempotency keys; `revoke()`. Plain `http://` only to localhost.

### API v2 client (`FragmentAPIClient`, deprecated)

- Create, pay and check for Stars, Premium and TON, with and without KYC; USDT payments,
  custom order info and idempotency keys; a recipient ban list; `walletVersion`
  (default `v5r1`).
- The auth key goes in the `Authorization` header, never in a URL.
- Errors keep only the message and code, not the request (seed, cookies or key).
- `buyStars` and `buyPremium` never report an order that may have been paid as unpaid.
- Warns once per process that v2 sends the seed phrase to the server.

### Package

- TypeScript types (`index.d.ts`); `FragmentAPIError` is exported.
- `npm test` runs the signing vectors and the trust checks; `npm publish` builds and
  tests first.
- axios and its dependencies updated (npm audit).
