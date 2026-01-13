export function getBalance(this: any, authKey?: string) {
  return this.get(`/v2/getBalance?auth_key=${encodeURIComponent(this.getAuthKey(authKey))}&wallet_type=${encodeURIComponent(this.walletVersion)}`);
}
