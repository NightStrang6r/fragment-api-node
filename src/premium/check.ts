export function getPremiumOrderStatus(this: any, order_uuid: string) {
  return this.get(`/v2/buyPremium/check?uuid=${order_uuid}`);
}
