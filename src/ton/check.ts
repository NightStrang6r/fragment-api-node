export function getTonOrderStatus(this: any, order_uuid: string) {
  return this.get(`/v2/buyTon/check?uuid=${order_uuid}`);
}
