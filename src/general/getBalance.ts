export function getBalance(this: any, authKey?: string, walletType = "v4r2") {
  return this.get(`/v2/getBalance?auth_key=${encodeURIComponent(this.getAuthKey(authKey))}&wallet_type=${encodeURIComponent(walletType)}`);
}
