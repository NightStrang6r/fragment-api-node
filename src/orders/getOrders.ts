export function getOrders(this: any, authKey?: string, limit = 10, offset = 0) {
  return this.get(`/v2/getOrders?auth_key=${encodeURIComponent(this.getAuthKey(authKey))}&limit=${limit}&offset=${offset}`);
}
