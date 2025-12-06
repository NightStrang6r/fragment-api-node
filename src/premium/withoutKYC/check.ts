export function getPremiumWithoutKYCOrderStatus(this: any, order_uuid: string) {
  return this.get(`/v2/buyPremiumWithoutKYC/check?uuid=${order_uuid}`);
}
