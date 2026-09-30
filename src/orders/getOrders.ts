export function getOrders(this: any, authKey?: string, limit = 10, offset = 0) {
  return this.get(`/v2/getOrders?limit=${limit}&offset=${offset}`, this.getAuthKey(authKey));
}
