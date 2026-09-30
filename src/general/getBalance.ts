export function getBalance(this: any, authKey?: string) {
  return this.get(`/v2/getBalance?wallet_type=${encodeURIComponent(this.walletVersion)}`, this.getAuthKey(authKey));
}
