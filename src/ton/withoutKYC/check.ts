export function getTonWithoutKYCOrderStatus(this: any, order_uuid: string) {
  return this.get(`/v2/buyTonWithoutKYC/check?uuid=${order_uuid}`);
}
