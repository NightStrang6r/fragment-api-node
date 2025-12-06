export function getStarsWithoutKYCOrderStatus(this: any, order_uuid: string) {
  return this.get(`/v2/buyStarsWithoutKYC/check?uuid=${order_uuid}`);
}
